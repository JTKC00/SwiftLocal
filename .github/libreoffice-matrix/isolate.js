"use strict";

// Direct packaged-LibreOffice path matrix. One recorded factor changes per
// single-factor row. Combined rows are reproductions and are not causes.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const CRASH = 0xc0000409;

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}`);
  return process.argv[index + 1];
}

function optionalArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) return "";
  return process.argv[index + 1];
}

function shortPath(target) {
  const literal = String(target).replace(/'/g, "''");
  const command = `$p='${literal}'; $fs=New-Object -ComObject Scripting.FileSystemObject; if (Test-Path -LiteralPath $p -PathType Container) { $fs.GetFolder($p).ShortPath } elseif (Test-Path -LiteralPath $p) { $fs.GetFile($p).ShortPath } else { $p }`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "utf8", windowsHide: true });
  const value = String(result.stdout || "").trim();
  return value || target;
}

function measure(target) {
  const value = path.resolve(target);
  return { path: value, chars: value.length, utf8Bytes: Buffer.byteLength(value) };
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
  return path.resolve(target);
}

function copyFixture(fixture, directory, name = "office-smoke.docx") {
  const destination = path.join(ensureDir(directory), name);
  fs.copyFileSync(fixture, destination);
  return destination;
}

function pdfUri(target) {
  return pathToFileURL(path.resolve(target)).href;
}

function sleep(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    spawnSync("powershell.exe", ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${Number(ms)}`], { windowsHide: true });
  }
}

function stopOffice() {
  spawnSync("taskkill.exe", ["/F", "/IM", "soffice.bin"], { stdio: "ignore", windowsHide: true });
  spawnSync("taskkill.exe", ["/F", "/IM", "soffice.exe"], { stdio: "ignore", windowsHide: true });
  sleep(400);
}

