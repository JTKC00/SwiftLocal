"""
Python backend unit tests for conversion helpers and job cancel.

Run from repo root:
  py -3 -m unittest tests.backend.test_core -v
  # or
  py -3 tests/backend/test_core.py
"""

from __future__ import annotations

import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services import conversion_service as cs
from backend.services.conversion_service import next_available_path
from backend.services.job_service import Job, JobService, redact_job_options
from backend.security import ALLOWED_FRONTEND_ORIGINS, SESSION_TOKEN, is_valid_session_token
from backend.version import APP_VERSION, read_app_version


def _make_pdf(path: Path, pages: int = 2) -> None:
    from pypdf import PdfWriter

    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    with path.open("wb") as handle:
        writer.write(handle)


class TessdataTests(unittest.TestCase):
    def test_resolve_ocr_language_fallback(self) -> None:
        # No tool path → pass through preferred
        lang, note = cs.resolve_ocr_language(None, "chi_tra+eng")
        self.assertEqual(lang, "chi_tra+eng")
        self.assertIsNone(note)

        tess = ROOT / "tools" / "tesseract" / "tessdata"
        # Simulate tool next to tessdata
        fake_exe = ROOT / "tools" / "tesseract" / "tesseract.exe"
        if not (tess / "eng.traineddata").is_file():
            self.skipTest("no eng traineddata for fallback test")
        # Even without real exe, resolve_tessdata_dir looks at parent/tessdata of parent...
        # Use a path whose parent has tessdata sibling
        tool = ROOT / "tools" / "tesseract" / "tesseract.exe"
        if not tool.exists():
            # resolve via tessdata parent: create temp structure
            with tempfile.TemporaryDirectory() as tmp:
                base = Path(tmp)
                exe = base / "tesseract.exe"
                exe.write_bytes(b"x")
                td = base / "tessdata"
                td.mkdir()
                # only eng
                (td / "eng.traineddata").write_bytes(b"0" * 60_000)
                lang2, note2 = cs.resolve_ocr_language(exe, "chi_tra+eng")
                self.assertEqual(lang2, "eng")
                self.assertIsNotNone(note2)
                self.assertIn("eng", note2 or "")
            return
        langs = cs.list_tessdata_languages(tool)
        if "chi_tra" in langs and "eng" in langs:
            lang3, note3 = cs.resolve_ocr_language(tool, "chi_tra+eng")
            self.assertEqual(lang3, "chi_tra+eng")
            self.assertIsNone(note3)

    def test_resolve_bundled_tessdata(self) -> None:
        tool = ROOT / "tools" / "tesseract" / "tesseract.exe"
        if not tool.exists():
            # Fall back to tessdata folder alone (ensure-tessdata may populate without exe)
            tess = ROOT / "tools" / "tesseract" / "tessdata"
            if tess.is_dir() and (tess / "chi_tra.traineddata").is_file():
                self.assertGreater((tess / "chi_tra.traineddata").stat().st_size, 50_000)
                return
            self.skipTest("bundled tesseract not present")
        found = cs.resolve_tessdata_dir(tool)
        self.assertIsNotNone(found)
        assert found is not None
        self.assertEqual(found.name, "tessdata")
        self.assertTrue(found.is_dir())

    def test_chi_tra_pack_present_when_tools_tessdata_populated(self) -> None:
        chi = ROOT / "tools" / "tesseract" / "tessdata" / "chi_tra.traineddata"
        eng = ROOT / "tools" / "tesseract" / "tessdata" / "eng.traineddata"
        if not chi.is_file() or not eng.is_file():
            self.skipTest("tools tessdata not populated (run npm run tools:tessdata)")
        self.assertGreater(chi.stat().st_size, 50_000)
        self.assertGreater(eng.stat().st_size, 50_000)


class ApiSecurityTests(unittest.TestCase):
    def test_session_token_uses_constant_time_validation(self) -> None:
        self.assertTrue(is_valid_session_token(SESSION_TOKEN))
        self.assertFalse(is_valid_session_token(None))
        self.assertFalse(is_valid_session_token("wrong-token"))

    def test_cors_does_not_allow_null_origin(self) -> None:
        self.assertNotIn("null", ALLOWED_FRONTEND_ORIGINS)
        self.assertIn("http://127.0.0.1:4173", ALLOWED_FRONTEND_ORIGINS)

    def test_backend_version_comes_from_package_json(self) -> None:
        self.assertEqual(APP_VERSION, "0.3.1")
        self.assertEqual(read_app_version(), APP_VERSION)


class JobPersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_passwords_are_redacted_and_password_jobs_do_not_resume(self) -> None:
        from backend.services import job_service as js_mod

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            jobs_dir = tmp_path / "jobs"
            jobs_dir.mkdir()
            state_path = tmp_path / "jobs-state.json"
            old_jobs_dir = js_mod.JOBS_DIR
            old_state = js_mod.JOBS_STATE_PATH
            old_temp = js_mod.TEMP_DIR
            js_mod.JOBS_DIR = jobs_dir
            js_mod.JOBS_STATE_PATH = state_path
            js_mod.TEMP_DIR = tmp_path
            try:
                sample = jobs_dir / "secret" / "input" / "a.pdf"
                sample.parent.mkdir(parents=True)
                sample.write_bytes(b"%PDF")
                service = JobService()
                secret_job = Job(
                    id="secret",
                    type="pdf-encrypt",
                    input_paths=[sample],
                    output_dir=jobs_dir / "secret" / "output",
                    options={"password": "very-secret", "pages": "1"},
                    log=["failed with very-secret"],
                    error="very-secret",
                )
                service.jobs = [secret_job]
                service._save_jobs_state()
                saved = state_path.read_text(encoding="utf-8")
                self.assertNotIn("very-secret", saved)
                self.assertNotIn("password", saved.lower())
                self.assertEqual(service.public_job(secret_job)["options"], {"pages": "1"})

                restored = JobService()
                await restored.restore_state()
                self.assertEqual(restored.jobs[0].status, "failed")
                self.assertIn("重新輸入密碼", restored.jobs[0].error)
            finally:
                js_mod.JOBS_DIR = old_jobs_dir
                js_mod.JOBS_STATE_PATH = old_state
                js_mod.TEMP_DIR = old_temp


class OutputCollisionTests(unittest.IsolatedAsyncioTestCase):
    async def test_numbered_names_preserve_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            original = tmp_path / "report.pdf"
            original.write_text("original", encoding="utf-8")
            self.assertEqual(next_available_path(original), tmp_path / "report (2).pdf")
            (tmp_path / "report (2).pdf").write_text("second", encoding="utf-8")
            self.assertEqual(next_available_path(original), tmp_path / "report (3).pdf")
            self.assertEqual(original.read_text(encoding="utf-8"), "original")

    async def test_merge_does_not_overwrite_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "source.pdf"
            _make_pdf(source, 1)
            existing = tmp_path / "merged.pdf"
            existing.write_text("keep-me", encoding="utf-8")
            outputs, _ = await cs.merge_pdfs([source], tmp_path)
            self.assertEqual(outputs, [tmp_path / "merged (2).pdf"])
            self.assertEqual(existing.read_text(encoding="utf-8"), "keep-me")
            self.assertTrue(outputs[0].exists())

    async def test_redact_job_options(self) -> None:
        self.assertEqual(
            redact_job_options({"password": "secret", "passphrase": "secret2", "pages": "1"}),
            {"pages": "1"},
        )

    async def test_restore_marks_running_failed_and_keeps_queued(self) -> None:
        from backend.services import job_service as js_mod
        from backend.services.job_service import Job, JobService

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            jobs_dir = tmp_path / "jobs"
            jobs_dir.mkdir()
            state_path = tmp_path / "jobs-state.json"
            old_jobs_dir = js_mod.JOBS_DIR
            old_state = js_mod.JOBS_STATE_PATH
            old_temp = js_mod.TEMP_DIR
            js_mod.JOBS_DIR = jobs_dir
            js_mod.JOBS_STATE_PATH = state_path
            js_mod.TEMP_DIR = tmp_path
            try:
                sample = jobs_dir / "j1" / "input" / "a.pdf"
                sample.parent.mkdir(parents=True)
                sample.write_bytes(b"%PDF")
                payload = {
                    "version": 1,
                    "jobs": [
                        {
                            "id": "j1",
                            "type": "pdf-compress",
                            "inputPaths": [str(sample)],
                            "outputDir": str(jobs_dir / "j1" / "output"),
                            "options": {},
                            "status": "running",
                            "createdAt": "t0",
                            "log": [],
                            "error": "",
                            "outputPaths": [],
                        },
                        {
                            "id": "j2",
                            "type": "pdf-compress",
                            "inputPaths": [str(sample)],
                            "outputDir": str(jobs_dir / "j2" / "output"),
                            "options": {},
                            "status": "queued",
                            "createdAt": "t1",
                            "log": [],
                            "error": "",
                            "outputPaths": [],
                        },
                    ],
                }
                state_path.write_text(json.dumps(payload), encoding="utf-8")
                service = JobService()
                await service.restore_state()
                by_id = {job.id: job for job in service.jobs}
                self.assertEqual(by_id["j1"].status, "failed")
                self.assertIn("中斷", by_id["j1"].error)
                self.assertEqual(by_id["j2"].status, "queued")
                self.assertTrue(state_path.exists())
            finally:
                js_mod.JOBS_DIR = old_jobs_dir
                js_mod.JOBS_STATE_PATH = old_state
                js_mod.TEMP_DIR = old_temp


