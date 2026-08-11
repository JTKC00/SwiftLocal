"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test } = require("node:test");
const {
  assertTrustedIpcSender,
  isAllowedExternalUrl,
  isTrustedRendererUrl
} = require("../../desktop/security");

describe("Electron renderer security", () => {
  const trusted = "file:///C:/SwiftLocal/frontend/index.html";

  test("allows the app document including query and fragment", () => {
    assert.equal(isTrustedRendererUrl(`${trusted}?mode=desktop#pdf`, trusted), true);
  });

  test("treats equivalent encoded packaged file paths as the same document", () => {
    const chromiumUrl = "file:///C:/~/SwiftLocal/resources/app.asar/frontend/index.html";
    const nodeUrl = "file:///C:/%7E/SwiftLocal/resources/app.asar/frontend/index.html";
    assert.equal(isTrustedRendererUrl(chromiumUrl, nodeUrl), true);
  });

  test("rejects external and sibling local documents", () => {
    assert.equal(isTrustedRendererUrl("https://example.com/", trusted), false);
    assert.equal(isTrustedRendererUrl("file:///C:/SwiftLocal/frontend/other.html", trusted), false);
  });

  test("accepts an allow-list of trusted renderer documents", () => {
    const { buildTrustedRendererUrls } = require("../../desktop/security");
    const frontendDir = path.resolve(__dirname, "..", "..", "frontend");
    const list = buildTrustedRendererUrls(frontendDir);
    assert.equal(list.length, 2);
    assert.equal(isTrustedRendererUrl(list[0], list), true);
    assert.equal(isTrustedRendererUrl(list[1], list), true);
    assert.equal(isTrustedRendererUrl("file:///C:/SwiftLocal/frontend/other.html", list), false);
  });

  test("opens only HTTP(S) links externally", () => {
    assert.equal(isAllowedExternalUrl("https://example.com"), true);
    assert.equal(isAllowedExternalUrl("http://example.com"), true);
    assert.equal(isAllowedExternalUrl("file:///C:/secret.txt"), false);
    assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
  });

  test("rejects IPC from an untrusted sender frame", () => {
    assert.doesNotThrow(() => assertTrustedIpcSender({ senderFrame: { url: trusted } }, trusted));
    assert.throws(
      () => assertTrustedIpcSender({ senderFrame: { url: "https://example.com" } }, trusted),
      /untrusted renderer/
    );
  });

  test("keeps sandbox and a strict CSP enabled", () => {
    const root = path.resolve(__dirname, "..", "..");
    const mainSource = fs.readFileSync(path.join(root, "desktop", "main.js"), "utf8");
    const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
    const appSource = fs.readFileSync(path.join(root, "frontend", "app.js"), "utf8");
    const css = fs.readFileSync(path.join(root, "frontend", "styles.css"), "utf8");
    assert.match(mainSource, /sandbox:\s*true/);
    assert.match(html, /Content-Security-Policy/);
    assert.doesNotMatch(html, /unsafe-inline/);
    assert.doesNotMatch(html, /\sstyle=/i);
    assert.doesNotMatch(appSource, /style=["'`]transform:/i);
    for (const rotation of [0, 90, 180, 270]) {
      assert.match(css, new RegExp(`\\.pdf-rotation-${rotation}\\s*\\{[^}]*rotate\\(${rotation}deg\\)`));
    }
  });

  test("home secondary action has visible text on its white background", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "..", "..", "frontend", "styles.css"), "utf8");
    assert.match(css, /\.home-hero \.ghost-button\s*\{[^}]*background:\s*#fff;[^}]*color:\s*#17483d;/s);
  });

  test("PDF workspace exposes visual OCR actions and a same-workspace result panel", () => {
    const root = path.resolve(__dirname, "..", "..");
    const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
    const appSource = fs.readFileSync(path.join(root, "frontend", "app.js"), "utf8");
    const preload = fs.readFileSync(path.join(root, "desktop", "preload.js"), "utf8");
    const main = fs.readFileSync(path.join(root, "desktop", "main.js"), "utf8");
    assert.match(html, /id="pdf-workspace-ocr-page"[^>]*>目前頁面</);
    assert.match(html, /id="pdf-workspace-ocr-document"[^>]*>整份 PDF</);
    assert.match(html, /id="pdf-workspace-ocr-text"[^>]*readonly/);
    assert.match(html, /繁體中文 \+ English/);
    assert.match(appSource, /payload\.append\("language", "chi_tra\+eng"\)/);
    assert.match(appSource, /payload\.append\("pages", String\(selection\.page\.pageIndex \+ 1\)\)/);
    assert.match(preload, /readJobTextOutputs/);
    assert.match(main, /backend:read-job-text-outputs/);
  });

  test("image workspace is visual-first and keeps static export available", () => {
    const root = path.resolve(__dirname, "..", "..");
    const html = fs.readFileSync(path.join(root, "frontend", "index.html"), "utf8");
    const appSource = fs.readFileSync(path.join(root, "frontend", "app.js"), "utf8");
    assert.match(html, /id="image-preview-canvas"/);
    assert.match(html, /id="image-workspace-thumbnails"/);
    assert.match(html, /id="image-apply-crop"[^>]*>套用裁切</);
    assert.match(html, /id="image-ocr-current"[^>]*>目前圖片</);
    assert.match(html, /id="image-ocr-all"[^>]*>全部圖片</);
    assert.match(html, /id="image-ocr-region"[^>]*>辨識框選</);
    assert.match(html, /id="image-ocr-text"[^>]*readonly/);
    assert.match(html, /id="image-export-cancel"/);
    assert.doesNotMatch(html, /id="img-backend-form"/);
    assert.match(appSource, /payload\.append\("imageOps", JSON\.stringify/);
    assert.match(appSource, /靜態模式可編輯及匯出 JPEG／PNG／WebP/);
    assert.match(appSource, /item\.crop = \{ \.\.\.selection \}/);
  });

  test("CI covers all primary desktop platforms", () => {
    const ci = fs.readFileSync(path.resolve(__dirname, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
    assert.match(ci, /ubuntu-latest/);
    assert.match(ci, /windows-latest/);
    assert.match(ci, /macos-latest/);
  });

  test("CI runs typecheck and release metadata checks", () => {
    const ci = fs.readFileSync(path.resolve(__dirname, "..", "..", ".github", "workflows", "ci.yml"), "utf8");
    assert.match(ci, /npm run typecheck/);
    assert.match(ci, /npm run check:ci/);
  });
});
