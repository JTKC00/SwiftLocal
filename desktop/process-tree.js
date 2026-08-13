"use strict";

const { spawn } = require("node:child_process");

/**
 * Terminate a child and every process it spawned.
 * yt-dlp can create FFmpeg and Deno children, so child.kill() alone is not
 * sufficient on Windows.
 */
function terminateProcessTree(child, options = {}) {
  if (!child || !child.pid) return Promise.resolve(false);
  const graceMs = Math.max(100, Number(options.graceMs) || 1500);
  const hardDeadlineMs = Math.max(graceMs + 100, Number(options.hardDeadlineMs) || graceMs + 1000);

  if (process.platform === "win32") {
    return new Promise((resolve) => {
      let settled = false;
      let killer;
      let timer;
      try {
        killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore"
        });
      } catch {
        tryKillDirect(child);
        resolve(true);
        return;
      }
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(true);
      };
      killer.once("error", () => {
        tryKillDirect(child);
        finish();
      });
      killer.once("close", finish);
      timer = setTimeout(() => {
        tryKillDirect(child);
        finish();
      }, graceMs);
      if (typeof timer.unref === "function") timer.unref();
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer);
      clearTimeout(deadlineTimer);
      child.removeListener("close", finish);
      resolve(true);
    };
    child.once("close", finish);
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      tryKillDirect(child, "SIGTERM");
    }
    const forceTimer = setTimeout(() => {
      if (child.exitCode != null || child.signalCode != null) {
        finish();
        return;
      }
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        tryKillDirect(child, "SIGKILL");
      }
    }, graceMs);
    const deadlineTimer = setTimeout(finish, hardDeadlineMs);
  });
}

function tryKillDirect(child, signal) {
  try {
    if (child.exitCode == null && child.signalCode == null) child.kill(signal);
  } catch {
    // The process may have exited between the status check and kill.
  }
}

module.exports = {
  terminateProcessTree
};
