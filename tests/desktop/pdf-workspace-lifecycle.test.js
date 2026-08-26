"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { describe, test } = require("node:test");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const viewer = require("../../frontend/pdf-core/viewer.js");
const pages = require("../../frontend/pdf-core/pages.js");
const annotations = require("../../frontend/pdf-core/annotations.js");
const save = require("../../frontend/pdf-core/save.js");
const canonicalPath = require("../../frontend/shared/canonical-path.js");
const { createPdfWorkspaceCloseGuard } = require("../../desktop/pdf-workspace-close-guard.js");

const root = path.resolve(__dirname, "..", "..");
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("PDF workspace lifecycle regressions", () => {
  test("page rebuild preserves remapped stamps and rotations through save", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 0; i < 3; i += 1) {
      const page = doc.addPage([300, 400]);
      page.drawText(`page ${i + 1}`, { x: 20, y: 350, size: 14, font });
    }
    const bytes = new Uint8Array(await doc.save());
    const session = await viewer.openFromBytes(bytes, { name: "state.pdf" });

    try {
      const signature = annotations.addSignatureStamp(session, {
        page: 1,
        x: 20,
        y: 20,
        width: 80,
        height: 30,
        dataUrl: png
      });
      const date = annotations.addDateStamp(session, {
        page: 3,
        x: 30,
        y: 30,
        text: "2026-08-26"
      });
      viewer.rotatePage(session, 2, 90);
      session.currentPage = 2;

      const reordered = await pages.reorderPages(session, [3, 1, 2]);
      await viewer.replaceSessionBytes(session, reordered.bytes, {
        name: session.name,
        preserveState: snapshotState(session)
      });

      assert.equal(session.annotations.length, 2);
      assert.equal(session.annotations.find((item) => item.id === signature.id).page, 2);
      assert.equal(session.annotations.find((item) => item.id === date.id).page, 1);
      assert.equal(viewer.getPageRotation(session, 3), 90);
      assert.equal(session.currentPage, 3);
      assert.equal(save.isDirty(session), true);

      const reorderedExport = await save.exportBytes(session);
      const reorderedDoc = await PDFDocument.load(reorderedExport);
      assert.equal(reorderedDoc.getPageCount(), 3);

      const deleted = await pages.deletePages(session, [2]);
      await viewer.replaceSessionBytes(session, deleted.bytes, {
        name: session.name,
        preserveState: snapshotState(session)
      });

      assert.equal(session.pageCount, 2);
      assert.equal(session.annotations.length, 1);
      assert.equal(session.annotations[0].id, date.id);
      assert.equal(session.annotations[0].page, 1);
      assert.equal(viewer.getPageRotation(session, 2), 90);
      const finalExport = await save.exportBytes(session);
      const finalDoc = await PDFDocument.load(finalExport);
      assert.equal(finalDoc.getPageCount(), 2);
      assert.equal(finalDoc.getPage(1).getRotation().angle, 90);
    } finally {
      await viewer.closeSession(session);
    }
  });

  test("closing a session clears document-specific state before another PDF opens", async () => {
    const firstBytes = await makePdfBytes("first");
    const secondBytes = await makePdfBytes("second");
    const first = await viewer.openFromBytes(firstBytes, { name: "first.pdf" });
    annotations.addDateStamp(first, { page: 1, text: "unsaved" });
    viewer.rotatePage(first, 1, 90);
    const originalSessionBytes = first.bytes.slice();
    await assert.rejects(() => viewer.replaceSessionBytes(first, new Uint8Array([1, 2, 3]), {
      name: "broken.pdf"
    }));
    assert.deepEqual(Array.from(first.bytes), Array.from(originalSessionBytes));
    assert.ok(first._pdf);
    assert.equal(first.annotations.length, 1);
    await viewer.closeSession(first);

    assert.equal(first.bytes, null);
    assert.equal(first.pageCount, 0);
    assert.deepEqual(first.annotations, []);
    assert.deepEqual(Object.keys(first.pageRotations), []);
    assert.equal(first.annotationDirty, false);

    const second = await viewer.openFromBytes(secondBytes, { name: "second.pdf" });
    try {
      assert.deepEqual(second.annotations || [], []);
      assert.deepEqual(Object.keys(second.pageRotations), []);
      assert.equal(second.name, "second.pdf");
    } finally {
      await viewer.closeSession(second);
    }
  });

  test("clean workspace close proceeds without a prompt", async () => {
    let closeCount = 0;
    let promptCount = 0;
    const window = { isDestroyed: () => false };
    const guard = createPdfWorkspaceCloseGuard({
      getWindow: () => window,
      requestDirtyState: async () => ({ dirty: false, tabs: [] }),
      confirmClose: () => {
        promptCount += 1;
        return true;
      },
      closeWindow: () => {
        closeCount += 1;
      }
    });
    const event = makePreventableEvent();

    assert.equal(guard.handleWindowClose(event), false);
    await settle();
    assert.equal(event.prevented, 1);
    assert.equal(promptCount, 0);
    assert.equal(closeCount, 1);
  });

  test("dirty active and inactive tabs prompt once and cancel or confirm close", async () => {
    let answer = false;
    let promptCount = 0;
    let closeCount = 0;
    const window = { isDestroyed: () => false };
    const state = {
      dirty: true,
      tabs: [
        { title: "active.pdf", active: true },
        { title: "inactive.pdf", active: false }
      ]
    };
    const guard = createPdfWorkspaceCloseGuard({
      getWindow: () => window,
      requestDirtyState: async () => state,
      confirmClose: (received) => {
        promptCount += 1;
        assert.deepEqual(received.tabs.map((tab) => tab.title), ["active.pdf", "inactive.pdf"]);
        return answer;
      },
      closeWindow: () => {
        closeCount += 1;
      }
    });

    const cancelled = makePreventableEvent();
    assert.equal(guard.handleWindowClose(cancelled), false);
    await settle();
    assert.equal(cancelled.prevented, 1);
    assert.equal(promptCount, 1);
    assert.equal(closeCount, 0);

    answer = true;
    const confirmed = makePreventableEvent();
    assert.equal(guard.handleWindowClose(confirmed), false);
    await settle();
    assert.equal(promptCount, 2);
    assert.equal(closeCount, 1);
  });

  test("app quit uses the same dirty guard and confirmed quit bypasses recursion", async () => {
    let quitCount = 0;
    let promptCount = 0;
    const window = { isDestroyed: () => false };
    const guard = createPdfWorkspaceCloseGuard({
      getWindow: () => window,
      requestDirtyState: async () => ({ dirty: true, tabs: [{ title: "dirty.pdf" }] }),
      confirmClose: () => {
        promptCount += 1;
        return true;
      },
      quitApp: () => {
        quitCount += 1;
      }
    });
    const event = makePreventableEvent();

    assert.equal(guard.handleBeforeQuit(event), false);
    await settle();
    assert.equal(event.prevented, 1);
    assert.equal(promptCount, 1);
    assert.equal(quitCount, 1);

    const retry = makePreventableEvent();
    assert.equal(guard.handleBeforeQuit(retry), true);
    assert.equal(retry.prevented, 0);
  });

  test("Electron wiring keeps the close guard ahead of backend/media shutdown", () => {
    const mainSource = fs.readFileSync(path.join(root, "desktop", "main.js"), "utf8");
    const preloadSource = fs.readFileSync(path.join(root, "desktop", "preload.js"), "utf8");
    const appSource = fs.readFileSync(path.join(root, "frontend", "pdf-workspace", "app.js"), "utf8");
    assert.match(mainSource, /window\.on\("close"/);
    assert.match(mainSource, /pdfWorkspaceCloseGuard\.handleBeforeQuit/);
    assert.match(preloadSource, /onPdfWorkspaceCloseCheck/);
    assert.match(appSource, /getDirtyState/);
    assert.ok(
      mainSource.indexOf("pdfWorkspaceCloseGuard.handleBeforeQuit") <
      mainSource.indexOf("backend.dispose()")
    );
    assert.match(mainSource, /mediaDownload\.dispose\(\)/);
  });

  test("shared canonical keys preserve UNC identity and POSIX backslashes", () => {
    const unc = String.raw`\\server\share\a.pdf`;
    const mixed = String.raw`//SERVER/share/A.PDF`;
    const rootRelative = String.raw`\server\share\a.pdf`;
    assert.equal(canonicalPath.canonicalPathKey(unc, { platform: "win32" }), String.raw`\\server\share\a.pdf`);
    assert.equal(
      canonicalPath.canonicalPathKey(unc, { platform: "win32" }),
      canonicalPath.canonicalPathKey(mixed, { platform: "win32" })
    );
    assert.notEqual(
      canonicalPath.canonicalPathKey(unc, { platform: "win32" }),
      canonicalPath.canonicalPathKey(rootRelative, { platform: "win32" })
    );
    const posixBackslash = String.raw`a\b.pdf`;
    assert.equal(canonicalPath.canonicalPathKey(posixBackslash, { platform: "linux" }), posixBackslash);
    assert.notEqual(
      canonicalPath.canonicalPathKey(posixBackslash, { platform: "linux" }),
      canonicalPath.canonicalPathKey("a/b.pdf", { platform: "linux" })
    );
  });

  test("preload suppresses duplicate pending delivery but permits a fresh delivery after consumption", () => {
    const harness = loadPreloadHarness("win32");
    const unc = String.raw`\\server\share\a.pdf`;
    harness.emit("pdf-workspace:open-path", { path: unc });
    harness.emit("pdf-workspace:open-path", { path: String.raw`//SERVER/share/A.PDF` });

    const first = [];
    const unsubscribe = harness.api.onPdfWorkspaceOpenPath((request) => first.push(request));
    assert.equal(first.length, 1);
    assert.equal(first[0].path, unc);
    unsubscribe();

    harness.emit("pdf-workspace:open-path", { path: String.raw`//SERVER/share/A.PDF`, asNewTab: true });
    const second = [];
    harness.api.onPdfWorkspaceOpenPath((request) => second.push(request));
    assert.equal(second.length, 1);
    assert.equal(second[0].asNewTab, true);
  });
});

