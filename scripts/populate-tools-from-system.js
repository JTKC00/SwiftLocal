"use strict";

/**
 * Copy portable tool layouts into tools/ from common Windows install locations.
 * Safe to re-run. Does not delete existing tessdata language packs.
 *
 *   node scripts/populate-tools-from-system.js
 *   npm run tools:populate
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const toolsRoot = path.join(projectRoot, "tools");

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log(`  COPY ${src}`);
  console.log(`    -> ${path.relative(projectRoot, dest)}`);
}

function copyDirRobocopy(src, dest) {
  ensureDir(path.dirname(dest));
  // /E copy subdirs including empty; /NFL /NDL quieter; /NJH /NJS no headers
  const r = spawnSync(
    "robocopy",
    [src, dest, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np"],
    { encoding: "utf8" }
  );
  // robocopy exit codes 0-7 are success-ish
  if (r.status !== null && r.status >= 8) {
    throw new Error(`robocopy failed (${r.status}): ${src} -> ${dest}\n${r.stderr || r.stdout || ""}`);
  }
  console.log(`  COPYDIR ${src}`);
  console.log(`       -> ${path.relative(projectRoot, dest)}`);
}

function which(cmd) {
  const r = spawnSync("where.exe", [cmd], { encoding: "utf8" });
  if (r.status !== 0) return "";
  const line = (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return line || "";
}

console.log("\n【從本機安裝複製工具到 tools/】\n");

// --- Tesseract ---
const tessCandidates = [
  path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Tesseract-OCR"),
  path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Tesseract-OCR")
];
let tessSrc = tessCandidates.find((d) => exists(path.join(d, "tesseract.exe")));
if (tessSrc) {
  const dest = path.join(toolsRoot, "tesseract");
  // Preserve existing tessdata (chi_tra etc.) by merging: copy exe+dlls, merge tessdata
  ensureDir(dest);
  for (const name of fs.readdirSync(tessSrc)) {
    if (name === "tessdata") continue;
    const from = path.join(tessSrc, name);
    const to = path.join(dest, name);
    const st = fs.statSync(from);
    if (st.isFile()) {
      copyFile(from, to);
    } else if (st.isDirectory() && name.toLowerCase() !== "doc") {
      // skip large docs; copy other dirs lightly if needed
    }
  }
  // DLLs often next to exe
  const tessdataSrc = path.join(tessSrc, "tessdata");
  const tessdataDest = path.join(dest, "tessdata");
  if (exists(tessdataSrc)) {
    ensureDir(tessdataDest);
    for (const f of fs.readdirSync(tessdataSrc)) {
      if (!f.endsWith(".traineddata") && !f.endsWith(".user-words") && !f.endsWith(".user-patterns") && f !== "configs" && f !== "tessconfigs") {
        // copy configs dirs
      }
      const from = path.join(tessdataSrc, f);
      const to = path.join(tessdataDest, f);
      if (fs.statSync(from).isFile()) {
        // Don't overwrite larger/better local packs with same name if already valid
        if (exists(to) && fs.statSync(to).size > 50_000 && f.endsWith(".traineddata")) {
          continue;
        }
        copyFile(from, to);
      }
    }
  }
  if (exists(path.join(dest, "tesseract.exe"))) {
    console.log("OK  Tesseract -> tools/tesseract/");
  }
} else {
  console.log("SKIP Tesseract（系統未找到）");
}

// --- FFmpeg ---
const ffmpegPath =
  which("ffmpeg") ||
  path.join(process.env.USERPROFILE || "", ".local", "bin", "ffmpeg.exe");
if (ffmpegPath && exists(ffmpegPath)) {
  const binDir = path.dirname(ffmpegPath);
  const destBin = path.join(toolsRoot, "ffmpeg", "bin");
  ensureDir(destBin);
  for (const name of ["ffmpeg.exe", "ffprobe.exe", "ffplay.exe"]) {
    const src = path.join(binDir, name);
    if (exists(src)) copyFile(src, path.join(destBin, name));
  }
  // copy sibling dlls if any
  for (const name of fs.readdirSync(binDir)) {
    if (name.toLowerCase().endsWith(".dll")) {
      copyFile(path.join(binDir, name), path.join(destBin, name));
    }
  }
  console.log("OK  FFmpeg -> tools/ffmpeg/bin/");
} else {
  console.log("SKIP FFmpeg（系統未找到）");
}

// --- QPDF ---
const qpdfPath =
  which("qpdf") ||
  path.join(process.env["ProgramFiles"] || "C:\\Program Files", "qpdf 12.3.2", "bin", "qpdf.exe");
// also scan Program Files for qpdf*
let qpdfBin = qpdfPath && exists(qpdfPath) ? path.dirname(qpdfPath) : "";
if (!qpdfBin) {
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  try {
    for (const name of fs.readdirSync(pf)) {
      if (!/^qpdf/i.test(name)) continue;
      const cand = path.join(pf, name, "bin", "qpdf.exe");
      if (exists(cand)) {
        qpdfBin = path.dirname(cand);
        break;
      }
    }
  } catch {
    // ignore
  }
}
if (qpdfBin) {
  const destBin = path.join(toolsRoot, "qpdf", "bin");
  copyDirRobocopy(qpdfBin, destBin);
  console.log("OK  QPDF -> tools/qpdf/bin/");
} else {
  console.log("SKIP QPDF（系統未找到）");
}

// --- LibreOffice (large; optional unless Full) ---
const loProgram = [
  path.join(process.env["ProgramFiles"] || "C:\\Program Files", "LibreOffice", "program"),
  path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "LibreOffice", "program")
].find((d) => exists(path.join(d, "soffice.exe")));

const skipLo = process.argv.includes("--skip-libreoffice");
if (loProgram && !skipLo) {
  const loRoot = path.dirname(loProgram); // .../LibreOffice
  const dest = path.join(toolsRoot, "libreoffice");
  console.log("COPY LibreOffice（體積較大，可能需數分鐘）…");
  copyDirRobocopy(loRoot, dest);
  console.log("OK  LibreOffice -> tools/libreoffice/");
} else if (skipLo) {
  console.log("SKIP LibreOffice（--skip-libreoffice）");
} else {
  console.log("SKIP LibreOffice（系統未找到）");
}

console.log("\n接著執行:");
console.log("  npm run tools:tessdata");
console.log("  npm run check:pack");
console.log("  npm run check:pack:full   # 若要 Full\n");
