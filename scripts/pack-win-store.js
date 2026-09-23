"use strict";
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function main() {
  if (process.platform !== "win32") throw new Error("Store AppX spike requires Windows x64 (LibreOffice MSI extraction, MakeAppx and package registration). Use Store Packaging Spike CI.");
  if (process.arch !== "x64") throw new Error("Store spike is x64 only");
  if (process.argv.length > 2 || process.env.SWIFTLOCAL_STORE_MODE) {
    throw new Error("Production Store candidate accepts no identity overrides or publishing arguments");
  }
  if (require("electron-builder/package.json").version !== "26.15.3") throw new Error("Store spike requires pinned electron-builder 26.15.3");
  const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false", SWIFTLOCAL_FULL_BUILD: "1" };
  for (const name of Object.keys(env)) if (/^(WIN_)?CSC_/.test(name) && name !== "CSC_IDENTITY_AUTO_DISCOVERY") delete env[name];
  const run = args => {
    const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
    if (result.error || result.status !== 0) throw result.error || new Error(`Store step failed (${result.status}): ${args[0]}`);
  };
  run(["scripts/ensure-native-tools.js", "--download", "--full"]);
  run(["scripts/ensure-media-download-tools.js", "--platform", "win32", "--download"]);
  run(["scripts/ensure-tessdata.js", "--require-full", "--download"]);
  run(["scripts/check-pack-ready.js", "--full"]);
  run(["scripts/build-store-assets.js"]);
  run([require.resolve("electron-builder/out/cli/cli.js"), "--config", "electron-builder.store.config.js", "--win", "appx", "--x64", "--publish", "never"]);
  run(["scripts/verify-store-package.js"]);
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { main };
