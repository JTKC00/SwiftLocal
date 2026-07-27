/**
 * Shared utilities for SwiftLocal toolbox and PDF workspace.
 * Browser: attaches to window.SwiftLocalShared
 * Node tests: require("./index.js") or individual files
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./settings"),
      require("./error-handling"),
      require("./recent-files"),
      require("./file-dialogs")
    );
  } else {
    // Individual scripts may have already populated SwiftLocalShared.
    root.SwiftLocalShared = root.SwiftLocalShared || {};
    factory(
      root.SwiftLocalShared,
      root.SwiftLocalShared,
      root.SwiftLocalShared,
      root.SwiftLocalShared
    );
  }
})(typeof self !== "undefined" ? self : this, function (settings, errors, recent, dialogs) {
  "use strict";
  return Object.assign({}, settings, errors, recent, dialogs);
});
