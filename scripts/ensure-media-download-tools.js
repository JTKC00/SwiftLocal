"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("node:https");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const toolsRoot = path.join(projectRoot, "tools");
const lockPath = path.join(toolsRoot, "media-download-tools.lock.json");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

function parseArgs(argv) {
  let platform = "current";
  let mode = "check";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--platform" && argv[index + 1]) platform = argv[++index];
    else if (arg === "--download") mode = "download";
    else if (arg === "--check") mode = "check";
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  const targetPlatform = platform === "current" ? process.platform : platform;
  const targetArch = targetPlatform === "win32" ? "x64" : process.arch;
  const targetKey = `${targetPlatform}-${targetArch}`;
  if (!lock.ytDlp.targets[targetKey] || !lock.deno.targets[targetKey]) {
    throw new Error(`Unsupported media-tool target: ${targetKey}`);
  }
  return { mode, targetPlatform, targetArch, targetKey };
}

function executableName(tool, platform) {
  if (tool === "ytDlp") return platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  return platform === "win32" ? "deno.exe" : "deno";
}

function executablePath(tool, platform) {
  const folder = tool === "ytDlp" ? "yt-dlp" : "deno";
  return path.join(toolsRoot, folder, "bin", executableName(tool, platform));
}

function stampPath(tool, targetKey = "") {
  const folder = tool === "ytDlp" ? "yt-dlp" : "deno";
  const suffix = targetKey ? `-${targetKey}` : "";
  return path.join(toolsRoot, folder, `.swiftlocal-media-tool${suffix}.json`);
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function hasExecutableHeader(filePath, platform) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 500_000) return false;
    const handle = fs.openSync(filePath, "r");
    const header = Buffer.alloc(4);
    fs.readSync(handle, header, 0, 4, 0);
    fs.closeSync(handle);
    return platform === "win32"
      ? header.subarray(0, 2).toString("ascii") === "MZ"
      : ["cffaedfe", "feedfacf", "cafebabe", "cafebabf"].includes(header.toString("hex"));
  } catch {
    return false;
  }
}

function verifyInstalled(tool, target) {
  const definition = lock[tool];
  const source = definition.targets[target.targetKey];
  const filePath = executablePath(tool, target.targetPlatform);
  if (!hasExecutableHeader(filePath, target.targetPlatform)) {
    throw new Error(`${tool} executable missing or invalid: ${path.relative(projectRoot, filePath)}`);
  }
  let stamp;
  try {
    const targetStamp = stampPath(tool, target.targetKey);
    const readableStamp = fs.existsSync(targetStamp) ? targetStamp : stampPath(tool);
    stamp = JSON.parse(fs.readFileSync(readableStamp, "utf8"));
  } catch {
    throw new Error(`${tool} verification stamp missing; run with --download`);
  }
  const actualHash = sha256File(filePath);
  if (stamp.version !== definition.version || stamp.target !== target.targetKey || stamp.sourceSha256 !== source.sha256) {
    throw new Error(`${tool} version/source stamp does not match the lock file`);
  }
  if (stamp.executableSha256 !== actualHash) {
    throw new Error(`${tool} executable checksum mismatch`);
  }
  if (!source.archive && actualHash !== source.sha256) {
    throw new Error(`${tool} release checksum mismatch`);
  }

  if (target.targetPlatform === process.platform && target.targetArch === process.arch) {
    const versionResult = spawnSync(filePath, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 15_000 });
    const output = `${versionResult.stdout || ""}${versionResult.stderr || ""}`;
    if (versionResult.status !== 0 || !output.includes(definition.version)) {
      throw new Error(`${tool} --version did not report ${definition.version}`);
    }
  }
  return { tool, version: definition.version, filePath, sha256: actualHash };
}

function downloadFile(url, destination, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error(`Too many redirects: ${url}`));
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "SwiftLocal-build/1" } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).href;
        downloadFile(next, destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
        return;
      }
      const stream = fs.createWriteStream(destination, { flags: "wx" });
      response.pipe(stream);
      stream.once("finish", () => stream.close(resolve));
      stream.once("error", reject);
    });
    request.setTimeout(120_000, () => request.destroy(new Error(`Download timeout: ${url}`)));
    request.once("error", reject);
  });
}

function extractArchive(archivePath, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const command = process.platform === "win32" ? "powershell.exe" : "unzip";
  const args = process.platform === "win32"
    ? [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "& { param([string]$archivePath, [string]$outputDir) Expand-Archive -LiteralPath $archivePath -DestinationPath $outputDir -Force }",
        archivePath,
        outputDir
      ]
    : ["-o", archivePath, "-d", outputDir];
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Archive extraction failed: ${result.stderr || result.stdout || result.error || command}`);
}

function findFile(root, name) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return candidate;
    if (entry.isDirectory()) {
      const nested = findFile(candidate, name);
      if (nested) return nested;
    }
  }
  return "";
}

async function installTool(tool, target, tempRoot) {
  const definition = lock[tool];
  const source = definition.targets[target.targetKey];
  const sourcePath = path.join(tempRoot, `${tool}${source.archive ? ".zip" : ".download"}`);
  console.log(`Downloading ${tool} ${definition.version} for ${target.targetKey}`);
  await downloadFile(source.url, sourcePath);
  const sourceHash = sha256File(sourcePath);
  if (sourceHash !== source.sha256) {
    throw new Error(`${tool} source checksum mismatch: expected ${source.sha256}, got ${sourceHash}`);
  }

  let preparedPath = sourcePath;
  if (source.archive) {
    const extracted = path.join(tempRoot, `${tool}-extracted`);
    extractArchive(sourcePath, extracted);
    preparedPath = findFile(extracted, executableName(tool, target.targetPlatform));
    if (!preparedPath) throw new Error(`${tool} archive did not contain ${executableName(tool, target.targetPlatform)}`);
  }

  const destination = executablePath(tool, target.targetPlatform);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(preparedPath, destination);
  if (target.targetPlatform !== "win32") fs.chmodSync(destination, 0o755);
  const executableSha256 = sha256File(destination);
  fs.writeFileSync(stampPath(tool, target.targetKey), `${JSON.stringify({
    schemaVersion: 1,
    tool,
    version: definition.version,
    target: target.targetKey,
    sourceUrl: source.url,
    sourceSha256: source.sha256,
    executableSha256
  }, null, 2)}\n`, "utf8");
}

async function main() {
  const target = parseArgs(process.argv.slice(2));
  if (target.mode === "download") {
    const missing = ["ytDlp", "deno"].filter((tool) => {
      try {
        verifyInstalled(tool, target);
        return false;
      } catch {
        return true;
      }
    });
    if (missing.length) {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-media-tools-"));
      try {
        for (const tool of missing) await installTool(tool, target, tempRoot);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    } else {
      console.log(`Pinned media tools already verified for ${target.targetKey}`);
    }
  }
  const results = [verifyInstalled("ytDlp", target), verifyInstalled("deno", target)];
  for (const result of results) {
    console.log(`OK ${result.tool} ${result.version}: ${path.relative(projectRoot, result.filePath)}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  executablePath,
  hasExecutableHeader,
  parseArgs,
  sha256File,
  verifyInstalled
};
