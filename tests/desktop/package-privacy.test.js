"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyNoRuntimeData, verifyNoNestedCanvas } = require("../../scripts/verify-release-artifacts");

test("release verifier rejects runtime uploads, tokens, jobs and local settings", () => {
  for (const entry of ["/backend/temp/session-token", "\\backend\\temp\\uploads\\private.pdf", "/backend/tools.json", "/desktop/jobs-state.json", "/.swiftlocal-tools.json", "/backend/__pycache__/main.pyc"]) {
    assert.throws(() => verifyNoRuntimeData([entry]), /Runtime data must not be shipped/);
  }
  assert.doesNotThrow(() => verifyNoRuntimeData(["/backend/main.py", "/desktop/backend.js", "/frontend/app.js"]));
});

test("release verifier detects duplicate canvas with either platform's ASAR separators", () => {
  const duplicate = "/node_modules/pdfjs-dist/node_modules/@napi-rs/canvas/package.json";
  for (const entry of [duplicate, duplicate.replaceAll("/", "\\")]) {
    assert.throws(() => verifyNoNestedCanvas([entry]), /巢狀/);
  }
  assert.doesNotThrow(() => verifyNoNestedCanvas(["/node_modules/@napi-rs/canvas/package.json"]));
});