class MediaArgsTests(unittest.TestCase):
    def test_video_args(self) -> None:
        args = cs.build_ffmpeg_media_args(
            Path("in.mp4"),
            Path("out.mp4"),
            {
                "extension": "mp4",
                "scale": "1280:720",
                "videoBitrate": "2M",
                "audioBitrate": "128k",
                "start": "1.5",
                "duration": "10",
            },
        )
        self.assertEqual(args[:6], ["-y", "-ss", "1.5", "-i", "in.mp4", "-t"])
        self.assertIn("10", args)
        self.assertIn("-vf", args)
        self.assertIn("scale=1280:720", args)
        self.assertIn("-b:v", args)
        self.assertIn("2m", args)
        self.assertEqual(args[-1], "out.mp4")

    def test_audio_only_and_gif(self) -> None:
        mp3 = cs.build_ffmpeg_media_args(Path("in.mp4"), Path("out.mp3"), {"extension": "mp3", "audioBitrate": "192k"})
        self.assertIn("-vn", mp3)
        self.assertIn("libmp3lame", mp3)
        gif = cs.build_ffmpeg_media_args(
            Path("in.mp4"), Path("out.gif"), {"extension": "gif", "gifFps": "12", "scale": "-2:480"}
        )
        vf = gif[gif.index("-vf") + 1]
        self.assertIn("fps=12", vf)
        self.assertIn("scale=-2:480", vf)

    def test_sanitize_rejects(self) -> None:
        with self.assertRaises(ValueError):
            cs.sanitize_media_bitrate("fast", "videoBitrate")
        with self.assertRaises(ValueError):
            cs.sanitize_gif_fps("99")
        with self.assertRaises(ValueError):
            cs.sanitize_media_crop("bad")


class OcrPdfRenderTests(unittest.TestCase):
    def test_render_rejects_pages_above_pixel_limit(self) -> None:
        try:
            import pypdfium2  # noqa: F401
        except ImportError:
            self.skipTest("pypdfium2 not installed")
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            sample = base / "large.pdf"
            page_dir = base / "pages"
            page_dir.mkdir()
            _make_pdf(sample, 1)
            old_limit = cs.OCR_PDF_MAX_PIXELS
            cs.OCR_PDF_MAX_PIXELS = 10
            try:
                with self.assertRaisesRegex(RuntimeError, "too large"):
                    cs._render_pdf_pages_sync(sample, page_dir, max_pages=1, scale=1.0)
            finally:
                cs.OCR_PDF_MAX_PIXELS = old_limit

    def test_render_pdf_pages_creates_png(self) -> None:
        sample = ROOT / "smoke-temp" / "release-check" / "input" / "a.pdf"
        if not sample.exists():
            self.skipTest("sample PDF not present")
        try:
            import pypdfium2  # noqa: F401
        except ImportError:
            self.skipTest("pypdfium2 not installed")
        with tempfile.TemporaryDirectory() as tmp:
            page_dir = Path(tmp) / "pages"
            page_dir.mkdir()
            images, log = cs._render_pdf_pages_sync(sample, page_dir, max_pages=2, scale=1.0)
            self.assertGreaterEqual(len(images), 1)
            self.assertTrue(images[0].exists())
            self.assertIn("render:", log)


class LibreOfficeOutputTests(unittest.TestCase):
    def test_resolve_expected_and_renamed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            before = cs.snapshot_output_dir(out)
            expected = out / "My Report.final.pdf"
            expected.write_bytes(b"%PDF")
            found = cs.resolve_libreoffice_output(out, Path("My Report.final.docx"), "pdf", before)
            self.assertEqual(found, expected)

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            before = cs.snapshot_output_dir(out)
            alt = out / "weird_name.pdf"
            alt.write_bytes(b"%PDF")
            found = cs.resolve_libreoffice_output(out, Path("weird name.xlsx"), "pdf", before)
            self.assertEqual(found, alt)

    def test_missing_output_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            before = cs.snapshot_output_dir(out)
            with self.assertRaises(RuntimeError) as ctx:
                cs.resolve_libreoffice_output(out, Path("a.docx"), "pdf", before)
            self.assertIn("找不到輸出檔", str(ctx.exception))


