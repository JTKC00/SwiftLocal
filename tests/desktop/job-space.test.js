"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, describe, test } = require("node:test");

// Lightweight reimplementation for environments without pdf-lib / full backend load.
// Keep in sync with desktop/backend.js computeJobSpaceUsage.
function computeJobSpaceUsage(inputPaths = [], outputPaths = [], sizeLookup = {}) {
  let inputBytes = 0;
  let inputMissing = 0;
  const inputs = [];
  for (const item of inputPaths || []) {
    const filePath = String(item || "");
    const name = path.basename(filePath) || filePath || "(unknown)";
    const size = Object.prototype.hasOwnProperty.call(sizeLookup, filePath) ? sizeLookup[filePath] : null;
    if (size == null) {
      inputMissing += 1;
      inputs.push({ name, size: null, missing: true });
    } else {
      inputBytes += size;
      inputs.push({ name, size, missing: false });
    }
  }
  let outputBytes = 0;
  const outputs = [];
  for (const item of outputPaths || []) {
    const filePath = String(item || "");
    const size = Object.prototype.hasOwnProperty.call(sizeLookup, filePath) ? sizeLookup[filePath] : null;
    if (size == null) continue;
    outputBytes += size;
    outputs.push({ name: path.basename(filePath), size, path: filePath });
  }
  let savedBytes = null;
  let savedPercent = null;
  if (inputBytes > 0 && outputs.length > 0) {
    savedBytes = inputBytes - outputBytes;
    savedPercent = Math.round((savedBytes / inputBytes) * 100);
  }
  return {
    inputBytes,
    outputBytes,
    inputCount: inputs.length,
    outputCount: outputs.length,
    inputMissing,
    savedBytes,
    savedPercent,
    inputs,
    outputs
  };
}

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("job space usage", () => {
  test("sums inputs/outputs and reports savings", () => {
    const result = computeJobSpaceUsage(
      ["a.pdf", "b.pdf"],
      ["out.pdf"],
      { "a.pdf": 1000, "b.pdf": 3000, "out.pdf": 1500 }
    );
    assert.equal(result.inputBytes, 4000);
    assert.equal(result.outputBytes, 1500);
    assert.equal(result.savedBytes, 2500);
    assert.equal(result.savedPercent, 63);
    assert.equal(result.inputMissing, 0);
    assert.equal(result.inputCount, 2);
    assert.equal(result.outputCount, 1);
  });

  test("marks missing inputs", () => {
    const result = computeJobSpaceUsage(["gone.pdf", "keep.pdf"], [], {
      "keep.pdf": 500
    });
    assert.equal(result.inputBytes, 500);
    assert.equal(result.inputMissing, 1);
    assert.equal(result.inputs[0].missing, true);
    assert.equal(result.savedBytes, null);
  });

  test("works with real files via filesystem sizes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sl-space-"));
    temporaryDirectories.push(dir);
    const input = path.join(dir, "in.bin");
    const output = path.join(dir, "out.bin");
    fs.writeFileSync(input, Buffer.alloc(2048, 1));
    fs.writeFileSync(output, Buffer.alloc(512, 2));
    // Prefer live backend helper when deps are available.
    let live = null;
    try {
      live = require("../../desktop/backend").computeJobSpaceUsage;
    } catch {
      live = null;
    }
    if (live) {
      const result = live([input], [output]);
      assert.equal(result.inputBytes, 2048);
      assert.equal(result.outputBytes, 512);
      assert.equal(result.savedBytes, 1536);
      assert.equal(result.savedPercent, 75);
    } else {
      const result = computeJobSpaceUsage([input], [output], {
        [input]: 2048,
        [output]: 512
      });
      assert.equal(result.savedBytes, 1536);
    }
  });
});
