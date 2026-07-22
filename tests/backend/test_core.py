"""
Python backend unit tests for conversion helpers and job cancel.

Run from repo root:
  py -3 -m unittest tests.backend.test_core -v
  # or
  py -3 tests/backend/test_core.py
"""

from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services import conversion_service as cs
from backend.services.job_service import JobService


def _make_pdf(path: Path, pages: int = 2) -> None:
    from pypdf import PdfWriter

    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=200, height=200)
    with path.open("wb") as handle:
        writer.write(handle)


class TessdataTests(unittest.TestCase):
    def test_resolve_bundled_tessdata(self) -> None:
        tool = ROOT / "tools" / "tesseract" / "tesseract.exe"
        if not tool.exists():
            self.skipTest("bundled tesseract not present")
        found = cs.resolve_tessdata_dir(tool)
        self.assertIsNotNone(found)
        assert found is not None
        self.assertEqual(found.name, "tessdata")
        self.assertTrue(found.is_dir())


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


if __name__ == "__main__":
    unittest.main()
