"use strict";

/**
 * Lightweight contract tests for jobs-state schema version 1.
 * See docs/jobs-state-schema.md
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, test } = require("node:test");
const {
  JOBS_STATE_SCHEMA_VERSION,
  loadJobsState,
  saveJobsState
} = require("../../desktop/backend");

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("jobs-state schema v1 (desktop)", () => {
  test("schema version constant is 2", () => {
    assert.equal(JOBS_STATE_SCHEMA_VERSION, 2);
  });

  test("saveJobsState writes version, savedAt, and jobs envelope", () => {
    const dir = tempDir("sl-schema-save-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const pdfPath = path.join(dir, "a.pdf");
      fs.writeFileSync(pdfPath, "%PDF-1.4");
      saveJobsState(statePath, [
        {
          id: "j1",
          type: "pdf-compress",
          inputPaths: [pdfPath],
          outputDir: dir,
          options: { extension: "pdf" },
          status: "done",
          createdAt: "2026-01-01T00:00:00.000Z",
          startedAt: null,
          finishedAt: "2026-01-01T00:00:01.000Z",
          outputPaths: [pdfPath],
          log: ["ok"],
          error: ""
        }
      ]);
      const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
      assert.equal(raw.version, JOBS_STATE_SCHEMA_VERSION);
      assert.equal(typeof raw.savedAt, "string");
      assert.ok(raw.savedAt.length > 0);
      assert.ok(Array.isArray(raw.jobs));
      assert.equal(raw.jobs.length, 1);
      assert.equal(raw.jobs[0].id, "j1");
      assert.equal(raw.jobs[0].type, "pdf-compress");
      assert.deepEqual(raw.jobs[0].options, { extension: "pdf" });
      assert.equal(raw.jobs[0].status, "done");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadJobsState accepts legacy bare array", () => {
    const dir = tempDir("sl-schema-legacy-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const pdfPath = path.join(dir, "b.pdf");
      fs.writeFileSync(pdfPath, "%PDF-1.4");
      fs.writeFileSync(
        statePath,
        JSON.stringify([
          {
            id: "legacy1",
            type: "pdf-merge",
            inputPaths: [pdfPath],
            outputDir: dir,
            options: {},
            status: "done",
            createdAt: "t0",
            outputPaths: [],
            log: [],
            error: ""
          }
        ]),
        "utf8"
      );
      const restored = loadJobsState(statePath);
      assert.equal(restored.length, 1);
      assert.equal(restored[0].id, "legacy1");
      assert.equal(restored[0].status, "done");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadJobsState accepts object without version field", () => {
    const dir = tempDir("sl-schema-nover-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const pdfPath = path.join(dir, "c.pdf");
      fs.writeFileSync(pdfPath, "%PDF-1.4");
      fs.writeFileSync(
        statePath,
        JSON.stringify({
          jobs: [
            {
              id: "nover",
              type: "image-convert",
              inputPaths: [pdfPath],
              outputDir: dir,
              options: {},
              status: "queued",
              createdAt: "t0",
              outputPaths: [],
              log: [],
              error: ""
            }
          ]
        }),
        "utf8"
      );
      const restored = loadJobsState(statePath);
      assert.equal(restored.length, 1);
      assert.equal(restored[0].id, "nover");
      assert.equal(restored[0].status, "queued");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("loadJobsState fails closed when any entry is missing id or type", () => {
    const dir = tempDir("sl-schema-drop-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const pdfPath = path.join(dir, "d.pdf");
      fs.writeFileSync(pdfPath, "%PDF-1.4");
      fs.writeFileSync(
        statePath,
        JSON.stringify({
          version: 1,
          jobs: [
            { type: "pdf-compress", inputPaths: [pdfPath], status: "done" },
            { id: "no-type", inputPaths: [pdfPath], status: "done" },
            {
              id: "ok",
              type: "pdf-compress",
              inputPaths: [pdfPath],
              outputDir: dir,
              options: {},
              status: "done",
              createdAt: "t0",
              outputPaths: [],
              log: [],
              error: ""
            }
          ]
        }),
        "utf8"
      );
      const restored = loadJobsState(statePath, { withMetadata: true });
      assert.equal(restored.trusted, false);
      assert.deepEqual(restored.jobs, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("docs/jobs-state-schema.md documents version 2 and error codes", () => {
    const doc = fs.readFileSync(path.resolve(__dirname, "..", "..", "docs", "jobs-state-schema.md"), "utf8");
    assert.match(doc, /schema version 2/i);
    assert.match(doc, /JOBS_STATE_SCHEMA_VERSION/);
    assert.match(doc, /"version":\s*2/);
    assert.match(doc, /errorCode/);
    assert.match(doc, /missing_tool/);
    assert.match(doc, /password/i);
  });

  test("saveJobsState persists error classification fields", () => {
    const dir = tempDir("sl-schema-err-");
    try {
      const statePath = path.join(dir, "jobs-state.json");
      const pdfPath = path.join(dir, "e.pdf");
      fs.writeFileSync(pdfPath, "%PDF-1.4");
      saveJobsState(statePath, [
        {
          id: "err1",
          type: "pdf-compress",
          inputPaths: [pdfPath],
          outputDir: dir,
          options: {},
          status: "failed",
          createdAt: "t0",
          startedAt: null,
          finishedAt: "t1",
          outputPaths: [],
          log: [],
          error: "missing",
          errorCode: "missing_tool",
          errorHint: "install tool",
          retriable: true
        }
      ]);
      const raw = JSON.parse(fs.readFileSync(statePath, "utf8"));
      assert.equal(raw.version, 2);
      assert.equal(raw.jobs[0].errorCode, "missing_tool");
      assert.equal(raw.jobs[0].errorHint, "install tool");
      assert.equal(raw.jobs[0].retriable, true);
      const restored = loadJobsState(statePath);
      assert.equal(restored[0].errorCode, "missing_tool");
      assert.equal(restored[0].retriable, true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
