"use strict";

/**
 * Pre-pack checklist for end-user builds.
 * Exit 0 = ready to pack; exit 1 = missing items (printed in plain Chinese).
 *
 *   node scripts/check-pack-ready.js           # standard pack:win
 *   node scripts/check-pack-ready.js --full    # Full (requires LibreOffice)
 *   npm run check:pack
 *   npm run check:pack:full
 */

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const toolsRoot = path.join(projectRoot, "tools");
const wantFull = process.argv.includes("--full");

const checks = [];
let failed = 0;

function ok(msg) {
  checks.push({ ok: true, msg });
  console.log(`  ✓  ${msg}`);
}

function bad(msg, hint) {
  failed += 1;
  checks.push({ ok: false, msg, hint });
  console.log(`  ✗  ${msg}`);
  if (hint) console.log(`      → ${hint}`);
}

function findExecutable(root, names, depth) {
  if (!fs.existsSync(root) || depth < 0) return "";
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return "";
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(root, entry.name);
    if (entry.isFile() && names.has(entry.name)) return full;
    if (entry.isDirectory()) {
      const nested = findExecutable(full, names, depth - 1);
      if (nested) return nested;
    }
  }
  return "";
}

function resolveTessdataDir(tesseractExe) {
  if (!tesseractExe) {
    const fallback = path.join(toolsRoot, "tesseract", "tessdata");
    return fs.existsSync(fallback) ? fallback : fallback;
  }
  const exeDir = path.dirname(path.resolve(tesseractExe));
  const candidates = [
    path.join(exeDir, "tessdata"),
    path.join(exeDir, "share", "tessdata"),
    path.join(exeDir, "..", "tessdata"),
    path.join(exeDir, "..", "share", "tessdata"),
    path.join(toolsRoot, "tesseract", "tessdata")
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
  }
  return path.join(exeDir, "tessdata");
}

function validTraineddata(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 50_000;
  } catch {
    return false;
  }
}

console.log("");
console.log(wantFull ? "【打包前檢查 · Full 版】" : "【打包前檢查 · 一般版】");
console.log(`tools 目錄: ${toolsRoot}`);
console.log("");

// --- tools root ---
if (!fs.existsSync(toolsRoot)) {
  bad("找不到 tools/ 資料夾", "請建立 tools/ 並放入內建工具（見 tools/README.md）");
} else {
  ok("tools/ 存在");
}

// --- Tesseract exe ---
const tesseract = findExecutable(toolsRoot, new Set(["tesseract.exe", "tesseract"]), 6);
if (tesseract) {
  ok(`Tesseract 執行檔: ${path.relative(projectRoot, tesseract)}`);
} else {
  bad(
    "缺少 Tesseract 執行檔（tesseract.exe）",
    "請放入 tools/tesseract/tesseract.exe（portable 版）"
  );
}

// --- tessdata languages ---
const tessdataDir = resolveTessdataDir(tesseract || "");
const requiredLangs = ["eng", "chi_tra", "osd"];
if (!fs.existsSync(tessdataDir)) {
  bad(
    `缺少 tessdata 目錄: ${path.relative(projectRoot, tessdataDir)}`,
    "執行: npm run tools:tessdata"
  );
} else {
  ok(`tessdata: ${path.relative(projectRoot, tessdataDir)}`);
  for (const lang of requiredLangs) {
    const f = path.join(tessdataDir, `${lang}.traineddata`);
    if (validTraineddata(f)) {
      const mb = (fs.statSync(f).size / (1024 * 1024)).toFixed(2);
      ok(`語言包 ${lang}.traineddata (${mb} MB)`);
    } else {
      bad(
        `缺少或損壞語言包: ${lang}.traineddata`,
        "執行: npm run tools:tessdata   （會複製本機或從網路下載 chi_tra/eng/osd）"
      );
    }
  }
}

// --- FFmpeg ---
const ffmpeg = findExecutable(toolsRoot, new Set(["ffmpeg.exe", "ffmpeg"]), 6);
if (ffmpeg) {
  ok(`FFmpeg: ${path.relative(projectRoot, ffmpeg)}`);
} else {
  bad("缺少 FFmpeg", "請放入 tools/ffmpeg/…/ffmpeg.exe");
}

// --- QPDF ---
const qpdf = findExecutable(toolsRoot, new Set(["qpdf.exe", "qpdf"]), 6);
if (qpdf) {
  ok(`QPDF: ${path.relative(projectRoot, qpdf)}`);
} else {
  bad("缺少 QPDF", "請放入 tools/qpdf/…/qpdf.exe");
}

// --- LibreOffice (Full only) ---
const soffice = findExecutable(toolsRoot, new Set(["soffice.exe", "soffice.com", "soffice"]), 8);
if (wantFull) {
  if (soffice) {
    ok(`LibreOffice: ${path.relative(projectRoot, soffice)}`);
  } else {
    bad(
      "Full 版缺少 LibreOffice（soffice）",
      "請放入 tools/libreoffice/program/soffice.exe"
    );
  }
} else if (soffice) {
  ok(`LibreOffice（可選，已找到）: ${path.relative(projectRoot, soffice)}`);
} else {
  console.log("  ·  LibreOffice 未放入 tools/（一般版可選；Office 轉 PDF 需系統安裝或 Full 版）");
}

console.log("");
if (failed === 0) {
  console.log("結果: 通過 — 可以打包");
  console.log(wantFull ? "  npm run pack:win:full" : "  npm run pack:win");
  console.log("");
  console.log("打包後請再確認用家路徑內有繁中包，例如:");
  console.log("  dist/win-unpacked/resources/tools/tesseract/tessdata/chi_tra.traineddata");
  console.log("  或 dist-full/win-unpacked/resources/tools/.../chi_tra.traineddata");
  console.log("");
  process.exit(0);
}

console.log(`結果: 未就緒（${failed} 項缺漏）`);
console.log("");
console.log("建議順序:");
console.log("  1. 依 tools/README.md 放好 tesseract / ffmpeg / qpdf" + (wantFull ? " / libreoffice" : ""));
console.log("  2. npm run tools:tessdata");
console.log("  3. npm run check:pack" + (wantFull ? ":full" : ""));
console.log("  4. npm run pack:win" + (wantFull ? ":full" : ""));
console.log("");
process.exit(1);
