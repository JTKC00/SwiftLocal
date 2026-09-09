(function (root) {
  "use strict";

  function escapeCell(value) {
    let text = String(value ?? "");
    // CSV quotes only delimit a cell; they do not stop spreadsheet formulas.
    if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  const api = { escapeCell };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SwiftLocalCsv = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
