"use strict";

// Kept as a compatibility entrypoint. Native binaries now come from pinned sources.
const { main } = require("./ensure-native-tools");
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--skip-libreoffice")) {
  console.error("Supported option: --skip-libreoffice");
  process.exitCode = 1;
} else {
  main(["--download", ...(args.includes("--skip-libreoffice") ? [] : ["--full"])]).catch(error => {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
