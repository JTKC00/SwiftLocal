"use strict";

const assert = require("node:assert/strict");
const { afterEach, describe, test } = require("node:test");
const { chooseFileDialogProperties } = require("../../desktop/dialog-options");
const { choosePdfFiles, pickViaInput } = require("../../frontend/shared/file-dialogs");

const previousWindow = global.window;
const previousDocument = global.document;

afterEach(() => {
  if (previousWindow === undefined) delete global.window;
  else global.window = previousWindow;
  if (previousDocument === undefined) delete global.document;
  else global.document = previousDocument;
});

describe("shared file dialogs", () => {
  test("passes multiple through the Electron bridge and enforces single results", async () => {
    let receivedOptions = null;
    global.window = {
      swiftLocalBackend: {
        chooseFiles: async (options) => {
          receivedOptions = options;
          return ["C:\\測試 使用者\\one.pdf", "C:\\測試 使用者\\two.pdf"];
        }
      }
    };

    const result = await choosePdfFiles({ multiple: false, title: "選擇 PDF" });

    assert.equal(receivedOptions.multiple, false);
    assert.deepEqual(result.paths, ["C:\\測試 使用者\\one.pdf"]);
  });

  test("uses multiSelections only for multi-file Electron requests", () => {
    assert.deepEqual(chooseFileDialogProperties({ multiple: false }), ["openFile"]);
    assert.deepEqual(chooseFileDialogProperties({ multiple: true }), ["openFile", "multiSelections"]);
    assert.deepEqual(chooseFileDialogProperties({}), ["openFile", "multiSelections"]);
  });

  test("resolves successful browser selection and removes the input once", async () => {
    const dom = installFakeDom();
    const file = { name: "繁體中文 document.pdf" };
    const promise = pickViaInput({ accept: "application/pdf", multiple: false });

    assert.equal(dom.input.multiple, false);
    dom.input.files = [file];
    dom.input.dispatch("change");

    const result = await promise;
    assert.deepEqual(result.files, [file]);
    assert.deepEqual(result.paths, []);
    assert.equal(dom.input.removeCount, 1);

    dom.input.dispatch("cancel");
    dom.windowTarget.dispatch("focus");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(dom.input.removeCount, 1);
  });

  test("resolves native browser cancellation to an empty selection", async () => {
    const dom = installFakeDom();
    const promise = pickViaInput({ accept: "application/pdf", multiple: true });

    dom.input.dispatch("cancel");

    const result = await promise;
    assert.deepEqual(result, { files: [], paths: [] });
    assert.equal(dom.input.removeCount, 1);

    dom.windowTarget.dispatch("focus");
    dom.input.dispatch("change");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(dom.input.removeCount, 1);
  });

  test("uses window focus as the legacy browser cancellation fallback", async () => {
    const dom = installFakeDom();
    const promise = pickViaInput({ accept: "application/pdf", multiple: false });

    dom.windowTarget.dispatch("focus");

    const result = await promise;
    assert.deepEqual(result, { files: [], paths: [] });
    assert.equal(dom.input.removeCount, 1);
  });
});

function installFakeDom() {
  const windowTarget = new FakeEventTarget();
  const body = {
    appendChild(node) {
      node.parentNode = body;
      this.child = node;
    },
    removeChild(node) {
      if (this.child === node) this.child = null;
      node.parentNode = null;
    }
  };
  const input = new FakeInput();
  global.window = windowTarget;
  global.document = {
    body,
    createElement() {
      return input;
    }
  };
  return { input, windowTarget };
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((item) => item !== listener));
  }

  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }
}

class FakeInput extends FakeEventTarget {
  constructor() {
    super();
    this.files = [];
    this.parentNode = null;
    this.removeCount = 0;
    this.style = {};
  }

  click() {}

  remove() {
    this.removeCount += 1;
    if (this.parentNode && typeof this.parentNode.removeChild === "function") {
      this.parentNode.removeChild(this);
    }
  }
}
