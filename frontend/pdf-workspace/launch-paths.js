/**
 * Transient launch-path delivery shared by the PDF workspace bootstrap and
 * its Node tests. It deliberately tracks only in-flight launch requests;
 * regular file opens remain under the workspace's normal tab behavior.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SwiftLocalPdfWorkspaceLaunch = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function getCanonicalPathApi() {
    if (typeof window !== "undefined" && window.SwiftLocalCanonicalPath) {
      return window.SwiftLocalCanonicalPath;
    }
    try {
      return require("../shared/canonical-path.js");
    } catch {
      return null;
    }
  }

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

  function canonicalPathKey(filePath, options) {
    const shared = getCanonicalPathApi();
    if (shared && typeof shared.canonicalPathKey === "function") {
      return shared.canonicalPathKey(filePath, options);
    }
    // The shared helper is loaded by the workspace HTML and is available to
    // Node tests. Keep a literal fallback rather than reintroducing a second
    // platform-specific normalization implementation.
    return stripQuotes(filePath);
  }

  function createPathRequestGate(options) {
    const pending = new Set();
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
        } finally {
          pending.delete(item.key);
        }
      }
    }

    function request(filePath, openPath) {
      if (typeof openPath !== "function") return Promise.resolve(false);
      const path = stripQuotes(filePath);
      const key = canonicalPathKey(path, options);
      if (!key || pending.has(key)) return Promise.resolve(false);
      pending.add(key);
      queue.push({ path, key, open: openPath });
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
