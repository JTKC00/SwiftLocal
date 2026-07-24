"use strict";

const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const projectRoot = path.resolve(__dirname, "..");

function expectedWindowsArtifactNames(version, arch = "x64", full = false) {
  const edition = full ? "-full" : "";
  return [
    `SwiftLocal-${version}${edition}-portable-${arch}.exe`,
    `SwiftLocal-${version}${edition}-installer-${arch}.exe`
  ];
}

function requireReleaseFile(filePath, minimumBytes = 1024 * 1024) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`缺少發行產物：${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size < minimumBytes) {
    throw new Error(`發行產物大小異常：${filePath} (${stat.size} bytes)`);
  }
  return stat;
}

function verifyPackagedApplication(outputDir, version) {
  const unpackedDir = path.join(outputDir, "win-unpacked");
  requireReleaseFile(path.join(unpackedDir, "快轉通 SwiftLocal.exe"));

  const archivePath = path.join(unpackedDir, "resources", "app.asar");
  requireReleaseFile(archivePath);
  const packagedManifest = JSON.parse(asar.extractFile(archivePath, "package.json").toString("utf8"));
  if (packagedManifest.version !== version) {
    throw new Error(`封裝版本不符：預期 ${version}，實際 ${packagedManifest.version || "未知"}`);
  }

  const toolsDir = path.join(unpackedDir, "resources", "tools");
  if (!fs.existsSync(toolsDir) || fs.readdirSync(toolsDir).length === 0) {
    throw new Error(`封裝程式缺少 tools 資源：${toolsDir}`);
  }
  return { archivePath, toolsDir };
}

function verifyWindowsRelease(options = {}) {
  const version = options.version || require(path.join(projectRoot, "package.json")).version;
  const full = Boolean(options.full);
  const outputDir = path.resolve(projectRoot, options.outputDir || (full ? "dist-full" : "dist"));
  const artifacts = expectedWindowsArtifactNames(version, options.arch || "x64", full).map((name) => {
    const filePath = path.join(outputDir, name);
    const stat = requireReleaseFile(filePath);
    return { filePath, size: stat.size };
  });
  const packaged = verifyPackagedApplication(outputDir, version);
  return { version, outputDir, artifacts, packaged };
}

function parseArgs(args) {
  const output = { full: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--full") output.full = true;
    else if (arg === "--dir" && args[index + 1]) output.outputDir = args[++index];
    else if (arg === "--arch" && args[index + 1]) output.arch = args[++index];
    else throw new Error(`不支援的參數：${arg}`);
  }
  return output;
}

if (require.main === module) {
  try {
    const result = verifyWindowsRelease(parseArgs(process.argv.slice(2)));
    console.log(`OK SwiftLocal ${result.version} Windows 發行產物`);
    for (const artifact of result.artifacts) {
      console.log(`OK ${path.basename(artifact.filePath)} (${Math.round(artifact.size / 1024 / 1024)} MB)`);
    }
    console.log("OK app.asar 版本與 tools 資源");
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  expectedWindowsArtifactNames,
  parseArgs,
  requireReleaseFile,
  verifyPackagedApplication,
  verifyWindowsRelease
};
