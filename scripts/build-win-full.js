"use strict";

const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = "dist-full";
const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js");

const requestedTargets = process.argv.slice(2);
const targets = requestedTargets.length ? requestedTargets : ["portable", "installer"];

console.log("=== ensure pinned online-media tools ===");
const mediaToolsResult = spawnSync(
  process.execPath,
  [path.join(__dirname, "ensure-media-download-tools.js"), "--platform", "win32", "--download"],
  { cwd: projectRoot, stdio: "inherit" }
);
if (mediaToolsResult.status !== 0) {
  console.error("Full build aborted: yt-dlp / Deno could not be provisioned and verified.");
  process.exit(mediaToolsResult.status || 1);
}

console.log("=== ensure required tessdata (eng, chi_tra, osd) for Full build ===");
const tessdataResult = spawnSync(
  process.execPath,
  [path.join(__dirname, "ensure-tessdata.js"), "--require-full", "--download"],
  { cwd: projectRoot, stdio: "inherit" }
);
if (tessdataResult.status !== 0) {
  console.error(
    "Full build aborted: required Tesseract language packs missing (need eng + chi_tra + osd).\n" +
      "Run: npm run tools:tessdata\n" +
      "Or place chi_tra.traineddata under tools/tesseract/tessdata/"
  );
  process.exit(tessdataResult.status || 1);
}

console.log("=== Full pack readiness check ===");
const ready = spawnSync(
  process.execPath,
  [path.join(__dirname, "check-pack-ready.js"), "--full"],
  { cwd: projectRoot, stdio: "inherit" }
);
if (ready.status !== 0) {
  console.error("Full build aborted. Fix items above, then: npm run check:pack:full");
  process.exit(ready.status || 1);
}

const builderArgs = [
  electronBuilderCli,
  "--config",
  "electron-builder.config.js",
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
  if (code !== 0) process.exit(Number.isInteger(code) ? code : 1);
  console.log("=== verify Full Windows release payload ===");
  const verify = spawnSync(
    process.execPath,
    [path.join(__dirname, "verify-release-artifacts.js"), ...fullVerificationArgs(targets)],
    { cwd: projectRoot, stdio: "inherit" }
  );
  if (verify.error) console.error(verify.error);
  process.exit(verify.status === 0 ? 0 : 1);
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

function fullVerificationArgs(items) {
  const args = ["--full", "--dir", outputDir];
  if (items.includes("dir")) return [...args, "--unpacked"];
  const kinds = [];
  if (items.includes("portable")) kinds.push("portable");
  if (items.includes("installer") || items.includes("nsis")) kinds.push("installer");
  if (kinds.length === 1) args.push("--artifact", kinds[0]);
  return args;
}