class PdfSplitTests(unittest.TestCase):
    def test_out_of_range_only_raises(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "a.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=2)
            with self.assertRaises(ValueError) as ctx:
                cs._split_pdf_sync(src, out, [(10, 12)])
            self.assertIn("No valid pages", str(ctx.exception))
            self.assertEqual(list(out.glob("*.pdf")), [])

    def test_partial_range_skips_invalid(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "a.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=2)
            outputs, logs = cs._split_pdf_sync(src, out, [(1, 1), (10, 12)])
            self.assertEqual(len(outputs), 1)
            self.assertTrue(outputs[0].exists())
            self.assertTrue(any("skipped" in item for item in logs))


class EncryptedPdfTests(unittest.TestCase):
    def test_require_unencrypted_detects_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "plain.pdf"
            _make_pdf(src, pages=1)
            # plain should pass
            cs.require_unencrypted_pdf(src)

    def test_encrypted_error_message_helper(self) -> None:
        err = cs.encrypted_pdf_error("secret.pdf")
        self.assertIn("加密", str(err))
        self.assertIn("secret.pdf", str(err))
        self.assertTrue(cs.re_search_encrypted("document is encrypted"))
        self.assertTrue(cs.re_search_encrypted("需要密碼"))
        self.assertFalse(cs.re_search_encrypted("not found"))


class JobCancelTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_queued(self) -> None:
        service = JobService()
        from backend.services.job_service import Job

        fake = Job(
            id="queued1",
            type="pdf-merge",
            input_paths=[],
            output_dir=Path(tempfile.mkdtemp()),
            options={},
            status="queued",
        )
        service.jobs.insert(0, fake)
        public = await service.cancel_job("queued1")
        assert public is not None
        self.assertEqual(public["status"], "cancelled")
        self.assertEqual(fake.status, "cancelled")

    async def test_cancel_running_sets_flag(self) -> None:
        from backend.services.job_service import Job

        service = JobService()
        fake = Job(
            id="run1",
            type="pdf-merge",
            input_paths=[],
            output_dir=Path(tempfile.mkdtemp()),
            options={},
            status="running",
        )
        service.jobs.insert(0, fake)
        public = await service.cancel_job("run1")
        assert public is not None
        self.assertTrue(fake.cancel_requested)
        self.assertTrue(cs._cancel_requested.get("run1"))

    async def test_delete_running_rejected(self) -> None:
        from backend.services.job_service import Job

        service = JobService()
        fake = Job(
            id="run2",
            type="pdf-merge",
            input_paths=[],
            output_dir=Path(tempfile.mkdtemp()),
            options={},
            status="running",
        )
        service.jobs.insert(0, fake)
        with self.assertRaises(ValueError):
            await service.delete_job("run2")

    async def test_run_job_respects_cancel_before_work(self) -> None:
        from backend.services.job_service import Job

        service = JobService()
        fake = Job(
            id="run3",
            type="pdf-merge",
            input_paths=[],
            output_dir=Path(tempfile.mkdtemp()),
            options={},
            status="queued",
            cancel_requested=True,
        )
        service.jobs.insert(0, fake)
        await service._run_job(fake)
        self.assertEqual(fake.status, "cancelled")

    async def test_queue_reruns_after_worker_finishes(self) -> None:
        """Regression: jobs enqueued while running must still be processed."""
        from backend.services.job_service import Job

        service = JobService()
        calls: list[str] = []

        async def fake_run(job: Job) -> None:
            calls.append(job.id)
            job.status = "done"
            job.finished_at = "t"

        service._run_job = fake_run  # type: ignore[method-assign]

        first = Job(id="j1", type="pdf-merge", input_paths=[], output_dir=Path("."), options={})
        second = Job(id="j2", type="pdf-merge", input_paths=[], output_dir=Path("."), options={})
        service.jobs = [second, first]  # insert order newest-first; queue runs oldest first

        await service._run_next()
        # allow follow-up create_task(_run_next) if any
        await asyncio.sleep(0.05)
        # With only queued jobs and fake_run, single _run_next should drain both in while loop
        self.assertEqual(calls, ["j1", "j2"])


class JobCancelledProcessTests(unittest.TestCase):
    def test_ensure_not_cancelled_raises(self) -> None:
        cs.begin_job("x")
        try:
            cs.request_cancel("x")
            with self.assertRaises(cs.JobCancelled):
                cs.ensure_not_cancelled()
        finally:
            cs.end_job("x")


class ProcessErrorFormatterTests(unittest.TestCase):
    def test_unsigned_crash_code_3221226505(self) -> None:
        msg = cs.format_process_error(returncode=3221226505)
        self.assertIn("0xC0000409", msg)
        self.assertIn("意外崩潰", msg)
        self.assertNotRegex(msg, r"^Process exited with code")
        self.assertIn("【技術詳情】", msg)

    def test_signed_crash_code_minus_1073740791(self) -> None:
        self.assertTrue(cs.is_windows_stack_buffer_overrun(-1073740791))
        self.assertTrue(cs.is_windows_stack_buffer_overrun(3221226505))
        self.assertTrue(cs.is_windows_stack_buffer_overrun(0xC0000409))
        msg = cs.format_process_error(returncode=-1073740791, stdout="faulting module ucrtbase.dll")
        self.assertIn("0xC0000409", msg)
        self.assertIn("ucrtbase.dll", msg)

    def test_timeout_message(self) -> None:
        msg = cs.format_process_error(timeout=True, timeout_seconds=180)
        self.assertIn("逾時", msg)
        self.assertIn("180", msg)

    def test_not_found_and_permission(self) -> None:
        nf = cs.format_process_error(not_found=True, executable=r"C:\missing\soffice.exe")
        self.assertIn("找不到", nf)
        perm = cs.format_process_error(permission_denied=True, executable="soffice")
        self.assertIn("權限", perm)

    def test_output_missing(self) -> None:
        msg = cs.format_process_error(output_missing=True, expected_output="a.docx")
        self.assertIn("未產生輸出檔", msg)
        self.assertIn("a.docx", msg)

    def test_impl_store_and_filter(self) -> None:
        store = cs.format_process_error(
            returncode=1,
            stderr="SfxBaseModel::impl_store failed\nError Area:Io Class:Write Code:16",
        )
        self.assertIn("無法寫入", store)
        filt = cs.format_process_error(returncode=1, stderr="Unknown export filter for foobar")
        self.assertIn("匯出篩選器", filt)

    def test_run_process_sync_maps_crash_code(self) -> None:
        class FakeProc:
            def __init__(self) -> None:
                self.returncode = 3221226505

            def communicate(self, timeout=None):  # noqa: ANN001
                return ("", "crash")

            def kill(self) -> None:
                return None

            def poll(self):  # noqa: ANN001
                return self.returncode

        original = cs.subprocess.Popen

        def fake_popen(*_a, **_k):  # noqa: ANN001
            return FakeProc()

        cs.subprocess.Popen = fake_popen  # type: ignore[assignment]
        try:
            with self.assertRaises(RuntimeError) as ctx:
                cs._run_process_sync("soffice", ["--version"], 30, None, "LibreOffice")
            self.assertIn("0xC0000409", str(ctx.exception))
            self.assertIn("crash", str(ctx.exception))
        finally:
            cs.subprocess.Popen = original  # type: ignore[assignment]

    def test_run_process_sync_timeout(self) -> None:
        class FakeProc:
            returncode = -1

            def communicate(self, timeout=None):  # noqa: ANN001
                if timeout is not None:
                    raise cs.subprocess.TimeoutExpired(cmd="x", timeout=timeout)
                return ("partial", "out")

            def kill(self) -> None:
                return None

        original = cs.subprocess.Popen
        cs.subprocess.Popen = lambda *a, **k: FakeProc()  # type: ignore[assignment,misc]
        try:
            with self.assertRaises(RuntimeError) as ctx:
                cs._run_process_sync("soffice", [], 12, None, "LibreOffice")
            self.assertIn("逾時", str(ctx.exception))
            self.assertIn("12", str(ctx.exception))
        finally:
            cs.subprocess.Popen = original  # type: ignore[assignment]


class PdfToOfficeFallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_libreoffice_success_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "doc.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=1)

            async def fake_require(_key: str):
                return {"path": "fake-soffice", "available": True}

            async def fake_run(executable, args, timeout=300, tool_label="外部程序"):  # noqa: ANN001
                # Simulate LO writing the expected docx.
                target = out / "doc.docx"
                target.write_bytes(b"PK" + b"\0" * 100)
                return "ok"

            original_require = cs.tools_service.require_tool
            original_run = cs.run_process
            cs.tools_service.require_tool = fake_require  # type: ignore[method-assign]
            cs.run_process = fake_run  # type: ignore[assignment]
            try:
                outputs, logs = await cs.convert_pdf_to_office([src], out, "docx")
                self.assertEqual(len(outputs), 1)
                self.assertTrue(outputs[0].exists())
                self.assertGreater(outputs[0].stat().st_size, 64)
                self.assertFalse((out / "doc_lo_profile").exists())
            finally:
                cs.tools_service.require_tool = original_require  # type: ignore[method-assign]
                cs.run_process = original_run  # type: ignore[assignment]

    async def test_crash_falls_back_to_pdf2docx(self) -> None:
        try:
            import pdf2docx  # noqa: F401
        except ImportError:
            self.skipTest("pdf2docx not installed")

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "scan.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=1)

            async def fake_require(_key: str):
                return {"path": "fake-soffice", "available": True}

            async def fake_run(executable, args, timeout=300, tool_label="外部程序"):  # noqa: ANN001
                # Incomplete/zero-byte artifact then crash.
                bad = out / "scan.docx"
                bad.write_bytes(b"")
                raise RuntimeError(cs.format_process_error(returncode=3221226505, stderr="ucrtbase"))

            def fake_pdf2docx_sync(input_path: Path, output_path: Path) -> None:
                output_path.write_bytes(b"PK" + b"compat" * 20)

            original_require = cs.tools_service.require_tool
            original_run = cs.run_process
            original_sync = cs._pdf_to_docx_sync
            cs.tools_service.require_tool = fake_require  # type: ignore[method-assign]
            async def no_tess() -> bool:
                return False

            original_tess = cs.tesseract_available
            cs.run_process = fake_run  # type: ignore[assignment]
            cs._pdf_to_docx_sync = fake_pdf2docx_sync  # type: ignore[assignment]
            cs.tesseract_available = no_tess  # type: ignore[assignment]
            try:
                outputs, logs = await cs.convert_pdf_to_office(
                    [src], out, "docx", scan_ocr="off"
                )
                self.assertEqual(len(outputs), 1)
                self.assertTrue(outputs[0].exists())
                self.assertGreater(outputs[0].stat().st_size, 64)
                self.assertTrue(any(cs.DOCX_FALLBACK_LOG in item for item in logs))
                self.assertFalse((out / "scan_lo_profile").exists())
                # Incomplete empty docx must not remain as the only product (replaced by fallback).
                self.assertNotEqual(outputs[0].stat().st_size, 0)
            finally:
                cs.tools_service.require_tool = original_require  # type: ignore[method-assign]
                cs.run_process = original_run  # type: ignore[assignment]
                cs._pdf_to_docx_sync = original_sync  # type: ignore[assignment]
                cs.tesseract_available = original_tess  # type: ignore[assignment]

    async def test_fallback_missing_pdf2docx(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "a.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=1)

            async def fake_require(_key: str):
                return {"path": "fake-soffice", "available": True}

            async def fake_run(executable, args, timeout=300, tool_label="外部程序"):  # noqa: ANN001
                raise RuntimeError(cs.format_process_error(returncode=-1073740791))

            async def no_tess() -> bool:
                return False

            original_require = cs.tools_service.require_tool
            original_run = cs.run_process
            original_avail = cs.pdf2docx_available
            original_tess = cs.tesseract_available
            cs.tools_service.require_tool = fake_require  # type: ignore[method-assign]
            cs.run_process = fake_run  # type: ignore[assignment]
            cs.pdf2docx_available = lambda: False  # type: ignore[assignment]
            cs.tesseract_available = no_tess  # type: ignore[assignment]
            try:
                with self.assertRaises(RuntimeError) as ctx:
                    # scan_ocr=off: blank PDFs would otherwise take the OCR path first.
                    await cs.convert_pdf_to_office([src], out, "docx", scan_ocr="off")
                msg = str(ctx.exception)
                self.assertIn("相容引擎未安裝", msg)
                self.assertIn("requirements.txt", msg)
            finally:
                cs.tools_service.require_tool = original_require  # type: ignore[method-assign]
                cs.run_process = original_run  # type: ignore[assignment]
                cs.pdf2docx_available = original_avail  # type: ignore[assignment]
                cs.tesseract_available = original_tess  # type: ignore[assignment]

    async def test_xlsx_does_not_use_docx_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "sheet.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=1)
            fallback_called = {"n": 0}

            async def fake_require(_key: str):
                return {"path": "fake-soffice", "available": True}

            async def fake_run(executable, args, timeout=300, tool_label="外部程序"):  # noqa: ANN001
                raise RuntimeError(cs.format_process_error(returncode=3221226505))

            def fake_pdf2docx_sync(input_path: Path, output_path: Path) -> None:
                fallback_called["n"] += 1
                output_path.write_bytes(b"PK" + b"x" * 40)

            original_require = cs.tools_service.require_tool
            original_run = cs.run_process
            original_sync = cs._pdf_to_docx_sync
            cs.tools_service.require_tool = fake_require  # type: ignore[method-assign]
            cs.run_process = fake_run  # type: ignore[assignment]
            cs._pdf_to_docx_sync = fake_pdf2docx_sync  # type: ignore[assignment]
            try:
                with self.assertRaises(RuntimeError) as ctx:
                    await cs.convert_pdf_to_office([src], out, "xlsx")
                self.assertEqual(fallback_called["n"], 0)
                self.assertIn("實驗性", str(ctx.exception))
                self.assertIn("0xC0000409", str(ctx.exception))
            finally:
                cs.tools_service.require_tool = original_require  # type: ignore[method-assign]
                cs.run_process = original_run  # type: ignore[assignment]
                cs._pdf_to_docx_sync = original_sync  # type: ignore[assignment]

    async def test_pptx_odt_no_fallback(self) -> None:
        for ext in ("pptx", "odt"):
            with tempfile.TemporaryDirectory() as tmp:
                base = Path(tmp)
                src = base / f"p.{ext}.pdf"
                # stem will be "p.pptx" if name is p.pptx.pdf — use simple name
                src = base / "deck.pdf"
                out = base / "out"
                out.mkdir()
                _make_pdf(src, pages=1)
                called = {"n": 0}

                async def fake_require(_key: str):
                    return {"path": "fake-soffice", "available": True}

                async def fake_run(executable, args, timeout=300, tool_label="外部程序"):  # noqa: ANN001
                    raise RuntimeError("LibreOffice failed hard")

                def fake_pdf2docx_sync(input_path: Path, output_path: Path) -> None:
                    called["n"] += 1

                original_require = cs.tools_service.require_tool
                original_run = cs.run_process
                original_sync = cs._pdf_to_docx_sync
                cs.tools_service.require_tool = fake_require  # type: ignore[method-assign]
                cs.run_process = fake_run  # type: ignore[assignment]
                cs._pdf_to_docx_sync = fake_pdf2docx_sync  # type: ignore[assignment]
                try:
                    with self.assertRaises(RuntimeError) as ctx:
                        await cs.convert_pdf_to_office([src], out, ext)
                    self.assertEqual(called["n"], 0)
                    self.assertIn("實驗性", str(ctx.exception))
                finally:
                    cs.tools_service.require_tool = original_require  # type: ignore[method-assign]
                    cs.run_process = original_run  # type: ignore[assignment]
                    cs._pdf_to_docx_sync = original_sync  # type: ignore[assignment]

    async def test_missing_output_triggers_cleanup_and_fallback(self) -> None:
        try:
            import pdf2docx  # noqa: F401
        except ImportError:
            self.skipTest("pdf2docx not installed")

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "emptyout.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=1)

            async def fake_require(_key: str):
                return {"path": "fake-soffice", "available": True}

            async def fake_run(executable, args, timeout=300, tool_label="外部程序"):  # noqa: ANN001
                # Exit 0 but create incomplete file only.
                (out / "emptyout.docx").write_bytes(b"xx")
                return "done"

            def fake_pdf2docx_sync(input_path: Path, output_path: Path) -> None:
                output_path.write_bytes(b"PK" + b"ok" * 40)

            original_require = cs.tools_service.require_tool
            original_run = cs.run_process
            original_sync = cs._pdf_to_docx_sync
            cs.tools_service.require_tool = fake_require  # type: ignore[method-assign]
            cs.run_process = fake_run  # type: ignore[assignment]
            cs._pdf_to_docx_sync = fake_pdf2docx_sync  # type: ignore[assignment]
            async def no_tess() -> bool:
                return False

            original_tess = cs.tesseract_available
            cs.tesseract_available = no_tess  # type: ignore[assignment]
            try:
                outputs, logs = await cs.convert_pdf_to_office(
                    [src], out, "docx", scan_ocr="off"
                )
                self.assertEqual(len(outputs), 1)
                self.assertTrue(any(cs.DOCX_FALLBACK_LOG in item for item in logs))
                self.assertGreater(outputs[0].stat().st_size, 64)
            finally:
                cs.tools_service.require_tool = original_require  # type: ignore[method-assign]
                cs.run_process = original_run  # type: ignore[assignment]
                cs._pdf_to_docx_sync = original_sync  # type: ignore[assignment]
                cs.tesseract_available = original_tess  # type: ignore[assignment]

    def test_remove_incomplete_and_profile_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            tiny = base / "a.docx"
            tiny.write_bytes(b"")
            self.assertTrue(cs.remove_incomplete_office_output(tiny))
            self.assertFalse(tiny.exists())

            profile = base / "stem_lo_profile"
            (profile / "user").mkdir(parents=True)
            (profile / "user" / "x").write_text("y", encoding="utf-8")
            cs.cleanup_lo_profile(profile)
            self.assertFalse(profile.exists())

    def test_pdf2docx_status_shape(self) -> None:
        status = cs.pdf2docx_status()
        self.assertIn("available", status)
        self.assertIn("label", status)
        self.assertEqual(status["label"], "PDF→DOCX 相容引擎")

    def test_sanitize_docx_engine(self) -> None:
        self.assertEqual(cs.sanitize_docx_engine("auto"), "auto")
        self.assertEqual(cs.sanitize_docx_engine("compat"), "compat")
        self.assertEqual(cs.sanitize_docx_engine("pdf2docx"), "compat")
        with self.assertRaises(ValueError):
            cs.sanitize_docx_engine("magic")

    async def test_docx_engine_compat_skips_libreoffice(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "a.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=1)
            lo_calls = {"n": 0}

            async def boom_run(*_a, **_k):  # noqa: ANN001
                lo_calls["n"] += 1
                raise RuntimeError("should not call LO")

            def fake_pdf2docx(input_path: Path, output_path: Path) -> None:
                output_path.write_bytes(b"PK" + b"c" * 80)

            original_run = cs.run_process
            original_sync = cs._pdf_to_docx_sync
            original_tess = cs.tesseract_available
            cs.run_process = boom_run  # type: ignore[assignment]
            cs._pdf_to_docx_sync = fake_pdf2docx  # type: ignore[assignment]

            async def no_tess() -> bool:
                return False

            cs.tesseract_available = no_tess  # type: ignore[assignment]
            try:
                outputs, logs = await cs.convert_pdf_to_office(
                    [src], out, "docx", docx_engine="compat", scan_ocr="off"
                )
                self.assertEqual(lo_calls["n"], 0)
                self.assertEqual(len(outputs), 1)
                self.assertTrue(any(cs.DOCX_COMPAT_DIRECT_LOG in item for item in logs))
            finally:
                cs.run_process = original_run  # type: ignore[assignment]
                cs._pdf_to_docx_sync = original_sync  # type: ignore[assignment]
                cs.tesseract_available = original_tess  # type: ignore[assignment]

    def test_scan_hint_on_blank_pdf(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "blank.pdf"
            _make_pdf(src, pages=1)
            hint = cs.maybe_scan_ocr_hint(src)
            self.assertIsNotNone(hint)
            assert hint is not None
            self.assertIn("掃描", hint)

    def test_sanitize_scan_ocr(self) -> None:
        self.assertEqual(cs.sanitize_scan_ocr("auto"), "auto")
        self.assertEqual(cs.sanitize_scan_ocr("force"), "force")
        self.assertEqual(cs.sanitize_scan_ocr("off"), "off")
        with self.assertRaises(ValueError):
            cs.sanitize_scan_ocr("maybe")

    def test_sanitize_ocr_output(self) -> None:
        self.assertEqual(cs.sanitize_ocr_output("both"), "both")
        self.assertEqual(cs.sanitize_ocr_output("searchable"), "searchable")
        self.assertEqual(cs.sanitize_ocr_output("docx"), "docx")
        self.assertEqual(cs.sanitize_ocr_output("pdf"), "searchable")
        with self.assertRaises(ValueError):
            cs.sanitize_ocr_output("zip")

    def test_pdf_to_searchable_job_type_supported(self) -> None:
        from backend.services.job_service import SUPPORTED_JOB_TYPES

        self.assertIn("pdf-to-searchable-pdf", SUPPORTED_JOB_TYPES)

    def test_searchable_job_options_defaults(self) -> None:
        from backend.services.job_service import JobService

        service = JobService()
        opts = service._validate_options("pdf-to-searchable-pdf", {})
        self.assertEqual(opts["language"], "chi_tra+eng")
        self.assertIn("maxPages", opts)

    def test_write_text_docx_minimal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "t.docx"
            cs.write_text_docx_sync(out, "Hello\nWorld", title="Test")
            self.assertTrue(out.is_file())
            self.assertGreater(out.stat().st_size, 64)
            # ZIP signature
            self.assertEqual(out.read_bytes()[:2], b"PK")

    async def test_ocr_pipeline_mocked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "scan.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=1)

            async def fake_ocr(paths, odir, language, max_pages=50):  # noqa: ANN001
                target = odir / f"{paths[0].stem}_ocr.txt"
                target.write_text("--- Page 1 ---\nOCR HELLO\n", encoding="utf-8")
                return [target], ["ocr-mock"]

            original = cs.ocr_pdf
            cs.ocr_pdf = fake_ocr  # type: ignore[assignment]
            try:
                path, logs = await cs.convert_pdf_to_docx_via_ocr(src, out, language="eng", max_pages=2)
                self.assertTrue(path.exists())
                self.assertTrue(any(cs.DOCX_OCR_PIPELINE_LOG in x for x in logs))
            finally:
                cs.ocr_pdf = original  # type: ignore[assignment]

    async def test_searchable_ocr_then_docx_mocked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            src = base / "scan.pdf"
            out = base / "out"
            out.mkdir()
            _make_pdf(src, pages=1)

            async def fake_searchable(input_path, output_dir, language="eng", max_pages=50):  # noqa: ANN001
                pdf = output_dir / f"{input_path.stem}_ocr_searchable.pdf"
                # Minimal valid-enough PDF bytes for existence checks
                pdf.write_bytes(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n" + b"\0" * 80)
                return pdf, ["ocr-searchable-mock"]

            def fake_pdf2docx(input_path: Path, output_path: Path) -> None:
                output_path.write_bytes(b"PK" + b"from-searchable" * 10)

            original_s = cs.create_searchable_pdf_via_ocr
            original_p = cs._pdf_to_docx_sync
            cs.create_searchable_pdf_via_ocr = fake_searchable  # type: ignore[assignment]
            cs._pdf_to_docx_sync = fake_pdf2docx  # type: ignore[assignment]
            try:
                path, logs = await cs.convert_pdf_to_docx_via_searchable_ocr(
                    src, out, language="eng", max_pages=2, ocr_output="both"
                )
                self.assertTrue(path.exists())
                self.assertTrue((out / "scan_ocr_searchable.pdf").exists())
                self.assertTrue(any(cs.DOCX_SEARCHABLE_OCR_LOG in x for x in logs))

                path_only, logs_only = await cs.convert_pdf_to_docx_via_searchable_ocr(
                    src, out, language="eng", max_pages=2, ocr_output="searchable"
                )
                self.assertTrue(str(path_only).endswith("_ocr_searchable.pdf"))
                self.assertTrue(any("僅輸出可搜尋 PDF" in x for x in logs_only))

                path_docx, logs_docx = await cs.convert_pdf_to_docx_via_searchable_ocr(
                    src, out, language="eng", max_pages=2, ocr_output="docx"
                )
                self.assertTrue(str(path_docx).endswith(".docx"))
                self.assertFalse((out / "scan_ocr_searchable.pdf").exists())
                self.assertTrue(any("移除可搜尋 PDF" in x for x in logs_docx))
            finally:
                cs.create_searchable_pdf_via_ocr = original_s  # type: ignore[assignment]
                cs._pdf_to_docx_sync = original_p  # type: ignore[assignment]


if __name__ == "__main__":
    unittest.main()
