"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createCanvas } = require("@napi-rs/canvas");
const { PDFDocument } = require("pdf-lib");
const { runImageTextOcr, runTesseractOcr } = require("../desktop/backend");

async function main() {
  if (process.platform !== "win32") throw new Error("This smoke requires the real Windows Tesseract binary");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "SwiftLocal OCR 中文 é-"));
  const saved = { TMP: process.env.TMP, TEMP: process.env.TEMP };
  try {
    const tools = path.join(root, "安裝目錄 日本語", "tesseract");
    fs.cpSync(path.resolve(__dirname, "../tools/tesseract"), tools, { recursive: true });
    const temp = path.join(root, "使用者 暫存"); fs.mkdirSync(temp);
    process.env.TMP = temp; process.env.TEMP = temp;
    const canvas = createCanvas(1200, 180), ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1200, 180);
    ctx.fillStyle = "black"; ctx.font = "52px Arial"; ctx.fillText("SWIFTLOCAL HONG KONG 12345", 20, 100);
    const input = path.join(root, "測試輸入.png"); fs.writeFileSync(input, canvas.toBuffer("image/png"));
    const textBase = path.join(root, "辨識結果"), pdfBase = path.join(root, "可搜尋文件");
    const exe = path.join(tools, "tesseract.exe"), data = path.join(tools, "tessdata");
    await runImageTextOcr(exe, input, textBase, "chi_tra+eng", data, {});
    const text = fs.readFileSync(textBase + ".txt", "utf8");
    assert.match(text, /SWIFTLOCAL/); assert.match(text, /HONG\s+KONG/);
    await runTesseractOcr(exe, input, pdfBase, "chi_tra+eng", data, {}, { outputFormat: "pdf" });
    const pdf = fs.readFileSync(pdfBase + ".pdf");
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
    assert.ok(fs.existsSync(path.join(data, "eng.traineddata")), "junction cleanup removed installed language data");
    fs.mkdirSync("acceptance-evidence", { recursive: true });
    fs.writeFileSync("acceptance-evidence/unicode-ocr.json", JSON.stringify({ status: "PASS", executable: exe, temp, input, text, pdfBytes: pdf.length, pdfSha256: crypto.createHash("sha256").update(pdf).digest("hex") }, null, 2));
    console.log("PASS real Windows Tesseract: Unicode executable, tessdata, input, output and Temp; text and searchable PDF");
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
