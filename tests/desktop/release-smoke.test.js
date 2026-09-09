"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { validateTools } = require("../../scripts/smoke-release");

test("release smoke rejects missing engines; development opt-out is explicit", () => {
  assert.equal(validateTools({}).length, 4);
  assert.deepEqual(validateTools({}, { allowMissing: true }), []);
});

test("bundled smoke rejects system engines and sibling directories", () => {
  const bundledRoot = path.resolve("tools");
  const tools = Object.fromEntries(["qpdf", "tesseract", "libreOffice", "ffmpeg"].map(name => [name, { available: true, path: path.join(bundledRoot, name, "bin", name) }]));
  assert.deepEqual(validateTools(tools, { bundledRoot }), []);
  tools.ffmpeg.path = path.resolve("tools-other", "ffmpeg");
  assert.match(validateTools(tools, { bundledRoot })[0], /ffmpeg resolved outside/);
});
