"use strict";

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { main: verifyPackagedUi } = require("./verify-packaged-ui");

const projectRoot = path.resolve(__dirname, "..");
const PORTABLE_STARTUP_TIMEOUT_MS = 300000;
const UNPACKED_STARTUP_TIMEOUT_MS = 10000;
const PORTABLE_CLEANUP_TIMEOUT_MS = 120000;
const UNPACKED_CLEANUP_TIMEOUT_MS = 30000;

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

function isPortableExecutable(executablePath) {
  return /-portable-(?:x64|arm64|ia32)\.exe$/i.test(path.basename(executablePath));
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} 必須是正整數`);
  return parsed;
}

function resolveStartupTimeoutMs(executablePath, explicitValue, env = process.env) {
  const configured = explicitValue ?? env.SWIFTLOCAL_PACKAGED_STARTUP_TIMEOUT_MS;
  if (configured != null && configured !== "") return parsePositiveInteger(configured, "startup timeout");
  return isPortableExecutable(executablePath) ? PORTABLE_STARTUP_TIMEOUT_MS : UNPACKED_STARTUP_TIMEOUT_MS;
}

function parseArgs(argv = process.argv.slice(2)) {
  const positional = [];
  let startupTimeoutMs = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--startup-timeout-ms") {
      if (index + 1 >= argv.length) throw new Error("--startup-timeout-ms 缺少數值");
      startupTimeoutMs = parsePositiveInteger(argv[++index], "startup timeout");
      continue;
    }
    if (argument.startsWith("--startup-timeout-ms=")) {
      startupTimeoutMs = parsePositiveInteger(argument.slice(argument.indexOf("=") + 1), "startup timeout");
      continue;
    }
    if (argument.startsWith("--")) throw new Error(`不支援的 packaged UI smoke 參數：${argument}`);
    positional.push(argument);
  }
  if (positional.length > 4) throw new Error("packaged UI smoke positional 參數過多");
  const executablePath = path.resolve(projectRoot, positional[0] || resolveDefaultPackagedExe());
  return {
    packagedExe: executablePath,
    ocrFixturePath: positional[1] ? path.resolve(projectRoot, positional[1]) : "",
    ocrOutputDir: positional[2] ? path.resolve(projectRoot, positional[2]) : "",
    imageFixturePath: positional[3] ? path.resolve(projectRoot, positional[3]) : "",
    startupTimeoutMs: resolveStartupTimeoutMs(executablePath, startupTimeoutMs)
  };
}

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

function waitForExit(child, timeoutMs) {
  if (!child.pid) return Promise.resolve(true);
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
    child.once("error", onExit);
  });
}

async function main(options = parseArgs()) {
  if (process.platform !== "win32") throw new Error("packaged UI smoke 目前只支援 Windows packaged EXE");
  const { packagedExe, ocrFixturePath, ocrOutputDir, imageFixturePath, startupTimeoutMs } = options;
  if (!fs.existsSync(packagedExe)) throw new Error(`缺少 Windows packaged EXE：${packagedExe}`);
  const portable = isPortableExecutable(packagedExe);
  const configuredPort = process.env.SWIFTLOCAL_PACKAGED_DEBUG_PORT;
  const debuggerPort = configuredPort ? Number(configuredPort) : await findAvailablePort();
  if (!Number.isInteger(debuggerPort) || debuggerPort < 1024 || debuggerPort > 65535) throw new Error("偵錯連接埠無效");

  const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-packaged-ui-smoke-"));
  const profileDir = path.join(sessionRoot, "profile");
  fs.mkdirSync(profileDir, { recursive: true });
  const app = spawn(packagedExe, [
    `--remote-debugging-port=${debuggerPort}`,
    `--user-data-dir=${profileDir}`
  ], {
    cwd: path.dirname(packagedExe),
    detached: false,
    stdio: "ignore",
    windowsHide: true,
    env: portable ? { ...process.env, TEMP: sessionRoot, TMP: sessionRoot } : process.env
  });
  const startedAt = Date.now();
  let launchError = null;
  let exitDetails = null;
  app.once("error", (error) => {
    launchError = error;
  });
  app.once("exit", (code, signal) => {
    exitDetails = { code, signal };
  });

  let verificationError = null;
  let forcedCleanup = false;
  try {
    console.log(
      `START packaged ${portable ? "Portable" : "app"} PID ${app.pid || "unknown"}; startup timeout ${(startupTimeoutMs / 1000).toFixed(0)}s`
    );
    await verifyPackagedUi(`http://127.0.0.1:${debuggerPort}/json`, {
      startupTimeoutMs,
      ocrFixturePath,
      ocrOutputDir,
      imageFixturePath,
      closeWindowOnFinish: true,
      getLaunchFailure: () => {
        if (launchError) return `packaged launcher 啟動失敗：${launchError.message}`;
        if (exitDetails) {
          return `packaged launcher 在 DevTools 就緒前退出（code=${exitDetails.code}, signal=${exitDetails.signal || "none"}）`;
        }
        return "";
      },
      onStartupProgress: ({ elapsedMs, lastError }) => {
        console.log(
          `WAIT packaged startup ${(elapsedMs / 1000).toFixed(0)}s/${(startupTimeoutMs / 1000).toFixed(0)}s; launcher PID ${app.pid}; ${lastError?.message || "DevTools 未就緒"}`
        );
      }
    });
    console.log(`OK packaged renderer ready and verified after ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } catch (error) {
    verificationError = error;
  } finally {
    const cleanupTimeoutMs = portable ? PORTABLE_CLEANUP_TIMEOUT_MS : UNPACKED_CLEANUP_TIMEOUT_MS;
    const exitedGracefully = await waitForExit(app, cleanupTimeoutMs);
    if (!exitedGracefully && app.pid) {
      forcedCleanup = true;
      spawnSync("taskkill.exe", ["/PID", String(app.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      await waitForExit(app, 10000);
      const exitFailure = new Error("packaged app 未在期限內正常退出，已強制清理自己的程序樹");
      if (!verificationError) verificationError = exitFailure;
      else console.error(`FAIL ${exitFailure.message}`);
    }
    let cleanupError = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        fs.rmSync(sessionRoot, { recursive: true, force: true });
        cleanupError = null;
        break;
      } catch (error) {
        cleanupError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (cleanupError) {
      const cleanupFailure = new Error(`無法完全清理 packaged smoke session：${cleanupError.message}`);
      if (!verificationError) verificationError = cleanupFailure;
      else console.error(`FAIL ${cleanupFailure.message}`);
    }
  }
  if (!forcedCleanup && !verificationError) console.log("OK packaged app exited normally and isolated session was cleaned");
  if (verificationError) throw verificationError;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  PORTABLE_STARTUP_TIMEOUT_MS,
  UNPACKED_STARTUP_TIMEOUT_MS,
  isPortableExecutable,
  main,
  parseArgs,
  resolveStartupTimeoutMs,
  waitForExit
};
