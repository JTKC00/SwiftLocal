"use strict";

// Production-identity Store overlay. Partner Center values come from the identity record.
// This overlay never mutates the cached production NSIS/Portable config object.
const base = require("./electron-builder.config");
const path = require("node:path");
const identity = require("./build/store/identity");
module.exports = {
  ...base,
  directories: { ...base.directories, output: identity.outputDirectory, buildResources: "build/store" },
  publish: null,
  extraMetadata: { main: "build/store/main.js" },
  files: [...base.files, "!backend{,/**/*}", "!scripts/start-backend.*",
    "build/store/main.js", "build/store/runtime.js", "build/store/identity.js", "build/store/partner-center-identity.json"],
  beforePack: async () => {
    const { verifyNativeTool } = require("./scripts/native-tool-lock");
    for (const tool of ["ffmpeg", "qpdf", "tesseract", "libreoffice"]) {
      verifyNativeTool(tool, path.join(__dirname, "tools"));
    }
    const { requireLockedTessdata } = require("./scripts/tessdata-lock");
    for (const language of ["chi_tra", "eng", "osd"]) {
      requireLockedTessdata(path.join(__dirname, "tools/tesseract/tessdata", `${language}.traineddata`), language);
    }
  },
  win: {
    ...base.win,
    target: [{ target: "appx", arch: ["x64"] }],
    fileAssociations: [],
    // Include the Full payload regardless of the production config's env flag.
    extraResources: [{ from: "tools", to: "tools", filter: [
      "ffmpeg/**/*", "qpdf/**/*", "tesseract/**/*", "libreoffice/**/*", "yt-dlp/**/*", "deno/**/*",
      "*.lock.json", "README.md", "!**/*.dylib", "!**/*.so", "!**/*.jnilib"
    ] }]
  },
  nsis: undefined,
  portable: undefined,
  appx: {
    identityName: identity.identityName,
    publisher: identity.publisher,
    publisherDisplayName: identity.publisherDisplayName,
    applicationId: identity.applicationId,
    displayName: identity.reservedProductName,
    artifactName: "SwiftLocal-${version}-store-${arch}.${ext}",
    customManifestPath: "AppxManifest.xml",
    languages: ["zh-TW", "en-US"],
    minVersion: "10.0.19041.0",
    maxVersionTested: "10.0.26100.0",
    setBuildNumber: false,
    addAutoLaunchExtension: false,
    capabilities: ["runFullTrust"]
  }
};
