/**
 * Recent files list (names + optional local paths). Never uploads.
 * Paths may be empty in pure browser mode (File objects are not persistable).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalShared = root.SwiftLocalShared || {};
    Object.assign(root.SwiftLocalShared, factory());
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "swiftlocal.recentPdfs";
  const DEFAULT_LIMIT = 12;

  function loadRecentFiles(limit) {
    const max = Number(limit) > 0 ? Number(limit) : DEFAULT_LIMIT;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list
        .filter((item) => item && typeof item === "object" && item.name)
        .slice(0, max)
        .map((item) => ({
          name: String(item.name || ""),
          path: item.path ? String(item.path) : "",
          openedAt: item.openedAt ? String(item.openedAt) : ""
        }));
    } catch {
      return [];
    }
  }

  function rememberRecentFile(entry, limit) {
    const max = Number(limit) > 0 ? Number(limit) : DEFAULT_LIMIT;
    const name = entry && entry.name ? String(entry.name) : "";
    if (!name) return loadRecentFiles(max);
    const pathValue = entry && entry.path ? String(entry.path) : "";
    const next = {
      name,
      path: pathValue,
      openedAt: new Date().toISOString()
    };
    const prev = loadRecentFiles(max * 2);
    const filtered = prev.filter((item) => {
      if (pathValue && item.path) return item.path !== pathValue;
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
    clearRecentFiles
  };
});
