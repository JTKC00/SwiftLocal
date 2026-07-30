"use strict";

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { main: verifyPackagedUi } = require("./verify-packaged-ui");

const projectRoot = path.resolve(__dirname, "..");
function resolveDefaultPackagedExe() {
  const candidates = [
    path.join("dist", "win-unpacked", "SwiftLocal.exe"),
    path.join("dist", "win-unpacked", "快轉通 SwiftLocal.exe"),
    path.join("dist-full", "win-unpacked", "SwiftLocal.exe"),
    path.join("dist-full", "win-unpacked", "快轉通 SwiftLocal.exe")
  ];
  for (const relative of candidates) {
    const absolute = path.resolve(projectRoot, relative);
    if (fs.existsSync(absolute)) return absolute;
  }
  return path.resolve(projectRoot, candidates[0]);
}

const packagedExe = path.resolve(projectRoot, process.argv[2] || resolveDefaultPackagedExe());

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function main() {
  if (process.platform !== "win32") throw new Error("packaged UI smoke 目前只支援 Windows 目錄版");
  if (!fs.existsSync(packagedExe)) throw new Error(`缺少 Windows 目錄版：${packagedExe}`);
  const configuredPort = process.env.SWIFTLOCAL_PACKAGED_DEBUG_PORT;
  const debuggerPort = configuredPort ? Number(configuredPort) : await findAvailablePort();
  if (!Number.isInteger(debuggerPort) || debuggerPort < 1024 || debuggerPort > 65535) throw new Error("偵錯連接埠無效");

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-packaged-ui-smoke-"));
  const app = spawn(packagedExe, [
    `--remote-debugging-port=${debuggerPort}`,
    `--user-data-dir=${profileDir}`
  ], {
    cwd: path.dirname(packagedExe),
    detached: false,
    stdio: "ignore",
    windowsHide: true
  });

  let verificationError = null;
  try {
    await verifyPackagedUi(`http://127.0.0.1:${debuggerPort}/json`);
  } catch (error) {
    verificationError = error;
  } finally {
    if (app.pid) {
      spawnSync("taskkill.exe", ["/PID", String(app.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
    }
    let cleanupError = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
        cleanupError = null;
        break;
      } catch (error) {
        cleanupError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (cleanupError) console.warn(`WARN 無法完全清理隔離設定：${cleanupError.message}`);
  }
  if (verificationError) throw verificationError;
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
});
