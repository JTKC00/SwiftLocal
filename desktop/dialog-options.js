"use strict";

/**
 * Build Electron's open-file properties for the shared file-picker bridge.
 * A single-file request must omit `multiSelections` entirely.
 */
function chooseFileDialogProperties(options = {}) {
  const properties = ["openFile"];
  if (options && options.multiple !== false) {
    properties.push("multiSelections");
  }
  return properties;
}

module.exports = {
  chooseFileDialogProperties
};
