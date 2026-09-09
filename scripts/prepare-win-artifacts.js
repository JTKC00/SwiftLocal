"use strict";
const fs = require("node:fs");
const path = require("node:path");

function clearNsisArchive(outputDir, { name, version }, arch = "x64") {
  const filename = `${name}-${version}-${arch}.nsis.7z`;
  if (path.basename(filename) !== filename || /[\\/]/.test(filename)) throw new Error("Invalid NSIS archive name");
  const directory = path.resolve(outputDir);
  const archive = path.resolve(directory, filename);
  if (path.dirname(archive) !== directory) throw new Error("NSIS archive escaped output directory");
  // An interrupted compressor leaves a newer but incomplete archive that the
  // packager otherwise considers up to date. Never reuse it across invocations.
  fs.rmSync(archive, { force: true });
}

module.exports = { clearNsisArchive };
