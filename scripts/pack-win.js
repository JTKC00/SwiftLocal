"use strict";

/**
 * Windows package entry: provision pinned media tools, verify Windows resources,
 * refresh tessdata when possible, then run electron-builder.
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

console.log("=== ensure tessdata (best-effort refresh) ===");
const tess = spawnSync(
  process.execPath,
  [path.join(__dirname, "ensure-tessdata.js"), "--download"],
  { cwd: projectRoot, stdio: "inherit" }
);
if (tess.status && tess.status !== 0) {
  console.warn(
    "WARN: tessdata ensure did not fully succeed; packaging continues.\n" +
      "  For a complete Full build with chi_tra guaranteed, use: npm run pack:win:full"
  );
}

const child = spawn(
  process.execPath,
  [electronBuilderCli, "--config", "electron-builder.config.js", ...builderArgs],
  { cwd: projectRoot, stdio: "inherit" }
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
