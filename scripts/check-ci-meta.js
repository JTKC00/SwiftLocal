"use strict";

/**
 * Lightweight CI / release metadata checks that do not require tools/ binaries.
 * Exit 0 when consistent; exit 1 with plain messages on failure.
 *
 *   node scripts/check-ci-meta.js
 *   npm run check:ci
 */

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
let failed = 0;

function ok(msg) {
  console.log(`  ✓  ${msg}`);
}

function bad(msg, hint) {
  failed += 1;
  console.log(`  ✗  ${msg}`);
  if (hint) console.log(`      → ${hint}`);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function isSemver(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}

function checkPackageVersion() {
  const pkg = readJson("package.json");
  const version = String(pkg.version || "").trim();
  if (!version) {
    bad("package.json 缺少 version");
    return "";
  }
  if (!isSemver(version)) {
    bad(`package.json version 不是語意化版本：${version}`, "請使用 x.y.z 或 x.y.z-prerelease");
    return version;
  }
  ok(`package.json version = ${version}`);
  return version;
}

function checkChangelog(version) {
  const changelog = readText("CHANGELOG.md");
  const hasUnreleased = /^##\s+Unreleased\b/m.test(changelog);
  const hasVersionHeading =
    version &&
    new RegExp(`^##\\s+${version.replace(/\./g, "\\.")}(?:\\s|$|—|-)`, "m").test(changelog);
  if (hasUnreleased || hasVersionHeading) {
    ok(
      hasVersionHeading
        ? `CHANGELOG 含版本標題 ${version}`
        : "CHANGELOG 含 Unreleased（開發中可）"
    );
  } else {
    bad(
      "CHANGELOG 未包含 Unreleased 或目前版本標題",
      `請新增 "## Unreleased" 或 "## ${version}"`
    );
  }
}

function checkElectronBuilderArtifactNames() {
  const config = require(path.join(projectRoot, "electron-builder.config.js"));
  const expected = [
    ["win.artifactName", config.win && config.win.artifactName, "SwiftLocal-${version}-${arch}.${ext}"],
    [
      "portable.artifactName",
      config.portable && config.portable.artifactName,
      "SwiftLocal-${version}-portable-${arch}.${ext}"
    ],
    [
      "nsis.artifactName",
      config.nsis && config.nsis.artifactName,
      "SwiftLocal-${version}-installer-${arch}.${ext}"
    ],
    [
      "mac.artifactName",
      config.mac && config.mac.artifactName,
      "SwiftLocal-${version}-mac-${arch}.${ext}"
    ]
  ];

  for (const [label, actual, pattern] of expected) {
    if (!actual || typeof actual !== "string") {
      bad(`${label} 未設定`);
      continue;
    }
    if (!actual.includes("${version}")) {
      bad(`${label} 未含 \${version}：${actual}`);
      continue;
    }
    if (actual !== pattern) {
      bad(`${label} 與預期命名不一致：${actual}`, `預期 ${pattern}`);
      continue;
    }
    ok(`${label} = ${actual}`);
  }
}

function checkRequirementsPinned() {
  const lines = readText("backend/requirements.txt")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (!lines.length) {
    bad("backend/requirements.txt 沒有可安裝的依賴列");
    return;
  }

  for (const line of lines) {
    // Accept name[extra]==version or name==version
    if (!/^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?==[A-Za-z0-9_.+-]+$/.test(line)) {
      bad(`未固定版本的依賴列：${line}`, "請使用 package==x.y.z");
      continue;
    }
    ok(`pin ${line}`);
  }
}

function checkCiWorkflow() {
  const ci = readText(".github/workflows/ci.yml");
  if (!/\bnpm run typecheck\b/.test(ci)) {
    bad("CI 未執行 npm run typecheck", "請在 .github/workflows/ci.yml 加入 typecheck 步驟");
  } else {
    ok("CI 含 npm run typecheck");
  }
  if (!/\bnpm run check:ci\b/.test(ci)) {
    bad("CI 未執行 npm run check:ci", "請在 .github/workflows/ci.yml 加入 check:ci 步驟");
  } else {
    ok("CI 含 npm run check:ci");
  }
  if (!/python-version:\s*["']?3\.12/.test(ci)) {
    bad("CI Python 版本不是 3.12", "請與 backend/requirements 鎖定策略對齊");
  } else {
    ok("CI Python 3.12");
  }
}

function main() {
  console.log("");
  console.log("【CI／發行元資料檢查】");
  console.log("");

  const version = checkPackageVersion();
  checkChangelog(version);
  checkElectronBuilderArtifactNames();
  checkRequirementsPinned();
  checkCiWorkflow();

  console.log("");
  if (failed) {
    console.log(`失敗 ${failed} 項`);
    process.exit(1);
  }
  console.log("全部通過");
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  isSemver,
  checkPackageVersion,
  checkRequirementsPinned
};
