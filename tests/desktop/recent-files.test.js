"use strict";

const assert = require("node:assert/strict");
const { afterEach, describe, test } = require("node:test");
const {
  loadRecentFiles,
  rememberRecentFile,
  recentFilePathKey
} = require("../../frontend/shared/recent-files");

const previousStorage = global.localStorage;

afterEach(() => {
  if (previousStorage === undefined) delete global.localStorage;
  else global.localStorage = previousStorage;
});

describe("recent PDF path identity", () => {
  test("deduplicates Windows paths with case and slash differences", () => {
    installStorage();
    const windows = { platform: "win32" };

    rememberRecentFile({
      name: "報告.pdf",
      path: "C:\\Users\\測試 使用者\\Documents\\報告.pdf"
    }, 12, windows);
    const result = rememberRecentFile({
      name: "報告.pdf",
      path: "c:/users/測試 使用者/documents/報告.PDF"
    }, 12, windows);

    assert.equal(recentFilePathKey("C:\\Users\\測試 使用者\\Documents\\報告.pdf", windows),
      "c:\\users\\測試 使用者\\documents\\報告.pdf");
    assert.equal(result.length, 1);
    assert.equal(result[0].path, "c:/users/測試 使用者/documents/報告.PDF");
  });

  test("keeps genuinely different Windows files separate", () => {
    installStorage();
    const windows = { platform: "win32" };

    rememberRecentFile({ name: "a.pdf", path: "C:\\Docs\\a.pdf" }, 12, windows);
    const result = rememberRecentFile({ name: "a.pdf", path: "C:/Other\\a.pdf" }, 12, windows);

    assert.equal(result.length, 2);
  });

  test("keeps case-sensitive path differences on non-Windows platforms", () => {
    installStorage();
    const mac = { platform: "darwin" };

    rememberRecentFile({ name: "Report.pdf", path: "/Users/demo/Report.pdf" }, 12, mac);
    const result = rememberRecentFile({ name: "report.pdf", path: "/Users/demo/report.pdf" }, 12, mac);

    assert.equal(result.length, 2);
    assert.notEqual(
      recentFilePathKey("/Users/demo/Report.pdf", mac),
      recentFilePathKey("/Users/demo/report.pdf", mac)
    );
  });

  test("filters equivalent legacy entries while loading recent files", () => {
    installStorage([
      { name: "new.pdf", path: "C:\\Docs\\New.pdf", openedAt: "2" },
      { name: "old spelling", path: "c:/docs/new.PDF", openedAt: "1" },
      { name: "other.pdf", path: "C:\\Docs\\Other.pdf", openedAt: "0" }
    ]);

    const result = loadRecentFiles(12, { platform: "win32" });
    assert.deepEqual(result.map((item) => item.path), ["C:\\Docs\\New.pdf", "C:\\Docs\\Other.pdf"]);
  });
});

function installStorage(initial = []) {
  let value = JSON.stringify(initial);
  global.localStorage = {
    getItem() {
      return value;
    },
    setItem(_key, next) {
      value = String(next);
    },
    removeItem() {
      value = null;
    }
  };
}
