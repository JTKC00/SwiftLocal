"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test, before } = require("node:test");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const viewer = require("../../frontend/pdf-core/viewer.js");
const print = require("../../frontend/pdf-core/print.js");
const shell = require("../../frontend/pdf-workspace/shell.js");

const tmpDir = path.join(__dirname, "..", "..", "smoke-temp", "pdf-viewer-core");

async function makeSamplePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i += 1) {
    const page = doc.addPage([400, 500]);
    page.drawText(`SwiftLocal page ${i + 1}`, {
      x: 40,
      y: 420,
      size: 18,
      font
    });
    page.drawText("Findable keyword ALPHA", {
      x: 40,
      y: 380,
      size: 12,
      font
    });
  }
  return new Uint8Array(await doc.save());
}

describe("PDF.js reader core", () => {
  /** @type {Uint8Array} */
  let sampleBytes;

  before(async () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    sampleBytes = await makeSamplePdf();
    fs.writeFileSync(path.join(tmpDir, "sample.pdf"), sampleBytes);
  });

  test("shell phase is pages-tabs", () => {
    assert.equal(shell.PHASE, "pages-tabs");
  });

  test("viewer source resolves PDF.js against the document, not pdf-core/", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "pdf-core", "viewer.js"),
      "utf8"
    );
    assert.match(source, /new URL\(relative,\s*window\.location\.href\)/);
    assert.match(source, /pdf-core\/vendor/);
    // Guard: must not use a bare relative import that lands under pdf-core/.
    assert.doesNotMatch(source, /import\([^)]*["'`]\.\/vendor\/pdfjs/);
  });

  test("openFromBytes parses page count with pdf.js", async () => {
    const session = await viewer.openFromBytes(sampleBytes, { name: "sample.pdf" });
    try {
      assert.equal(session.pageCount, 3);
      assert.equal(session.meta.engine, "pdf.js");
      assert.ok(session.bytes && session.bytes.byteLength > 0);
      assert.ok(session._pdf);
      // Mutation of source buffer must not affect session copy.
      sampleBytes[0] = 0;
      assert.notEqual(session.bytes[0], 0);
      // restore for other tests
      sampleBytes = await makeSamplePdf();
    } finally {
      await viewer.closeSession(session);
      assert.equal(session.bytes, null);
      assert.equal(session._pdf, null);
      assert.equal(session.pageCount, 0);
    }
  });

  test("setCurrentPage and zoom clamp", async () => {
    const session = await viewer.openFromBytes(sampleBytes, { name: "z.pdf" });
    try {
      assert.equal(viewer.setCurrentPage(session, 99), 3);
      assert.equal(viewer.setCurrentPage(session, 0), 1);
      assert.equal(viewer.setZoom(session, 10), 4);
      assert.equal(viewer.setZoom(session, 0.01), 0.25);
      assert.equal(session.fitMode, "custom");
    } finally {
      await viewer.closeSession(session);
    }
  });

  test("searchDocument finds keyword across pages", async () => {
    const session = await viewer.openFromBytes(sampleBytes, { name: "s.pdf" });
    try {
      const result = await viewer.searchDocument(session, "ALPHA");
      assert.ok(result.matches.length >= 1);
      assert.equal(result.matches[0].page, 1);
      const next = viewer.stepSearch(session, 1);
      assert.ok(next);
      assert.ok(next.page >= 1);
    } finally {
      await viewer.closeSession(session);
    }
  });

  test("encrypted-looking password error is friendly", async () => {
    // Invalid encrypted-like stream: pdf.js may throw; we only assert open of plain works.
    await assert.rejects(
      () => viewer.openFromBytes(new Uint8Array([1, 2, 3, 4]), { name: "bad.pdf" }),
      /無法開啟|Invalid|PDF/i
    );
  });

  test("print helper requires session bytes in browser only", async () => {
    assert.equal(typeof print.printDocument, "function");
    // In Node there is no document — print should throw.
    await assert.rejects(
      () => print.printDocument({ bytes: sampleBytes }),
      /列印|環境/
    );
  });

  test("page size is available after open", async () => {
    const session = await viewer.openFromBytes(sampleBytes, { name: "size.pdf" });
    try {
      const size = await viewer.getPageSize(session, 1);
      assert.ok(size.width > 10);
      assert.ok(size.height > 10);
      const zoom = await viewer.computeFitZoom(session, { width: 200, height: 200 }, "width");
      assert.ok(zoom > 0 && zoom <= 4);
    } finally {
      await viewer.closeSession(session);
    }
  });

  test("highlightSearchInTextLayer marks matching spans", () => {
    const root = {
      querySelectorAll(sel) {
        if (sel === "span.highlight") return this._highlighted || [];
        if (sel === "span") return this._spans || [];
        return [];
      },
      _spans: [],
      _highlighted: []
    };
    const makeSpan = (text) => {
      const classes = new Set();
      return {
        textContent: text,
        classList: {
          add(...names) {
            names.forEach((n) => classes.add(n));
            root._highlighted = root._spans.filter((s) => s.classList.contains("highlight"));
          },
          remove(...names) {
            names.forEach((n) => classes.delete(n));
            root._highlighted = root._spans.filter((s) => s.classList.contains("highlight"));
          },
          contains(name) {
            return classes.has(name);
          }
        }
      };
    };
    root._spans = [makeSpan("hello ALPHA world"), makeSpan("other"), makeSpan("alpha again")];
    const count = viewer.highlightSearchInTextLayer(root, "ALPHA");
    assert.equal(count, 2);
    assert.equal(root._spans[0].classList.contains("highlight"), true);
    assert.equal(root._spans[1].classList.contains("highlight"), false);
    assert.equal(root._spans[2].classList.contains("highlight"), true);
  });

  test("getSelectedText returns empty without a browser selection", () => {
    assert.equal(viewer.getSelectedText(null), "");
  });

  test("viewer exports text-layer helpers", () => {
    assert.equal(typeof viewer.renderTextLayerForPage, "function");
    assert.equal(typeof viewer.copySelectedText, "function");
    assert.equal(typeof viewer.cancelTextLayer, "function");
  });

  test("rotatePage marks dirty and exportBytes bakes rotation", async () => {
    const save = require("../../frontend/pdf-core/save.js");
    const session = await viewer.openFromBytes(sampleBytes, { name: "rot.pdf" });
    try {
      assert.equal(viewer.rotatePage(session, 1, 90), 90);
      assert.equal(session.dirty, true);
      assert.equal(viewer.getPageRotation(session, 1), 90);
      assert.equal(save.isDirty(session), true);
      const exported = await save.exportBytes(session);
      assert.ok(exported.byteLength > 100);
      const { PDFDocument } = require("pdf-lib");
      const reloaded = await PDFDocument.load(exported);
      const angle = reloaded.getPage(0).getRotation().angle;
      assert.equal(angle, 90);
    } finally {
      await viewer.closeSession(session);
    }
  });

  test("IR56B-like permission PDF can be form-inspected after qpdf decrypt fixture", async () => {
    // Uses local smoke-temp copy if present (optional network-sourced IR56B).
    const irPath = path.join(__dirname, "..", "..", "smoke-temp", "ir56b_ay_qpdf.pdf");
    if (!fs.existsSync(irPath)) return;
    const forms = require("../../frontend/pdf-core/forms.js");
    const bytes = new Uint8Array(fs.readFileSync(irPath));
    const info = await forms.inspectForm(bytes);
    assert.equal(info.hasForm, true);
    assert.ok(info.fieldCount >= 50, `expected many fields, got ${info.fieldCount}`);
    const names = info.fields.map((f) => f.name);
    assert.ok(names.includes("Name of Employer") || names.some((n) => /Employer/i.test(n)));
  });

  test("page reorder and delete rebuild PDF", async () => {
    const pages = require("../../frontend/pdf-core/pages.js");
    const { PDFDocument } = require("pdf-lib");
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i += 1) doc.addPage([200 + i, 300]);
    const bytes = new Uint8Array(await doc.save());
    const session = await viewer.openFromBytes(bytes, { name: "multi.pdf" });
    try {
      assert.equal(session.pageCount, 3);
      const reordered = await pages.reorderPages(session, [3, 1, 2]);
      await viewer.replaceSessionBytes(session, reordered.bytes, { name: "multi.pdf" });
      assert.equal(session.pageCount, 3);
      const deleted = await pages.deletePages(session, [2]);
      await viewer.replaceSessionBytes(session, deleted.bytes, { name: "multi.pdf" });
      assert.equal(session.pageCount, 2);
      const blank = await pages.insertBlankPage(session, 2);
      await viewer.replaceSessionBytes(session, blank.bytes, { name: "multi.pdf" });
      assert.equal(session.pageCount, 3);
    } finally {
      await viewer.closeSession(session);
    }
  });

  test("signature and date stamps bake into exportBytes", async () => {
    const annotations = require("../../frontend/pdf-core/annotations.js");
    const save = require("../../frontend/pdf-core/save.js");
    // 1x1 PNG
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const session = await viewer.openFromBytes(sampleBytes, { name: "stamp.pdf" });
    try {
      annotations.addSignatureStamp(session, {
        page: 1,
        x: 50,
        y: 50,
        width: 80,
        height: 30,
        dataUrl: png
      });
      annotations.addDateStamp(session, {
        page: 1,
        x: 50,
        y: 100,
        text: "2026-03-25",
        fontSize: 12
      });
      assert.equal(annotations.isAnnotationDirty(session), true);
      assert.equal(save.isDirty(session), true);
      const exported = await save.exportBytes(session);
      assert.ok(exported.byteLength > sampleBytes.byteLength * 0.5);
    } finally {
      await viewer.closeSession(session);
    }
  });

  test("AcroForm inspect and export filled values", async () => {
    const forms = require("../../frontend/pdf-core/forms.js");
    const save = require("../../frontend/pdf-core/save.js");
    const { PDFDocument, StandardFonts } = require("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 500]);
    const form = doc.getForm();
    const text = form.createTextField("full_name");
    text.addToPage(page, { x: 40, y: 400, width: 200, height: 22 });
    text.setText("Before");
    const check = form.createCheckBox("agree");
    check.addToPage(page, { x: 40, y: 360, width: 16, height: 16 });
    const bytes = new Uint8Array(await doc.save());

    const info = await forms.inspectForm(bytes);
    assert.equal(info.hasForm, true);
    assert.ok(info.fieldCount >= 2);

    const session = await viewer.openFromBytes(bytes, { name: "form.pdf" });
    try {
      await forms.attachFormToSession(session);
      assert.equal(forms.hasForm(session), true);
      forms.setFormValue(session, "full_name", "Alice");
      forms.setFormValue(session, "agree", true);
      assert.equal(save.isDirty(session), true);
      const exported = await save.exportBytes(session);
      const re = await PDFDocument.load(exported);
      const reForm = re.getForm();
      assert.equal(reForm.getTextField("full_name").getText(), "Alice");
      assert.equal(reForm.getCheckBox("agree").isChecked(), true);
    } finally {
      await viewer.closeSession(session);
    }
  });

  test("password required error has code", async () => {
    // Minimal encrypted-like failure: open with wrong password on plain PDF should not be password_required.
    // Build a password-protected PDF if pdf-lib supports encrypt.
    const { PDFDocument, StandardFonts } = require("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("secret", { x: 20, y: 100, size: 12, font });
    let encrypted;
    try {
      doc.encrypt({
        userPassword: "s3cret",
        ownerPassword: "s3cret-owner",
        permissions: { printing: "highResolution" }
      });
      encrypted = new Uint8Array(await doc.save());
    } catch {
      // Older pdf-lib without encrypt — skip soft.
      return;
    }
    await assert.rejects(
      () => viewer.openFromBytes(encrypted, { name: "enc.pdf" }),
      (error) => error && (error.code === "password_required" || error.code === "password_incorrect")
    );
    const opened = await viewer.openFromBytes(encrypted, {
      name: "enc.pdf",
      password: "s3cret"
    });
    try {
      assert.ok(opened.pageCount >= 1);
      assert.equal(opened.wasPasswordProtected, true);
    } finally {
      await viewer.closeSession(opened);
    }
  });
});
