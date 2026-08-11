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

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    tryKillDirect(child, "SIGTERM");
  }
  const timer = setTimeout(() => {
    if (child.exitCode != null || child.signalCode != null) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      tryKillDirect(child, "SIGKILL");
    }
  }, graceMs);
  if (typeof timer.unref === "function") timer.unref();
  return Promise.resolve(true);
}

function tryKillDirect(child, signal) {
  try {
    if (!child.killed) child.kill(signal);
  } catch {
    // The process may have exited between the status check and kill.
  }
}

module.exports = {
  terminateProcessTree
};
