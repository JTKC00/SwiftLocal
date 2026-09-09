"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mountPdfWorkspace } = require("../../frontend/pdf-workspace/shell.js");

async function withWorkspaceHarness(run) {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const launchPaths = require("../../frontend/pdf-workspace/launch-paths.js");
  const state = {
    files: new Map(),
    reads: [],
    opened: [],
    openAttempts: [],
    closed: [],
    confirmCalls: 0,
    confirmResult: true,
    promptValues: [],
    openBehavior: null,
    passwordMode: "password_required"
  };
  const canonicalKey = (filePath) => launchPaths.canonicalPathKey(filePath, { platform: "win32" });
  const shared = {
    loadRecentFiles: () => [],
    rememberRecentFile: () => {},
    formatUserError: (_error, fallback) => fallback
  };
  const viewer = {
    async openFromBytes(bytes, options) {
      const copy = new Uint8Array(bytes);
      state.openAttempts.push({ bytes: Array.from(copy), options });
      const failure = typeof state.openBehavior === "function"
        ? state.openBehavior(copy, options)
        : null;
      if (failure) throw failure;
      const session = {
        _pdf: {},
        bytes: copy,
        currentPage: 1,
        dirty: false,
        meta: {},
        name: options.name,
        pageCount: 1,
        search: null,
        sourcePath: options.sourcePath,
        zoom: 1
      };
      state.opened.push({ bytes: Array.from(copy), options, session });
      return session;
    },
    async closeSession(session) {
      state.closed.push(session);
    },
    createEmptySession: () => ({ }),
    async applyFit() {},
    async renderPageToCanvas() {
      return { width: 100, height: 100 };
    },
    async renderThumbnail() {},
    getSelectedText: () => "",
    copySelectedText: async () => ({ ok: false, text: "" })
  };
  const core = {
    pages: {},
    annotations: {},
    save: {
      isDirty: (session) => Boolean(session && session.dirty)
    },
    viewer
  };
  const host = createFakeElement();
  const elements = new Map(["tabs", "layout", "save", "save-as", "page-dup", "page-blank", "page-delete", "page-insert-file", "page-insert", "sig-add", "sig-file", "status", "close"].map((name) => [`[data-pdf-ws-${name}]`, createFakeElement()]));
  host.querySelector = (selector) => elements.get(selector) || null;
  const tabBar = elements.get("[data-pdf-ws-tabs]");
  tabBar.querySelectorAll = (selector) => {
    const attribute = selector.slice(1, -1);
    const matches = [...tabBar.innerHTML.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))];
    return matches.map((match) => {
      const button = createFakeElement();
      button.getAttribute = (name) => name === attribute ? match[1] : null;
      // Keep the current rendered handlers available for regression interactions.
      state.tabButtons = state.tabButtons || {};
      state.tabButtons[`${attribute}:${match[1]}`] = button;
      return button;
    });
  };
  global.document = {
    createElement: () => createFakeElement()
  };
  global.window = {
    SwiftLocalPdfCore: core,
    SwiftLocalPdfWorkspaceLaunch: { canonicalPathKey: canonicalKey },
    SwiftLocalShared: shared,
    confirm: () => {
      state.confirmCalls += 1;
      return state.confirmResult;
    },
    prompt: () => state.promptValues.length ? state.promptValues.shift() : null,
    swiftLocalBackend: {
      async readLocalFile(filePath) {
        state.reads.push(filePath);
        const bytes = state.files.get(filePath);
        if (!bytes) throw new Error(`missing test file: ${filePath}`);
        return {
          data: new Uint8Array(bytes),
          name: filePath.split(/[/\\]/).pop(),
          path: filePath
        };
      }
    }
  };

  try {
    const api = mountPdfWorkspace(host, { standalone: true });
    return await run({ api, state, core, host, elements });
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
}

function createFakeElement() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    emit(type, event = {}) {
      for (const callback of listeners.get(type) || []) callback(event);
    },
    appendChild() {},
    classList: {
      add() {},
      remove() {},
      toggle() {}
    },
    click() {},
    clientHeight: 600,
    clientWidth: 800,
    closest: () => null,
    focus() {},
    getAttribute: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
    scrollIntoView() {},
    setAttribute() {},
    style: {},
    textContent: "",
    value: ""
  };
}

function deferredOperation() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function settleWorkspace() {
  await new Promise((resolve) => setImmediate(resolve));
}