function snapshotState(session) {
  return {
    currentPage: session.currentPage,
    zoom: session.zoom,
    fitMode: session.fitMode,
    annotations: session.annotations.map((annotation) => Object.assign({}, annotation)),
    annotationDirty: session.annotationDirty,
    formFields: (session.formFields || []).map((field) => Object.assign({}, field)),
    formValues: session.formValues,
    formDirty: session.formDirty,
    pageRotations: Object.assign({}, session.pageRotations),
    dirty: session.dirty
  };
}

async function makePdfBytes(label) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 400]);
  page.drawText(label, { x: 20, y: 350 });
  return new Uint8Array(await doc.save());
}

function makePreventableEvent() {
  return {
    prevented: 0,
    preventDefault() {
      this.prevented += 1;
    }
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

function loadPreloadHarness(platform) {
  const source = fs.readFileSync(path.join(root, "desktop", "preload.js"), "utf8");
  const listeners = new Map();
  const exposed = {};
  const ipcRenderer = {
    on(channel, handler) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(handler);
    },
    removeListener(channel, handler) {
      if (listeners.has(channel)) listeners.get(channel).delete(handler);
    },
    invoke: async () => undefined,
    send() {}
  };
  const contextBridge = {
    exposeInMainWorld(name, api) {
      exposed[name] = api;
    }
  };
  const electron = { contextBridge, ipcRenderer, webUtils: { getPathForFile: () => "" } };
  vm.runInNewContext(source, {
    console,
    process: { platform },
    require(name) {
      if (name === "electron") return electron;
      if (name.endsWith("frontend/shared/canonical-path.js")) return canonicalPath;
      throw new Error(`unexpected preload dependency: ${name}`);
    }
  }, { filename: path.join(root, "desktop", "preload.js") });

  return {
    api: exposed.swiftLocalBackend,
    emit(channel, ...args) {
      for (const handler of listeners.get(channel) || []) handler({}, ...args);
    }
  };
}
