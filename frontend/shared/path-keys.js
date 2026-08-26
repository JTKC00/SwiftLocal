/**
 * Cross-platform path keys used for logical file identity, not filesystem I/O.
 * Windows paths are case-insensitive and use one slash direction; POSIX paths
 * keep case significant and preserve backslashes as filename characters.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPathKeys = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function stripQuotes(raw) {
    let value = String(raw || "").trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }
    return value;
  }

  function isWindows(options) {
    if (options && options.platform) return options.platform === "win32";
    if (typeof navigator !== "undefined") {
      return /win/i.test(`${navigator.platform || ""} ${navigator.userAgent || ""}`);
    }
    if (typeof process !== "undefined" && process.platform) {
      return process.platform === "win32";
    }
    return false;
  }

  function normalizeWindowsPathKey(value) {
    const normalized = value.replace(/\//g, "\\");
    const unc = normalized.startsWith("\\\\");
    const body = unc ? normalized.replace(/^\\+/, "") : normalized;
    const prefix = unc ? "\\\\" : "";
    return `${prefix}${body.replace(/\\+/g, "\\")}`.toLowerCase();
  }

  function canonicalPathKey(filePath, options) {
    let value = stripQuotes(filePath);
    if (!value) return "";

    const windows = isWindows(options);
    if (/^file:/i.test(value) && typeof URL === "function") {
      try {
        const url = new URL(value);
        let pathname = decodeURIComponent(url.pathname || "");
        if (windows) {
          if (url.hostname) pathname = `\\\\${url.hostname}${pathname}`;
          else if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1);
        }
        value = pathname || value;
      } catch {
        // Keep the original path for the comparison fallback.
      }
    }

    if (windows) {
      return normalizeWindowsPathKey(value);
    }
    return value;
  }

  return {
    stripQuotes,
    isWindows,
    canonicalPathKey
  };
});
