/**
 * Platform-neutral path identity helper shared by the PDF workspace browser
 * and Electron preload. It intentionally does not resolve relative paths or
 * touch the filesystem; callers use it only to compare delivery identities.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(typeof globalThis !== "undefined" ? globalThis : null);
  } else {
    root.SwiftLocalCanonicalPath = factory(root);
  }
})(typeof self !== "undefined" ? self : this, function (environment) {
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
    if (typeof process !== "undefined" && process.platform) {
      return process.platform === "win32";
    }
    const navigatorLike = environment && environment.navigator;
    return Boolean(
      navigatorLike && /win/i.test(`${navigatorLike.platform || ""} ${navigatorLike.userAgent || ""}`)
    );
  }

  function decodeFileUrl(value, windows) {
    if (!/^file:/i.test(value) || typeof URL !== "function") return value;
    try {
      const url = new URL(value);
      let pathname = decodeURIComponent(url.pathname || "");
      if (windows) {
        if (url.hostname) pathname = `\\\\${url.hostname}${pathname}`;
        else if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1);
      }
      return pathname || value;
    } catch {
      return value;
    }
  }

  function normalizeWindows(value) {
    const slashed = value.replace(/\//g, "\\");
    // Keep the two leading separators that identify a UNC path. Collapsing
    // them into one would make \\server\share distinct from its own identity.
    if (slashed.startsWith("\\\\")) {
      const body = slashed.slice(2).replace(/\\+/g, "\\");
      return `\\\\${body}`.toLowerCase();
    }
    return slashed.replace(/\\+/g, "\\").toLowerCase();
  }

  function canonicalPathKey(filePath, options) {
    const raw = stripQuotes(filePath);
    if (!raw) return "";
    const windows = isWindows(options);
    const value = decodeFileUrl(raw, windows);
    // On POSIX, a backslash is a legal filename character, not a separator.
    return windows ? normalizeWindows(value) : value;
  }

  return {
    stripQuotes,
    canonicalPathKey
  };
});
