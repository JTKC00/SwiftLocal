"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { configureBuildCommand, createYargs } = require("electron-builder/out/builder");

for (const [file, targets] of [
  ["build-win-full.js", ["installer"]],
  ["build-win-full.js", ["portable", "installer"]],
  ["build-win-full.js", ["dir"]],
  ["pack-win.js", ["--win", "nsis"]]
]) {
  test(`${file} ${targets.join(" ")}: real builder parser accepts targets and disables publishing`, () => {
    const filename = path.resolve(__dirname, "../../scripts", file);
    const realRequire = createRequire(filename);
    let captured;
    const requireStub = id => id === "node:child_process"
      ? { spawnSync: () => ({ status: 0 }), spawn: (_exe, args) => { captured = args; return { on() {} }; } }
      : id === "./prepare-win-artifacts" ? { clearNsisArchive() {} } : realRequire(id);
    requireStub.resolve = realRequire.resolve;
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
      require: requireStub, __dirname: path.dirname(filename),
      process: { argv: ["node", filename, ...targets], execPath: process.execPath, env: {}, exit(code) { throw new Error(`exit ${code}`); } },
      console: { log() {}, error() {} }
    }, { filename });
    const parsed = configureBuildCommand(createYargs()).exitProcess(false).strict().parse(captured.slice(1));
    assert.equal(parsed.publish, "never");
    if (targets.includes("installer") || targets.includes("nsis")) assert.ok(parsed.win.includes("nsis"));
    if (targets.includes("portable")) assert.ok(parsed.win.includes("portable"));
    if (targets.includes("dir")) assert.equal(parsed.dir, true);
  });
}
