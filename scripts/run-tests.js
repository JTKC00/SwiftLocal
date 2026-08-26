"use strict";

/**
 * Run desktop (Node) + backend (Python) unit tests.
 * Usage: node scripts/run-tests.js [--python-only]
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
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
  if (result.error) console.error(result.error);
  return spawnResultExitCode(result);
}

function spawnResultExitCode(result) {
  if (!result || result.error || result.status === null || result.status === undefined) {
    return 1;
  }
  return result.status;
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

function runPythonTests() {
  const py = pythonCmd();
  if (!py) {
    console.error("\nNo compatible Python runtime found. Install backend/requirements.txt or set SWIFTLOCAL_PYTHON.");
    return 1;
  }
  return run(py.cmd, [...py.prefix, "-m", "unittest", "tests.backend.test_core", "-v"], "Backend (Python)");
}

function main(args = process.argv.slice(2)) {
  let code = 0;
  const pythonOnly = args.includes("--python-only");

  if (!pythonOnly) {
    const desktopTestDir = path.join(root, "tests", "desktop");
    const desktopTests = fs.readdirSync(desktopTestDir)
      .filter((name) => name.endsWith(".test.js"))
      .sort()
      .map((name) => path.join(desktopTestDir, name));
    code = run("node", ["--test", ...desktopTests], "Desktop (Node)") || code;
  }

  code = runPythonTests() || code;
  console.log(code === 0 ? "\nAll tests passed." : "\nSome tests failed.");
  return code;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  main,
  pythonCmd,
  run,
  runPythonTests,
  spawnResultExitCode
};
