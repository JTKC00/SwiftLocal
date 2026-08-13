"use strict";

/**
 * Desktop backend unit tests (no Electron window required).
 * Run: node --test tests/desktop/backend.test.js
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, describe, before, after } = require("node:test");
const { PDFDocument } = require("pdf-lib");

const {
  BackendService,
  snapshotOutputDir,
  resolveLibreOfficeOutput,
  formatProcessError,
  isWindowsStackBufferOverrun,
  libreOfficeArgs,
  pathToLibreOfficeFileUri,
  createLibreOfficeProfileDir,
  filterSuccessfulToolOutput,
  detectTesseractLanguageSupport,
  parseTesseractListLanguages,
  scanTessdataLanguages,
  resolveOcrLanguage,
  buildTesseractOcrArgs,
  chooseOcrText,
  repairOcrText,
  removeIncompleteOfficeOutput,
  cleanupLoProfile,
  pdfBytesLookEncrypted,
  isEncryptedPdfMessage,
  parsePageRanges,
  sanitizeOfficeExtension,
  officeConvertTarget,
  buildFfmpegMediaArgs,
  sanitizeMediaBitrate,
  sanitizeGifFps,
  loadJobsState,
  saveJobsState,
  atomicWriteFileSync,
  normalizePersistedJob,
  redactJobOptions,
  nextAvailablePath,
  fitOutputFilename,
  validateJobInputLimits,
  DEFAULT_OCR_LANGUAGE,
  sanitizeOcrLanguage,
  sanitizeDesktopJobOptions,
  sanitizeImageOps,
  sanitizeImageRectangle,
  sanitizeImageQuality,
  sanitizeImageDimension,
  sanitizeImageKeepRatio,
  resolveWorkspaceImageSize,
  renderWorkspaceImageCanvas,
  sanitizeOcrPageSelection,
  assertOcrLanguagesAvailable,
  createFriendlyOcrError,
  bundledTessdataDir,
  listOcrLanguages,
  JobCancelledError,
  runProcess
} = require("../../desktop/backend.js");

const { createCanvas } = require("@napi-rs/canvas");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFakeTesseract(dir, body) {
  if (process.platform === "win32") {
    const file = path.join(dir, "tesseract.cmd");
    fs.writeFileSync(file, `@echo off\r\n${body}\r\n`, "utf8");
    return file;
  }
  const file = path.join(dir, "tesseract");
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, "utf8");
  fs.chmodSync(file, 0o755);
  return file;
}

function writeFakeNodeTool(dir, name, source) {
  const script = path.join(dir, `${name}.js`);
  fs.writeFileSync(script, source, "utf8");
  if (process.platform === "win32") {
    const wrapper = path.join(dir, `${name}.cmd`);
    fs.writeFileSync(wrapper, `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`, "utf8");
    return wrapper;
  }
  const wrapper = path.join(dir, name);
  fs.writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, "utf8");
  fs.chmodSync(wrapper, 0o755);
  return wrapper;
}

async function writeBlankPdf(filePath, pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage([200, 200]);
  }
  fs.writeFileSync(filePath, await doc.save());
}

function jpegWithExifOrientation(jpeg, orientation) {
  const tiff = Buffer.alloc(26);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt32LE(0, 22);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const marker = Buffer.alloc(4);
  marker[0] = 0xff;
  marker[1] = 0xe1;
  marker.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), marker, payload, jpeg.subarray(2)]);
}

describe("pdfBytesLookEncrypted", () => {
  test("detects /Encrypt marker", () => {
    const sample = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n");
    assert.equal(pdfBytesLookEncrypted(sample), true);
  });

  test("plain PDF is not encrypted", () => {
    const sample = Buffer.from("%PDF-1.4 no crypto here");
    assert.equal(pdfBytesLookEncrypted(sample), false);
  });
});

describe("isEncryptedPdfMessage", () => {
  test("matches common encrypted wording", () => {
    assert.equal(isEncryptedPdfMessage("Input document is encrypted"), true);
    assert.equal(isEncryptedPdfMessage("需要密碼"), true);
    assert.equal(isEncryptedPdfMessage("PDF 已加密"), true);
    assert.equal(isEncryptedPdfMessage("parse failed"), false);
  });
});

describe("Tesseract language detection", () => {
  test("--list-langs containing chi_tra marks Traditional Chinese as installed", async () => {
    const dir = tempDir("sl-tess-list-");
    try {
      const exe = path.join(dir, "tesseract.exe");
      fs.writeFileSync(exe, "");
      let seenArgs = [];
      const result = await detectTesseractLanguageSupport(exe, async (_file, args) => {
        seenArgs = args;
        return "List of available languages (4):\nchi_sim\nchi_tra\neng\nosd\n";
      });
      assert.equal(result.detectionMethod, "list-langs");
      assert.equal(result.hasChiTra, true);
      assert.equal(result.hasEng, true);
      assert.ok(seenArgs.includes("--list-langs"));
      assert.deepEqual(result.detectedLanguages, ["chi_sim", "chi_tra", "eng", "osd"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("manifest missing chi_tra does not override actual listed languages", async () => {
    const dir = tempDir("sl-tess-manifest-");
    try {
      const tessdata = path.join(dir, "tessdata");
      fs.mkdirSync(tessdata);
      fs.writeFileSync(path.join(tessdata, "swiftlocal-tessdata.json"), JSON.stringify({ languages: ["eng"] }));
      const exe = path.join(dir, "tesseract.exe");
      fs.writeFileSync(exe, "");
      const result = await detectTesseractLanguageSupport(exe, async () => {
        return "List of available languages (2):\nchi_tra\neng\n";
      });
      assert.equal(result.detectionMethod, "list-langs");
      assert.equal(result.hasChiTra, true);
      assert.deepEqual(result.detectedLanguages, ["chi_tra", "eng"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("falls back to scanning traineddata when --list-langs fails", async () => {
    const dir = tempDir("sl-tess-scan-");
    try {
      const tessdata = path.join(dir, "tessdata");
      fs.mkdirSync(tessdata);
      fs.writeFileSync(path.join(tessdata, "chi_tra.traineddata"), Buffer.alloc(60_000));
      fs.writeFileSync(path.join(tessdata, "eng.traineddata"), Buffer.alloc(60_000));
      const exe = writeFakeTesseract(dir, process.platform === "win32" ? "exit /b 9" : "exit 9");
      const result = await detectTesseractLanguageSupport(exe);
      assert.equal(result.detectionMethod, "traineddata-scan");
      assert.equal(result.hasChiTra, true);
      assert.deepEqual(result.detectedLanguages, ["chi_tra", "eng"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reports missing chi_tra only when it is absent", () => {
    assert.deepEqual(parseTesseractListLanguages("List of available languages (2):\neng\nosd\n"), ["eng", "osd"]);
    const dir = tempDir("sl-tess-nochi-");
    try {
      fs.writeFileSync(path.join(dir, "eng.traineddata"), Buffer.alloc(60_000));
      const langs = scanTessdataLanguages(dir);
      assert.equal(langs.includes("chi_tra"), false);
      assert.deepEqual(langs, ["eng"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("OCR language resolver keeps chi_tra from --list-langs even without traineddata scan", () => {
    const dir = tempDir("sl-tess-ocr-lang-");
    try {
      const body = process.platform === "win32"
        ? "echo List of available languages ^(2^):\r\necho chi_tra\r\necho eng\r\nexit /b 0"
        : 'printf "List of available languages (2):\\nchi_tra\\neng\\n"\nexit 0';
      const exe = writeFakeTesseract(dir, body);
      const result = resolveOcrLanguage(exe, "chi_tra+eng");
      assert.equal(result.language, "chi_tra+eng");
      assert.equal(result.note, "");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Tesseract OCR args pass tessdata before input and keep language", () => {
    const args = buildTesseractOcrArgs("scan.png", "scan_ocr", "chi_tra+eng", "C:\\tools\\tesseract\\tessdata", "pdf");
    assert.deepEqual(args, [
      "--tessdata-dir",
      "C:\\tools\\tesseract\\tessdata",
      "--psm",
      "6",
      "scan.png",
      "scan_ocr",
      "-l",
      "chi_tra+eng",
      "pdf"
    ]);
  });

  test("OCR text repair fixes common Windows security dialog misread", () => {
    const text = [
      "CapabilityAccessManager",
      "若要取得資料夾存取權,您必須使用蕉全性天記樟訪-",
      "BRO"
    ].join("\n");
    const fixed = repairOcrText(text);
    assert.match(fixed, /使用安全性索引標籤。/);
    assert.match(fixed, /關閉\(C\)/);
  });

  test("OCR chooser can prefer sparse UI text over block text", () => {
    const primary = "CapabilityAccessManager\n若要取得資料夾存取權,您必須使用蕉全性天記樟訪-\n關閉(C)";
    const sparse = [
      "CapabilityAccessManager",
      "A 您已被拒絕,無權存取這個資料夾。",
      "若要取得資料夾存取權,您必須使用蕉全性天記樟訪-",
      "BRO"
    ].join("\n");
    const chosen = chooseOcrText(primary, sparse);
    assert.match(chosen, /您已被拒絕/);
    assert.match(chosen, /安全性索引標籤/);
    assert.match(chosen, /關閉\(C\)/);
  });
});

describe("parsePageRanges", () => {
  test("empty text returns all pages", () => {
    assert.deepEqual(parsePageRanges("", 3), [[0, 1, 2]]);
  });

  test("parses ranges and clips to page count", () => {
    assert.deepEqual(parsePageRanges("1-2,5", 4), [[0, 1]]);
  });

  test("rejects inverted ranges", () => {
    assert.deepEqual(parsePageRanges("5-1", 10), []);
  });
});

describe("PDF workspace OCR helpers", () => {
  test("uses Traditional Chinese plus English as the default language", () => {
    assert.equal(DEFAULT_OCR_LANGUAGE, "chi_tra+eng");
    assert.equal(sanitizeOcrLanguage(""), "chi_tra+eng");
    assert.equal(sanitizeOcrLanguage("chi_tra+eng+chi_tra"), "chi_tra+eng");
    assert.throws(() => sanitizeOcrLanguage("eng;rm"), /語言設定無效/);
  });

  test("constructs Tesseract argv safely for paths with spaces and Chinese", () => {
    const args = buildTesseractOcrArgs(
      "C:\\使用者\\James Tong\\掃描文件.png",
      "C:\\輸出資料\\page_001_ocr",
      "chi_tra+eng",
      "C:\\Program Files\\Tesseract-OCR\\tessdata"
    );
    assert.deepEqual(args, [
      "C:\\使用者\\James Tong\\掃描文件.png",
      "C:\\輸出資料\\page_001_ocr",
      "-l",
      "chi_tra+eng",
      "--tessdata-dir",
      "C:\\Program Files\\Tesseract-OCR\\tessdata"
    ]);
  });

  test("supports current-page and multi-page OCR selections", () => {
    assert.deepEqual(sanitizeOcrPageSelection("3"), [3]);
    assert.deepEqual(sanitizeOcrPageSelection("1-2,4,2"), [1, 2, 4]);
    assert.deepEqual(sanitizeOcrPageSelection(""), []);
    assert.throws(() => sanitizeOcrPageSelection("3-1"), /頁碼範圍無效/);
  });

  test("distinguishes missing language data and friendly OCR failures", () => {
    const dir = tempDir("sl-tessdata-");
    try {
      fs.writeFileSync(path.join(dir, "eng.traineddata"), Buffer.alloc(60_001));
      assert.deepEqual(listOcrLanguages(dir), ["eng"]);
      assert.throws(() => assertOcrLanguagesAvailable("chi_tra+eng", dir), /chi_tra/);
      assert.match(createFriendlyOcrError(new Error("OCR 結果為空"), "scan.pdf").message, /未辨識到文字/);
      assert.match(createFriendlyOcrError(new Error("PDF render failed"), "scan.pdf").message, /頁面影像/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("resolves Unix share tessdata beside a bundled executable", () => {
    const root = tempDir("sl-tess-root-");
    try {
      const bin = path.join(root, "bin");
      const tessdata = path.join(root, "share", "tessdata");
      fs.mkdirSync(bin, { recursive: true });
      fs.mkdirSync(tessdata, { recursive: true });
      const executable = path.join(bin, "tesseract");
      fs.writeFileSync(executable, "x");
      assert.equal(bundledTessdataDir(executable), tessdata);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Visual-first image workspace helpers", () => {
  test("validates imageOps count, coordinates, limits, and shared export settings", () => {
    const options = sanitizeDesktopJobOptions("image-convert", {
      extension: "webp",
      imageOps: JSON.stringify([
        { rotation: 90, flip: "horizontal", crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, ocrRegion: null },
        { rotation: 0, flip: "none", crop: null, ocrRegion: null }
      ]),
      quality: "0.8",
      maxWidth: "1600",
      maxHeight: "900",
      keepRatio: "true",
      watermarkText: "香港 Office",
      watermarkPosition: "center"
    }, 2);
    assert.equal(options.extension, "webp");
    assert.equal(options.quality, "0.8");
    assert.equal(options.maxWidth, "1600");
    assert.equal(options.watermarkText, "香港 Office");
    assert.deepEqual(JSON.parse(options.imageOps)[0], {
      rotation: 90,
      flip: "horizontal",
      crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
      ocrRegion: null
    });
    assert.throws(() => sanitizeImageOps("[{\"rotation\":0}]", 2), /數量/);
    assert.throws(() => sanitizeImageOps("[null]", 1), /必須是物件/);
    assert.throws(() => sanitizeImageOps("[]", 101), /最多處理 100/);
    assert.throws(() => sanitizeImageRectangle({ x: 0.8, y: 0, width: 0.3, height: 1 }), /圖片範圍/);
    assert.throws(() => sanitizeImageQuality("0.2"), /30%/);
    assert.throws(() => sanitizeImageDimension("32769", "maxWidth"), /32768/);
    assert.throws(() => sanitizeImageDimension("100.5", "maxWidth"), /32768/);
    assert.equal(sanitizeImageKeepRatio("false"), false);
    assert.throws(() => sanitizeImageKeepRatio("yes"), /true 或 false/);
    assert.throws(() => sanitizeImageOps('[{"rotation":"90deg"}]', 1), /旋轉角度/);
    assert.throws(() => sanitizeImageOps('[{"rotation":false}]', 1), /旋轉角度/);
    assert.throws(() => sanitizeImageRectangle({ x: false, y: 0, width: 1, height: 1 }), /座標/);
    assert.deepEqual(resolveWorkspaceImageSize(4000, 2000, 1000, 1000, true), { width: 1000, height: 500 });
    assert.deepEqual(resolveWorkspaceImageSize(400, 200, 100, 80, false), { width: 100, height: 80 });
  });

  test("applies EXIF orientation before rotation, crop, and export resize", async () => {
    const dir = tempDir("sl-image-order-");
    try {
      const source = createCanvas(40, 20);
      const context = source.getContext("2d");
      context.fillStyle = "#f00";
      context.fillRect(0, 0, 20, 20);
      context.fillStyle = "#00f";
      context.fillRect(20, 0, 20, 20);
      const input = path.join(dir, "香港 文件.jpg");
      fs.writeFileSync(input, jpegWithExifOrientation(source.toBuffer("image/jpeg", 95), 6));

      const exifOnly = await renderWorkspaceImageCanvas(input, {
        rotation: 0, flip: "none", crop: null, ocrRegion: null
      }, {}, true);
      assert.deepEqual([exifOnly.width, exifOnly.height], [20, 40]);

      const rendered = await renderWorkspaceImageCanvas(input, {
        rotation: 90,
        flip: "none",
        crop: { x: 0, y: 0, width: 1, height: 0.5 },
        ocrRegion: null
      }, {
        maxWidth: 20,
        maxHeight: 20,
        keepRatio: true,
        watermarkText: "",
        watermarkPosition: "se"
      }, false);
      assert.deepEqual([rendered.width, rendered.height], [20, 5]);

      const plainInput = path.join(dir, "transform.png");
      fs.writeFileSync(plainInput, source.toBuffer("image/png"));
      const rotatedThenFlipped = await renderWorkspaceImageCanvas(plainInput, {
        rotation: 90,
        flip: "horizontal",
        crop: null,
        ocrRegion: null
      }, {}, true);
      const topPixel = rotatedThenFlipped.getContext("2d").getImageData(10, 5, 1, 1).data;
      assert.ok(topPixel[0] > topPixel[2], "horizontal flip must apply after the 90° rotation");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("uses the same normalized crop for OCR regions and enforces 8px minimum", async () => {
    const dir = tempDir("sl-image-region-");
    try {
      const source = createCanvas(64, 32);
      source.getContext("2d").fillRect(0, 0, 64, 32);
      const input = path.join(dir, "region.png");
      fs.writeFileSync(input, source.toBuffer("image/png"));
      const canvas = await renderWorkspaceImageCanvas(input, {
        rotation: 0,
        flip: "none",
        crop: { x: 0, y: 0, width: 0.5, height: 1 },
        ocrRegion: { x: 0, y: 0, width: 0.5, height: 0.5 }
      }, {}, true);
      assert.deepEqual([canvas.width, canvas.height], [16, 16]);
      await assert.rejects(
        renderWorkspaceImageCanvas(input, {
          rotation: 0,
          flip: "none",
          crop: null,
          ocrRegion: { x: 0, y: 0, width: 0.1, height: 0.1 }
        }, {}, true),
        /8 × 8 pixels/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("LibreOffice output resolution", () => {
  test("prefers expected stem name", () => {
    const dir = tempDir("sl-lo-");
    try {
      const before = snapshotOutputDir(dir);
      const expected = path.join(dir, "My Report.final.pdf");
      fs.writeFileSync(expected, "%PDF");
      const found = resolveLibreOfficeOutput(dir, "My Report.final.docx", "pdf", before);
      assert.equal(found, expected);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("finds renamed output with similar stem", () => {
    const dir = tempDir("sl-lo2-");
    try {
      const before = snapshotOutputDir(dir);
      const alt = path.join(dir, "weird_name.pdf");
      fs.writeFileSync(alt, "%PDF");
      const found = resolveLibreOfficeOutput(dir, "weird name.xlsx", "pdf", before);
      assert.equal(found, alt);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("throws when no output appears", () => {
    const dir = tempDir("sl-lo3-");
    try {
      const before = snapshotOutputDir(dir);
      assert.throws(
        () => resolveLibreOfficeOutput(dir, "a.docx", "pdf", before),
        /找不到輸出檔/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("office convert targets", () => {
  test("maps extensions to LibreOffice filters", () => {
    assert.equal(sanitizeOfficeExtension("DOCX"), "docx");
    assert.equal(officeConvertTarget("xlsx"), "xlsx:Calc MS Excel 2007 XML");
    assert.throws(() => sanitizeOfficeExtension("pdf"), /Unsupported Office format/);
  });
});

describe("LibreOffice profile isolation", () => {
  test("creates a different user profile for each task", () => {
    const dir = tempDir("sl-lo-profile-");
    try {
      const first = createLibreOfficeProfileDir(dir);
      const second = createLibreOfficeProfileDir(dir);
      assert.notEqual(first, second);
      assert.equal(fs.existsSync(first), true);
      assert.equal(fs.existsSync(second), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("encodes spaces, Chinese characters, and Windows paths as file URIs", () => {
    const winPath = "C:\\Users\\測試 使用者\\Libre Office\\profile";
    const uri = pathToLibreOfficeFileUri(winPath);
    assert.match(uri, /^file:\/\/\//);
    assert.match(uri, /%E6%B8%AC%E8%A9%A6/);
    assert.match(uri, /%20/);
    assert.doesNotMatch(uri, /\\/);
  });

  test("LibreOffice args use isolated profile URI and first-start suppression", () => {
    const dir = tempDir("sl-lo-args-");
    try {
      const input = path.join(dir, "含 空格.docx");
      fs.writeFileSync(input, "docx");
      const profile = path.join(dir, "profile 中文");
      const args = libreOfficeArgs(dir, input, "pdf", profile);
      const envArg = args.find((arg) => arg.startsWith("-env:UserInstallation="));
      assert.ok(envArg);
      assert.match(envArg, /file:\/\/\//);
      assert.doesNotMatch(envArg, /file:\/\/\/file:/);
      assert.match(envArg, /%E4%B8%AD%E6%96%87/);
      assert.ok(args.includes("--headless"));
      assert.ok(args.includes("--nologo"));
      assert.ok(args.includes("--nodefault"));
      assert.ok(args.includes("--nofirststartwizard"));
      assert.ok(args.includes("--nolockcheck"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("process error formatter", () => {
  test("maps 3221226505 and signed -1073740791 to 0xC0000409 message", () => {
    assert.equal(isWindowsStackBufferOverrun(3221226505), true);
    assert.equal(isWindowsStackBufferOverrun(-1073740791), true);
    const msg = formatProcessError({ returncode: 3221226505, stderr: "ucrtbase.dll" });
    assert.match(msg, /0xC0000409/);
    assert.match(msg, /意外崩潰/);
    assert.match(msg, /【技術詳情】/);
    assert.doesNotMatch(msg, /^Process exited with code/);
    const signed = formatProcessError({ returncode: -1073740791 });
    assert.match(signed, /0xC0000409/);
  });

  test("timeout and missing output messages", () => {
    assert.match(formatProcessError({ timeout: true, timeoutSeconds: 180 }), /逾時/);
    assert.match(formatProcessError({ outputMissing: true, expectedOutput: "a.docx" }), /未產生輸出檔/);
  });

  test("non-zero exits retain stderr, exit code, command, and cwd", () => {
    const msg = formatProcessError({
      returncode: 3765269347,
      stderr: "LibreOffice stderr",
      stdout: "LibreOffice stdout",
      executable: "C:\\Program Files\\LibreOffice\\program\\soffice.com",
      args: ["--headless", "--convert-to", "pdf", "input.docx"],
      cwd: "C:\\Work Dir",
      toolLabel: "LibreOffice"
    });
    assert.match(msg, /exitCode=3765269347/);
    assert.match(msg, /stderr=LibreOffice stderr/);
    assert.match(msg, /stdout=LibreOffice stdout/);
    assert.match(msg, /command="C:\\Program Files\\LibreOffice\\program\\soffice.com"/);
    assert.match(msg, /cwd=C:\\Work Dir/);
  });

  test("filters unrelated LibreOffice Python prefix warnings from successful logs", () => {
    const output = filterSuccessfulToolOutput(
      "Could not find platform independent libraries <prefix>\nconvert ok",
      "LibreOffice"
    );
    assert.equal(output, "convert ok");
  });

  test("removes incomplete outputs and cleans profiles", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-lo-"));
    try {
      const tiny = path.join(dir, "a.docx");
      fs.writeFileSync(tiny, "");
      assert.equal(removeIncompleteOfficeOutput(tiny), true);
      assert.equal(fs.existsSync(tiny), false);
      const profile = path.join(dir, "p_lo_profile");
      fs.mkdirSync(path.join(profile, "user"), { recursive: true });
      fs.writeFileSync(path.join(profile, "user", "x"), "y");
      cleanupLoProfile(profile);
      assert.equal(fs.existsSync(profile), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ffmpeg media args", () => {
  test("builds video args with scale bitrate and trim", () => {
    const args = buildFfmpegMediaArgs("in.mp4", "out.mp4", {
      extension: "mp4",
      scale: "1280:720",
      videoBitrate: "2M",
      audioBitrate: "128k",
      start: "1.5",
      duration: "10"
    });
    assert.deepEqual(args.slice(0, 6), ["-y", "-ss", "1.5", "-i", "in.mp4", "-t"]);
    assert.ok(args.includes("10"));
    assert.ok(args.includes("-vf"));
    assert.ok(args.includes("scale=1280:720"));
    assert.ok(args.includes("-b:v"));
    assert.ok(args.includes("2m"));
    assert.ok(args.includes("-b:a"));
    assert.equal(args[args.length - 1], "out.mp4");
  });

  test("audio-only strips video", () => {
    const args = buildFfmpegMediaArgs("in.mp4", "out.mp3", {
      extension: "mp3",
      audioBitrate: "192k"
    });
    assert.ok(args.includes("-vn"));
    assert.ok(args.includes("libmp3lame"));
    assert.ok(!args.includes("-vf"));
  });

  test("gif uses fps filter", () => {
    const args = buildFfmpegMediaArgs("in.mp4", "out.gif", {
      extension: "gif",
      gifFps: "12",
      scale: "-2:480"
    });
    assert.ok(args.includes("-vf"));
    const vf = args[args.indexOf("-vf") + 1];
    assert.match(vf, /fps=12/);
    assert.match(vf, /scale=-2:480/);
  });

  test("rejects bad bitrate and fps", () => {
    assert.throws(() => sanitizeMediaBitrate("fast", "videoBitrate"), /Invalid/);
    assert.throws(() => sanitizeGifFps("99"), /1 and 30/);
  });
});

describe("job queue order", () => {
  test("processes oldest queued job first (FIFO)", async () => {
    const dir = tempDir("sl-fifo-");
    try {
      const xPath = path.join(dir, "x.pdf");
      const yPath = path.join(dir, "y.pdf");
      await writeBlankPdf(xPath, 1);
      await writeBlankPdf(yPath, 1);
      const backend = new BackendService({
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs-state.json"),
        defaultOutputDir: dir
      });
      backend.running = true; // block auto-run while enqueueing
      const order = [];
      backend.runJob = async (job) => {
        order.push(job.id);
      };
      const a = await backend.enqueue({
        type: "pdf-compress",
        inputPaths: [xPath],
        outputDir: dir,
        options: {}
      });
      const b = await backend.enqueue({
        type: "pdf-compress",
        inputPaths: [yPath],
        outputDir: dir,
        options: {}
      });
      backend.running = false;
      await backend.runNext();
      // wait for both
      for (let i = 0; i < 50 && order.length < 2; i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.deepEqual(order, [a.id, b.id]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("job persistence", () => {
  test("atomic state write preserves the previous file and removes temp data when replace fails", () => {
    const dir = tempDir("sl-persist-atomic-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      fs.writeFileSync(statePath, "previous-state", "utf8");
      const failingFs = new Proxy(fs, {
        get(target, property) {
          if (property === "renameSync") return () => { throw new Error("simulated replace failure"); };
          return target[property];
        }
      });
      assert.throws(() => atomicWriteFileSync(statePath, "new-state", failingFs), /simulated replace failure/);
      assert.equal(fs.readFileSync(statePath, "utf8"), "previous-state");
      assert.deepEqual(fs.readdirSync(dir), ["jobs-state.json"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("BackendService preserves a corrupt state file instead of replacing it with an empty queue", () => {
    const dir = tempDir("sl-persist-corrupt-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const corrupt = "{not-json";
      fs.writeFileSync(statePath, corrupt, "utf8");
      const originalWarn = console.warn;
      console.warn = () => {};
      let backend;
      try {
        backend = new BackendService({
          configPath: path.join(dir, "tools.json"),
          jobsStatePath: statePath,
          defaultOutputDir: dir
        });
      } finally {
        console.warn = originalWarn;
      }
      assert.equal(backend.jobsStateTrusted, false);
      assert.deepEqual(backend.getJobs(), []);
      assert.equal(fs.readFileSync(statePath, "utf8"), corrupt);
      backend.pruneJobs();
      assert.equal(fs.readFileSync(statePath, "utf8"), corrupt);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("passwords are redacted from public and persisted job data", async () => {
    const dir = tempDir("sl-secret-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const inputPath = path.join(dir, "secret.pdf");
      fs.writeFileSync(inputPath, "%PDF-1.4");
      const backend = new BackendService({
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: statePath,
        defaultOutputDir: dir
      });
      // Skip real tool discovery; preflight only needs qpdf marked available.
      backend.tools = {
        qpdf: { available: true, path: "qpdf", version: "test", source: "test" }
      };
      backend.running = true;
      const publicResult = await backend.enqueue({
        type: "pdf-encrypt",
        inputPaths: [inputPath],
        outputDir: dir,
        options: { password: "very-secret", extension: "pdf" }
      });
      assert.deepEqual(publicResult.options, { extension: "pdf" });
      assert.doesNotMatch(fs.readFileSync(statePath, "utf8"), /very-secret|password/i);

      const restored = loadJobsState(statePath);
      assert.equal(restored[0].status, "failed");
      assert.match(restored[0].error, /重新輸入密碼/);
      assert.deepEqual(restored[0].options, { extension: "pdf" });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("redacts nested password-like option keys", () => {
    assert.deepEqual(
      redactJobOptions({ mode: "safe", nested: { passphrase: "hidden", pages: "1" } }),
      { mode: "safe", nested: { pages: "1" } }
    );
  });

  test("running jobs become failed on reload; queued resume", () => {
    const dir = tempDir("sl-persist-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const pdfPath = path.join(dir, "a.pdf");
      fs.writeFileSync(pdfPath, "%PDF-1.4");
      saveJobsState(statePath, [
        {
          id: "run1",
          type: "pdf-compress",
          inputPaths: [pdfPath],
          outputDir: dir,
          options: {},
          status: "running",
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          finishedAt: null,
          outputPaths: [],
          log: [],
          error: ""
        },
        {
          id: "q1",
          type: "pdf-compress",
          inputPaths: [pdfPath],
          outputDir: dir,
          options: {},
          status: "queued",
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
          outputPaths: [],
          log: [],
          error: ""
        }
      ]);
      const restored = loadJobsState(statePath);
      const running = restored.find((j) => j.id === "run1");
      const queued = restored.find((j) => j.id === "q1");
      assert.equal(running.status, "failed");
      assert.match(running.error, /重啟|中斷/);
      assert.equal(queued.status, "queued");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("BackendService reloads state from disk", () => {
    const dir = tempDir("sl-persist2-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const configPath = path.join(dir, "tools.json");
      const pdfPath = path.join(dir, "b.pdf");
      fs.writeFileSync(pdfPath, "%PDF-1.4");
      saveJobsState(statePath, [
        {
          id: "done1",
          type: "pdf-merge",
          inputPaths: [pdfPath],
          outputDir: dir,
          options: {},
          status: "done",
          createdAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: new Date().toISOString(),
          outputPaths: [pdfPath],
          log: ["ok"],
          error: ""
        }
      ]);
      const backend = new BackendService({
        configPath,
        jobsStatePath: statePath,
        defaultOutputDir: dir
      });
      assert.equal(backend.jobs.length, 1);
      assert.equal(backend.jobs[0].status, "done");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("output collision handling", () => {
  test("uses numbered names without overwriting existing files", () => {
    const dir = tempDir("sl-output-name-");
    try {
      const original = path.join(dir, "report.pdf");
      const second = path.join(dir, "report (2).pdf");
      fs.writeFileSync(original, "original");
      assert.equal(nextAvailablePath(original), second);
      fs.writeFileSync(second, "second");
      assert.equal(nextAvailablePath(original), path.join(dir, "report (3).pdf"));
      assert.equal(fs.readFileSync(original, "utf8"), "original");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fits long ASCII and Traditional Chinese output names within component limits", () => {
    for (const stem of ["a".repeat(250), "香港文件".repeat(80)]) {
      const first = fitOutputFilename(`${stem}_compressed`, ".pdf");
      const collision = fitOutputFilename(`${stem}_compressed`, ".pdf", " (9999)");
      assert.ok(Buffer.byteLength(first) <= 240);
      assert.ok(Buffer.byteLength(collision) <= 240);
      assert.ok(first.endsWith(".pdf"));
      assert.ok(collision.endsWith(" (9999).pdf"));
    }
  });
});

describe("input resource limits", () => {
  test("rejects a file above the configured per-file limit", () => {
    const dir = tempDir("sl-input-limit-");
    try {
      const input = path.join(dir, "large.bin");
      fs.writeFileSync(input, Buffer.alloc(16));
      assert.throws(
        () => validateJobInputLimits([input], dir, { maxFileBytes: 8, maxJobBytes: 32, diskMultiplier: 1 }),
        /file limit/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rejects aggregate input above the job limit", () => {
    const dir = tempDir("sl-job-limit-");
    try {
      const first = path.join(dir, "a.bin");
      const second = path.join(dir, "b.bin");
      fs.writeFileSync(first, Buffer.alloc(8));
      fs.writeFileSync(second, Buffer.alloc(8));
      assert.throws(
        () => validateJobInputLimits([first, second], dir, { maxFileBytes: 10, maxJobBytes: 12, diskMultiplier: 1 }),
        /total limit/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("BackendService jobs", () => {
  test("retry respects the queued-job admission limit", async () => {
    const dir = tempDir("sl-retry-limit-");
    try {
      const inputPath = path.join(dir, "input.pdf");
      fs.writeFileSync(inputPath, "%PDF-1.4");
      const backend = new BackendService({
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs-state.json"),
        defaultOutputDir: dir
      });
      backend.jobs = Array.from({ length: 50 }, (_item, index) => ({
        id: `queued-${index}`,
        type: "pdf-merge",
        inputPaths: [inputPath],
        outputDir: dir,
        options: {},
        status: "queued",
        createdAt: new Date().toISOString(),
        outputPaths: [],
        log: [],
        error: ""
      }));
      backend.jobs.push({
        id: "retry-me",
        type: "pdf-merge",
        inputPaths: [inputPath],
        outputDir: dir,
        options: {},
        status: "failed",
        createdAt: new Date().toISOString(),
        outputPaths: [],
        log: [],
        error: "failed",
        retriable: true
      });
      await assert.rejects(backend.retryJob("retry-me"), /Too many queued jobs/);
      assert.equal(backend.pendingAdmissions, 0);
      assert.equal(backend.jobs.at(-1).status, "failed");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("dispose cancels queued work and rejects later admission", async () => {
    const dir = tempDir("sl-dispose-");
    try {
      const inputPath = path.join(dir, "input.pdf");
      fs.writeFileSync(inputPath, "%PDF-1.4");
      const backend = new BackendService({
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs-state.json"),
        defaultOutputDir: dir
      });
      backend.tools = {};
      backend.runNext = async () => {};
      const queued = await backend.enqueue({
        type: "pdf-merge",
        inputPaths: [inputPath],
        outputDir: dir,
        options: {}
      });
      assert.equal(backend.hasActiveWork(), true);
      await backend.dispose();
      assert.equal(backend.getJobs().find((job) => job.id === queued.id).status, "cancelled");
      assert.equal(backend.hasActiveWork(), false);
      await assert.rejects(
        backend.enqueue({ type: "pdf-merge", inputPaths: [inputPath], outputDir: dir, options: {} }),
        /正在結束/
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("dispose waits for running in-process work to observe cancellation", async () => {
    const dir = tempDir("sl-dispose-running-");
    try {
      const backend = new BackendService({
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs-state.json"),
        defaultOutputDir: dir
      });
      const job = {
        id: "running-dispose",
        type: "pdf-merge",
        inputPaths: [],
        outputDir: dir,
        options: {},
        status: "running",
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: null,
        outputPaths: [],
        log: [],
        error: "",
        cancelRequested: false,
        _child: null
      };
      backend.jobs = [job];
      backend.running = true;
      setTimeout(() => {
        if (job.cancelRequested) {
          job.status = "cancelled";
          backend.running = false;
        }
      }, 75);
      const started = Date.now();
      await backend.dispose();
      assert.ok(Date.now() - started >= 50);
      assert.equal(job.cancelRequested, true);
      assert.equal(job.status, "cancelled");
      assert.equal(backend.running, false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  let outDir;
  let backendSequence = 0;

  function createTestBackend() {
    backendSequence += 1;
    const backend = new BackendService({
      defaultOutputDir: outDir,
      configPath: path.join(outDir, `tools-${backendSequence}.json`),
      jobsStatePath: path.join(outDir, `jobs-${backendSequence}.json`)
    });
    // These queue tests exercise built-in PDF behavior, not system tool discovery.
    // Avoid making their short async assertions depend on first-run version scans.
    backend.tools = {};
    return backend;
  }

  before(() => {
    outDir = tempDir("sl-jobs-");
  });

  after(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  test("PDF to DOCX compat preflight does not require LibreOffice", async () => {
    const backend = createTestBackend();
    const inputPath = path.join(outDir, "compat-preflight.pdf");
    await writeBlankPdf(inputPath, 1);
    backend.tools = {
      libreOffice: { available: false },
      tesseract: { available: false },
      pdf2docx: { available: true }
    };
    const result = await backend.preflightJob({
      type: "pdf-to-office",
      inputPaths: [inputPath],
      outputDir: outDir,
      options: { extension: "docx", docxEngine: "compat", scanOcr: "off", ocrOutput: "docx" }
    });
    assert.equal(result.ok, true, JSON.stringify(result.issues));
  });

  test("forced OCR preflight requires Tesseract instead of LibreOffice", async () => {
    const dir = tempDir("sl-preflight-forced-ocr-");
    try {
      const inputPath = path.join(dir, "scan.pdf");
      await writeBlankPdf(inputPath, 1);
      const backend = new BackendService({
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs-state.json"),
        defaultOutputDir: dir
      });
      backend.tools = { libreOffice: { available: true, path: "soffice" } };
      const result = await backend.preflightJob({
        type: "pdf-to-office",
        inputPaths: [inputPath],
        outputDir: dir,
        options: { extension: "docx", docxEngine: "auto", scanOcr: "force", ocrOutput: "both" }
      });
      assert.equal(result.ok, false);
      assert.equal(result.issues[0].tool, "tesseract");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("forced OCR with auto engine bypasses LibreOffice", {
    skip: process.platform === "win32" ? "test shim is a .cmd, which shell:false intentionally does not execute" : false
  }, async () => {
    const dir = tempDir("sl-forced-ocr-direct-");
    try {
      const inputPath = path.join(dir, "scan.pdf");
      const generatedPage = path.join(dir, "generated.pdf");
      await writeBlankPdf(inputPath, 1);
      await writeBlankPdf(generatedPage, 1);
      const fakeTesseract = writeFakeNodeTool(dir, "fake-tesseract-forced", [
        '"use strict";',
        'const fs = require("node:fs");',
        'const args = process.argv.slice(2);',
        'if (args.includes("--list-langs")) { console.log("List of available languages (1):\\neng"); process.exit(0); }',
        'const outputBase = args[args.indexOf("-l") - 1];',
        'if (args.at(-1) === "pdf") fs.copyFileSync(' + JSON.stringify(generatedPage) + ', outputBase + ".pdf");',
        'else fs.writeFileSync(outputBase + ".txt", "OCR TEXT");'
      ].join("\n"));
      const backend = new BackendService({
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs-state.json"),
        defaultOutputDir: dir
      });
      backend.tools = {
        tesseract: { available: true, path: fakeTesseract },
        libreOffice: { available: true, path: path.join(dir, "must-not-run-soffice") }
      };
      const job = {
        id: "forced-ocr",
        type: "pdf-to-office",
        inputPaths: [inputPath],
        outputDir: dir,
        options: { extension: "docx", docxEngine: "auto", scanOcr: "force", ocrOutput: "both", language: "eng" },
        outputPaths: [],
        log: [],
        cancelRequested: false
      };
      await backend.runPdfToOffice(job);
      assert.ok(job.outputPaths.some((item) => item.endsWith(".docx")));
      assert.ok(job.outputPaths.some((item) => item.endsWith(".pdf")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("concurrent admission cannot exceed the queued-job limit", async () => {
    const dir = tempDir("sl-admission-limit-");
    try {
      const inputPath = path.join(dir, "input.pdf");
      await writeBlankPdf(inputPath, 1);
      const backend = new BackendService({
        defaultOutputDir: dir,
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs.json")
      });
      backend.tools = {};
      backend.running = true;
      const attempts = Array.from({ length: 51 }, () => backend.enqueue({
        type: "pdf-compress",
        inputPaths: [inputPath],
        outputDir: dir,
        options: {}
      }));
      const settled = await Promise.allSettled(attempts);
      assert.equal(settled.filter((item) => item.status === "fulfilled").length, 50);
      assert.equal(settled.filter((item) => item.status === "rejected").length, 1);
      assert.equal(backend.jobs.filter((item) => item.status === "queued").length, 50);
      assert.equal(backend.pendingAdmissions, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("PDF to DOCX compat preserves an existing output", async () => {
    const backend = createTestBackend();
    const inputPath = path.join(outDir, "相容 文件.pdf");
    await writeBlankPdf(inputPath, 1);
    const existing = path.join(outDir, "相容 文件.docx");
    fs.writeFileSync(existing, "keep-user-docx", "utf8");
    const job = {
      id: "compat-collision",
      type: "pdf-to-office",
      inputPaths: [inputPath],
      outputDir: outDir,
      options: { extension: "docx", docxEngine: "compat", scanOcr: "off", ocrOutput: "docx" },
      outputPaths: [],
      itemResults: [],
      log: [],
      error: "",
      cancelRequested: false
    };
    await backend.runPdfToOffice(job);
    assert.equal(fs.readFileSync(existing, "utf8"), "keep-user-docx");
    assert.deepEqual(job.outputPaths.map((item) => path.basename(item)), ["相容 文件 (2).docx"]);
  });

  test("searchable PDF OCR preserves an existing output", {
    skip: process.platform === "win32" ? "test shim is a .cmd, which shell:false intentionally does not execute" : false
  }, async () => {
    const dir = tempDir("sl-searchable-collision-");
    try {
      const inputPath = path.join(dir, "掃描 文件.pdf");
      const generatedPage = path.join(dir, "generated-page.pdf");
      await writeBlankPdf(inputPath, 1);
      await writeBlankPdf(generatedPage, 1);
      const fakeTesseract = writeFakeNodeTool(dir, "fake-tesseract", [
        '"use strict";',
        'const fs = require("node:fs");',
        'const args = process.argv.slice(2);',
        'if (args.includes("--list-langs")) { console.log("List of available languages (1):\\neng"); process.exit(0); }',
        'const languageIndex = args.indexOf("-l");',
        'const outputBase = args[languageIndex - 1];',
        `fs.copyFileSync(${JSON.stringify(generatedPage)}, outputBase + ".pdf");`
      ].join("\n"));
      const existing = path.join(dir, "掃描 文件_ocr_searchable.pdf");
      fs.writeFileSync(existing, "keep-user-pdf", "utf8");
      const backend = new BackendService({
        defaultOutputDir: dir,
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs.json")
      });
      backend.tools = { tesseract: { available: true, path: fakeTesseract } };
      const job = {
        id: "searchable-collision",
        type: "pdf-to-searchable-pdf",
        inputPaths: [inputPath],
        outputDir: dir,
        options: { language: "eng", maxPages: "2" },
        outputPaths: [],
        itemResults: [],
        log: [],
        error: "",
        cancelRequested: false
      };
      await backend.runPdfToSearchablePdf(job);
      assert.equal(fs.readFileSync(existing, "utf8"), "keep-user-pdf");
      assert.deepEqual(job.outputPaths.map((item) => path.basename(item)), ["掃描 文件_ocr_searchable (2).pdf"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("failed FFmpeg conversion removes its partial output", {
    skip: process.platform === "win32" ? "test shim is a .cmd, which shell:false intentionally does not execute" : false
  }, async () => {
    const dir = tempDir("sl-media-partial-");
    try {
      const inputPath = path.join(dir, "media input.wav");
      fs.writeFileSync(inputPath, "input", "utf8");
      const fakeFfmpeg = writeFakeNodeTool(dir, "fake-ffmpeg", [
        '"use strict";',
        'const fs = require("node:fs");',
        'fs.writeFileSync(process.argv.at(-1), "partial");',
        'process.exit(9);'
      ].join("\n"));
      const backend = new BackendService({
        defaultOutputDir: dir,
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs.json")
      });
      backend.tools = { ffmpeg: { available: true, path: fakeFfmpeg } };
      const job = {
        id: "media-partial",
        type: "media-convert",
        inputPaths: [inputPath],
        outputDir: dir,
        options: { extension: "mp3" },
        outputPaths: [],
        log: [],
        cancelRequested: false
      };
      await assert.rejects(backend.runMediaConvert(job), /FFmpeg|exit code|failed/i);
      assert.equal(fs.existsSync(path.join(dir, "media input.mp3")), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("zero-byte FFmpeg output is rejected and removed", {
    skip: process.platform === "win32" ? "test shim is a .cmd, which shell:false intentionally does not execute" : false
  }, async () => {
    const dir = tempDir("sl-media-empty-");
    try {
      const inputPath = path.join(dir, "media.wav");
      fs.writeFileSync(inputPath, "input", "utf8");
      const fakeFfmpeg = writeFakeNodeTool(dir, "fake-ffmpeg-empty", [
        '"use strict";',
        'require("node:fs").writeFileSync(process.argv.at(-1), "");'
      ].join("\n"));
      const backend = new BackendService({
        defaultOutputDir: dir,
        configPath: path.join(dir, "tools.json"),
        jobsStatePath: path.join(dir, "jobs.json")
      });
      backend.tools = { ffmpeg: { available: true, path: fakeFfmpeg } };
      const job = {
        id: "media-empty",
        type: "media-convert",
        inputPaths: [inputPath],
        outputDir: dir,
        options: { extension: "mp3" },
        outputPaths: [],
        log: [],
        cancelRequested: false
      };
      await assert.rejects(backend.runMediaConvert(job), /有效輸出檔/);
      assert.equal(fs.existsSync(path.join(dir, "media.mp3")), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("external process timeout terminates its process tree", async () => {
    const dir = tempDir("sl-process-timeout-");
    let grandchildPid = 0;
    try {
      const pidPath = path.join(dir, "grandchild.pid");
      const runner = path.join(dir, "runner.js");
      fs.writeFileSync(runner, [
        '"use strict";',
        'const fs = require("node:fs");',
        'const { spawn } = require("node:child_process");',
        'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
        `fs.writeFileSync(${JSON.stringify(pidPath)}, String(child.pid));`,
        'setInterval(() => {}, 1000);'
      ].join("\n"));
      const promise = runProcess(process.execPath, [runner], null, "test tool", { timeoutMs: 150 });
      await assert.rejects(promise, (error) => error && error.errorCode === "tool_timeout");
      grandchildPid = Number(fs.readFileSync(pidPath, "utf8"));
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.throws(() => process.kill(grandchildPid, 0));
    } finally {
      if (grandchildPid) {
        try { process.kill(grandchildPid, "SIGKILL"); } catch { /* already gone */ }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns only completed TXT outputs for workspace OCR", () => {
    const backend = createTestBackend();
    const textPath = path.join(outDir, "香港 文件_ocr.txt");
    const pdfPath = path.join(outDir, "other.pdf");
    fs.writeFileSync(textPath, "--- Page 1 ---\n香港\nHONG KONG\n", "utf8");
    fs.writeFileSync(pdfPath, "%PDF");
    backend.jobs.unshift({
      id: "workspace-ocr",
      type: "ocr-pdf",
      inputPaths: [],
      outputDir: outDir,
      options: {},
      status: "done",
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: new Date().toISOString(),
      outputPaths: [textPath, pdfPath],
      log: [],
      error: "",
      progress: { current: 1, total: 1, phase: "ocr", message: "已辨識第 1 / 1 頁" },
      cancelRequested: false,
      _child: null
    });
    assert.deepEqual(backend.readJobTextOutputs("workspace-ocr"), [{
      name: "香港 文件_ocr.txt",
      text: "--- Page 1 ---\n香港\nHONG KONG\n"
    }]);
    const publicResult = backend.getJobs().find((job) => job.id === "workspace-ocr");
    assert.deepEqual(publicResult.progress, {
      current: 1,
      total: 1,
      phase: "ocr",
      message: "已辨識第 1 / 1 頁"
    });
  });

  test("image batch keeps successful outputs and reports a failed file", async () => {
    const backend = createTestBackend();
    const batchDir = tempDir("sl-image-batch-");
    try {
      const valid = path.join(batchDir, "中英 document.png");
      const broken = path.join(batchDir, "broken image.png");
      const canvas = createCanvas(40, 24);
      canvas.getContext("2d").fillRect(0, 0, 40, 24);
      fs.writeFileSync(valid, canvas.toBuffer("image/png"));
      fs.writeFileSync(broken, "not an image");
      const job = {
        id: "image-partial",
        type: "image-convert",
        inputPaths: [valid, broken],
        outputDir: batchDir,
        options: {
          extension: "png",
          imageOps: JSON.stringify([
            { rotation: 90, flip: "none", crop: null, ocrRegion: null },
            { rotation: 0, flip: "none", crop: null, ocrRegion: null }
          ]),
          quality: "0.85",
          maxWidth: "20",
          maxHeight: "20",
          keepRatio: "true",
          watermarkText: "",
          watermarkPosition: "se"
        },
        status: "running",
        outputPaths: [],
        itemResults: [],
        log: [],
        error: "",
        cancelRequested: false
      };
      await backend.runImageConvert(job);
      assert.equal(job.outputPaths.length, 1);
      assert.deepEqual(job.itemResults.map((item) => item.status), ["done", "failed"]);
      assert.equal(job.itemResults[0].name, "中英 document.png");
      assert.deepEqual([job.progress.current, job.progress.total], [2, 2]);
      assert.match(job.progress.message, /1 個未完成/);
    } finally {
      fs.rmSync(batchDir, { recursive: true, force: true });
    }
  });

  test("cancelled image work removes its controlled OS temp directory", async () => {
    const backend = createTestBackend();
    const input = path.join(outDir, "cancel-image.png");
    const canvas = createCanvas(16, 16);
    fs.writeFileSync(input, canvas.toBuffer("image/png"));
    const before = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("swiftlocal-image-convert-")));
    const job = {
      id: "image-cancel",
      type: "image-convert",
      inputPaths: [input],
      outputDir: outDir,
      options: { extension: "png", imageOps: "", quality: "0.85", keepRatio: "true" },
      status: "running",
      outputPaths: [],
      itemResults: [],
      log: [],
      error: "",
      cancelRequested: true
    };
    await assert.rejects(backend.runImageConvert(job), /取消/);
    const after = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("swiftlocal-image-convert-"));
    assert.deepEqual(new Set(after), before);
  });

  test("cancel queued job marks cancelled", async () => {
    const inputPath = path.join(outDir, "cancel-queued.pdf");
    await writeBlankPdf(inputPath, 1);
    const backend2 = createTestBackend();
    backend2.running = true; // block worker so job stays queued
    const queued = await backend2.enqueue({
      type: "pdf-merge",
      inputPaths: [inputPath],
      outputDir: outDir,
      options: {}
    });
    assert.equal(queued.status, "queued");
    const cancelled = backend2.cancelJob(queued.id);
    assert.equal(cancelled.status, "cancelled");
    assert.match(cancelled.error, /取消/);
  });

  test("delete running job is rejected", async () => {
    const inputPath = path.join(outDir, "delete-running.pdf");
    await writeBlankPdf(inputPath, 1);
    const backend = createTestBackend();
    backend.running = true;
    const job = await backend.enqueue({
      type: "pdf-compress",
      inputPaths: [inputPath],
      outputDir: outDir,
      options: {}
    });
    // Manually flip to running
    const internal = backend.jobs.find((item) => item.id === job.id);
    internal.status = "running";
    assert.throws(() => backend.deleteJob(job.id), /執行中/);
  });

  test("cancel running job sets flag and ends cancelled", async () => {
    const backend = createTestBackend();
    const pdfPath = path.join(outDir, "cancel-me.pdf");
    await writeBlankPdf(pdfPath, 3);

    // Patch runJob to wait until cancelled
    backend.runJob = async (job) => {
      let waited = 0;
      while (!job.cancelRequested && waited < 50) {
        await new Promise((r) => setTimeout(r, 20));
        waited += 1;
      }
      if (job.cancelRequested) {
        throw new JobCancelledError();
      }
    };

    const job = await backend.enqueue({
      type: "pdf-compress",
      inputPaths: [pdfPath],
      outputDir: outDir,
      options: {}
    });

    // Wait until running
    for (let i = 0; i < 50 && backend.jobs[0].status === "queued"; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const cancelling = backend.cancelJob(job.id);
    assert.equal(cancelling.cancelRequested, true);
    assert.match(String(cancelling.log.slice(-1)[0] || ""), /取消請求/);

    for (let i = 0; i < 100; i += 1) {
      if (backend.jobs[0].status === "cancelled") {
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(backend.jobs[0].status, "cancelled");
    const finished = backend.getJobs().find((item) => item.id === job.id);
    assert.ok(finished);
    assert.equal(finished.cancelRequested, false);
  });

  test("pure pdf ops raise JobCancelledError when cancel is already requested", async () => {
    const backend = createTestBackend();
    const a = path.join(outDir, "pure-cancel-a.pdf");
    const b = path.join(outDir, "pure-cancel-b.pdf");
    await writeBlankPdf(a, 2);
    await writeBlankPdf(b, 2);
    const jobOut = path.join(outDir, "pure-cancel-out");
    fs.mkdirSync(jobOut, { recursive: true });

    const base = {
      outputDir: jobOut,
      options: {},
      outputPaths: [],
      log: [],
      cancelRequested: true
    };

    await assert.rejects(
      () => backend.runPdfMerge({ ...base, id: "m1", type: "pdf-merge", inputPaths: [a, b] }),
      (error) => error.name === "JobCancelledError"
    );
    await assert.rejects(
      () => backend.runPdfSplit({
        ...base,
        id: "s1",
        type: "pdf-split",
        inputPaths: [a],
        options: { pages: "1,2" }
      }),
      (error) => error.name === "JobCancelledError"
    );
    await assert.rejects(
      () => backend.runPdfRotate({
        ...base,
        id: "r1",
        type: "pdf-rotate",
        inputPaths: [a],
        options: { angle: "90" }
      }),
      (error) => error.name === "JobCancelledError"
    );
    await assert.rejects(
      () => backend.runPdfCompress({ ...base, id: "c1", type: "pdf-compress", inputPaths: [a] }),
      (error) => error.name === "JobCancelledError"
    );
  });

  test("pdf-merge produces merged.pdf", async () => {
    const backend = createTestBackend();
    const a = path.join(outDir, "a.pdf");
    const b = path.join(outDir, "b.pdf");
    await writeBlankPdf(a, 1);
    await writeBlankPdf(b, 1);
    const jobOut = path.join(outDir, "merge-out");
    fs.mkdirSync(jobOut, { recursive: true });

    await backend.enqueue({
      type: "pdf-merge",
      inputPaths: [a, b],
      outputDir: jobOut,
      options: {}
    });

    for (let i = 0; i < 100; i += 1) {
      const job = backend.jobs[0];
      if (job.status === "done" || job.status === "failed") {
        break;
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    const job = backend.jobs[0];
    assert.equal(job.status, "done", job.error || job.log.join("\n"));
    assert.ok(fs.existsSync(path.join(jobOut, "merged.pdf")));
  });

  test("pdf-merge preserves an existing merged.pdf", async () => {
    const backend = createTestBackend();
    const input = path.join(outDir, "collision-source.pdf");
    await writeBlankPdf(input, 1);
    const jobOut = path.join(outDir, "merge-collision-out");
    fs.mkdirSync(jobOut, { recursive: true });
    const existing = path.join(jobOut, "merged.pdf");
    fs.writeFileSync(existing, "keep-me");

    await backend.enqueue({ type: "pdf-merge", inputPaths: [input], outputDir: jobOut, options: {} });
    for (let i = 0; i < 100; i += 1) {
      if (["done", "failed"].includes(backend.jobs[0].status)) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal(backend.jobs[0].status, "done", backend.jobs[0].error);
    assert.equal(fs.readFileSync(existing, "utf8"), "keep-me");
    assert.ok(fs.existsSync(path.join(jobOut, "merged (2).pdf")));
  });

  test("encrypted-looking PDF fails compress with friendly message", async () => {
    const backend = createTestBackend();
    const enc = path.join(outDir, "locked.pdf");
    fs.writeFileSync(enc, "%PDF-1.4\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n");
    const jobOut = path.join(outDir, "enc-out");
    fs.mkdirSync(jobOut, { recursive: true });

    await backend.enqueue({
      type: "pdf-compress",
      inputPaths: [enc],
      outputDir: jobOut,
      options: {}
    });

    for (let i = 0; i < 100; i += 1) {
      if (backend.jobs[0].status === "done" || backend.jobs[0].status === "failed") {
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    const job = backend.jobs[0];
    assert.equal(job.status, "failed");
    assert.match(job.error, /加密|解密/);
  });
});
