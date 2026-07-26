"use strict";

const assert = require("node:assert/strict");
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

  test("errorCodeLabel covers known codes", () => {
    assert.equal(errorCodeLabel(ERROR_CODES.MISSING_TOOL), "缺少工具");
    assert.equal(errorCodeLabel("nope"), "未知錯誤");
  });
});
