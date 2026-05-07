"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const toolsRoot = path.join(projectRoot, "tools");
const homebrewPrefix = "/opt/homebrew";

const TOOL_SPECS = [
  {
    key: "ffmpeg",
    executable: path.join(homebrewPrefix, "bin", "ffmpeg"),
    bundleDir: path.join(toolsRoot, "ffmpeg"),
    executableName: "ffmpeg",
    searchRoots: [path.join(homebrewPrefix, "opt", "ffmpeg", "lib")]
  },
  {
    key: "tesseract",
    executable: path.join(homebrewPrefix, "bin", "tesseract"),
    bundleDir: path.join(toolsRoot, "tesseract"),
    executableName: "tesseract",
    searchRoots: [path.join(homebrewPrefix, "opt", "tesseract", "lib")],
    copyDirs: [
      {
        from: path.join(homebrewPrefix, "opt", "tesseract", "share", "tessdata"),
        to: "share/tessdata"
      }
    ]
  },
  {
    key: "qpdf",
    executable: path.join(homebrewPrefix, "bin", "qpdf"),
    bundleDir: path.join(toolsRoot, "qpdf"),
    executableName: "qpdf",
    searchRoots: [path.join(homebrewPrefix, "opt", "qpdf", "lib")]
  }
];

const GLOBAL_SEARCH_ROOTS = [
  path.join(homebrewPrefix, "lib"),
  path.join(homebrewPrefix, "opt"),
  path.join(homebrewPrefix, "Cellar")
];

main();

function main() {
  ensureDir(toolsRoot);
  for (const spec of TOOL_SPECS) {
    bundleTool(spec);
  }
}

function bundleTool(spec) {
  if (!fs.existsSync(spec.executable)) {
    throw new Error(`Missing executable for ${spec.key}: ${spec.executable}`);
  }

  fs.rmSync(spec.bundleDir, { recursive: true, force: true });
  const binDir = path.join(spec.bundleDir, "bin");
  const libDir = path.join(spec.bundleDir, "lib");
  ensureDir(binDir);
  ensureDir(libDir);

  const actualBinaryPath = path.join(binDir, `${spec.executableName}.bin`);
  copyFilePreserveMode(spec.executable, actualBinaryPath);

  const queue = [];
  const copiedLibraries = new Map();

  enqueueDependencies(spec, spec.executable, buildSearchRoots(spec, spec.executable), copiedLibraries, queue, libDir);

  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    enqueueDependencies(spec, item.source, buildSearchRoots(spec, item.source), copiedLibraries, queue, libDir);
  }

  patchBinary(spec, actualBinaryPath, spec.executable, copiedLibraries);
  for (const item of queue) {
    patchLibrary(spec, item.destination, item.source, copiedLibraries);
  }
  signMachO(actualBinaryPath);
  for (const item of queue) {
    signMachO(item.destination);
  }

  if (spec.copyDirs) {
    for (const item of spec.copyDirs) {
      copyDirectory(item.from, path.join(spec.bundleDir, item.to));
    }
  }

  writeWrapper(spec, path.join(binDir, spec.executableName));
}

function enqueueDependencies(spec, sourcePath, searchRoots, copiedLibraries, queue, libDir) {
  for (const dependency of readDependencies(sourcePath)) {
    if (shouldSkipDependency(sourcePath, dependency.reference)) {
      continue;
    }
    const resolved = resolveDependency(dependency.reference, sourcePath, searchRoots);
    if (!resolved || shouldSkipDependency(sourcePath, resolved)) {
      continue;
    }
    const copiedKey = `${resolved}::${path.basename(dependency.reference)}`;
    const destination = path.join(libDir, path.basename(dependency.reference));
    if (!copiedLibraries.has(copiedKey)) {
      copyFilePreserveMode(resolved, destination);
      copiedLibraries.set(copiedKey, destination);
      queue.push({ source: resolved, destination });
    }
  }
}

function readDependencies(filePath) {
  const output = execFileSync("otool", ["-L", filePath], { encoding: "utf8" });
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ reference: line.split(" (compatibility version")[0].trim() }));
}

