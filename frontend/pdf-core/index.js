/**
 * pdf-core aggregate. Browser: window.SwiftLocalPdfCore
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./viewer"),
      require("./forms"),
      require("./annotations"),
      require("./save"),
      require("./print"),
      require("./compatibility"),
      require("./pages")
    );
  } else {
    const core = root.SwiftLocalPdfCore || {};
    root.SwiftLocalPdfCore = factory(
      core.viewer,
      core.forms,
      core.annotations,
      core.save,
      core.print,
      core.compatibility,
      core.pages
    );
  }
})(typeof self !== "undefined" ? self : this, function (viewer, forms, annotations, save, print, compatibility, pages) {
  "use strict";
  return {
    version: "0.4.0-workspace",
    viewer: viewer || null,
    forms: forms || null,
    annotations: annotations || null,
    save: save || null,
    print: print || null,
    compatibility: compatibility || null,
    pages: pages || null
  };
});
