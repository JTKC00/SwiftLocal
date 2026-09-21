"use strict";
const fs = require("node:fs");
const path = require("node:path");

function configureStorePaths(app, proc = process) {
  if (proc.platform !== "win32" || !proc.windowsStore) throw new Error("Store TEST entrypoint requires an installed Windows package identity");
  const root = path.join(app.getPath("appData"), "SwiftLocal Store TEST");
  const locations = {
    userData: root,
    sessionData: path.join(root, "session"),
    temp: path.join(root, "temp"),
    crashDumps: path.join(root, "crashes"),
    logs: path.join(root, "logs")
  };
  for (const [name, directory] of Object.entries(locations)) {
    fs.mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  proc.env.TEMP = proc.env.TMP = locations.temp;
  proc.env.DENO_DIR = path.join(root, "deno-cache");
  proc.env.XDG_CACHE_HOME = path.join(root, "cache");
  fs.mkdirSync(proc.env.DENO_DIR, { recursive: true });
  fs.mkdirSync(proc.env.XDG_CACHE_HOME, { recursive: true });
  proc.chdir(root);
  return { windowsStore: Boolean(proc.windowsStore), resourcesPath: proc.resourcesPath,
    cwd: proc.cwd(), ...locations, denoCache: proc.env.DENO_DIR, cache: proc.env.XDG_CACHE_HOME };
}
module.exports = { configureStorePaths };
