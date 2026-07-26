"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { afterEach, describe, test } = require("node:test");
const {
  DEFAULT_JOB_RETENTION_HOURS,
  DEFAULT_MAX_PERSISTED_JOBS,
  pruneJobList,
  cleanupSwiftLocalTempDirs
} = require("../../desktop/job-cleanup");

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(dir);
  return dir;
}

function finishedJob(id, ageHours, status = "done") {
  const finishedAt = new Date(Date.now() - ageHours * 3600 * 1000).toISOString();
  return {
    id,
    type: "pdf-compress",
    status,
    createdAt: finishedAt,
    finishedAt
  };
}

describe("job auto cleanup helpers", () => {
  test("defaults are positive", () => {
    assert.ok(DEFAULT_JOB_RETENTION_HOURS > 0);
    assert.ok(DEFAULT_MAX_PERSISTED_JOBS >= 1);
  });

  test("pruneJobList drops finished jobs older than retention", () => {
    const nowMs = Date.now();
    const result = pruneJobList(
      [
        finishedJob("old", DEFAULT_JOB_RETENTION_HOURS + 5),
        finishedJob("fresh", 1),
        { id: "queued", status: "queued", createdAt: new Date().toISOString(), finishedAt: null }
      ],
      { nowMs, retentionHours: DEFAULT_JOB_RETENTION_HOURS, maxPersisted: DEFAULT_MAX_PERSISTED_JOBS }
    );
    assert.ok(result.removedByAge >= 1);
    const ids = result.jobs.map((job) => job.id);
    assert.ok(ids.includes("fresh"));
    assert.ok(ids.includes("queued"));
    assert.ok(!ids.includes("old"));
  });

  test("forceFinished removes terminal jobs only", () => {
    const result = pruneJobList(
      [
        finishedJob("d1", 1),
        finishedJob("f1", 1, "failed"),
        { id: "q1", status: "queued", createdAt: new Date().toISOString() }
      ],
      { forceFinished: true }
    );
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].id, "q1");
    assert.equal(result.removedByAge, 2);
  });

  test("cap keeps newest terminal jobs", () => {
    const jobs = [];
    for (let i = 0; i < 5; i += 1) {
      jobs.push({
        id: `t${i}`,
        status: "done",
        createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
        finishedAt: `2026-01-0${i + 1}T00:00:00.000Z`
      });
    }
    jobs.push({ id: "active", status: "running", createdAt: "2026-02-01T00:00:00.000Z" });
    const result = pruneJobList(jobs, {
      nowMs: Date.parse("2026-02-01T00:00:00.000Z"),
      retentionHours: 24 * 365,
      maxPersisted: 3
    });
    assert.equal(result.jobs.length, 3);
    assert.ok(result.jobs.some((job) => job.id === "active"));
    assert.ok(result.removedByCap >= 1);
  });

  test("cleanupSwiftLocalTempDirs removes aged .swiftlocal-* folders", () => {
    const dir = tempDir("sl-cleanup-temp-");
    const oldTemp = path.join(dir, ".swiftlocal-office-old");
    fs.mkdirSync(oldTemp);
    const oldTime = Date.now() - 48 * 3600 * 1000;
    fs.utimesSync(oldTemp, new Date(oldTime), new Date(oldTime));
    const freshTemp = path.join(dir, ".swiftlocal-office-fresh");
    fs.mkdirSync(freshTemp);
    const removed = cleanupSwiftLocalTempDirs(dir, Date.now());
    assert.ok(removed >= 1);
    assert.equal(fs.existsSync(oldTemp), false);
    assert.equal(fs.existsSync(freshTemp), true);
  });
});
