"use strict";

// Local TEST spike only. Do not infer Partner Center values from desktop appId.
// This overlay never mutates the cached production config object.
const base = require("./electron-builder.config");
const path = require("node:path");
module.exports = {
  ...base,
  directories: { ...base.directories, output: "dist-store-test", buildResources: "build/store" },
  publish: null,
  extraMetadata: { main: "build/store/main.js" },
  files: [...base.files, "!backend{,/**/*}", "!scripts/start-backend.*", "build/store/main.js", "build/store/runtime.js"],
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
    identityName: "SwiftLocal.StoreSpike.TEST",
    publisher: "CN=SwiftLocal Store Spike TEST",
    publisherDisplayName: "SwiftLocal TEST - NOT FOR SUBMISSION",
    applicationId: "SwiftLocal",
    displayName: "SwiftLocal TEST",
    artifactName: "SwiftLocal-${version}-store-TEST-${arch}.${ext}",
    customManifestPath: "AppxManifest.xml",
    languages: ["zh-TW", "en-US"],
    minVersion: "10.0.19041.0",
    maxVersionTested: "10.0.26100.0",
    setBuildNumber: false,
    addAutoLaunchExtension: false,
    capabilities: ["runFullTrust"]
  }
};
