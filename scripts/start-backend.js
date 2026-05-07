"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const backendArgs = ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8787"];

const candidates = buildPythonCandidates();
run();

function run() {
  tryNextCandidate(0);
}

function tryNextCandidate(index) {
  if (index >= candidates.length) {
    console.error("Unable to find a working Python executable for the backend.");
    console.error("Set SWIFTLOCAL_PYTHON to an absolute path if Python is installed in a custom location.");
    process.exit(1);
  }

  const candidate = candidates[index];
  const child = spawn(candidate.command, candidate.args.concat(backendArgs), {
    cwd: projectRoot,
    stdio: "inherit"
  });

  child.on("error", (error) => {
    if (error && error.code === "ENOENT") {
      tryNextCandidate(index + 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code === 0 || code === null) {
      process.exit(code || 0);
      return;
    }
    if (candidate.fallbackOnFailure) {
      tryNextCandidate(index + 1);
      return;
    }
    process.exit(code);
  });
}

function buildPythonCandidates() {
  const configured = String(process.env.SWIFTLOCAL_PYTHON || "").trim();
  const items = [];

  if (configured) {
    items.push({ command: configured, args: [], fallbackOnFailure: false });
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const windowsCandidates = [
      path.join(localAppData, "Python", "pythoncore-3.14-64", "python.exe"),
      path.join(localAppData, "Python", "bin", "python.exe")
    ];
    for (const candidate of windowsCandidates) {
      if (candidate && fs.existsSync(candidate)) {
        items.push({ command: candidate, args: [], fallbackOnFailure: true });
      }
    }
    items.push({ command: "py", args: ["-3"], fallbackOnFailure: true });
  }

  items.push({ command: "python3", args: [], fallbackOnFailure: true });
  items.push({ command: "python", args: [], fallbackOnFailure: true });

  return items;
}
