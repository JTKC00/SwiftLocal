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
  assert.match(html, /id="ocr-hub-readiness"[^>]*role="status"/);
  assert.match(html, /id="office-hub-readiness"[^>]*role="status"/);
  assert.match(app, /function updateProductHubReadiness\(/);
  assert.match(app, /Tesseract 與 chi_tra\+eng 語言包均可使用/);
  assert.match(app, /只有 PDF → Word 相容模式可用/);
});

test("batch routes open multi-file forms without new job types", () => {
  assert.match(html, /class="product-route-actions"[\s\S]*data-image-job="ocr-image"[\s\S]*data-pdf-mode="ocr-pdf"/);
  assert.match(html, /批量 Office 轉換[\s\S]*data-pdf-mode="office-to-pdf"/);
  assert.match(app, /input\.multiple = showWorkspace \|\| mode === "merge" \|\| usesBackgroundTask/);
  assert.doesNotMatch(app, /batch-ocr|batch-office/);
});

test("PDF sections keep technical Office options in advanced settings", () => {
  const pdfSectionLabels = ["閱讀與填表", "頁面整理", "轉換與 OCR", "保護與壓縮"];
  for (const label of pdfSectionLabels) assert.ok(html.includes(label), `missing PDF section: ${label}`);
  assert.match(html, /<details class="pdf-office-advanced" id="pdf-office-advanced" hidden>/);
  assert.match(html, /進階：相容引擎與掃描件 OCR/);
  assert.match(app, /function updatePdfSectionNavigation\(/);
});

test("homepage positioning and quick actions prioritize the five core areas", () => {
  assert.match(html, /本機優先的辦公文件與媒體處理工作台/);
  for (const label of ["開啟／填寫 PDF", "掃描文件 OCR", "Office 轉 PDF", "壓縮圖片", "壓縮影片或轉音訊"]) {
    assert.ok(html.includes(label), `missing quick action: ${label}`);
  }
  const quickStart = html.slice(html.indexOf('<div class="quick-actions"'), html.indexOf('</section>', html.indexOf('<div class="quick-actions"')));
  assert.doesNotMatch(quickStart, /zip-panel|ZIP/);
});

test("preset filters follow the product taxonomy without breaking legacy categories", () => {
  for (const category of ["pdf", "ocr", "office", "image", "media", "automation", "other", "custom"]) {
    assert.match(html, new RegExp(`data-preset-filter="${category}"`));
  }
  assert.doesNotMatch(html, /data-preset-filter="text"/);
  assert.match(app, /function presetDisplayCategory\(preset\)/);
  assert.match(app, /state\.presetFilter === "custom" \? Boolean\(preset\.custom\)/);
  assert.match(app, /"workflow-panel": "automation"/);
  assert.match(app, /"media-panel": "media"/);
});

test("search and mobile navigation expose all five core workspaces", () => {
  assert.match(html, /id="quick-actions"[^>]*aria-live="polite"/);
  assert.match(app, /terms\.every\(\(term\) => haystack\.includes\(term\)\)/);
  assert.match(app, /SEARCH_HIDDEN_PANEL_IDS = new Set\(\["home-panel", "pdf-panel", "pdf-reader-panel"\]\)/);
  assert.match(app, /function toolAreaLabel\(panelId\)/);
  const mobileStart = html.indexOf('<nav class="mobile-primary-nav"');
  const mobileNav = html.slice(mobileStart, html.indexOf("</nav>", mobileStart));
  for (const panelId of ["pdf-hub-panel", "ocr-panel", "office-panel", "image-panel", "media-panel"]) {
    assert.match(mobileNav, new RegExp(`data-mobile-panel="${panelId}"`));
  }
});
