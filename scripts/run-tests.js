"use strict";

/**
 * Run desktop (Node) + backend (Python) unit tests.
 * Usage: node scripts/run-tests.js
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

function run(command, args, label) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    windowsHide: true
  });
  if (result.error) {
    console.error(result.error);
    return 1;
  }
  return result.status === null ? 1 : result.status;
}

function pythonCmd() {
  const candidates = [];
  if (process.env.SWIFTLOCAL_PYTHON) {
    candidates.push({ cmd: process.env.SWIFTLOCAL_PYTHON, prefix: [] });
  }
  if (process.platform === "win32") {
    candidates.push({ cmd: "py", prefix: ["-3"] });
  }
  candidates.push({ cmd: "python3", prefix: [] }, { cmd: "python", prefix: [] });

  for (const candidate of candidates) {
    const probe = spawnSync(
      candidate.cmd,
      [...candidate.prefix, "-c", "import sys, unittest, pypdf; print(sys.executable)"],
      { shell: false, windowsHide: true, encoding: "utf8" }
    );
    if (probe.status === 0) {
      return candidate;
    }
  }
  return null;
}

let code = 0;

code = run("node", ["--test", "tests/desktop/backend.test.js"], "Desktop (Node)") || code;

const py = pythonCmd();
if (!py) {
  console.error("\nNo compatible Python runtime found. Install backend/requirements.txt or set SWIFTLOCAL_PYTHON.");
  code = 1;
} else {
  code =
    run(py.cmd, [...py.prefix, "-m", "unittest", "tests.backend.test_core", "-v"], "Backend (Python)") ||
    code;
}

console.log(code === 0 ? "\nAll tests passed." : "\nSome tests failed.");
process.exit(code);