for (const operation of ["save", "page-dup", "page-blank", "page-delete", "page-insert-file"]) {
  test(`pending ${operation} preserves both documents during tab/close/re-entry and queued open`, async () => {
    await withWorkspaceHarness(async ({ api, state, core, host, elements }) => {
      const gate = deferredOperation();
      const a = "C:/A.pdf";
      const b = "C:/B.pdf";
      const c = "C:/C.pdf";
      [a, b, c].forEach((file, i) => state.files.set(file, new Uint8Array([i + 1])));
      await api.openPath(b);
      const other = api.getSession();
      other.dirty = true;
      await api.openPath(a, { asNewTab: true });
      const original = api.getSession();
      original.dirty = true;
      const calls = [];
      core.viewer.replaceSessionBytes = async (target, bytes, options) => {
        calls.push(target);
        target.bytes = bytes;
        target.sourcePath = options.sourcePath;
        target.dirty = false;
      };
      let starts = 0;
      const run = async (target) => {
        starts += 1;
        assert.equal(target, original);
        await gate.promise;
        return { ok: true, bytes: new Uint8Array([9]), path: a, insertedAt: 2, insertedCount: 1, deleted: [1] };
      };
      core.save.saveInPlace = run;
      // pages is captured when mounting, so provide its methods through the harness object.
      Object.assign(core.pages, { duplicatePage: run, insertBlankPage: run, deletePages: run, insertPdfBytes: run });
      const control = elements.get(`[data-pdf-ws-${operation}]`);
      if (operation === "page-insert-file") {
        control.files = [{ arrayBuffer: async () => new Uint8Array([7]).buffer }];
        control.emit("change");
      } else control.emit("click");
      await settleWorkspace();
      assert.equal(starts, 1);
      assert.equal(elements.get("[data-pdf-ws-layout]").inert, true);
      const otherTab = api.getDirtyState().tabs.find((tab) => tab.title === "B.pdf");
      state.tabButtons[`data-tab-activate:${otherTab.id}`].emit("click");
      state.tabButtons[`data-tab-close:${otherTab.id}`].emit("click", { stopPropagation() {} });
      host.emit("keydown", { ctrlKey: true, key: "s", preventDefault() {} });
      assert.equal(api.getSession(), original);
      assert.equal(state.closed.length, 0);
      assert.equal(starts, 1);
      const opening = api.openPath(c, { asNewTab: true });
      await settleWorkspace();
      assert.equal(state.reads.includes(c), false);
      gate.resolve();
      await opening;
      assert.deepEqual(calls, [original]);
      assert.deepEqual(Array.from(original.bytes), [9]);
      assert.deepEqual(Array.from(other.bytes), [2]);
      assert.equal(other.sourcePath, b);
      assert.equal(other.dirty, true);
      assert.equal(api.getSession().sourcePath, c);
      assert.equal(elements.get("[data-pdf-ws-layout]").inert, false);
    });
  });
}

test("destroy waits for pending save and prevents queued opens from resurrecting the workspace", async () => {
  await withWorkspaceHarness(async ({ api, state, core, elements }) => {
    state.files.set("A.pdf", new Uint8Array([1]));
    state.files.set("B.pdf", new Uint8Array([2]));
    await api.openPath("A.pdf");
    const original = api.getSession();
    const gate = deferredOperation();
    core.save.saveInPlace = async () => { await gate.promise; return { ok: true, bytes: new Uint8Array([9]), path: "A.pdf" }; };
    core.viewer.replaceSessionBytes = async (target, bytes) => { assert.equal(target, original); target.bytes = bytes; };
    elements.get("[data-pdf-ws-save]").emit("click");
    const opening = api.openPath("B.pdf");
    api.destroy();
    assert.equal(state.closed.length, 0);
    gate.resolve();
    await opening;
    await settleWorkspace();
    assert.deepEqual(state.closed, [original]);
    assert.deepEqual(state.reads, ["A.pdf"]);
    assert.equal(api.getSession().bytes, undefined);
  });
});

test("WebP signature import is rejected before reading or saving unsupported image bytes", async () => {
  await withWorkspaceHarness(async ({ core, elements }) => {
    let saved = false;
    core.annotations.saveSignature = () => { saved = true; };
    const input = elements.get("[data-pdf-ws-sig-file]");
    input.files = [{ type: "image/webp", name: "signature.webp", size: 100 }];
    input.emit("change");
    await settleWorkspace();
    assert.equal(saved, false);
    assert.match(elements.get("[data-pdf-ws-status]").textContent, /PNG.*JPEG/);
  });
});

test("concurrent queued opens run in order without replacing an unrelated tab", async () => {
  await withWorkspaceHarness(async ({ api, state, core }) => {
    state.files.set("A.pdf", new Uint8Array([1]));
    state.files.set("B.pdf", new Uint8Array([2]));
    const gate = deferredOperation();
    const originalOpen = core.viewer.openFromBytes;
    core.viewer.openFromBytes = async (bytes, options) => {
      if (options.name === "A.pdf") await gate.promise;
      return originalOpen(bytes, options);
    };
    const first = api.openPath("A.pdf", { asNewTab: true });
    const second = api.openPath("B.pdf", { asNewTab: true });
    await settleWorkspace();
    assert.deepEqual(state.reads, ["A.pdf"]);
    gate.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(state.reads, ["A.pdf", "B.pdf"]);
    assert.equal(state.closed.length, 0);
    assert.equal(api.getSession().sourcePath, "B.pdf");
    assert.deepEqual(state.opened.map((item) => Array.from(item.session.bytes)), [[1], [2]]);
  });
});
