"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const toolsRoot = path.join(projectRoot, "tools");
const outputDir = "dist-full";
const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js");
const bundleToolsScript = path.join(projectRoot, "scripts", "bundle-mac-tools.js");

const requestedTargets = process.argv.slice(2);
const targets = requestedTargets.length ? requestedTargets : ["dmg"];

const bundleTools = spawn(process.execPath, [bundleToolsScript], {
  cwd: projectRoot,
  stdio: "inherit"
});

bundleTools.on("exit", (code) => {
  if (code) {
    process.exit(code);
    return;
  }
  startBuild();
});

bundleTools.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

function startBuild() {
  const sofficePath = findExecutable(toolsRoot, new Set(["soffice"]), 8);
  if (!sofficePath) {
    console.error(
      "Mac full build requires LibreOffice in tools/. Expected a bundled soffice executable under tools/LibreOffice.app/Contents/MacOS/soffice or another tools/ subfolder."
    );
    process.exit(1);
  }

  // Ensure eng + chi_tra language packs ship with Full (default OCR: chi_tra+eng).
  console.log("=== ensure tessdata (eng, chi_tra) for Mac Full build ===");
  const tessdataResult = spawnSync(
    process.execPath,
    [path.join(__dirname, "ensure-tessdata.js"), "--require-full", "--download"],
    { cwd: projectRoot, stdio: "inherit" }
  );
  if (tessdataResult.status !== 0) {
    console.error(
      "Mac full build aborted: required Tesseract language packs missing (eng + chi_tra).\n" +
        "Run: npm run tools:tessdata"
    );
    process.exit(tessdataResult.status || 1);
  }

  const builderArgs = [
    electronBuilderCli,
    "--config",
    "electron-builder.config.js",
    "--mac",
    ...mapTargets(targets),
    `--config.directories.output=${outputDir}`,
    "--config.mac.artifactName=SwiftLocal-${version}-full-mac-${arch}.${ext}",
    "--config.dmg.artifactName=SwiftLocal-${version}-full-mac-${arch}.${ext}"
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
}

function mapTargets(items) {
  const mapped = [];
  for (const item of items) {
    if (item === "dir") {
      mapped.push("--dir");
      continue;
    }
    if (item === "dmg") {
      mapped.push(item);
      continue;
    }
    console.error(`Unsupported mac full build target: ${item}`);
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
