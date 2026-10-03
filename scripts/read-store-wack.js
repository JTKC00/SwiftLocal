"use strict";
const fs = require("node:fs");
const crypto = require("node:crypto");
const { DOMParser } = require("@xmldom/xmldom");
const identity = require("../build/store/identity");

function summarizeWack(xml) {
  const invalid = message => { throw new Error(`Invalid WACK report: ${message}`); };
  const document = new DOMParser({ errorHandler: { warning: invalid, error: invalid, fatalError: invalid } }).parseFromString(xml, "text/xml");
  const root = document.documentElement;
  if (root?.tagName !== "REPORT" || root.getAttribute("APP_NAME") !== identity.identityName
      || root.getAttribute("APP_VERSION") !== identity.packageVersion) invalid("unexpected package identity/version");
  const tests = Array.from(root.getElementsByTagName("TEST"), test => ({
    name: test.getAttribute("NAME"), optional: test.getAttribute("OPTIONAL") === "TRUE",
    result: test.getElementsByTagName("RESULT")[0]?.textContent.trim() || "UNKNOWN",
    messages: Array.from(test.getElementsByTagName("MESSAGE"), message => message.getAttribute("TEXT"))
  }));
  const required = tests.filter(test => !test.optional);
  const pass = root.getAttribute("OVERALL_RESULT") === "PASS" && root.getAttribute("PARTIAL_RUN") === "FALSE"
    && required.length > 0 && required.every(test => test.result === "PASS");
  return { status: pass ? "PASS" : "FAIL", overallResult: root.getAttribute("OVERALL_RESULT"),
    partialRun: root.getAttribute("PARTIAL_RUN"), kitVersion: root.getAttribute("VERSION"),
    os: root.getAttribute("OS"), requiredTests: required.length,
    optionalFailures: tests.filter(test => test.optional && test.result !== "PASS").length,
    reportSha256: crypto.createHash("sha256").update(xml).digest("hex"), tests };
}
if (require.main === module) {
  try {
    const summary = summarizeWack(fs.readFileSync(process.argv[2], "utf8"));
    fs.writeFileSync(process.argv[3], JSON.stringify(summary, null, 2) + "\n");
    console.log(`WACK ${summary.status}; ${summary.requiredTests} required tests; ${summary.optionalFailures} optional failures. See ${process.argv[3]}`);
    if (summary.status !== "PASS") process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { summarizeWack };
