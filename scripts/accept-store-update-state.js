"use strict";
// Phase 2D only. Real theme/preset/output/jobs behavior, not a synthetic storage key.
// Verification reads persisted values before performing ANY preference/state writes.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { port, connect, evaluate, pageAt, readWhenReady } = require("./accept-store-windows");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const presetName = "Phase 2D Store media preset";
const keys = ["swiftlocal-theme", "swiftlocal-presets", "swiftlocal-workflows", "swiftlocal.recentPdfs", "swiftlocal-accessibility"];

async function main(configFile, mode) {
  assert.ok(["seed", "verify", "checkpoint", "verify-reverse"].includes(mode), "Use seed, verify, checkpoint or verify-reverse");
  const config = JSON.parse(fs.readFileSync(configFile, "utf8").replace(/^\uFEFF/, ""));
  const expectedFile = config.stateBaselineFile;
  assert.ok(expectedFile, "Shared stateBaselineFile must be configured across lifecycle stages");
  const report = { status: "UNVERIFIED", scope: "automated installed Store persistence check; GUI observation separate", mode };
  let client, pid;
  try {
    const debugPort = await port();
    // Do not run the probe flag here: take retention measurements before probes/jobs.
    const activation = spawnSync(config.powershell, ["-NoProfile", "-File", config.activate, "-Aumid", config.aumid,
      "-Arguments", `--remote-debugging-port=${debugPort}`], { encoding: "utf8", windowsHide: true });
    assert.equal(activation.status, 0, activation.stderr || activation.stdout);
    pid = Number(activation.stdout.trim()); assert.ok(pid > 0);
    const page = await pageAt(`http://127.0.0.1:${debugPort}/json`, /frontend\/index\.html$/);
    client = await connect(page.webSocketDebuggerUrl);
    report.startupTransportRetries = [];
    await readWhenReady(client, `(async()=>{for(let i=0;i<100;i++){if(window.swiftLocalBackend&&document.querySelector('#theme-toggle'))return true;await new Promise(r=>setTimeout(r,100))}throw new Error('home not ready')})()`, error => report.startupTransportRetries.push(error));
    const candidates = [config.profile, path.join(process.env.LOCALAPPDATA, "Packages", config.expectedFamily, "LocalCache", "Roaming", config.profileDirectoryName)];
    const profile = candidates.find(p => fs.existsSync(path.join(p, "store-runtime-paths.json")));
    assert.ok(profile, "Actual Store runtime profile not found");
    const runtime = JSON.parse(fs.readFileSync(path.join(profile, "store-runtime-paths.json"), "utf8"));
    assert.equal(runtime.windowsStore, true);
    assert.equal(path.resolve(runtime.resourcesPath), path.resolve(path.dirname(config.exe), "resources"));
    const read = () => evaluate(client, `(async()=>({config:await window.swiftLocalBackend.getConfig(),storage:Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,localStorage.getItem(k)])),jobs:await window.swiftLocalBackend.getJobs()}))()`);
    report.startup = await read();
    report.profile = profile; report.runtime = runtime;
    if (mode === "seed") {
      assert.ok(!fs.existsSync(expectedFile), "Do not replace an earlier state baseline");
      fs.mkdirSync(config.output, { recursive: true });
      // Public preference button; normal saved-preset form; existing backend IPC.
      await evaluate(client, `document.querySelector('#theme-toggle').click(); true`);
      await evaluate(client, `window.swiftLocalBackend.setDefaultOutputDir(${JSON.stringify(config.output)})`);
      await evaluate(client, `(()=>{document.querySelector('[data-panel="media-panel"]').click();document.querySelector('#media-output-extension').value='mp3';document.querySelector('#save-tool-preset').click();if(!document.querySelector('#preset-dialog').open)throw new Error('preset dialog did not open');document.querySelector('#preset-name').value=${JSON.stringify(presetName)};document.querySelector('#preset-dialog-form').requestSubmit();return true})()`);
      const payload = { type: "pdf-compress", inputPaths: [path.join(config.fixtures, "a.pdf")], outputDir: path.join(config.output, "retention-marker"), options: {} };
      const created = await evaluate(client, `window.swiftLocalBackend.enqueueJob(${JSON.stringify(payload)})`);
      let done;
      for (let i = 0; i < 600; i++) {
        done = (await evaluate(client, `window.swiftLocalBackend.getJobs()`)).find(j => j.id === created.id);
        if (["done", "failed", "cancelled"].includes(done?.status)) break;
        await delay(300);
      }
      assert.equal(done?.status, "done", JSON.stringify(done));
      report.seeded = await read();
      assert.equal(report.seeded.config.defaultOutputDir, config.output);
      assert.ok(JSON.parse(report.seeded.storage["swiftlocal-presets"]).some(p => p.name === presetName));
      report.jobId = done.id;
      report.outputs = done.outputPaths.map(o => ({ path: o.path, bytes: fs.statSync(o.path).size, sha256: hash(o.path) }));
      assert.ok(report.outputs.length);
      assert.equal(fs.readFileSync(report.outputs[0].path).subarray(0, 5).toString(), "%PDF-");
    } else {
      const checkpointFile = path.join(path.dirname(expectedFile), "store-before-reverse-state.json");
      const before = JSON.parse(fs.readFileSync(mode === "verify-reverse" ? checkpointFile : expectedFile, "utf8"));
      assert.equal(report.startup.config.defaultOutputDir, before.seeded.config.defaultOutputDir, "Output preference lost");
      // A checkpoint records legitimate smoke changes (e.g. new PDF recents).
      // It is a new reverse-test baseline, never a replacement update verdict.
      if (mode !== "checkpoint") {
        for (const key of keys) assert.equal(report.startup.storage[key], before.seeded.storage[key], `Renderer state changed/lost: ${key}`);
      }
      assert.ok(report.startup.jobs.some(j => j.id === before.jobId && j.status === "done"), "Seeded product job missing");
      for (const output of before.outputs) assert.equal(hash(output.path), output.sha256, "User output changed/missing");
      assert.equal(path.resolve(profile), path.resolve(before.profile), "Store physical profile moved");
      report.retention = { settings: "PASS", realRendererPreferencesAndPreset: "PASS", jobs: "PASS", userOutputHashes: "PASS" };
      report.outputs = before.outputs;
      report.jobId = before.jobId;
      if (mode === "checkpoint") {
        report.seeded = report.startup;
        report.scope = "read-only checkpoint before reverse coexistence; not update retention verdict";
        report.retention.realRendererPreferencesAndPreset = "PARTIAL";
        assert.ok(!fs.existsSync(checkpointFile), "Reverse checkpoint already exists");
      }
    }
    const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(config.evidence, `store-state-${mode}.png`), Buffer.from(screenshot.data, "base64"));
    void evaluate(client, `window.close(); true`).catch(() => {});
    for (let i = 0; i < 120; i++) { try { process.kill(pid, 0); } catch { pid = null; break; } await delay(250); }
    assert.equal(pid, null, "State measurement app did not exit normally");
    report.persistedFiles = Object.fromEntries(["tools.json", "jobs-state.json", "session/Preferences"].map(name => {
      const file = path.join(profile, name);
      return [name, fs.existsSync(file) ? { bytes: fs.statSync(file).size, sha256: hash(file) } : { missing: true }];
    }));
    assert.ok(!report.persistedFiles["tools.json"].missing && !report.persistedFiles["jobs-state.json"].missing);
    report.status = "PASS";
    if (mode === "seed") fs.writeFileSync(expectedFile, JSON.stringify(report, null, 2));
    if (mode === "checkpoint") fs.writeFileSync(path.join(path.dirname(expectedFile), "store-before-reverse-state.json"), JSON.stringify(report, null, 2));
  } catch (error) { report.status = "FAIL"; report.error = error.stack; throw error; }
  finally {
    client?.close();
    if (pid) spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    fs.writeFileSync(path.join(config.evidence, `store-state-${mode}.json`), JSON.stringify(report, null, 2));
  }
}
if (require.main === module) main(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
