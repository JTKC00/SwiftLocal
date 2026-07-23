"use strict";

/**
 * Ensure bundled Tesseract language packs exist under tools/ before packaging.
 *
 * Full builds require Traditional Chinese (chi_tra) so shipped defaults
 * (chi_tra+eng) work offline after install.
 *
 * Usage:
 *   node scripts/ensure-tessdata.js
 *   node scripts/ensure-tessdata.js --require-full   # fail if tesseract or required langs missing
 *   node scripts/ensure-tessdata.js --download       # download missing packs from GitHub
 *
 * Default: try local copy from system Tesseract, then download if --download or SWIFTLOCAL_TESSDATA_DOWNLOAD=1.
 */

const fs = require("node:fs");
const path = require("node:path");
const projectRoot = path.resolve(__dirname, "..");
const toolsRoot = path.join(projectRoot, "tools");

/** Languages required in Full / recommended for default chi_tra+eng OCR. */
const REQUIRED_LANGS = ["eng", "chi_tra", "osd"];
/** Nice-to-have (not hard-fail for full unless listed above). */
const OPTIONAL_LANGS = ["chi_sim"];

const args = new Set(process.argv.slice(2));
const requireFull = args.has("--require-full") || process.env.SWIFTLOCAL_REQUIRE_TESSDATA === "1";
const forceDownload =
  args.has("--download") ||
  process.env.SWIFTLOCAL_TESSDATA_DOWNLOAD === "1" ||
  requireFull; // full build always tries to obtain missing packs

// Prefer tessdata_fast for smaller installers; override with SWIFTLOCAL_TESSDATA_REPO=tessdata|tessdata_best
const tessdataRepo = process.env.SWIFTLOCAL_TESSDATA_REPO || "tessdata_fast";
const TESSDATA_BASE =
  process.env.SWIFTLOCAL_TESSDATA_URL ||
  `https://github.com/tesseract-ocr/${tessdataRepo}/raw/main`;

function main() {
  const tesseractExe = findExecutable(
    toolsRoot,
    new Set(["tesseract.exe", "tesseract"]),
    6
  );
  if (!tesseractExe) {
    const msg =
      "tools/ 下找不到 tesseract 執行檔。Full 版請先放入 portable Tesseract（見 tools/README.md）。";
    if (requireFull) {
      console.error(`FAIL: ${msg}`);
      process.exit(1);
    }
    console.warn(`WARN: ${msg}`);
    // Still prepare language packs under the documented layout for later bundling.
    const fallbackDir = path.join(toolsRoot, "tesseract", "tessdata");
    fs.mkdirSync(fallbackDir, { recursive: true });
    console.log(`tessdata (prepared): ${fallbackDir}`);
    ensureLanguages(fallbackDir);
    return;
  }

  const tessdataDir = resolveTessdataDir(tesseractExe);
  fs.mkdirSync(tessdataDir, { recursive: true });
  console.log(`Tesseract: ${tesseractExe}`);
  console.log(`tessdata:  ${tessdataDir}`);
  ensureLanguages(tessdataDir);
}

function ensureLanguages(tessdataDir) {

  const missing = [];
  for (const lang of REQUIRED_LANGS) {
    const dest = path.join(tessdataDir, `${lang}.traineddata`);
    if (isValidTraineddata(dest)) {
      console.log(`OK   ${lang}.traineddata (${fs.statSync(dest).size} bytes)`);
      continue;
    }
    missing.push(lang);
  }

  if (missing.length) {
    console.log(`Missing required language packs: ${missing.join(", ")}`);
    for (const lang of missing) {
      const dest = path.join(tessdataDir, `${lang}.traineddata`);
      let ok = tryCopyFromSystem(lang, dest);
      if (!ok && forceDownload) {
        ok = downloadTraineddata(lang, dest);
      }
      if (ok && isValidTraineddata(dest)) {
        console.log(`OK   obtained ${lang}.traineddata (${fs.statSync(dest).size} bytes)`);
      } else {
        console.error(`FAIL: could not obtain ${lang}.traineddata`);
      }
    }
  }

  // Optional packs: best-effort
  for (const lang of OPTIONAL_LANGS) {
    const dest = path.join(tessdataDir, `${lang}.traineddata`);
    if (isValidTraineddata(dest)) {
      console.log(`OK   optional ${lang}.traineddata`);
      continue;
    }
    if (forceDownload || tryCopyFromSystem(lang, dest)) {
      if (!isValidTraineddata(dest) && forceDownload) {
        downloadTraineddata(lang, dest);
      }
      if (isValidTraineddata(dest)) {
        console.log(`OK   optional ${lang}.traineddata obtained`);
      }
    }
  }

  const stillMissing = REQUIRED_LANGS.filter(
    (lang) => !isValidTraineddata(path.join(tessdataDir, `${lang}.traineddata`))
  );
  if (stillMissing.length) {
    console.error(
      `FAIL: tessdata still missing: ${stillMissing.join(", ")}.\n` +
        `  Place files in: ${tessdataDir}\n` +
        `  Or run: node scripts/ensure-tessdata.js --download\n` +
        `  Or copy from system: C:\\Program Files\\Tesseract-OCR\\tessdata\\`
    );
    if (requireFull) {
      process.exit(1);
    }
    process.exit(2);
  }

  // Manifest for packaging audit / UI
  const present = listTraineddata(tessdataDir);
  const manifest = {
    tessdataDir: path.relative(projectRoot, tessdataDir).replace(/\\/g, "/"),
    required: REQUIRED_LANGS,
    present,
    hasChiTra: present.includes("chi_tra"),
    hasEng: present.includes("eng"),
    updatedAt: new Date().toISOString()
  };
  const manifestPath = path.join(tessdataDir, "swiftlocal-tessdata.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`OK   Full OCR languages ready (chi_tra+eng). Languages: ${present.join(", ")}`);
  if (require.main === module) {
    process.exit(0);
  }
}

function isValidTraineddata(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    // frk.traineddata on some installs is a 20-byte stub; real packs are hundreds of KB+
    return fs.statSync(filePath).size > 50_000;
  } catch {
    return false;
  }
}

