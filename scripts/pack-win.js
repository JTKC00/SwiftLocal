"use strict";

/**
 * Windows package entry: provision pinned media tools and required tessdata,
 * verify the complete Windows resource set once, then run electron-builder.
 */
const path = require("node:path");
const { spawnSync, spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js");
const builderArgs = process.argv.slice(2);

console.log("=== ensure pinned online-media tools ===");
const mediaTools = spawnSync(
  process.execPath,
  [path.join(__dirname, "ensure-media-download-tools.js"), "--platform", "win32", "--download"],
  { cwd: projectRoot, stdio: "inherit" }
);
if (mediaTools.status !== 0) {
  console.error("Pack aborted: yt-dlp / Deno could not be provisioned and verified.");
  process.exit(mediaTools.status || 1);
}

console.log("=== ensure required tessdata (eng, chi_tra, osd) ===");
const tessdata = spawnSync(
  process.execPath,
  [path.join(__dirname, "ensure-tessdata.js"), "--download"],
  { cwd: projectRoot, stdio: "inherit" }
);
if (tessdata.status !== 0) {
  console.error("Pack aborted: required Tesseract language packs could not be provisioned.");
  process.exit(tessdata.status || 1);
}

console.log("=== pack readiness check ===");
const ready = spawnSync(
  process.execPath,
  [path.join(__dirname, "check-pack-ready.js")],
  { cwd: projectRoot, stdio: "inherit" }
);
if (ready.status !== 0) {
  console.error("Pack aborted: fix items above, then re-run npm run pack:win");
  process.exit(ready.status || 1);
}

const child = spawn(
  process.execPath,
  [electronBuilderCli, "--config", "electron-builder.config.js", ...builderArgs],
  {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, SWIFTLOCAL_FULL_BUILD: "0" }
  }
);
child.on("exit", (code) => {
  if (code !== 0) process.exit(Number.isInteger(code) ? code : 1);
  console.log("=== verify Windows release payload ===");
  const verify = spawnSync(
    process.execPath,
    [path.join(__dirname, "verify-release-artifacts.js"), ...verificationArgs(builderArgs)],
    { cwd: projectRoot, stdio: "inherit" }
  );
  if (verify.error) console.error(verify.error);
  process.exit(verify.status === 0 ? 0 : 1);
});
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

function verificationArgs(args) {
  if (args.includes("--dir")) return ["--unpacked"];
  const kinds = [];
  if (args.includes("portable")) kinds.push("portable");
  if (args.includes("nsis")) kinds.push("installer");
  if (!kinds.length || kinds.length === 2) return [];
  return ["--artifact", kinds[0]];
}
