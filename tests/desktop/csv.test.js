"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { escapeCell } = require("../../frontend/shared/csv");

test("CSV exports keep formula-like JSON headers, values and filenames literal", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", "  =1+1", "\u0001=1+1", "=report.txt"]) {
    assert.equal(escapeCell(value), `'${value}`);
  }
  assert.equal(escapeCell('\t=HYPERLINK("https://example.test")'), '"\'\t=HYPERLINK(""https://example.test"")"');
  assert.equal(escapeCell("\n=1+1"), '"\'\n=1+1"');
});

test("CSV exports preserve ordinary data and escape CSV delimiters", () => {
  assert.equal(escapeCell(null), "");
  assert.equal(escapeCell(123), "123");
  assert.equal(escapeCell("香港"), "香港");
  assert.equal(escapeCell('a,"b"'), '"a,""b"""');
  assert.equal(escapeCell("a\nb"), '"a\nb"');
});
