"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { taskEmptyState, progressValue, acceptedFiles, fileName } = require("../../frontend/shared/workbench");

test("offline task state offers repair, never falsely claims the history is empty", () => {
  const state = taskEmptyState({ connected: false, hasJobs: true, filtered: false });
  assert.equal(state.target, "backend-panel");
  assert.match(state.title, /未連接/);
});

test("empty filters can be cleared even before a user's first task", () => {
  assert.equal(taskEmptyState({ connected: true, hasJobs: false, filtered: true }).target, "reset");
  assert.equal(taskEmptyState({ connected: true, hasJobs: true, filtered: false }).target, "reset");
  assert.equal(taskEmptyState({ connected: true, hasJobs: false, filtered: false }).target, "home-panel");
});

test("progress without a meaningful total is indeterminate rather than zero percent", () => {
  for (const progress of [undefined, {}, { message: "Converting" }, { current: 2, total: 0 }, { current: NaN, total: 20 }, { current: -1, total: 20 }]) {
    assert.equal(progressValue(progress), null);
  }
  assert.equal(progressValue({ current: 2, total: 8 }), 25);
  assert.equal(progressValue({ current: 12, total: 8 }), 100);
});

test("mixed media drops keep supported files in order and reject unrelated files", () => {
  const files = [{ name: "A.MP4", type: "" }, { name: "notes.pdf", type: "application/pdf" }, { name: "song.wav", type: "audio/wav" }];
  assert.deepEqual(acceptedFiles(files, ".mp4,audio/*"), [files[0], files[2]]);
  assert.deepEqual(acceptedFiles(files, ""), files);
});

test("task display uses basenames for both desktop platforms", () => {
  assert.equal(fileName("C:\\Users\\person\\invoice.pdf"), "invoice.pdf");
  assert.equal(fileName("/Users/person/invoice.pdf"), "invoice.pdf");
});

test("application icons have complete Windows and macOS image containers", () => {
  const build = path.join(__dirname, "../../build");
  const ico = fs.readFileSync(path.join(build, "icon.ico"));
  assert.equal(ico.readUInt16LE(2), 1);
  const count = ico.readUInt16LE(4);
  assert.ok(count >= 5);
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const length = ico.readUInt32LE(at + 8);
    const offset = ico.readUInt32LE(at + 12);
    assert.ok(offset + length <= ico.length);
    assert.equal(ico.toString("ascii", offset + 1, offset + 4), "PNG");
  }
  const icns = fs.readFileSync(path.join(build, "icon.icns"));
  assert.equal(icns.toString("ascii", 0, 4), "icns");
  assert.equal(icns.readUInt32BE(4), icns.length);
  let at = 8;
  const entries = [];
  while (at < icns.length) {
    entries.push(icns.toString("ascii", at, at + 4));
    const length = icns.readUInt32BE(at + 4);
    assert.ok(length > 8 && at + length <= icns.length);
    at += length;
  }
  assert.ok(entries.includes("ic10"));
  assert.equal(at, icns.length);
});
