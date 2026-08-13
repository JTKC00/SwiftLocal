"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "frontend", "media-downloader.js"), "utf8");
const main = fs.readFileSync(path.join(root, "desktop", "main.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "desktop", "preload.js"), "utf8");
const builder = fs.readFileSync(path.join(root, "electron-builder.config.js"), "utf8");
const packCheck = fs.readFileSync(path.join(root, "scripts", "check-pack-ready.js"), "utf8");

test("online media downloader exposes the complete V1 desktop flow", () => {
  for (const id of [
    "media-download-url", "media-download-analyze", "media-download-thumbnail",
    "media-download-options", "media-download-output-dir", "media-download-pick-output",
    "media-download-start", "media-download-cancel", "media-download-progress",
    "media-download-open-file", "media-download-open-folder"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /只下載你有權保存的公開內容/);
  assert.match(html, /V1 不支援播放清單、登入、Cookie 或 DRM/);
});

test("renderer can only request typed IPC operations and never spawns a process", () => {
  for (const channel of ["status", "analyze", "start", "cancel", "open-result"]) {
    assert.match(main, new RegExp(`media-download:${channel}`));
  }
  assert.match(preload, /onMediaDownloadProgress/);
  assert.doesNotMatch(renderer, /child_process|\bspawn\s*\(|\bexec(?:File)?\s*\(/);
  assert.match(renderer, /\^data:image\\\/\(\?:jpeg\|png\|webp\|gif\);base64,/);
  assert.match(renderer, /elements\.thumbnail\.src = metadata\.thumbnailDataUrl/);
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  const imageSources = csp.split(";").find((directive) => directive.trim().startsWith("img-src")).trim().split(/\s+/);
  assert.ok(imageSources.includes("data:"));
  assert.ok(imageSources.includes("blob:"));
});

test("main process safely owns thumbnail networking and waits for all active work during quit", () => {
  const service = fs.readFileSync(path.join(root, "desktop", "media-download.js"), "utf8");
  assert.match(service, /if \(thumbnailUrl\) \{/);
  assert.doesNotMatch(service, /thumbnailUrl\s*&&\s*this\.fetchImpl/);
  assert.match(service, /lookup:\s*\(_hostname, lookupOptions, callback\)/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /shutdownFinished = true/);
  assert.match(main, /backend\.dispose\(\)/);
  assert.match(main, /mediaDownload\.dispose\(\)/);
  assert.match(main, /Promise\.allSettled\(shutdownTasks\)\.finally\(\(\) => \{/);
  assert.match(service, /finishedPromise/);
});

test("packaging copies and verifies pinned downloader resources", () => {
  assert.match(builder, /from:\s*"tools"/);
  assert.match(packCheck, /verifyInstalled\("ytDlp"/);
  assert.match(packCheck, /verifyInstalled\("deno"/);
  const lock = JSON.parse(fs.readFileSync(path.join(root, "tools", "media-download-tools.lock.json"), "utf8"));
  assert.match(lock.ytDlp.version, /^\d{4}\.\d{2}\.\d{2}$/);
  assert.match(lock.ytDlp.targets["win32-x64"].sha256, /^[a-f0-9]{64}$/);
  assert.match(lock.deno.targets["win32-x64"].sha256, /^[a-f0-9]{64}$/);
});
