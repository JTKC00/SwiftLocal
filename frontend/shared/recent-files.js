/**
 * Recent files list (names + optional local paths). Never uploads.
 * Paths may be empty in pure browser mode (File objects are not persistable).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./path-keys.js"));
  } else {
    root.SwiftLocalShared = root.SwiftLocalShared || {};
    Object.assign(root.SwiftLocalShared, factory(root.SwiftLocalPathKeys));
  }
})(typeof self !== "undefined" ? self : this, function (pathKeys) {
  "use strict";

  const STORAGE_KEY = "swiftlocal.recentPdfs";
  const DEFAULT_LIMIT = 12;
  const { canonicalPathKey } = pathKeys;

  function recentFilePathKey(filePath, options) {
    return filePath ? canonicalPathKey(filePath, options) : "";
  }

  function loadRecentFiles(limit, options) {
    const max = Number(limit) > 0 ? Number(limit) : DEFAULT_LIMIT;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      const seenPaths = new Set();
      const result = [];
      for (const item of list) {
        if (!item || typeof item !== "object" || !item.name) continue;
        const pathValue = item.path ? String(item.path) : "";
        const pathKey = recentFilePathKey(pathValue, options);
        if (pathKey && seenPaths.has(pathKey)) continue;
        if (pathKey) seenPaths.add(pathKey);
        result.push({
          name: String(item.name || ""),
          path: pathValue,
          openedAt: item.openedAt ? String(item.openedAt) : ""
        });
        if (result.length >= max) break;
      }
      return result;
    } catch {
      return [];
    }
  }

  function rememberRecentFile(entry, limit, options) {
    const max = Number(limit) > 0 ? Number(limit) : DEFAULT_LIMIT;
    const name = entry && entry.name ? String(entry.name) : "";
    if (!name) return loadRecentFiles(max, options);
    const pathValue = entry && entry.path ? String(entry.path) : "";
    const pathKey = recentFilePathKey(pathValue, options);
    const next = {
      name,
      path: pathValue,
      openedAt: new Date().toISOString()
    };
    const prev = loadRecentFiles(max * 2, options);
    const filtered = prev.filter((item) => {
      if (pathValue && item.path) {
        const itemPathKey = recentFilePathKey(item.path, options);
        if (pathKey && itemPathKey) return itemPathKey !== pathKey;
      }
      return !(item.name === name && !item.path);
    });
    const list = [next, ...filtered].slice(0, max);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore quota
    }
    return list;
  }

  function clearRecentFiles() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return {
    RECENT_FILES_KEY: STORAGE_KEY,
    DEFAULT_RECENT_LIMIT: DEFAULT_LIMIT,
    loadRecentFiles,
    rememberRecentFile,
    clearRecentFiles,
    recentFilePathKey
  };
});
