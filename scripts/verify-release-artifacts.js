"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");

const projectRoot = path.resolve(__dirname, "..");
const MAIN_EXE_CANDIDATES = ["SwiftLocal.exe", "快轉通 SwiftLocal.exe"];
const PRODUCT_NAME_TOKEN = "SwiftLocal";
const DISPLAY_PRODUCT_NAME = "快轉通 SwiftLocal";

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

function requireWindowsExecutable(filePath, minimumBytes = 50_000) {
  const stat = requireReleaseFile(filePath, minimumBytes);
  const handle = fs.openSync(filePath, "r");
  const header = Buffer.alloc(2);
  fs.readSync(handle, header, 0, 2, 0);
  fs.closeSync(handle);
  if (header.toString("ascii") !== "MZ") {
    throw new Error(`封裝工具不是有效的 Windows PE 執行檔：${filePath}`);
  }
  return stat;
}

function requireArtifactNotOlderThan(artifactPath, referencePaths, toleranceMs = 2000) {
  const artifactTime = fs.statSync(artifactPath).mtimeMs;
  const references = referencePaths.filter((filePath) => filePath && fs.existsSync(filePath));
  const newestReference = references.reduce((latest, filePath) => Math.max(latest, fs.statSync(filePath).mtimeMs), 0);
  if (newestReference && artifactTime + toleranceMs < newestReference) {
    throw new Error(`發行產物早於 win-unpacked 內容，可能是舊檔：${artifactPath}`);
  }
  return { artifactTime, newestReference };
}

function verifyArtifactPayloadMatches(artifactPath, packaged) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-artifact-verify-"));
  try {
    const payloadRoot = extractReleasePayload(artifactPath, tempDir);
    const expected = {
      appAsar: packaged.archivePath,
      ytDlp: packaged.mediaTools.ytDlp,
      deno: packaged.mediaTools.deno,
      ffmpeg: packaged.mediaTools.ffmpeg
    };
    const suffixes = {
      appAsar: path.join("resources", "app.asar"),
      ytDlp: path.join("resources", "tools", "yt-dlp", "bin", "yt-dlp.exe"),
      deno: path.join("resources", "tools", "deno", "bin", "deno.exe"),
      ffmpeg: path.join("resources", "tools", "ffmpeg", "bin", "ffmpeg.exe")
    };
    const hashes = {};
    for (const [key, expectedPath] of Object.entries(expected)) {
      const extractedPath = findFileBySuffix(payloadRoot, suffixes[key]);
      if (!extractedPath) throw new Error(`發行產物內缺少 ${suffixes[key]}：${artifactPath}`);
      const expectedHash = sha256File(expectedPath);
      const extractedHash = sha256File(extractedPath);
      if (expectedHash !== extractedHash) {
        throw new Error(`發行產物內容與 win-unpacked 不一致（${key}）：${artifactPath}`);
      }
      hashes[key] = extractedHash;
    }
    return hashes;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function extractReleasePayload(artifactPath, tempDir) {
  const sevenZip = require("7zip-bin").path7za;
  const outerDir = path.join(tempDir, "outer");
  fs.mkdirSync(outerDir, { recursive: true });
  extractWith7Zip(sevenZip, artifactPath, outerDir);
  if (findFileBySuffix(outerDir, path.join("resources", "app.asar"))) return outerDir;

  const nestedArchives = findFiles(outerDir).filter((filePath) => /\.(?:7z|zip)$/i.test(filePath)).slice(0, 12);
  for (let index = 0; index < nestedArchives.length; index += 1) {
    const nestedDir = path.join(tempDir, `nested-${index}`);
    fs.mkdirSync(nestedDir, { recursive: true });
    try {
      extractWith7Zip(sevenZip, nestedArchives[index], nestedDir);
    } catch {
      continue;
    }
    if (findFileBySuffix(nestedDir, path.join("resources", "app.asar"))) return nestedDir;
  }
  throw new Error(`無法從發行產物抽出 app.asar 進行內容比對：${artifactPath}`);
}

function extractWith7Zip(sevenZip, archivePath, outputDir) {
  try {
    execFileSync(sevenZip, ["x", "-y", `-o${outputDir}`, archivePath], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    });
  } catch (error) {
    const detail = String(error && (error.stderr || error.message) || error).split(/\r?\n/).slice(-5).join(" ");
    throw new Error(`無法解壓發行產物：${archivePath}（${detail}）`);
  }
}

