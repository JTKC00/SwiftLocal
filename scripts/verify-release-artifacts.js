"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");
const { readWindowsPe, readWindowsX64Pe } = require("./windows-pe");
const { loadTessdataLock, requireLockedTessdata } = require("./tessdata-lock");

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
  try {
    readWindowsX64Pe(filePath, minimumBytes);
  } catch (error) {
    throw new Error(`封裝工具不是有效的 x64 Windows PE 執行檔：${filePath}（${error.message}）`);
  }
  return stat;
}

function requireWindowsArtifact(filePath, minimumBytes = 1024 * 1024) {
  const stat = requireReleaseFile(filePath, minimumBytes);
  try {
    // NSIS installer stubs can be PE32 even when the bundled application is x64.
    readWindowsPe(filePath, minimumBytes);
  } catch (error) {
    throw new Error(`發行產物不是有效的 Windows PE 執行檔：${filePath}（${error.message}）`);
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
    const expected = packaged.payloadManifest || {};
    if (!Object.keys(expected).length) {
      throw new Error("win-unpacked 驗證結果沒有必備 payload 清單");
    }
    const applicationRoot = locateExtractedApplicationRoot(payloadRoot);
    const actual = buildPayloadManifest(applicationRoot);
    const expectedByPath = manifestByNormalizedPath(expected, "win-unpacked");
    const actualByPath = manifestByNormalizedPath(actual, "發行產物");
    const missing = Array.from(expectedByPath.keys()).filter((key) => !actualByPath.has(key));
    const unexpected = Array.from(actualByPath.keys()).filter((key) => !expectedByPath.has(key));
    if (missing.length || unexpected.length) {
      const details = [
        missing.length ? `缺少：${missing.slice(0, 5).join(", ")}` : "",
        unexpected.length ? `多餘：${unexpected.slice(0, 5).join(", ")}` : ""
      ].filter(Boolean).join("；");
      throw new Error(`發行產物檔案清單與 win-unpacked 不一致（${details}）：${artifactPath}`);
    }

    const hashes = {};
    for (const [key, expectedFile] of Object.entries(expected)) {
      const normalizedPath = normalizeManifestPath(expectedFile.relativePath);
      const actualFile = actualByPath.get(normalizedPath);
      const currentExpectedHash = sha256File(expectedFile.filePath);
      if (expectedFile.sha256 && currentExpectedHash !== expectedFile.sha256) {
        throw new Error(`win-unpacked 建立清單後內容已改變（${expectedFile.relativePath}）`);
      }
      if (expectedFile.bytes != null && fs.statSync(expectedFile.filePath).size !== expectedFile.bytes) {
        throw new Error(`win-unpacked 建立清單後大小已改變（${expectedFile.relativePath}）`);
      }
      if (currentExpectedHash !== actualFile.sha256 || fs.statSync(expectedFile.filePath).size !== actualFile.bytes) {
        throw new Error(`發行產物內容與 win-unpacked 不一致（${key}）：${artifactPath}`);
      }
      hashes[key] = actualFile.sha256;
    }
    return hashes;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildPayloadManifest(rootDir) {
  const manifest = {};
  for (const filePath of findFiles(rootDir)) {
    const relativePath = path.relative(rootDir, filePath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) continue;
    const portablePath = relativePath.replace(/\\/g, "/");
    const stat = fs.statSync(filePath);
    manifest[portablePath] = {
      filePath,
      relativePath: portablePath,
      bytes: stat.size,
      sha256: sha256File(filePath)
    };
  }
  if (!Object.keys(manifest).length) {
    throw new Error(`win-unpacked 沒有可驗證檔案：${rootDir}`);
  }
  return manifest;
}

function normalizeManifestPath(relativePath) {
  const portablePath = String(relativePath || "").replace(/\\/g, "/");
  if (
    !portablePath ||
    portablePath.startsWith("/") ||
    /^[a-z]:\//i.test(portablePath) ||
    portablePath.split("/").some((part) => part === "..")
  ) {
    throw new Error(`無效的 payload 相對路徑：${relativePath}`);
  }
  return portablePath.toLowerCase();
}

function manifestByNormalizedPath(manifest, label) {
  const indexed = new Map();
  for (const entry of Object.values(manifest)) {
    const key = normalizeManifestPath(entry.relativePath);
    if (indexed.has(key)) {
      throw new Error(`${label} 有重複的 Windows payload 路徑：${entry.relativePath}`);
    }
    indexed.set(key, entry);
  }
  return indexed;
}

function locateExtractedApplicationRoot(payloadRoot) {
  const roots = findFiles(payloadRoot)
    .filter((filePath) => path.basename(filePath).toLowerCase() === "app.asar")
    .filter((filePath) => path.basename(path.dirname(filePath)).toLowerCase() === "resources")
    .map((filePath) => path.dirname(path.dirname(filePath)))
    .filter((rootDir) => MAIN_EXE_CANDIDATES.some((name) => fs.existsSync(path.join(rootDir, name))));
  const uniqueRoots = Array.from(new Set(roots.map((rootDir) => path.resolve(rootDir))));
  if (uniqueRoots.length !== 1) {
    throw new Error(
      `無法唯一定位發行產物的應用程式根目錄（找到 ${uniqueRoots.length} 個）：${payloadRoot}`
    );
  }
  return uniqueRoots[0];
}

function payloadFile(resourcesDir, filePath) {
  const relativeFromResources = path.relative(resourcesDir, filePath);
  if (!relativeFromResources || relativeFromResources.startsWith("..") || path.isAbsolute(relativeFromResources)) {
    throw new Error(`必備 payload 路徑不在 resources 內：${filePath}`);
  }
  return {
    filePath,
    relativePath: path.join("resources", relativeFromResources)
  };
}

function extractReleasePayload(artifactPath, tempDir) {
  const sevenZip = ensureExecutableTool(require("7zip-bin").path7za);
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

function ensureExecutableTool(filePath) {
  if (process.platform !== "win32") fs.chmodSync(filePath, 0o755);
  return filePath;
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

function findFileByName(root, names) {
  const normalizedNames = new Set(Array.from(names, (name) => String(name).toLowerCase()));
  return findFiles(root).find((filePath) => normalizedNames.has(path.basename(filePath).toLowerCase())) || "";
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
  if (/FriendlyAppName[\s:=\0]{0,32}Electron/i.test(text)) {
    hits.push("installer_strings_electron_without_product");
  }
  // Stronger check: product display name should appear in installer payload.
  if (!text.includes("SwiftLocal") && !text.includes("快轉通")) {
    hits.push("installer_missing_swiftlocal_string");
  }
  return hits;
}

function requireSafeInstallerHints(installerPath) {
  const hints = readNsisFriendlyAppNameHints(installerPath);
  if (hints.length) {
    throw new Error(`安裝檔含不安全的產品名稱提示（${hints.join(", ")}）：${installerPath}`);
  }
  return hints;
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

function packagedTessdataDir(tesseractPath) {
  const executableDir = path.dirname(path.resolve(tesseractPath));
  const candidates = [
    path.join(executableDir, "tessdata"),
    path.join(executableDir, "share", "tessdata"),
    path.join(executableDir, "..", "tessdata"),
    path.join(executableDir, "..", "share", "tessdata")
  ];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isDirectory();
    } catch {
      return false;
    }
  }) || "";
}

function requireNamedWindowsExecutable(toolsDir, names, label, minimumBytes = 50_000) {
  const filePath = findFileByName(toolsDir, names);
  if (!filePath) {
    throw new Error(`封裝程式缺少 ${label}：${Array.from(names).join(" / ")}`);
  }
  requireWindowsExecutable(filePath, minimumBytes);
  return filePath;
}

function verifyRequiredToolPayload(resourcesDir, options = {}) {
  const toolsDir = path.join(resourcesDir, "tools");
  if (!fs.existsSync(toolsDir) || fs.readdirSync(toolsDir).length === 0) {
    throw new Error(`封裝程式缺少 tools 資源：${toolsDir}`);
  }

  const requiredTools = {
    ytDlp: requireNamedWindowsExecutable(toolsDir, new Set(["yt-dlp.exe"]), "yt-dlp", 1_000_000),
    deno: requireNamedWindowsExecutable(toolsDir, new Set(["deno.exe"]), "Deno", 1_000_000),
    ffmpeg: requireNamedWindowsExecutable(toolsDir, new Set(["ffmpeg.exe"]), "FFmpeg", 100_000),
    tesseract: requireNamedWindowsExecutable(toolsDir, new Set(["tesseract.exe"]), "Tesseract"),
    qpdf: requireNamedWindowsExecutable(toolsDir, new Set(["qpdf.exe"]), "QPDF", 10_000)
  };
  const bundledLibreOffice = fs.readdirSync(toolsDir, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.toLowerCase() === "libreoffice");
  if (!options.full && bundledLibreOffice) {
    throw new Error(`Standard 封裝不應包含 LibreOffice：${path.join(toolsDir, bundledLibreOffice.name)}`);
  }
  if (options.full) {
    requiredTools.libreOffice = requireNamedWindowsExecutable(
      toolsDir,
      new Set(["soffice.exe", "soffice.com"]),
      "LibreOffice"
    );
    const libreOfficeProgram = path.dirname(requiredTools.libreOffice);
    for (const supportName of ["soffice.bin", "fundamental.ini"]) {
      requireReleaseFile(path.join(libreOfficeProgram, supportName), 1);
    }
  }

  const tesseractRoot = path.dirname(requiredTools.tesseract);
  if (!findFiles(tesseractRoot).some((filePath) => /\.dll$/i.test(filePath))) {
    throw new Error(`封裝程式的 Tesseract 缺少必要 DLL 支援檔：${tesseractRoot}`);
  }
  const qpdfRoot = path.dirname(path.dirname(requiredTools.qpdf));
  if (!findFileByName(qpdfRoot, new Set(["qpdf.dll", "qpdf29.dll", "qpdf30.dll"]))) {
    throw new Error(`封裝程式的 QPDF 缺少必要 DLL 支援檔：${qpdfRoot}`);
  }

  const tessdataDir = packagedTessdataDir(requiredTools.tesseract);
  if (!tessdataDir) {
    throw new Error(`封裝程式的 Tesseract 旁缺少 tessdata：${requiredTools.tesseract}`);
  }
  const tessdata = {};
  const tessdataLock = options.tessdataLock || loadTessdataLock();
  for (const language of ["eng", "chi_tra", "osd"]) {
    const filePath = path.join(tessdataDir, `${language}.traineddata`);
    try {
      requireLockedTessdata(filePath, language, tessdataLock);
    } catch (error) {
      throw new Error(`封裝程式的 OCR 語言包未通過鎖定校驗：${filePath}（${error.message}）`);
    }
    tessdata[language] = filePath;
  }

  const payloadFiles = {};
  for (const [key, filePath] of Object.entries({ ...requiredTools, ...tessdata })) {
    payloadFiles[key] = payloadFile(resourcesDir, filePath);
  }
  return {
    toolsDir,
    requiredTools,
    mediaTools: {
      ytDlp: requiredTools.ytDlp,
      deno: requiredTools.deno,
      ffmpeg: requiredTools.ffmpeg
    },
    tessdata,
    payloadFiles
  };
}

function verifyPackagedApplication(outputDir, version, options = {}) {
  const unpackedDir = path.join(outputDir, "win-unpacked");
  const mainExe = findMainWindowsExecutable(unpackedDir);
  requireWindowsExecutable(mainExe, 1024 * 1024);

  const versionCheck = assertMainExeVersionInfo(mainExe);

  const resourcesDir = path.join(unpackedDir, "resources");
  const archivePath = path.join(resourcesDir, "app.asar");
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

  const tools = verifyRequiredToolPayload(resourcesDir, options);
  const payloadManifest = buildPayloadManifest(unpackedDir);
  return {
    archivePath,
    resourcesDir,
    ...tools,
    payloadFiles: {
      appAsar: payloadFile(resourcesDir, archivePath),
      ...tools.payloadFiles
    },
    payloadManifest,
    mainExe,
    versionCheck
  };
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
    const stat = requireWindowsArtifact(filePath, 1024 * 1024);
    return { filePath, size: stat.size };
  });

  for (const artifact of artifacts) {
    if (/installer/i.test(path.basename(artifact.filePath))) {
      requireSafeInstallerHints(artifact.filePath);
    }
  }

  const packaged = verifyPackagedApplication(outputDir, version, { full });
  const packagedReferences = [
    ...Object.values(packaged.payloadManifest).map((file) => file.filePath)
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
    console.log(
      `OK win-unpacked、app.asar 版本、無巢狀 canvas、${Object.keys(result.packaged.payloadFiles).join(" / ")} 資源`
    );
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  ensureExecutableTool,
  buildPayloadManifest,
  expectedWindowsArtifactNames,
  findMainWindowsExecutable,
  parseArgs,
  readWindowsVersionInfo,
  readNsisFriendlyAppNameHints,
  requireArtifactNotOlderThan,
  requireReleaseFile,
  requireSafeInstallerHints,
  requireWindowsArtifact,
  requireWindowsExecutable,
  verifyPackagedApplication,
  verifyArtifactPayloadMatches,
  verifyPdfAssociationConfig,
  verifyRequiredToolPayload,
  verifyWindowsRelease,
  MAIN_EXE_CANDIDATES
};
