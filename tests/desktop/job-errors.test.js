"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, test } = require("node:test");
const { classifyJobError, ERROR_CODES, errorCodeLabel } = require("../../desktop/job-errors");

describe("job error classification", () => {
  test("classifies missing tools", () => {
    const result = classifyJobError(new Error("找不到 FFmpeg 執行檔"));
    assert.equal(result.code, ERROR_CODES.MISSING_TOOL);
    assert.equal(result.retriable, true);
    assert.match(result.hint, /工具/);
  });

  test("classifies timeout and cancel", () => {
    assert.equal(classifyJobError(new Error("轉換逾時（30 秒）")).code, ERROR_CODES.TOOL_TIMEOUT);
    assert.equal(classifyJobError(new Error("任務已取消")).code, ERROR_CODES.CANCELLED);
  });

  test("classifies encrypted pdf as non-retriable without decrypt", () => {
    const result = classifyJobError(new Error("PDF 已加密，請先解密"));
    assert.equal(result.code, ERROR_CODES.ENCRYPTED_PDF);
    assert.equal(result.retriable, false);
  });

  test("does not classify external process failures as missing input while inputs exist", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-error-"));
    try {
      const input = path.join(dir, "sample.docx");
      fs.writeFileSync(input, "docx");
      const error = new Error("LibreOffice 轉換失敗（退出碼 3765269347）。input filter failed");
      error.errorCode = ERROR_CODES.OFFICE_CONVERSION_FAILED;
      const result = classifyJobError(error, { type: "office-to-pdf", inputPaths: [input] });
      assert.equal(result.code, ERROR_CODES.OFFICE_CONVERSION_FAILED);
      assert.notEqual(result.code, ERROR_CODES.MISSING_INPUT);
      assert.match(result.hint, /LibreOffice 未能轉換此文件/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("uses missing_input only when the filesystem confirms the input is gone", () => {
    const missing = path.join(os.tmpdir(), `swiftlocal-missing-${Date.now()}.docx`);
    const result = classifyJobError(new Error("anything"), { type: "office-to-pdf", inputPaths: [missing] });
    assert.equal(result.code, ERROR_CODES.MISSING_INPUT);
  });

  test("errorCodeLabel covers known codes", () => {
    assert.equal(errorCodeLabel(ERROR_CODES.MISSING_TOOL), "缺少工具");
    assert.equal(errorCodeLabel(ERROR_CODES.OFFICE_CONVERSION_FAILED), "Office 轉換失敗");
    assert.equal(errorCodeLabel(ERROR_CODES.PDF_RENDER_FAILED), "PDF 渲染失敗");
    assert.equal(errorCodeLabel("nope"), "未知錯誤");
  });

  test("classifies pdf render path-type failures", () => {
    const result = classifyJobError(
      new Error("PDF 渲染失敗 [pdf_page_render] | page=1 | Value is none of these types `String`, `Path`")
    );
    assert.equal(result.code, ERROR_CODES.PDF_RENDER_FAILED);
    assert.equal(result.retriable, true);
  });
});
