"use strict";

// Ask the installed SwiftLocal process to run isolate.js. Unpackaged
// CreateProcess cannot start soffice.com inside WindowsApps (EPERM), and
// Invoke-CommandInDesktopPackage returned without executing the launcher.
const fs = require("node:fs");
const net = require("node:net");
const { spawnSync } = require("node:child_process");
const { once } = require("node:events");

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function connect(url) {
  const socket = new WebSocket(url);
  await once(socket, "open");
  let next = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`inspector timeout: ${method}`));
        }, 45 * 60 * 1000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

async function waitForInspector(port, log) {
  const listUrl = `http://127.0.0.1:${port}/json/list`;
  const deadline = Date.now() + 45000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(listUrl);
      last = await response.text();
      const targets = JSON.parse(last);
      const target = targets.find((item) => item.webSocketDebuggerUrl);
      if (target) return target.webSocketDebuggerUrl;
    } catch (error) {
      last = error.message;
    }
    await delay(300);
  }
  fs.appendFileSync(log, `inspector unavailable: ${last}\n`);
  throw new Error("Packaged Electron did not open an inspector");
}

async function main() {
  const configPath = arg("--config");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  const log = config.launchLog;
  const port = await freePort();
  fs.appendFileSync(log, `activate inspect=${port}\n`);
  const activation = spawnSync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", config.activate,
    "-Aumid", config.aumid,
    "-Arguments", `--inspect=127.0.0.1:${port}`
  ], { encoding: "utf8", windowsHide: true });
  fs.appendFileSync(log, `activation status=${activation.status} stdout=${activation.stdout || ""} stderr=${activation.stderr || ""}\n`);
  if (activation.status !== 0) throw new Error("Store activation failed");
  const pid = Number(String(activation.stdout || "").trim());
  if (!pid) throw new Error(`Activation did not return a pid: ${activation.stdout}`);
  try {
    const websocketUrl = await waitForInspector(port, log);
    fs.appendFileSync(log, `inspector ${websocketUrl}\n`);
    const client = await connect(websocketUrl);
    const expression = `process.env.SWIFTLOCAL_LO_MATRIX_CONFIG = ${JSON.stringify(configPath)}; require(${JSON.stringify(config.isolate)}); "completed";`;
    const evaluation = client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    const finished = await Promise.race([
      evaluation.then((result) => ({ via: "inspector", result })),
      (async () => {
        const deadline = Date.now() + 40 * 60 * 1000;
        while (Date.now() < deadline) {
          if (fs.existsSync(config.evidence)) return { via: "evidence" };
          await delay(1000);
        }
        return { via: "timeout" };
      })()
    ]);
    fs.appendFileSync(log, `matrix finished via ${finished.via}\n`);
    if (finished.result) fs.appendFileSync(log, `${JSON.stringify(finished.result).slice(0, 4000)}\n`);
    client.close();
  } finally {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
  if (!fs.existsSync(config.evidence)) throw new Error("LibreOffice path matrix produced no evidence");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
