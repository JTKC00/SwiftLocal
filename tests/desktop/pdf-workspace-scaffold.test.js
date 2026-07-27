"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test } = require("node:test");
const {
  isTrustedRendererUrl,
  buildTrustedRendererUrls
} = require("../../desktop/security");
const {
  isPdfPath,
  getOpenFilesFromArgv,
  getAssociationStatus
} = require("../../desktop/file-associations");
const { pdfWorkspaceDocumentUrl } = require("../../desktop/pdf-window");

const root = path.resolve(__dirname, "..", "..");
const frontendDir = path.join(root, "frontend");

describe("PDF workspace scaffold", () => {
  test("module directories and entry files exist", () => {
    const required = [
      "frontend/shared/settings.js",
      "frontend/shared/error-handling.js",
      "frontend/shared/recent-files.js",
      "frontend/shared/file-dialogs.js",
      "frontend/shared/index.js",
      "frontend/pdf-core/viewer.js",
      "frontend/pdf-core/forms.js",
      "frontend/pdf-core/annotations.js",
      "frontend/pdf-core/save.js",
      "frontend/pdf-core/print.js",
      "frontend/pdf-core/compatibility.js",
      "frontend/pdf-core/index.js",
      "frontend/pdf-workspace/index.html",
      "frontend/pdf-workspace/shell.js",
      "frontend/pdf-workspace/app.js",
      "frontend/pdf-workspace/styles.css",
      "desktop/pdf-window.js",
      "desktop/file-associations.js"
    ];
    for (const rel of required) {
      assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
    }
  });

  test("main toolbox links pdf-reader-panel and modules", () => {
    const html = fs.readFileSync(path.join(frontendDir, "index.html"), "utf8");
    assert.match(html, /id="pdf-reader-panel"/);
    assert.match(html, /data-panel="pdf-reader-panel"/);
    assert.match(html, /pdf-workspace\/shell\.js/);
    assert.match(html, /pdf-core\/index\.js/);
    assert.match(html, /shared\/index\.js/);
    // Existing page editor keeps its own id (not the reader).
    assert.match(html, /id="pdf-workspace"/);
  });

  test("shared and pdf-core load in node", () => {
    const shared = require("../../frontend/shared/index.js");
    assert.equal(typeof shared.readSetting, "function");
    assert.equal(typeof shared.loadRecentFiles, "function");
    assert.equal(typeof shared.formatUserError, "function");

    const core = require("../../frontend/pdf-core/index.js");
    assert.match(String(core.version || ""), /forms|scaffold|0\./);
    assert.equal(typeof core.viewer.openFromBytes, "function");
    assert.equal(core.forms.isSupported(), true);
    assert.equal(core.save.POLICY.preferSaveAs, true);

    const encrypted = core.compatibility.bytesLookEncrypted(
      Buffer.from("%PDF-1.4\n/Encrypt 1 0 R\n")
    );
    assert.equal(encrypted, true);
  });

  test("viewer openFromBytes keeps a memory copy of a real PDF", async () => {
    const core = require("../../frontend/pdf-core/index.js");
    const { PDFDocument, StandardFonts } = require("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 300]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("hi", { x: 20, y: 200, size: 12, font });
    const bytes = new Uint8Array(await doc.save());
    const first = bytes[0];
    const session = await core.viewer.openFromBytes(bytes, { name: "a.pdf" });
    assert.equal(session.name, "a.pdf");
    assert.ok(session.pageCount >= 1);
    assert.equal(session.meta.engine, "pdf.js");
    bytes[0] = 0;
    assert.equal(session.bytes[0], first);
    await core.viewer.closeSession(session);
    assert.equal(session.bytes, null);
  });

  test("shell export exposes mountPdfWorkspace", () => {
    const shell = require("../../frontend/pdf-workspace/shell.js");
    assert.ok(
      shell.PHASE === "pages-tabs" ||
      shell.PHASE === "reader-core" ||
      shell.PHASE === "scaffold"
    );
    assert.equal(typeof shell.mountPdfWorkspace, "function");
  });

  test("security allows toolbox and pdf-workspace documents only", () => {
    const trusted = buildTrustedRendererUrls(frontendDir);
    assert.equal(trusted.length, 2);
    assert.equal(isTrustedRendererUrl(trusted[0], trusted), true);
    assert.equal(isTrustedRendererUrl(trusted[1], trusted), true);
    assert.equal(
      isTrustedRendererUrl(pathToSibling("other.html"), trusted),
      false
    );
    assert.equal(isTrustedRendererUrl("https://example.com/", trusted), false);
  });

  test("pdf-window helper points at workspace html", () => {
    const url = pdfWorkspaceDocumentUrl(frontendDir);
    assert.match(url, /pdf-workspace\/index\.html$/i);
  });

  test("file-associations argv parsing", () => {
    const {
      isPdfPath: isPdf,
      getOpenFilesFromArgv: fromArgv,
      getAssociationStatus: statusOf,
      normalizeArgPath
    } = require("../../desktop/file-associations");
    assert.equal(isPdf("C:\\docs\\a.PDF"), true);
    assert.equal(isPdf("notes.txt"), false);
    assert.equal(normalizeArgPath("\"C:\\\\docs\\\\quoted.pdf\"").toLowerCase().endsWith("quoted.pdf"), true);
    const files = fromArgv([
      "electron.exe",
      ".",
      "--enable-logging",
      "C:\\Users\\demo\\file.pdf",
      "readme.md",
      "\"D:\\\\More\\\\second.pdf\""
    ]);
    assert.equal(files.length, 2);
    assert.match(files[0], /file\.pdf$/i);
    assert.match(files[1], /second\.pdf$/i);
    const status = statusOf({ isPackaged: true });
    assert.equal(status.supported, process.platform === "win32" || process.platform === "darwin" ? true : status.supported);
    assert.equal(typeof status.message, "string");
    assert.match(status.progId, /SwiftLocal/i);
  });

  test("electron-builder registers pdf file association", () => {
    const config = require("../../electron-builder.config.js");
    assert.ok(Array.isArray(config.fileAssociations));
    const pdf = config.fileAssociations.find((item) => item.ext === "pdf");
    assert.ok(pdf);
    assert.match(String(pdf.mimeType || ""), /pdf/i);
    assert.match(String(pdf.role || ""), /Viewer/i);
  });
});

function pathToSibling(name) {
  const { pathToFileURL } = require("node:url");
  return pathToFileURL(path.join(frontendDir, name)).href;
}