function runCase(soffice, spec) {
  stopOffice();
  const input = copyFixture(spec.fixture, spec.inputDir, spec.inputName || "office-smoke.docx");
  const outdir = ensureDir(spec.outdir);
  const profile = ensureDir(spec.profile);
  const cwd = ensureDir(spec.cwd);
  const temp = ensureDir(spec.temp);
  const output = path.join(outdir, `${path.parse(input).name}.pdf`);
  fs.rmSync(output, { force: true });
  const args = [
    "--headless", "--nologo", "--nodefault", "--nofirststartwizard", "--norestore", "--nolockcheck",
    `-env:UserInstallation=${pdfUri(profile)}`,
    "--convert-to", "pdf",
    "--outdir", outdir,
    input
  ];
  const started = Date.now();
  const result = spawnSync(soffice, args, {
    cwd,
    env: { ...process.env, TEMP: temp, TMP: temp },
    timeout: 120000,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  const elapsedMs = Date.now() - started;
  let outputBytes = 0;
  let pdfHeader = false;
  if (fs.existsSync(output)) {
    const data = fs.readFileSync(output);
    outputBytes = data.length;
    pdfHeader = data.subarray(0, 5).toString() === "%PDF-";
  }
  const exitCode = result.error && result.error.code === "ETIMEDOUT" ? null : result.status;
  const unsigned = exitCode == null ? null : exitCode >>> 0;
  const status = pdfHeader && unsigned === 0 ? "PASS" : "FAIL";
  return {
    id: spec.id,
    factors: spec.factors,
    causal: spec.causal,
    contrastWith: spec.contrastWith || null,
    status,
    exitCode,
    exitHex: unsigned == null ? null : `0x${unsigned.toString(16)}`,
    crash0xC0000409: unsigned === CRASH,
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
    elapsedMs,
    input: measure(input),
    outdir: measure(outdir),
    profile: measure(profile),
    profileUri: pdfUri(profile),
    cwd: measure(cwd),
    temp: measure(temp),
    command: [soffice, ...args],
    output: fs.existsSync(output) ? measure(output) : null,
    outputBytes,
    pdfHeader,
    stdout: String(result.stdout || "").slice(0, 2000),
    stderr: String(result.stderr || "").slice(0, 2000),
    error: result.error ? result.error.message : ""
  };
}

function main() {
  if (process.platform !== "win32") throw new Error("LibreOffice path matrix requires Windows");
  const config = optionalArg("--config")
    ? JSON.parse(fs.readFileSync(optionalArg("--config"), "utf8").replace(/^\uFEFF/, ""))
    : {};
  const soffice = path.resolve(config.soffice || arg("--soffice"));
  const fixture = path.resolve(config.fixture || arg("--fixture"));
  const evidence = path.resolve(config.evidence || arg("--evidence"));
  const launchContext = config.launchContext || "unspecified";
  fs.mkdirSync(path.dirname(evidence), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(evidence), "lo-matrix-started.json"), JSON.stringify({
    phase: "started", soffice, fixture, launchContext
  }, null, 2));
  if (!fs.existsSync(soffice)) throw new Error(`soffice missing: ${soffice}`);
  if (!fs.existsSync(fixture)) throw new Error(`fixture missing: ${fixture}`);
  let versionText = "";
  const version = spawnSync(soffice, ["--version"], { encoding: "utf8", timeout: 60000, windowsHide: true });
  versionText = `${version.stdout || ""}${version.stderr || ""}`.trim();
  if (!versionText.includes("LibreOffice 26.2.6")) {
    const failure = {
      soffice,
      launchContext,
      libreOfficeVersion: versionText,
      fixture,
      fatal: `Unexpected LibreOffice version: ${versionText || version.error}`,
      spawnError: version.error ? { code: version.error.code || "", message: version.error.message } : null,
      rows: []
    };
    fs.mkdirSync(path.dirname(evidence), { recursive: true });
    fs.writeFileSync(evidence, JSON.stringify(failure, null, 2));
    throw new Error(failure.fatal);
  }
  stopOffice();
  const token = crypto.randomBytes(16).toString("hex");
  const suffix = crypto.randomBytes(3).toString("hex");
  const downloads = ensureDir(path.join(process.env.USERPROFILE, "Downloads", `sl-lo-matrix-${token}`));
  const local = ensureDir(process.env.LOCALAPPDATA);
  const tempLong = ensureDir(path.join(local, "Temp"));
  const tempShort = shortPath(tempLong);
  const shortRoot = path.join(downloads, "short");
  const asciiNest = `SwiftLocalStoreASCII${token}`;
  const baselineTemp = process.env.TEMP || tempLong;
  const caseSpec = (id, fields = {}) => ({
    id,
    fixture,
    causal: false,
    factors: [],
    contrastWith: null,
    inputDir: path.join(shortRoot, "in", id),
    outdir: path.join(shortRoot, "out", id),
    profile: path.join(shortRoot, "profile", id),
    cwd: shortRoot,
    temp: baselineTemp,
    ...fields
  });
  const deepAsciiInput = (root) => path.join(root, asciiNest, "inputfiles");
  const deepAsciiOut = (root) => path.join(root, asciiNest, "outputfiles", "store", "officetopdf");
  const deepAsciiProfile = (root) => path.join(deepAsciiOut(root), `.swiftlocal-office-${suffix}`, `lo-profile-${suffix}`);
  const deepRelativeInput = (root) => path.join(root, `SwiftLocal Store 中文 ${token}`, "輸入 文件");
  const deepRelativeOut = (root) => path.join(root, `SwiftLocal Store 中文 ${token}`, "輸出 文件", "store", "office-to-pdf");
  const asciiInput = (root) => path.join(root, `SwiftLocal Store ASCII ${token}`, "input files");
  const asciiOut = (root) => path.join(root, `SwiftLocal Store ASCII ${token}`, "output files", "store", "office-to-pdf");
  const scratchOut = (root, folder) => path.join(folder(root), `.swiftlocal-office-${suffix}`);
  const scratchProfile = (root, folder) => path.join(scratchOut(root, folder), `lo-profile-${suffix}`);
  const appdataShort = path.join(local, `sl-short-${token}`);
  const roamingCwd = path.join(process.env.APPDATA, "SwiftLocal Store TEST");
  const roamingTemp = path.join(roamingCwd, "temp");
  const exactFields = (root, folder) => ({
    inputDir: folder === deepRelativeOut ? deepRelativeInput(root) : asciiInput(root),
    outdir: scratchOut(root, folder),
    profile: scratchProfile(root, folder),
    cwd: roamingCwd,
    temp: roamingTemp
  });
  const specs = [
    caseSpec("baseline-short-downloads-short-profile", { causal: true, factors: ["baseline"] }),
    caseSpec("input-deep-ascii-downloads", { causal: true, factors: ["input-depth"], inputDir: deepAsciiInput(downloads) }),
    caseSpec("outdir-deep-ascii-downloads", { causal: true, factors: ["outdir-depth"], outdir: deepAsciiOut(downloads) }),
    caseSpec("profile-deep-ascii-downloads", { causal: true, factors: ["profile-depth"], profile: deepAsciiProfile(downloads) }),
    caseSpec("cwd-roaming-profile", { causal: true, factors: ["cwd"], cwd: roamingCwd }),
    caseSpec("temp-roaming-profile", { causal: true, factors: ["TEMP"], temp: roamingTemp }),
    caseSpec("input-short-appdata", { causal: true, factors: ["input-location-appdata"], inputDir: path.join(appdataShort, "in") }),
    caseSpec("outdir-short-appdata", { causal: true, factors: ["outdir-location-appdata"], outdir: path.join(appdataShort, "out") }),
    caseSpec("profile-short-appdata", { causal: true, factors: ["profile-location-appdata"], profile: path.join(appdataShort, "profile") }),
    caseSpec("input-unicode-short", { causal: true, factors: ["input-unicode"], inputDir: path.join(shortRoot, "輸入") }),
    caseSpec("outdir-unicode-short", { causal: true, factors: ["outdir-unicode"], outdir: path.join(shortRoot, "輸出") }),
    caseSpec("profile-unicode-short", { causal: true, factors: ["profile-unicode"], profile: path.join(shortRoot, "設定") }),
    caseSpec("input-spaces-short", { causal: true, factors: ["input-spaces"], inputDir: path.join(shortRoot, "input files") }),
    caseSpec("short-appdata-short-profile", {
      causal: false,
      factors: ["input-location-appdata", "outdir-location-appdata", "profile-location-appdata", "cwd"],
      inputDir: path.join(appdataShort, "workspace", "in"),
      outdir: path.join(appdataShort, "workspace", "out"),
      profile: path.join(appdataShort, "workspace", "profile"),
      cwd: path.join(appdataShort, "workspace")
    }),
    caseSpec("deep-downloads-short-profile", {
      causal: false,
      factors: ["input-depth", "outdir-depth", "unicode", "spaces"],
      contrastWith: "deep-appdata-short-profile",
      inputDir: deepRelativeInput(downloads),
      outdir: deepRelativeOut(downloads)
    }),
    caseSpec("deep-appdata-short-profile", {
      causal: false,
      factors: ["input-depth", "outdir-depth", "unicode", "spaces", "location-appdata"],
      contrastWith: "deep-downloads-short-profile",
      inputDir: deepRelativeInput(tempLong),
      outdir: deepRelativeOut(tempLong)
    }),
    caseSpec("exact-rejected-shape", {
      causal: false,
      factors: ["reproduction"],
      contrastWith: "exact-rejected-long-temp-root",
      ...exactFields(tempShort, deepRelativeOut)
    }),
    caseSpec("exact-rejected-long-temp-root", {
      causal: false,
      factors: ["reproduction-long-temp-root"],
      contrastWith: "exact-rejected-shape",
      ...exactFields(tempLong, deepRelativeOut)
    }),
    caseSpec("ascii-equivalent-of-exact", {
      causal: false,
      factors: ["reproduction-ascii"],
      contrastWith: "exact-rejected-shape",
      ...exactFields(tempShort, asciiOut)
    })
  ];
  const rows = [];
  let fatal = null;
  try {
    for (const spec of specs) rows.push(runCase(soffice, spec));
  } catch (error) {
    fatal = error;
  } finally {
    stopOffice();
    const owned = [
      downloads,
      appdataShort,
      path.join(tempLong, asciiNest),
      path.join(tempShort, asciiNest),
      path.join(tempLong, `SwiftLocal Store 中文 ${token}`),
      path.join(tempShort, `SwiftLocal Store 中文 ${token}`),
      path.join(tempLong, `SwiftLocal Store ASCII ${token}`),
      path.join(tempShort, `SwiftLocal Store ASCII ${token}`)
    ];
    if (process.env.GITHUB_ACTIONS === "true") owned.push(roamingCwd);
    for (const directory of owned) fs.rmSync(directory, { recursive: true, force: true });
    const report = {
      soffice,
      launchContext,
      libreOfficeVersion: versionText,
      fixture,
      fixtureBytes: fs.statSync(fixture).size,
      fixtureSha256: crypto.createHash("sha256").update(fs.readFileSync(fixture)).digest("hex"),
      tempLong,
      tempShort,
      shortPathDiffers: path.resolve(tempShort).toLowerCase() !== path.resolve(tempLong).toLowerCase(),
      causalRule: "Only a causal:true row may support a cause, and only by comparison with baseline-short-downloads-short-profile. contrastWith pairs isolate the single difference between those two rows.",
      fatal: fatal ? fatal.message : null,
      rows
    };
    fs.mkdirSync(path.dirname(evidence), { recursive: true });
    fs.writeFileSync(evidence, JSON.stringify(report, null, 2));
  }
  for (const row of rows) console.log(`${row.status} ${row.id} exit=${row.exitHex || "timeout"} pdf=${row.pdfHeader}`);
  if (fatal) throw fatal;
  if (rows.some((row) => row.id === "baseline-short-downloads-short-profile" && row.status !== "PASS")) {
    throw new Error("Baseline short conversion failed; matrix cannot isolate a path factor");
  }
}

main();