function listTraineddata(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".traineddata"))
    .map((name) => name.replace(/\.traineddata$/i, ""))
    .filter((lang) => isValidTraineddata(path.join(dir, `${lang}.traineddata`)))
    .sort();
}

function resolveTessdataDir(tesseractExe) {
  const exeDir = path.dirname(path.resolve(tesseractExe));
  const candidates = [
    path.join(exeDir, "tessdata"),
    path.join(exeDir, "share", "tessdata"),
    path.join(exeDir, "..", "tessdata"),
    path.join(exeDir, "..", "share", "tessdata"),
    path.join(toolsRoot, "tesseract", "tessdata")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  // Prefer next to executable (Windows portable layout in tools/README.md)
  return path.join(exeDir, "tessdata");
}

function systemTessdataCandidates() {
  const list = [];
  if (process.platform === "win32") {
    list.push(
      path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Tesseract-OCR", "tessdata"),
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Tesseract-OCR", "tessdata")
    );
  } else if (process.platform === "darwin") {
    list.push(
      "/opt/homebrew/share/tessdata",
      "/usr/local/share/tessdata",
      "/opt/homebrew/opt/tesseract/share/tessdata"
    );
  } else {
    list.push("/usr/share/tesseract-ocr/5/tessdata", "/usr/share/tessdata");
  }
  if (process.env.TESSDATA_PREFIX) {
    const prefix = process.env.TESSDATA_PREFIX;
    list.unshift(path.join(prefix, "tessdata"), prefix);
  }
  return list;
}

function tryCopyFromSystem(lang, dest) {
  for (const dir of systemTessdataCandidates()) {
    const src = path.join(dir, `${lang}.traineddata`);
    if (!isValidTraineddata(src)) continue;
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      console.log(`COPY ${lang} <- ${src}`);
      return true;
    } catch (error) {
      console.warn(`WARN copy ${lang} from ${src}: ${error.message}`);
    }
  }
  return false;
}

function downloadTraineddata(lang, dest) {
  const url = `${TESSDATA_BASE}/${lang}.traineddata`;
  const tmp = `${dest}.download`;
  console.log(`GET  ${url}`);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    downloadToFileSync(url, tmp);
    if (!isValidTraineddata(tmp)) {
      fs.unlinkSync(tmp);
      console.error(`FAIL downloaded ${lang} is too small / invalid`);
      return false;
    }
    fs.renameSync(tmp, dest);
    return true;
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
    console.error(`FAIL download ${lang}: ${error.message}`);
    return false;
  }
}

function downloadToFileSync(url, dest) {
  const { spawnSync } = require("node:child_process");
  if (process.platform === "win32") {
    const ps = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Invoke-WebRequest -Uri '${url.replace(/'/g, "''")}' -OutFile '${dest.replace(/'/g, "''")}' -UseBasicParsing`
      ],
      { stdio: "pipe", encoding: "utf8" }
    );
    if (ps.status !== 0) {
      throw new Error(ps.stderr || ps.stdout || `powershell exit ${ps.status}`);
    }
    return;
  }
  const curl = spawnSync("curl", ["-fsSL", "-o", dest, url], { stdio: "pipe", encoding: "utf8" });
  if (curl.status !== 0) {
    throw new Error(curl.stderr || curl.stdout || `curl exit ${curl.status}`);
  }
}

function findExecutable(root, executableNames, depth) {
  if (!fs.existsSync(root) || depth < 0) {
    return "";
  }
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return "";
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && executableNames.has(entry.name)) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      // Skip huge trees occasionally
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const nested = findExecutable(fullPath, executableNames, depth - 1);
      if (nested) return nested;
    }
  }
  return "";
}

main();
