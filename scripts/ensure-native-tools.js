"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { loadNativeLock, verifyNativeTool, isLanguagePack, payloadDigest, receiptName } = require("./native-tool-lock");
const { downloadFile, sha256File } = require("./ensure-media-download-tools");

function parseArgs(args) {
  const options = { download: false, full: false, toolsRoot: path.resolve(__dirname, "..", "tools"), archives: "" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--download") options.download = true;
    else if (args[i] === "--check") options.download = false;
    else if (args[i] === "--full") options.full = true;
    else if (["--tools-root", "--archives"].includes(args[i]) && args[i + 1]) {
      const key = args[i] === "--tools-root" ? "toolsRoot" : "archives";
      options[key] = path.resolve(args[++i]);
    } else throw new Error(`Unsupported argument: ${args[i]}`);
  }
  return options;
}
async function extract(archive, output, spec) {
  if (spec.format === "msi") {
    if (process.platform !== "win32") throw new Error("LibreOffice MSI administrative extraction requires Windows; its source archive has been verified but no payload has been installed");
    fs.mkdirSync(output, { recursive: true });
    execFileSync("msiexec.exe", ["/a", archive, "/qn", "/norestart", `TARGETDIR=${output}`], { stdio: "pipe", windowsHide: true, timeout: 10 * 60_000 });
    return;
  }
  let sevenZip;
  if (process.platform === "win32" && spec.format === "nsis") {
    // electron-builder's Windows 7za supports ZIP/7z, but not NSIS.
    // The extracted payload still has to match the checked-in tree digest.
    sevenZip = path.join(process.env.ProgramFiles || "C:\\Program Files", "7-Zip", "7z.exe");
    if (!fs.existsSync(sevenZip)) throw new Error("NSIS extraction requires full 7-Zip at Program Files/7-Zip/7z.exe on the Windows build host");
  } else {
    sevenZip = await require("app-builder-lib/out/toolsets/7zip").getPath7za();
  }
  fs.mkdirSync(output, { recursive: true });
  execFileSync(sevenZip, ["x", "-y", `-o${output}`, archive], { stdio: "pipe", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}
function preparePayload(extracted, destination, spec) {
  fs.mkdirSync(destination, { recursive: true });
  if (spec.format === "msi") {
    const matches = [];
    function find(directory) {
      if (fs.existsSync(path.join(directory, "program", "soffice.exe"))) matches.push(directory);
      else for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) find(path.join(directory, entry.name));
    }
    find(extracted);
    if (matches.length !== 1) throw new Error(`Expected one LibreOffice administrative image, found ${matches.length}`);
    fs.cpSync(matches[0], destination, { recursive: true });
    return;
  }
  for (const item of spec.copy) {
    const source = path.join(extracted, item.from);
    const target = path.join(destination, item.to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
  }
}
function replacePayload(key, prepared, toolsRoot) {
  const destination = path.join(toolsRoot, key);
  fs.mkdirSync(toolsRoot, { recursive: true });
  // Retain existing user tools outside the packaged tree; never silently delete them.
  let backup = "";
  if (fs.existsSync(destination)) {
    const backupRoot = path.join(os.homedir(), ".codex", "backups");
    fs.mkdirSync(backupRoot, { recursive: true });
    const timestamp = new Date().toISOString().replace(/:/g, "").replace(/\.\d{3}Z$/, "+0000");
    backup = fs.mkdtempSync(path.join(backupRoot, `${destination.replace(/[^a-zA-Z0-9._-]/g, "_")}-${timestamp}-`));
    fs.cpSync(destination, path.join(backup, key), { recursive: true, verbatimSymlinks: true });
    if (key === "tesseract") {
      const oldData = path.join(destination, "tessdata");
      if (fs.existsSync(oldData)) for (const name of fs.readdirSync(oldData)) {
        if (isLanguagePack(key, `tessdata/${name}`) && fs.lstatSync(path.join(oldData, name)).isFile()) {
          fs.copyFileSync(path.join(oldData, name), path.join(prepared, "tessdata", name));
        }
      }
    }
    fs.rmSync(destination, { recursive: true });
    console.log(`Previous ${key} preserved at ${backup}`);
  }
  try {
    fs.renameSync(prepared, destination);
  } catch (error) {
    if (backup) fs.cpSync(path.join(backup, key), destination, { recursive: true, verbatimSymlinks: true });
    throw error;
  }
}
async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const lock = loadNativeLock();
  for (const key of ["ffmpeg", "qpdf", "tesseract", ...(options.full ? ["libreoffice"] : [])]) {
    try {
      verifyNativeTool(key, options.toolsRoot, lock);
    } catch (error) {
      if (!options.download) throw error;
      const spec = lock.tools[key];
      fs.mkdirSync(options.toolsRoot, { recursive: true });
      // Same filesystem as the final destination so promotion is a rename.
      const temp = fs.mkdtempSync(path.join(path.dirname(options.toolsRoot), ".swiftlocal-native-"));
      try {
        const archive = options.archives ? path.join(options.archives, spec.archiveName) : path.join(temp, spec.archiveName);
        if (!options.archives) {
          console.log(`Downloading ${key} ${spec.version} from ${spec.url}`);
          await downloadFile(spec.url, archive);
        }
        if (sha256File(archive) !== spec.sha256) throw new Error(`${key}: source archive checksum mismatch`);
        const extracted = path.join(temp, "extracted");
        await extract(archive, extracted, spec);
        const stagedTools = path.join(temp, "tools");
        const prepared = path.join(stagedTools, key);
        preparePayload(extracted, prepared, spec);
        if (spec.payloadVerification === "source-receipt") {
          fs.writeFileSync(path.join(prepared, receiptName), JSON.stringify({ schemaVersion: 1, version: spec.version, target: lock.target, sourceSha256: spec.sha256, payloadSha256: payloadDigest(prepared, key) }, null, 2) + "\n");
        }
        verifyNativeTool(key, stagedTools, lock);
        replacePayload(key, prepared, options.toolsRoot);
      } finally {
        fs.rmSync(temp, { recursive: true, force: true });
      }
    }
    const result = verifyNativeTool(key, options.toolsRoot, lock);
    console.log(`OK ${key} ${result.version}: complete Windows payload matches lock`);
  }
}
if (require.main === module) main().catch(error => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
module.exports = { parseArgs, preparePayload, replacePayload, main };
