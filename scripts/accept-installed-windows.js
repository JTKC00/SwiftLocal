"use strict";
// Test harness only: talks to the actual installed Electron app over localhost CDP.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const assert = require("node:assert/strict");
const { readWhenReady } = require("./accept-store-windows");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}
async function connect(url) {
  const socket = new WebSocket(url); await once(socket, "open");
  let next = 0; const pending = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data); const request = pending.get(message.id);
    if (!request) return; pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("CDP disconnected")); }
    pending.clear();
  });
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++next;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 120000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}
async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function pageAt(endpoint, pattern, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const pages = await (await fetch(endpoint)).json(); const p = pages.find(item => item.type === "page" && pattern.test(item.url)); if (p) return p; } catch {}
    await delay(300);
  }
  throw new Error(`Renderer did not appear: ${pattern}`);
}
async function main(configFile, phase) {
  if (process.platform !== "win32") throw new Error("Installed acceptance requires Windows");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8").replace(/^\uFEFF/, ""));
  const report = { phase, platform: process.platform, userProfile: process.env.USERPROFILE, path: process.env.PATH, tests: [] };
  const record = (name, evidence) => report.tests.push({ name, status: "PASS", evidence });
  const failures = [];
  const attempt = async (name, action) => {
    try { await action(); } catch (error) {
      failures.push(error);
      report.tests.push({ name, status: "FAIL", error: error.stack });
    }
  };
  let app, client, appLog;
  let originalToolPaths;
  const changedTools = [];
  const restoreToolPreferences = async () => {
    if (!changedTools.length) return;
    while (changedTools.length) {
      const key = changedTools[changedTools.length - 1];
      await evaluate(client, `window.swiftLocalBackend.setToolPath(${JSON.stringify(key)}, ${JSON.stringify(originalToolPaths[key] || "")})`);
      changedTools.pop();
    }
    const restored = await evaluate(client, `window.swiftLocalBackend.getConfig()`);
    assert.deepEqual(restored.toolPaths, originalToolPaths, "Temporary NSIS tool preferences were not restored");
    report.temporaryToolPreferences.restored = "PASS";
    fs.writeFileSync(path.join(config.evidence, `${phase}-tool-preference-journal.json`), JSON.stringify(report.temporaryToolPreferences, null, 2));
    record("temporary-configured-tool-preferences-restored", { toolPaths: restored.toolPaths });
  };
  const debugPort = await port(); const endpoint = `http://127.0.0.1:${debugPort}/json`;
  try {
    appLog = fs.openSync(path.join(config.evidence, `${phase}-electron.log`), "w");
    app = spawn(config.exe, [`--remote-debugging-port=${debugPort}`], { cwd: path.dirname(config.exe), stdio: ["ignore", appLog, appLog], windowsHide: false });
    let launchError; app.on("error", error => { launchError = error; });
    const page = await pageAt(endpoint, /frontend\/index\.html$/);
    if (launchError) throw launchError;
    client = await connect(page.webSocketDebuggerUrl);
    report.startupTransportRetries = [];
    const startup = await readWhenReady(client, `(async()=>{for(let i=0;i<100;i++){if(window.swiftLocalBackend && document.querySelector('#quick-actions [data-panel="pdf-reader-panel"]'))return {title:document.title,config:await window.swiftLocalBackend.getConfig()};await new Promise(r=>setTimeout(r,100));}throw new Error('preload/home not ready')})()`, error => report.startupTransportRetries.push(error));
    assert.equal(startup.title, "快轉通 SwiftLocal");
    record("installed-startup-default-profile", startup);
    if (config.temporarilyClearConfiguredTools?.length) {
      originalToolPaths = { ...startup.config.toolPaths };
      const jobs = await evaluate(client, `window.swiftLocalBackend.getJobs()`);
      assert.ok(!jobs.some(job => ["queued", "running"].includes(job.status)), "Do not change tool preferences while pre-existing jobs are active");
      report.temporaryToolPreferences = { scope: "NSIS-only Full smoke preparation through existing public API; original preferences restored before Store lifecycle", originalToolPaths, cleared: [], restored: "UNVERIFIED" };
      fs.writeFileSync(path.join(config.evidence, `${phase}-tool-preference-journal.json`), JSON.stringify(report.temporaryToolPreferences, null, 2));
      for (const key of config.temporarilyClearConfiguredTools) {
        assert.equal(key, "qpdf", "Only the observed pre-existing qpdf override is permitted in this cycle");
        changedTools.push(key);
        await evaluate(client, `window.swiftLocalBackend.setToolPath(${JSON.stringify(key)}, '')`);
        report.temporaryToolPreferences.cleared.push(key);
      }
      fs.writeFileSync(path.join(config.evidence, `${phase}-tool-preference-journal.json`), JSON.stringify(report.temporaryToolPreferences, null, 2));
    }
    const firstLaunch = await client.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(config.evidence, `${phase}-first-launch.png`), Buffer.from(firstLaunch.data, "base64"));
    if (phase === "baseline") {
      await evaluate(client, `localStorage.setItem('swiftlocal-acceptance-upgrade','preserve-me')`);
      const savedOutput = path.join(config.output, "保留的輸出設定");
      await evaluate(client, `window.swiftLocalBackend.setDefaultOutputDir(${JSON.stringify(savedOutput)})`);
      record("upgrade-marker-and-setting-written", savedOutput);
    } else {
      if (phase === "upgrade") {
        assert.equal(await evaluate(client, `localStorage.getItem('swiftlocal-acceptance-upgrade')`), "preserve-me");
        assert.equal(startup.config.defaultOutputDir, path.join(config.output, "保留的輸出設定"));
      }
      record(phase === "upgrade" ? "upgrade-retains-user-data" : "installed-startup-ready", true);
      const tools = await evaluate(client, `window.swiftLocalBackend.detectTools()`);
      const bundledRoot = path.join(path.dirname(config.exe), "resources", "tools");
      for (const key of ["qpdf", "tesseract", "ffmpeg", "libreOffice"]) {
        const tool = tools[key]; assert.equal(tool?.available, true, key);
        const relative = path.relative(bundledRoot, tool.path);
        assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `${key} escaped bundled tools: ${tool.path}`);
        assert.equal(tool.source, "bundled", key);
      }
      assert.equal(tools.tesseract.hasChiTra, true); assert.equal(tools.tesseract.hasEng, true);
      record("all-tools-from-installed-full-package", tools);
      const inputs = config.fixtures;
      const languageState = () => Object.fromEntries(["chi_tra.traineddata", "eng.traineddata", "configs/pdf", "pdf.ttf"].map(name => {
        const file = path.join(tools.tesseract.tessdataPath, name);
        return [name, fs.existsSync(file) ? { bytes: fs.statSync(file).size, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") } : { missing: true }];
      }));
      const initialLanguages = languageState();
      report.languageSnapshots = [{ phase: "before-conversions", files: initialLanguages }];
      async function job(type, files, options = {}) {
        const outputDir = path.join(config.output, phase, type); fs.mkdirSync(outputDir, { recursive: true });
        const payload = { type, inputPaths: files.map(name => path.join(inputs, name)), outputDir, options };
        const created = await evaluate(client, `window.swiftLocalBackend.enqueueJob(${JSON.stringify(payload)})`);
        const start = Date.now(); let finished;
        while (Date.now() - start < 240000) {
          const list = await evaluate(client, `window.swiftLocalBackend.getJobs()`);
          const current = list.find(item => item.id === created.id);
          if (current && ["done", "failed", "cancelled"].includes(current.status)) { finished = current; break; }
          await delay(300);
        }
        assert.equal(finished?.status, "done", `${type}: ${JSON.stringify(finished)}`);
        const outputPaths = finished.outputPaths.map(file => file.path);
        assert.ok(outputPaths.length, type);
        for (const file of outputPaths) assert.ok(fs.statSync(file).size > 0, file);
        if (type === "ocr-image") assert.match(fs.readFileSync(outputPaths[0], "utf8"), /SWIFTLOCAL|HONG\s*KONG/i);
        if (["office-to-pdf", "pdf-to-searchable-pdf"].includes(type)) assert.equal(fs.readFileSync(outputPaths[0]).subarray(0, 5).toString(), "%PDF-");
        record(`installed-conversion-${type}`, { outputs: outputPaths, bytes: outputPaths.map(p => fs.statSync(p).size) });
      }
      for (const [type, files, options] of [
        ["pdf-compress", ["a.pdf"]],
        ["ocr-image", ["ocr-text.png"], { language: "chi_tra+eng" }],
        ["pdf-to-searchable-pdf", ["ocr-scan.pdf"], { language: "chi_tra+eng" }],
        ["office-to-pdf", ["office-smoke.docx"]],
        ["media-convert", ["tone.wav"], { extension: "mp3", audioBitrate: "128k" }]
      ]) {
        await attempt(`installed-conversion-${type}`, () => job(type, files, options));
        await attempt(`language-resources-preserved-after-${type}`, async () => {
          const files = languageState(); report.languageSnapshots.push({ phase: type, files });
          assert.deepEqual(files, initialLanguages, "A conversion changed installed language resources");
        });
      }
      const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(config.evidence, `${phase}-installed-home.png`), Buffer.from(screenshot.data, "base64"));
      await attempt("registered-pdf-shell-verb-opens-document", async () => {
      // Invoke the registered PDF class through Windows ShellExecuteEx (not a direct app argv).
      const shell = spawnSync(config.powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", config.shellOpen, "-Pdf", path.join(inputs, "a.pdf")], { encoding: "utf8", windowsHide: true });
      assert.equal(shell.status, 0, shell.stderr || shell.stdout);
      const pdfPage = await pageAt(endpoint, /frontend\/pdf-workspace\/index\.html/);
      const pdfClient = await connect(pdfPage.webSocketDebuggerUrl);
      try {
        let label = "";
        for (let i = 0; i < 100; i++) { label = await evaluate(pdfClient, `document.querySelector('.pdf-ws-tab-label')?.textContent || ''`); if (label.includes("a.pdf")) break; await delay(200); }
        assert.ok(label.includes("a.pdf"), `Shell-opened PDF did not load: ${label}`);
        const shot = await pdfClient.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(config.evidence, `${phase}-shell-pdf.png`), Buffer.from(shot.data, "base64"));
        record("registered-pdf-shell-verb-opens-document", label);
        void evaluate(pdfClient, `window.close(); true`).catch(() => {});
        await delay(500);
      } finally { pdfClient.close(); }
      });
    }
    await restoreToolPreferences();
    void evaluate(client, `window.close(); true`).catch(() => {});
    for (let i = 0; i < 120 && app.exitCode === null; i++) await delay(250);
    assert.equal(app.exitCode, 0, "Installed app did not exit normally");
    record("normal-exit", app.exitCode);
    client.close(); client = null;
    if (failures.length) throw new AggregateError(failures, `${failures.length} installed-app acceptance checks failed`);
  } catch (error) {
    try { await restoreToolPreferences(); } catch (restoreError) {
      report.tests.push({ name: "temporary-configured-tool-preferences-restored", status: "FAIL", error: restoreError.stack });
    }
    report.tests.push({ name: "acceptance", status: "FAIL", error: error.stack }); throw error;
  } finally {
    client?.close();
    if (app?.pid && app.exitCode === null) spawnSync("taskkill.exe", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    if (appLog !== undefined) fs.closeSync(appLog);
    fs.writeFileSync(path.join(config.evidence, `${phase}-installed.json`), JSON.stringify(report, null, 2));
  }
}
if (require.main === module) main(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
