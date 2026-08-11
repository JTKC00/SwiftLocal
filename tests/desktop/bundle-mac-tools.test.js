"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  snapshotValidTraineddata,
  restoreMissingTraineddata
} = require("../../scripts/bundle-mac-tools.js");

test("Mac tool rebundling preserves valid chi_tra without replacing valid system packs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sl-mac-tessdata-"));
  try {
    const tessdata = path.join(root, "share", "tessdata");
    fs.mkdirSync(tessdata, { recursive: true });
    const chiBytes = Buffer.alloc(60_001, 1);
    const originalEng = Buffer.alloc(60_001, 2);
    fs.writeFileSync(path.join(tessdata, "chi_tra.traineddata"), chiBytes);
    fs.writeFileSync(path.join(tessdata, "eng.traineddata"), originalEng);
    fs.writeFileSync(path.join(tessdata, "broken.traineddata"), Buffer.alloc(20));

    const snapshot = snapshotValidTraineddata(root);
    assert.deepEqual(Array.from(snapshot.keys()).sort(), ["chi_tra.traineddata", "eng.traineddata"]);

    fs.rmSync(tessdata, { recursive: true, force: true });
    fs.mkdirSync(tessdata, { recursive: true });
    const newerEng = Buffer.alloc(70_000, 3);
    fs.writeFileSync(path.join(tessdata, "eng.traineddata"), newerEng);
    restoreMissingTraineddata(root, snapshot);

    assert.deepEqual(fs.readFileSync(path.join(tessdata, "chi_tra.traineddata")), chiBytes);
    assert.deepEqual(fs.readFileSync(path.join(tessdata, "eng.traineddata")), newerEng);
    assert.equal(fs.existsSync(path.join(tessdata, "broken.traineddata")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
