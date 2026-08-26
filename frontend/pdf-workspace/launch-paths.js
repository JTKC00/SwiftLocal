/**
 * Transient launch-path delivery shared by the PDF workspace bootstrap and
 * its Node tests. It deliberately tracks only in-flight launch requests;
 * regular file opens remain under the workspace's normal tab behavior.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../shared/path-keys.js"));
  } else {
    root.SwiftLocalPdfWorkspaceLaunch = factory(root.SwiftLocalPathKeys);
  }
})(typeof self !== "undefined" ? self : this, function (pathKeys) {
  "use strict";

  const { stripQuotes, canonicalPathKey } = pathKeys;

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
