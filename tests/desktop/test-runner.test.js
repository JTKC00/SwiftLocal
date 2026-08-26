"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  spawnResultExitCode
} = require("../../scripts/run-tests");

test("test runner treats spawn errors and null statuses as failures", () => {
  assert.equal(spawnResultExitCode({ error: new Error("missing Python"), status: null }), 1);
  assert.equal(spawnResultExitCode({ status: null }), 1);
  assert.equal(spawnResultExitCode({ status: 2 }), 2);
  assert.equal(spawnResultExitCode({ status: 0 }), 0);
});
