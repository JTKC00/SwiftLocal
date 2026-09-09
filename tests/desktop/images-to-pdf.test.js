"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument } = require("pdf-lib");
const { createCanvas } = require("@napi-rs/canvas");
const { create } = require("../../frontend/shared/images-to-pdf");

function imageFile(name, width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  const bytes = canvas.toBuffer(name.endsWith("png") ? "image/png" : "image/jpeg");
  return { name, arrayBuffer: async () => bytes };
}

test("mixed PNG/JPEG become one readable PDF, preserving supplied order and aspect ratios", async () => {
  const portrait = imageFile("portrait.png", 80, 160, "red");
  const landscape = imageFile("landscape.jpg", 200, 100, "blue");
  const doc = await PDFDocument.load(await create([landscape, portrait], { PDFDocument }));
  assert.equal(doc.getPageCount(), 2);
  assert.deepEqual(doc.getPages().map(p => p.getSize()), [{ width: 150, height: 75 }, { width: 60, height: 120 }]);
  assert.ok(doc.getPages().every(p => p.node.Contents()));
});

test("A4 orientations and image-size margins produce expected page geometry", async () => {
  const file = imageFile("square.png", 100, 100, "green");
  for (const [pageSize, size] of [["a4-portrait", [595.28, 841.89]], ["a4-landscape", [841.89, 595.28]], ["image", [131.7, 131.7]]]) {
    const doc = await PDFDocument.load(await create([file], { PDFDocument, pageSize, margin: 28.35 }));
    assert.deepEqual([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()], size);
  }
});

test("empty, unsupported and corrupt input fail without returning partial PDF", async () => {
  await assert.rejects(create([], { PDFDocument }), /請先加入/);
  await assert.rejects(create([{ name: "file.pdf" }], { PDFDocument }), /JPG 或 PNG/);
  const good = imageFile("good.png", 10, 10, "white");
  await assert.rejects(create([good, { name: "broken.png", arrayBuffer: async () => Buffer.from("bad") }], { PDFDocument }), /broken.png：未能讀取圖片/);
  await assert.rejects(create([good], { PDFDocument, margin: -1 }), /頁邊距/);
});
