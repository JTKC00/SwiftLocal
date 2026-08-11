"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, test } = require("node:test");
const { isSemver } = require("../../scripts/check-ci-meta");

const root = path.resolve(__dirname, "..", "..");

describe("CI metadata", () => {
  test("package.json version is semver", () => {
    const version = require(path.join(root, "package.json")).version;
    assert.equal(isSemver(version), true);
  });

  test("backend requirements are fully pinned", () => {
    const lines = fs
      .readFileSync(path.join(root, "backend", "requirements.txt"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    assert.ok(lines.length >= 6);
    for (const line of lines) {
      assert.match(line, /^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?==[A-Za-z0-9_.+-]+$/);
    }
  });

  test("electron-builder artifact names embed package version token", () => {
    const config = require(path.join(root, "electron-builder.config.js"));
    assert.equal(config.portable.artifactName, "SwiftLocal-${version}-portable-${arch}.${ext}");
    assert.equal(config.nsis.artifactName, "SwiftLocal-${version}-installer-${arch}.${ext}");
    assert.equal(config.mac.artifactName, "SwiftLocal-${version}-mac-${arch}.${ext}");
    assert.equal(config.extraResources, undefined);
    const windowsFilters = config.win.extraResources[0].filter;
    const macFilters = config.mac.extraResources[0].filter;
    for (const pattern of ["!**/*.dylib", "!LibreOffice.app/**/*", "!yt-dlp/bin/yt-dlp", "!deno/bin/deno"]) {
      assert.ok(windowsFilters.includes(pattern), `Windows tools filter missing ${pattern}`);
    }
    for (const pattern of ["!**/*.exe", "!**/*.dll", "!libreoffice/**/*"]) {
      assert.ok(macFilters.includes(pattern), `macOS tools filter missing ${pattern}`);
    }
  });
});
