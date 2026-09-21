"use strict";
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { configureStorePaths } = require("./runtime");
const paths = configureStorePaths(app);
fs.writeFileSync(path.join(paths.userData, "store-runtime-paths.json"), JSON.stringify(paths, null, 2));
require("../../desktop/main");

// Opt-in spike diagnostics: versions executed by the actual package process.
// No private inputs, network download or system-installed tools are involved.
if (process.argv.includes("--store-spike-probe")) {
  app.whenReady().then(async () => {
    const { promisify } = require("node:util");
    const exec = promisify(require("node:child_process").execFile);
    const { BackendService } = require("../../desktop/backend");
    const { resolveBundledMediaTool } = require("../../desktop/media-download");
    const backend = new BackendService({ configPath: path.join(paths.userData, "probe-tools.json"), defaultOutputDir: paths.temp });
    const tools = await backend.detectTools();
    const results = {};
    for (const [key, executable, args] of [
      ["ffmpeg", tools.ffmpeg?.path, ["-version"]], ["qpdf", tools.qpdf?.path, ["--version"]],
      ["tesseract", tools.tesseract?.path, ["--version"]], ["libreoffice", tools.libreOffice?.path, ["--version"]],
      ["yt-dlp", resolveBundledMediaTool("yt-dlp"), ["--version"]], ["deno", resolveBundledMediaTool("deno"), ["--version"]]
    ]) {
      try {
        const relative = path.relative(path.join(process.resourcesPath, "tools"), executable || "");
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Executable is not bundled");
        const { stdout, stderr } = await exec(executable, args, { cwd: paths.temp, windowsHide: true, timeout: 60000 });
        results[key] = { status: "PASS", executable, cwd: paths.temp, output: (stdout + stderr).trim().slice(0, 3000) };
      } catch (error) { results[key] = { status: "FAIL", executable, error: error.message }; }
    }
    fs.writeFileSync(path.join(paths.userData, "store-native-probe.json"), JSON.stringify(results, null, 2));
  }).catch(error => { fs.writeFileSync(path.join(paths.userData, "store-native-probe.json"), JSON.stringify({ error: error.message })); });
}