function findFileBySuffix(root, suffix) {
  const normalizedSuffix = path.normalize(suffix).toLowerCase();
  return findFiles(root).find((filePath) => path.normalize(filePath).toLowerCase().endsWith(normalizedSuffix)) || "";
}

function findFiles(root) {
  const output = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile()) output.push(fullPath);
    }
  }
  return output;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function findMainWindowsExecutable(unpackedDir) {
  for (const name of MAIN_EXE_CANDIDATES) {
    const candidate = path.join(unpackedDir, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Fallback: any .exe in the unpacked root that is not a helper binary.
  if (fs.existsSync(unpackedDir)) {
    const names = fs.readdirSync(unpackedDir).filter((name) => /\.exe$/i.test(name));
    const preferred = names.find((name) => /swiftlocal/i.test(name)) || names[0];
    if (preferred) {
      return path.join(unpackedDir, preferred);
    }
  }
  throw new Error(`缺少主程式 EXE：${unpackedDir}（預期 ${MAIN_EXE_CANDIDATES.join(" 或 ")}）`);
}

function readWindowsVersionInfo(exePath) {
  if (process.platform !== "win32") {
    return null;
  }
  // Literal path injection (escape single quotes for PowerShell). Avoid $args with -Command.
  const escaped = String(exePath).replace(/'/g, "''");
  const script = [
    `$p = '${escaped}'`,
    `if (-not (Test-Path -LiteralPath $p)) { throw \"missing exe: $p\" }`,
    `$v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($p)`,
    `Write-Output ('FileDescription=' + $v.FileDescription)`,
    `Write-Output ('ProductName=' + $v.ProductName)`,
    `Write-Output ('InternalName=' + $v.InternalName)`,
    `Write-Output ('OriginalFilename=' + $v.OriginalFilename)`,
    `Write-Output ('CompanyName=' + $v.CompanyName)`
  ].join("; ");
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true }
  );
  const info = {};
  for (const line of String(output || "").split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    info[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return info;
}

function assertMainExeVersionInfo(exePath) {
  const info = readWindowsVersionInfo(exePath);
  if (!info) {
    return { skipped: true, reason: "non-windows" };
  }
  const fileDescription = String(info.FileDescription || "");
  const productName = String(info.ProductName || "");
  const internalName = String(info.InternalName || "");

  if (/^electron$/i.test(fileDescription) || fileDescription.toLowerCase() === "electron") {
    throw new Error(`主 EXE FileDescription 仍為 Electron：${exePath}`);
  }
  if (!productName || !productName.includes(PRODUCT_NAME_TOKEN)) {
    throw new Error(`主 EXE ProductName 未含 SwiftLocal（實際「${productName || "空"}」）：${exePath}`);
  }
  if (/^electron$/i.test(productName)) {
    throw new Error(`主 EXE ProductName 仍為 Electron：${exePath}`);
  }
  if (/^electron$/i.test(internalName)) {
    throw new Error(`主 EXE InternalName 仍為 Electron：${exePath}`);
  }
  return { skipped: false, info };
}

function readNsisFriendlyAppNameHints(installerPath) {
  if (!installerPath || !fs.existsSync(installerPath)) {
    return [];
  }
  // NSIS installer embeds Unicode strings for registry FriendlyAppName etc.
  const bytes = fs.readFileSync(installerPath);
  const text = Buffer.from(bytes).toString("utf16le");
  const hits = [];
  if (/FriendlyAppName/i.test(text) || /Applications\\/i.test(text)) {
    if (/Electron/i.test(text) && !new RegExp(DISPLAY_PRODUCT_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text)) {
      hits.push("installer_strings_electron_without_product");
    }
  }
  // Stronger check: product display name should appear in installer payload.
  if (!text.includes("SwiftLocal") && !text.includes("快轉通")) {
    hits.push("installer_missing_swiftlocal_string");
  }
  return hits;
}

function verifyPdfAssociationConfig(config) {
  const associations = Array.isArray(config.fileAssociations) ? config.fileAssociations : [];
  const pdf = associations.find((item) => String(item.ext || "").toLowerCase() === "pdf");
  if (!pdf) {
    throw new Error("electron-builder 缺少 PDF fileAssociations");
  }
  const description = String(pdf.description || pdf.name || "");
  if (/^electron$/i.test(description) || description.toLowerCase() === "electron") {
    throw new Error("PDF association FriendlyAppName/description 仍為 Electron");
  }
  if (!description.includes(PRODUCT_NAME_TOKEN) && !description.includes("快轉通")) {
    throw new Error(`PDF association description 未含 SwiftLocal：${description || "空"}`);
  }
  if (String(config.productName || "") && !String(config.productName).includes(PRODUCT_NAME_TOKEN)) {
    throw new Error(`productName 未含 SwiftLocal：${config.productName}`);
  }
  if (/^electron$/i.test(String(config.productName || ""))) {
    throw new Error("productName 仍為 Electron");
  }
  return pdf;
}

function verifyPackagedApplication(outputDir, version) {
  const unpackedDir = path.join(outputDir, "win-unpacked");
  const mainExe = findMainWindowsExecutable(unpackedDir);
  requireReleaseFile(mainExe);

  const versionCheck = assertMainExeVersionInfo(mainExe);

  const archivePath = path.join(unpackedDir, "resources", "app.asar");
  requireReleaseFile(archivePath);
  const packagedManifest = JSON.parse(asar.extractFile(archivePath, "package.json").toString("utf8"));
  if (packagedManifest.version !== version) {
    throw new Error(`封裝版本不符：預期 ${version}，實際 ${packagedManifest.version || "未知"}`);
  }

  // Dual @napi-rs/canvas instances break PDF.js Path rendering in OCR.
  const nestedCanvasMarker = path.posix.join("node_modules", "pdfjs-dist", "node_modules", "@napi-rs", "canvas", "package.json");
  try {
    asar.extractFile(archivePath, nestedCanvasMarker);
    throw new Error(
      "封裝 app.asar 仍含 pdfjs-dist 巢狀 @napi-rs/canvas（會造成 PDF OCR Path 型別不相容）。請確認 package.json overrides 生效後重新 npm install 與打包。"
    );
  } catch (error) {
    if (error && /仍含 pdfjs-dist 巢狀/.test(String(error.message || ""))) {
      throw error;
    }
    // extractFile throws when missing — expected.
  }
  const unpackedNested = path.join(
    unpackedDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "pdfjs-dist",
    "node_modules",
    "@napi-rs",
    "canvas"
  );
  if (fs.existsSync(unpackedNested)) {
    throw new Error(
      "封裝 app.asar.unpacked 仍含 pdfjs-dist 巢狀 @napi-rs/canvas（會造成 PDF OCR Path 型別不相容）。"
    );
  }

  const toolsDir = path.join(unpackedDir, "resources", "tools");
  if (!fs.existsSync(toolsDir) || fs.readdirSync(toolsDir).length === 0) {
    throw new Error(`封裝程式缺少 tools 資源：${toolsDir}`);
  }
  const mediaTools = {
    ytDlp: path.join(toolsDir, "yt-dlp", "bin", "yt-dlp.exe"),
    deno: path.join(toolsDir, "deno", "bin", "deno.exe"),
    ffmpeg: path.join(toolsDir, "ffmpeg", "bin", "ffmpeg.exe")
  };
  requireWindowsExecutable(mediaTools.ytDlp, 1_000_000);
  requireWindowsExecutable(mediaTools.deno, 1_000_000);
  requireWindowsExecutable(mediaTools.ffmpeg, 100_000);
  return { archivePath, toolsDir, mediaTools, mainExe, versionCheck };
}

function verifyWindowsRelease(options = {}) {
  const version = options.version || require(path.join(projectRoot, "package.json")).version;
  const full = Boolean(options.full);
  const outputDir = path.resolve(projectRoot, options.outputDir || (full ? "dist-full" : "dist"));
  const config = require(path.join(projectRoot, "electron-builder.config.js"));
  const pdfAssociation = verifyPdfAssociationConfig(config);

  const requestedKinds = new Set(options.artifactKinds || ["portable", "installer"]);
  const artifactNames = expectedWindowsArtifactNames(version, options.arch || "x64", full)
    .filter((name) => requestedKinds.has(/installer/i.test(name) ? "installer" : "portable"));
  const artifacts = (options.unpackedOnly ? [] : artifactNames).map((name) => {
    const filePath = path.join(outputDir, name);
    const stat = requireReleaseFile(filePath);
    return { filePath, size: stat.size };
  });

  for (const artifact of artifacts) {
    if (/installer/i.test(path.basename(artifact.filePath))) {
      const hints = readNsisFriendlyAppNameHints(artifact.filePath);
      if (hints.includes("installer_missing_swiftlocal_string")) {
        throw new Error(`安裝檔未內嵌 SwiftLocal 字串（FriendlyAppName 可能錯誤）：${artifact.filePath}`);
      }
    }
  }

  const packaged = verifyPackagedApplication(outputDir, version);
  const packagedReferences = [
    packaged.mainExe,
    packaged.archivePath,
    ...Object.values(packaged.mediaTools)
  ];
  for (const artifact of artifacts) {
    requireArtifactNotOlderThan(artifact.filePath, packagedReferences);
    verifyArtifactPayloadMatches(artifact.filePath, packaged);
  }
  return { version, outputDir, artifacts, packaged, pdfAssociation };
}

function parseArgs(args) {
  const output = { full: false, unpackedOnly: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--full") output.full = true;
    else if (arg === "--unpacked") output.unpackedOnly = true;
    else if (arg === "--artifact" && args[index + 1]) {
      const kind = args[++index];
      if (!["portable", "installer"].includes(kind)) throw new Error(`不支援的產物種類：${kind}`);
      if (!output.artifactKinds) output.artifactKinds = [];
      if (!output.artifactKinds.includes(kind)) output.artifactKinds.push(kind);
    }
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
    console.log(`OK 主 EXE：${path.basename(result.packaged.mainExe)}`);
    if (result.packaged.versionCheck && !result.packaged.versionCheck.skipped) {
      const info = result.packaged.versionCheck.info;
      console.log(
        `OK 版本資訊 FileDescription="${info.FileDescription}" ProductName="${info.ProductName}" InternalName="${info.InternalName}"`
      );
    }
    console.log("OK PDF fileAssociations / productName");
    console.log("OK win-unpacked、app.asar 版本、無巢狀 canvas、yt-dlp / Deno / FFmpeg 資源");
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  expectedWindowsArtifactNames,
  findMainWindowsExecutable,
  parseArgs,
  readWindowsVersionInfo,
  requireArtifactNotOlderThan,
  requireReleaseFile,
  requireWindowsExecutable,
  verifyPackagedApplication,
  verifyArtifactPayloadMatches,
  verifyPdfAssociationConfig,
  verifyWindowsRelease,
  MAIN_EXE_CANDIDATES
};
