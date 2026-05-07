"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const toolsRoot = path.join(projectRoot, "tools");
const outputDir = "dist-full";
const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js");

const requestedTargets = process.argv.slice(2);
const targets = requestedTargets.length ? requestedTargets : ["portable", "installer"];

const sofficePath = findExecutable(toolsRoot, new Set(["soffice.exe", "soffice"]), 6);
if (!sofficePath) {
  console.error("Full build requires LibreOffice in tools/. Expected a bundled soffice executable under tools/libreoffice/ or another tools/ subfolder.");
  process.exit(1);
}

const builderArgs = [
  electronBuilderCli,
  "--win",
  ...mapTargets(targets),
  `--config.directories.output=${outputDir}`,
  "--config.win.artifactName=SwiftLocal-${version}-full-${arch}.${ext}",
  "--config.portable.artifactName=SwiftLocal-${version}-full-portable-${arch}.${ext}",
  "--config.nsis.artifactName=SwiftLocal-${version}-full-installer-${arch}.${ext}"
];

const child = spawn(process.execPath, builderArgs, {
  cwd: projectRoot,
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code || 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

function mapTargets(items) {
  const mapped = [];
  for (const item of items) {
    if (item === "dir") {
      mapped.push("--dir");
      continue;
    }
    if (item === "installer") {
      mapped.push("nsis");
      continue;
    }
    if (item === "portable" || item === "nsis") {
      mapped.push(item);
      continue;
    }
    console.error(`Unsupported full build target: ${item}`);
    process.exit(1);
  }
  return mapped;
}

function findExecutable(root, executableNames, depth) {
  if (!fs.existsSync(root) || depth < 0) {
    return "";
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && executableNames.has(entry.name)) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const nested = findExecutable(fullPath, executableNames, depth - 1);
      if (nested) {
        return nested;
      }
    }
  }
  return "";
}
