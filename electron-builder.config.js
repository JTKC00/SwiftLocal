"use strict";

const shouldSignMac = process.env.SWIFTLOCAL_MAC_SIGN === "1";
const isFullWindowsBuild = process.env.SWIFTLOCAL_FULL_BUILD === "1";
const hasNotarizationCredentials = Boolean(
  (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) ||
  (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) ||
  (process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE)
);

const windowsToolFilters = [
  "**/*",
  "!**/*.dylib",
  "!**/*.so",
  "!**/*.jnilib",
  "!LibreOffice.app/**/*",
  "!ffmpeg/bin/ffmpeg",
  "!qpdf/bin/qpdf",
  "!tesseract/bin/tesseract",
  "!yt-dlp/bin/yt-dlp",
  "!deno/bin/deno"
];

if (!isFullWindowsBuild) {
  windowsToolFilters.push(
    "!libreoffice/**/*",
    "!libreOffice/**/*",
    "!LibreOffice/**/*"
  );
}

const macToolFilters = [
  "**/*",
  "!**/*.exe",
  "!**/*.dll",
  "!libreoffice/**/*"
];

module.exports = {
  appId: "com.swiftlocal.converter",
  productName: "快轉通 SwiftLocal",
  // Large tools/ tree (~2GB+) — maximum compression often fails or hangs on Windows 7za.
  compression: "normal",
  directories: {
    buildResources: "build",
    output: "dist"
  },
  files: [
    "frontend/**/*",
    "backend/**/*",
    "desktop/**/*",
    "build/icon.ico",
    "build/entitlements.mac.plist",
    "build/entitlements.mac.inherit.plist",
    "scripts/start-backend.cmd",
    "scripts/start-backend.js",
    "README.md",
    "package.json"
  ],
  // Register as a PDF viewer in “Open with” (installer / mac .app).
  // Does not force system default — user chooses in OS settings.
  fileAssociations: [
    {
      ext: "pdf",
      name: "PDF",
      description: "PDF Document — 快轉通 SwiftLocal",
      icon: "icon.ico",
      mimeType: "application/pdf",
      role: "Viewer",
      // macOS: Alternate so we appear as a viewer without replacing Preview by default.
      rank: "Alternate"
    }
  ],
  win: {
    icon: "build/icon.ico",
    // Stable ASCII EXE name for Windows shell / Open With registry keys.
    // productName remains "快轉通 SwiftLocal" (FileDescription / ProductName via rcedit).
    executableName: "SwiftLocal",
    target: [
      {
        target: "portable",
        arch: ["x64"]
      },
      {
        target: "nsis",
        arch: ["x64"]
      }
    ],
    artifactName: "SwiftLocal-${version}-${arch}.${ext}",
    // Keep resource editing enabled so the main EXE receives the SwiftLocal
    // icon/name/version. The current releases are intentionally unsigned.
    // Note: signExts only affects code signing (signIf), not rcedit resource
    // editing of the main product EXE (signAndEditResources still runs).
    signAndEditExecutable: true,
    // Full builds bundle many third-party EXEs (LibreOffice, Tesseract, FFmpeg,
    // QPDF). Exclude all EXEs from the signing pass so electron-builder does not
    // download winCodeSign or require Windows symlink privileges. The main app
    // EXE is still resource-edited before this negative signing rule is applied.
    signExts: ["!.exe"],
    extraResources: [
      {
        from: "tools",
        to: "tools",
        filter: windowsToolFilters
      }
    ]
  },
  mac: {
    icon: "frontend/assets/swiftlocal-logo.png",
    category: "public.app-category.productivity",
    target: ["dmg"],
    artifactName: "SwiftLocal-${version}-mac-${arch}.${ext}",
    identity: shouldSignMac ? undefined : null,
    hardenedRuntime: shouldSignMac,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.inherit.plist",
    notarize: shouldSignMac && hasNotarizationCredentials,
    extraResources: [
      {
        from: "tools",
        to: "tools",
        filter: macToolFilters
      }
    ]
  },
  portable: {
    artifactName: "SwiftLocal-${version}-portable-${arch}.${ext}"
  },
  nsis: {
    artifactName: "SwiftLocal-${version}-installer-${arch}.${ext}",
    // One-click install: double-click → install → desktop shortcut. Power users can still use portable.
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "快轉通 SwiftLocal",
    uninstallDisplayName: "快轉通 SwiftLocal",
    runAfterFinish: true,
    // Ensure file association keys are written for the installing user.
    menuCategory: false
  },
  dmg: {
    artifactName: "SwiftLocal-${version}-mac-${arch}.${ext}"
  }
};
