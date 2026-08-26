"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test } = require("node:test");

const {
  getOpenFilesFromArgv,
  getInitialLaunchRoute
} = require("../../desktop/file-associations");
const { createPathRequestGate } = require("../../frontend/pdf-workspace/launch-paths.js");
const { mountPdfWorkspace } = require("../../frontend/pdf-workspace/shell.js");

const root = path.resolve(__dirname, "..", "..");

describe("PDF Open With launch routing", () => {
  test("packaged Windows argv routes quoted paths with spaces to the PDF workspace", () => {
    const argv = [
      "C:\\Program Files\\SwiftLocal\\SwiftLocal.exe",
      "--original-process-start-time=123",
      "\"C:\\Users\\Demo User\\Documents\\a.pdf\"",
      "c:/users/demo user/documents/A.PDF"
    ];
    const route = getInitialLaunchRoute(argv, {
      cwd: "C:\\Program Files\\SwiftLocal",
      platform: "win32"
    });

    assert.equal(route.kind, "pdf-workspace");
    assert.equal(route.files.length, 1);
    assert.match(route.files[0], /Users\\Demo User\\Documents\\a\.pdf$/i);
  });

  test("no-PDF launch keeps the toolbox as the initial route", () => {
    const route = getInitialLaunchRoute([
      "C:\\Program Files\\SwiftLocal\\SwiftLocal.exe",
      "--no-sandbox"
    ], { platform: "win32" });
    assert.equal(route.kind, "toolbox");
    assert.deepEqual(route.files, []);
  });

  test("duplicate IPC and query delivery opens one canonical path", async () => {
    const gate = createPathRequestGate({ platform: "win32" });
    const opened = [];
    const open = async (filePath) => {
      await Promise.resolve();
      opened.push(filePath);
    };

    await Promise.all([
      gate.request("\"C:\\Users\\Demo User\\Documents\\a.pdf\"", open),
      gate.request("c:/Users/Demo User/Documents/A.PDF", open)
    ]);

    assert.equal(opened.length, 1);
    assert.equal(gate.canonicalPathKey(opened[0]), "c:\\users\\demo user\\documents\\a.pdf");
  });

  test("launch gate accepts the same canonical path after the first open completes", async () => {
    const gate = createPathRequestGate({ platform: "win32" });
    const opened = [];
    const open = async (filePath) => {
      opened.push(filePath);
    };

    await gate.request("C:\\Users\\Demo User\\Documents\\a.pdf", open);
    await gate.request("c:/users/demo user/documents/A.PDF", open);

    assert.equal(opened.length, 2);
  });

  test("reopening an already-open path reads fresh bytes from disk", async () => {
    await withWorkspaceHarness(async ({ api, state }) => {
      const filePath = "C:\\Users\\Demo User\\Documents\\a.pdf";
      state.files.set(filePath, new Uint8Array([1]));

      await api.openPath(filePath);
      const firstSession = api.getSession();
      state.files.set(filePath, new Uint8Array([2]));

      await api.openPath(filePath);

      assert.equal(state.reads.length, 2);
      assert.deepEqual(state.opened.map((item) => item.bytes), [[1], [2]]);
      assert.notEqual(api.getSession(), firstSession);
      assert.deepEqual(Array.from(api.getSession().bytes), [2]);
    });
  });

  test("reopening a dirty path confirms before replacing unsaved content", async () => {
    await withWorkspaceHarness(async ({ api, state }) => {
      const filePath = "C:\\Users\\Demo User\\Documents\\a.pdf";
      state.files.set(filePath, new Uint8Array([7]));

      await api.openPath(filePath);
      const dirtySession = api.getSession();
      dirtySession.dirty = true;
      state.confirmResult = false;

      await api.openPath(filePath);

      assert.equal(state.confirmCalls, 1);
      assert.equal(state.reads.length, 1);
      assert.equal(api.getSession(), dirtySession);
      assert.deepEqual(Array.from(api.getSession().bytes), [7]);
    });
  });

  test("same path still honors an explicit new-tab open", async () => {
    await withWorkspaceHarness(async ({ api, state }) => {
      const filePath = "C:\\Users\\Demo User\\Documents\\a.pdf";
      state.files.set(filePath, new Uint8Array([3]));

      await api.openPath(filePath);
      const firstSession = api.getSession();
      await api.openPath(filePath, { asNewTab: true });

      assert.equal(state.reads.length, 2);
      assert.equal(state.closed.length, 0);
      assert.notEqual(api.getSession(), firstSession);
      assert.deepEqual(Array.from(api.getSession().bytes), [3]);
    });
  });

  test("launch routing is wired through preload buffering and renderer gating", () => {
    const preload = fs.readFileSync(path.join(root, "desktop", "preload.js"), "utf8");
    const pdfWindow = fs.readFileSync(path.join(root, "desktop", "pdf-window.js"), "utf8");
    const app = fs.readFileSync(path.join(root, "frontend", "pdf-workspace", "app.js"), "utf8");
    assert.match(preload, /pendingOpenPaths/);
    assert.match(pdfWindow, /filePaths/);
    assert.match(app, /createPathRequestGate/);
    assert.match(app, /URLSearchParams/);
  });
});

async function withWorkspaceHarness(run) {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const launchPaths = require("../../frontend/pdf-workspace/launch-paths.js");
  const state = {
    files: new Map(),
    reads: [],
    opened: [],
    closed: [],
    confirmCalls: 0,
    confirmResult: true
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
      state.opened.push({ bytes: Array.from(copy), options });
      return {
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
    save: {
      isDirty: (session) => Boolean(session && session.dirty)
    },
    viewer
  };
  const host = createFakeElement();
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
    return await run({ api, state });
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
}

function createFakeElement() {
  return {
    addEventListener() {},
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
