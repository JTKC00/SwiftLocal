"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "frontend", "app.js"), "utf8");

test("sidebar presents five core workspaces and collapses secondary tools", () => {
  const coreStart = html.indexOf('<div class="nav-group core-nav-group">');
  const automationStart = html.indexOf('<span class="nav-group-label">自動化</span>');
  const coreNavigation = html.slice(coreStart, automationStart);

  assert.ok(coreStart >= 0 && automationStart > coreStart);
  for (const panelId of ["pdf-hub-panel", "ocr-panel", "office-panel", "image-panel", "media-panel"]) {
    assert.match(coreNavigation, new RegExp(`data-panel="${panelId}"`));
  }
  assert.doesNotMatch(coreNavigation, /data-panel="(?:zip|text|data|split|tools)-panel"/);
  assert.match(html, /<details class="nav-group secondary-tools-group">/);
  assert.doesNotMatch(html, /<details class="nav-group secondary-tools-group" open>/);
});

test("OCR and Office product routes reuse existing job modes", () => {
  for (const mode of ["ocr-pdf", "pdf-to-searchable-pdf", "pdf-to-office", "office-to-pdf"]) {
    assert.match(html, new RegExp(`data-pdf-mode="${mode}"`));
    assert.match(app, new RegExp(`"${mode}"`));
  }
  assert.match(html, /id="pdf-ocr-language"[^>]*value="chi_tra\+eng"/);
  assert.match(html, /data-image-job="ocr-image"/);
  assert.match(html, /data-workflow-template="office-archive"/);
});

test("homepage positioning and quick actions prioritize the five core areas", () => {
  assert.match(html, /本機優先的辦公文件與媒體處理工作台/);
  for (const label of ["開啟／填寫 PDF", "掃描文件 OCR", "Office 轉 PDF", "壓縮圖片", "壓縮影片或轉音訊"]) {
    assert.ok(html.includes(label), `missing quick action: ${label}`);
  }
  const quickStart = html.slice(html.indexOf('<div class="quick-actions"'), html.indexOf('</section>', html.indexOf('<div class="quick-actions"')));
  assert.doesNotMatch(quickStart, /zip-panel|ZIP/);
});
