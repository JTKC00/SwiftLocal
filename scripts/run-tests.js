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
    shell: process.platform === "win32"
  });
  if (result.error) {
    console.error(result.error);
    return 1;
  }
  return result.status === null ? 1 : result.status;
}

function pythonCmd() {
  // Prefer py -3 on Windows, else python3 / python
  if (process.platform === "win32") {
    const probe = spawnSync("py", ["-3", "-c", "print(1)"], { shell: true });
    if (probe.status === 0) {
      return { cmd: "py", prefix: ["-3"] };
    }
  }
  const py3 = spawnSync("python3", ["-c", "print(1)"], { shell: true });
  if (py3.status === 0) {
    return { cmd: "python3", prefix: [] };
  }
  return { cmd: "python", prefix: [] };
}

let code = 0;

code = run("node", ["--test", "tests/desktop/backend.test.js"], "Desktop (Node)") || code;

const py = pythonCmd();
code =
  run(py.cmd, [...py.prefix, "-m", "unittest", "tests.backend.test_core", "-v"], "Backend (Python)") ||
  code;

console.log(code === 0 ? "\nAll tests passed." : "\nSome tests failed.");
process.exit(code);
