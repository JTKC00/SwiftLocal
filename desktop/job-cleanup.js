"use strict";

/**
 * Job history / temp directory cleanup helpers (no heavy deps).
 * Used by desktop/backend.js and unit tests.
 */

const fs = require("node:fs");
const path = require("node:path");

const TERMINAL_JOB_STATUSES = new Set(["done", "failed", "cancelled"]);

function positiveEnvNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const DEFAULT_MAX_PERSISTED_JOBS = 80;
const DEFAULT_JOB_RETENTION_HOURS = positiveEnvNumber("SWIFTLOCAL_JOB_RETENTION_HOURS", 72);

/**
 * Pure prune of an in-memory job list.
 * @returns {{ jobs: object[], removedByAge: number, removedByCap: number }}
 */
function pruneJobList(jobs, options = {}) {
  const list = Array.isArray(jobs) ? jobs.slice() : [];
  const forceFinished = Boolean(options.forceFinished);
  const nowMs = options.nowMs != null ? Number(options.nowMs) : Date.now();
  const retentionHours = options.retentionHours != null ? Number(options.retentionHours) : DEFAULT_JOB_RETENTION_HOURS;
  const maxPersisted = options.maxPersisted != null ? Number(options.maxPersisted) : DEFAULT_MAX_PERSISTED_JOBS;

  const active = list.filter((job) => !TERMINAL_JOB_STATUSES.has(job.status));
  let terminal = list.filter((job) => TERMINAL_JOB_STATUSES.has(job.status));
  let removedByAge = 0;

  if (forceFinished) {
    removedByAge = terminal.length;
    terminal = [];
  } else {
    const maxAgeMs = retentionHours * 3600 * 1000;
    const kept = [];
    for (const job of terminal) {
      const finishedMs = Date.parse(job.finishedAt || job.createdAt || "") || 0;
      if (finishedMs && nowMs - finishedMs > maxAgeMs) {
        removedByAge += 1;
      } else {
        kept.push(job);
      }
    }
    terminal = kept;
  }

  terminal.sort((a, b) =>
    String(b.finishedAt || b.createdAt || "").localeCompare(String(a.finishedAt || a.createdAt || ""))
  );
  const maxTerminal = Math.max(0, maxPersisted - active.length);
  let removedByCap = 0;
  if (terminal.length > maxTerminal) {
    removedByCap = terminal.length - maxTerminal;
    terminal = terminal.slice(0, maxTerminal);
  }

  return {
    jobs: active.concat(terminal),
    removedByAge,
    removedByCap
  };
}

/** Remove aged `.swiftlocal-*` temp directories under rootDir (e.g. LibreOffice work folders). */
function cleanupSwiftLocalTempDirs(rootDir, nowMs = Date.now(), maxAgeMs = 24 * 3600 * 1000) {
  let removed = 0;
  if (!rootDir || !fs.existsSync(rootDir)) {
    return removed;
  }
  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(".swiftlocal-")) continue;
    const full = path.join(rootDir, entry.name);
    try {
      const stat = fs.statSync(full);
      if (nowMs - stat.mtimeMs > maxAgeMs) {
        fs.rmSync(full, { recursive: true, force: true });
        removed += 1;
      }
    } catch {
      // ignore races
    }
  }
  return removed;
}

module.exports = {
  TERMINAL_JOB_STATUSES,
  DEFAULT_MAX_PERSISTED_JOBS,
  DEFAULT_JOB_RETENTION_HOURS,
  pruneJobList,
  cleanupSwiftLocalTempDirs
};
