/**
 * Idempotent launch-path delivery shared by the PDF workspace bootstrap and
 * its Node tests. It deliberately tracks only launch requests; regular file
 * opens remain under the workspace's normal tab behavior.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfWorkspaceLaunch = factory();
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
    return false;
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
      return value.replace(/\//g, "\\").replace(/\\+/g, "\\").toLowerCase();
    }
    return value.replace(/\\/g, "/");
  }

  function createPathRequestGate(options) {
    const seen = new Set();
    const queue = [];
    let draining = null;

    async function drain() {
      while (queue.length) {
        const item = queue.shift();
        try {
          await item.open(item.path);
        } catch {
          // The workspace reports the open failure; continue with other
          // distinct launch paths without replaying this one.
        }
      }
    }

    function request(filePath, openPath) {
      if (typeof openPath !== "function") return Promise.resolve(false);
      const path = stripQuotes(filePath);
      const key = canonicalPathKey(path, options);
      if (!key || seen.has(key)) return Promise.resolve(false);
      seen.add(key);
      queue.push({ path, open: openPath });
      if (!draining) {
        draining = drain().finally(() => {
          draining = null;
        });
      }
      return draining.then(() => true);
    }

    return {
      canonicalPathKey: (filePath) => canonicalPathKey(filePath, options),
      request
    };
  }

  return {
    canonicalPathKey,
    createPathRequestGate
  };
});
