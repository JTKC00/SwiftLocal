/**
 * Shared settings helpers (localStorage). Safe for toolbox + PDF workspace.
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

  const PREFIX = "swiftlocal.settings.";

  function readSetting(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeSetting(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function removeSetting(key) {
    try {
      localStorage.removeItem(PREFIX + key);
      return true;
    } catch {
      return false;
    }
  }

  return {
    SETTINGS_PREFIX: PREFIX,
    readSetting,
    writeSetting,
    removeSetting
  };
});