function patchBinary(spec, destinationPath, sourcePath, copiedLibraries) {
  for (const dependency of readDependencies(sourcePath)) {
    const resolved = resolveDependency(dependency.reference, sourcePath, buildSearchRoots(spec, sourcePath));
    if (!resolved) {
      continue;
    }
    const bundledPath = copiedLibraries.get(`${resolved}::${path.basename(dependency.reference)}`);
    if (!bundledPath) {
      continue;
    }
    runInstallNameTool(["-change", dependency.reference, `@loader_path/../lib/${path.basename(bundledPath)}`, destinationPath]);
  }
}

function patchLibrary(spec, destinationPath, sourcePath, copiedLibraries) {
  runInstallNameTool(["-id", `@loader_path/${path.basename(destinationPath)}`, destinationPath]);
  for (const dependency of readDependencies(sourcePath)) {
    const resolved = resolveDependency(dependency.reference, sourcePath, buildSearchRoots(spec, sourcePath));
    if (!resolved) {
      continue;
    }
    const bundledPath = copiedLibraries.get(`${resolved}::${path.basename(dependency.reference)}`);
    if (!bundledPath) {
      continue;
    }
    runInstallNameTool(["-change", dependency.reference, `@loader_path/${path.basename(bundledPath)}`, destinationPath]);
  }
}

function resolveDependency(reference, sourcePath, searchRoots) {
  if (!reference || shouldSkipDependency(sourcePath, reference)) {
    return "";
  }
  if (path.isAbsolute(reference)) {
    return fs.existsSync(reference) ? fs.realpathSync(reference) : "";
  }

  const leafName = path.basename(reference);
  const candidates = [];
  if (reference.startsWith("@loader_path/")) {
    candidates.push(path.resolve(path.dirname(sourcePath), reference.slice("@loader_path/".length)));
  }
  if (reference.startsWith("@executable_path/")) {
    candidates.push(path.resolve(path.dirname(sourcePath), reference.slice("@executable_path/".length)));
  }
  if (reference.startsWith("@rpath/")) {
    for (const root of searchRoots) {
      candidates.push(path.join(root, leafName));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.realpathSync(candidate);
    }
  }
  return "";
}

function buildSearchRoots(spec, sourcePath) {
  const roots = [
    path.dirname(sourcePath),
    ...spec.searchRoots,
    ...GLOBAL_SEARCH_ROOTS
  ];
  return Array.from(new Set(roots.filter(Boolean).filter((item) => fs.existsSync(item))));
}

function shouldSkipDependency(sourcePath, dependencyPath) {
  if (!dependencyPath) {
    return true;
  }
  if (dependencyPath === sourcePath) {
    return true;
  }
  return dependencyPath.startsWith("/System/") || dependencyPath.startsWith("/usr/lib/");
}

function writeWrapper(spec, wrapperPath) {
  const lines = [
    "#!/bin/sh",
    "set -eu",
    "HERE=\"$(CDPATH= cd -- \"$(dirname \"$0\")\" && pwd)\""
  ];
  if (spec.key === "tesseract") {
    lines.push("export TESSDATA_PREFIX=\"$HERE/../share/\"");
  }
  lines.push(`exec \"$HERE/${spec.executableName}.bin\" \"$@\"`);
  fs.writeFileSync(wrapperPath, `${lines.join("\n")}\n`, "utf8");
  fs.chmodSync(wrapperPath, 0o755);
}

function copyDirectory(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) {
    throw new Error(`Missing directory to copy: ${fromPath}`);
  }
  fs.rmSync(toPath, { recursive: true, force: true });
  ensureDir(path.dirname(toPath));
  fs.cpSync(fromPath, toPath, { recursive: true, dereference: true });
}

function copyFilePreserveMode(fromPath, toPath) {
  ensureDir(path.dirname(toPath));
  fs.copyFileSync(fromPath, toPath);
  fs.chmodSync(toPath, fs.statSync(fromPath).mode);
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function runInstallNameTool(args) {
  execFileSync("install_name_tool", args, { stdio: "pipe" });
}

function signMachO(filePath) {
  execFileSync("codesign", ["--force", "--sign", "-", filePath], { stdio: "pipe" });
}
