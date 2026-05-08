"use strict";

const shouldSignMac = process.env.SWIFTLOCAL_MAC_SIGN === "1";
const hasNotarizationCredentials = Boolean(
  (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) ||
  (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) ||
  (process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE)
);

module.exports = {
  appId: "com.swiftlocal.converter",
  productName: "快轉通 SwiftLocal",
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
  extraResources: [
    {
      from: "tools",
      to: "tools",
      filter: [
        "**/*"
      ]
    }
  ],
  win: {
    icon: "build/icon.ico",
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
    signAndEditExecutable: false
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
    notarize: shouldSignMac && hasNotarizationCredentials
  },
  portable: {
    artifactName: "SwiftLocal-${version}-portable-${arch}.${ext}"
  },
  nsis: {
    artifactName: "SwiftLocal-${version}-installer-${arch}.${ext}",
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "快轉通 SwiftLocal",
    uninstallDisplayName: "快轉通 SwiftLocal"
  },
  dmg: {
    artifactName: "SwiftLocal-${version}-mac-${arch}.${ext}"
  }
};
