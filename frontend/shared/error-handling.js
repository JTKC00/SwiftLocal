/**
 * Shared user-facing error formatting (no stack traces in UI).
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

  function formatUserError(error, fallback) {
    if (error == null) return fallback || "發生未知錯誤";
    if (typeof error === "string") {
      const text = error.trim();
      return text || fallback || "發生未知錯誤";
    }
    if (error && typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
    try {
      return String(error);
    } catch {
      return fallback || "發生未知錯誤";
    }
  }

  function isUserCancelled(error) {
    if (!error) return false;
    if (error.cancelled || error.name === "JobCancelledError" || error.name === "AbortError") {
      return true;
    }
    return /任務已取消|user cancelled|aborted/i.test(String(error.message || error));
  }

  return {
    formatUserError,
    isUserCancelled
  };
});
