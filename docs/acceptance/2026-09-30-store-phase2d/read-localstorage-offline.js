"use strict";
// Read bytes only; never open LevelDB or launch a browser. This checkpoint has WALs
// and no SSTables. Refuse other layouts rather than guess or mutate the database.
// Formats: google/leveldb doc/log_format.md and db/write_batch.cc;
// Chromium cached_storage_area.cc StorageFormat UTF16=0 / Latin1=1.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function maskedCrc(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0x82f63b78 : 0);
  }
  crc = (~crc) >>> 0;
  return (((crc >>> 15) | (crc << 17)) + 0xa282ead8) >>> 0;
}
function records(bytes) {
  let offset = 0, fragments = null;
  const result = [];
  while (offset < bytes.length) {
    const blockLeft = 32768 - (offset % 32768);
    if (blockLeft < 7) {
      assert.ok(bytes.subarray(offset, offset + blockLeft).every(byte => byte === 0));
      offset += blockLeft; continue;
    }
    assert.ok(offset + 7 <= bytes.length, "Truncated WAL header");
    const crc = bytes.readUInt32LE(offset), length = bytes.readUInt16LE(offset + 4), type = bytes[offset + 6];
    if (crc === 0 && length === 0 && type === 0) {
      assert.ok(bytes.subarray(offset, Math.min(bytes.length, offset + blockLeft)).every(byte => byte === 0));
      offset += blockLeft; continue;
    }
    assert.ok(length + 7 <= blockLeft && offset + 7 + length <= bytes.length, "Truncated/cross-block WAL record");
    const payload = bytes.subarray(offset + 7, offset + 7 + length);
    assert.equal(maskedCrc(bytes.subarray(offset + 6, offset + 7 + length)), crc, "WAL CRC32C mismatch");
    if (type === 1) { assert.equal(fragments, null); result.push(payload); }
    else if (type === 2) { assert.equal(fragments, null); fragments = [payload]; }
    else if (type === 3) { assert.ok(fragments); fragments.push(payload); }
    else if (type === 4) { assert.ok(fragments); result.push(Buffer.concat([...fragments, payload])); fragments = null; }
    else throw new Error("Unsupported WAL record type");
    offset += 7 + length;
  }
  assert.equal(fragments, null, "Incomplete WAL fragments");
  return result;
}
function batch(bytes) {
  assert.ok(bytes.length >= 12);
  const sequence = bytes.readBigUInt64LE(0), count = bytes.readUInt32LE(8);
  let offset = 12;
  const take = () => {
    let length = 0, shift = 0, byte;
    do {
      assert.ok(offset < bytes.length && shift < 35, "Invalid varint");
      byte = bytes[offset++]; length += (byte & 127) * (2 ** shift); shift += 7;
    } while (byte & 128);
    assert.ok(offset + length <= bytes.length, "Invalid length-prefixed value");
    const value = bytes.subarray(offset, offset + length); offset += length; return value;
  };
  const operations = [];
  for (let i = 0; i < count; i++) {
    assert.ok(offset < bytes.length);
    const type = bytes[offset++]; assert.ok(type === 0 || type === 1);
    const key = take(), value = type === 1 ? take() : null;
    operations.push({ sequence: sequence + BigInt(i), key, value });
  }
  assert.equal(offset, bytes.length, "Unexpected trailing write-batch data");
  return operations;
}
function decode(bytes) {
  assert.ok(bytes.length);
  if (bytes[0] === 1) return bytes.subarray(1).toString("latin1");
  assert.equal(bytes[0], 0, "Unsupported Chromium string encoding");
  assert.equal((bytes.length - 1) % 2, 0);
  return bytes.subarray(1).toString("utf16le");
}
function readLocalStorage(directory, keys) {
  const names = fs.readdirSync(directory);
  assert.ok(!names.some(name => /\.(ldb|sst)$/i.test(name)), "SSTable layout requires a separate read-only decoder; do not launch/open LevelDB");
  const logs = names.filter(name => /^\d+\.log$/.test(name)).sort();
  assert.ok(logs.length, "No localStorage WAL");
  const operations = [], files = [];
  for (const name of logs) {
    const bytes = fs.readFileSync(path.join(directory, name));
    files.push({ name, bytes: bytes.length, sha256: hash(bytes) });
    for (const record of records(bytes)) operations.push(...batch(record));
  }
  operations.sort((a, b) => a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0);
  const state = new Map(), prefix = Buffer.from("_file://\0");
  for (const op of operations) {
    if (!op.key.subarray(0, prefix.length).equals(prefix)) continue;
    const key = decode(op.key.subarray(prefix.length));
    state.set(key, op.value === null ? null : decode(op.value));
  }
  return { method: "read-only CRC32C-checked WAL/write-batch replay, file:// origin, Chromium string decoding; database never opened", files, operations: operations.length,
    values: Object.fromEntries(keys.map(key => [key, state.get(key) ?? null])) };
}
module.exports = { readLocalStorage };
