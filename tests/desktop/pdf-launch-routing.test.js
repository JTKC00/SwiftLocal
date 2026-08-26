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
