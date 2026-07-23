"use strict";

/**
 * Windows package entry: best-effort tessdata (chi_tra+eng), then electron-builder.
 * Does not hard-fail on missing tools (unlike Full); still tries to embed language packs when present.
 */
const path = require("node:path");
const { spawnSync, spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js");
const builderArgs = process.argv.slice(2);

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
child.on("exit", (code) => process.exit(code || 0));
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
