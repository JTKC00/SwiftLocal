"use strict";

// Rebuild distributable icons from the selected, traced SVG master.
// Uses the project's existing SVG renderer; no network or tracing dependency.
const fs = require("node:fs");
const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const root = path.resolve(__dirname, "..");
const brand = path.join(root, "frontend", "assets", "brand");

async function png(svg, size, height = size) {
  const canvas = createCanvas(size, height);
  const ctx = canvas.getContext("2d");
  const image = await loadImage(Buffer.from(svg));
  ctx.drawImage(image, 0, 0, size, height);
  return canvas.toBuffer("image/png");
}

async function main() {
  const master = fs.readFileSync(path.join(brand, "mark.svg"), "utf8");
  const [, width, height] = master.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
  const shape = master.match(/<path[\s\S]*\/>/)[0];
  const scale = 720 / height;
  const transform = `translate(${(1024 - width * scale) / 2} 152) scale(${scale})`;
  const white = shape.replace(/fill="[^"]+"/, 'fill="#ffffff"');
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><title>SwiftLocal</title><rect width="1024" height="1024" rx="224" fill="#1f7a68"/><g transform="${transform}">${white}</g></svg>`;
  fs.writeFileSync(path.join(brand, "app-icon.svg"), `${icon}\n`);
  fs.writeFileSync(path.join(brand, "mark-light.svg"), master.replace(/fill="[^"]+"/g, 'fill="#b3ead9"'));
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const images = new Map();
  for (const size of sizes) {
    const buffer = await png(icon, size);
    images.set(size, buffer);
    fs.writeFileSync(path.join(brand, `app-icon-${size}.png`), buffer);
  }
  fs.writeFileSync(path.join(root, "frontend/assets/swiftlocal-logo.png"), images.get(256));
  fs.writeFileSync(path.join(root, "frontend/assets/swiftlocal-logo-source.png"), images.get(1024));
  const transparent = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="${transform}">${shape}</g></svg>`;
  fs.writeFileSync(path.join(brand, "mark.png"), await png(transparent, 1024));
  fs.writeFileSync(path.join(brand, "mark-light.png"), await png(transparent.replace(/fill="[^"]+"/g, 'fill="#b3ead9"'), 1024));
  for (const [theme, markColor, textColor] of [["light", "#1f7a68", "#202b2c"], ["dark", "#b3ead9", "#eef3f0"]]) {
    const lockup = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="144" viewBox="0 0 600 144"><title>快轉通 SwiftLocal</title><g transform="translate(24 20) scale(${104 / height})">${shape.replace(/fill="[^"]+"/, `fill="${markColor}"`)}</g><g fill="${textColor}" font-family="Segoe UI, Microsoft JhengHei, sans-serif"><text x="132" y="72" font-size="48" font-weight="600">SwiftLocal</text><text x="134" y="112" font-size="24">快轉通</text></g></svg>`;
    fs.writeFileSync(path.join(brand, `wordmark-${theme}.svg`), `${lockup}\n`);
    fs.writeFileSync(path.join(brand, `wordmark-${theme}.png`), await png(lockup, 1200, 288));
  }
  // ICO PNG entries preserve alpha and include native small sizes for Windows.
  const icoSizes = sizes.filter((size) => size <= 256);
  const header = Buffer.alloc(6 + icoSizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(icoSizes.length, 4);
  let offset = header.length;
  icoSizes.forEach((size, index) => {
    const at = 6 + index * 16;
    header[at] = header[at + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(images.get(size).length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += images.get(size).length;
  });
  fs.writeFileSync(path.join(root, "build/icon.ico"), Buffer.concat([header, ...icoSizes.map((size) => images.get(size))]));
  const icnsTypes = [["icp4", 16], ["icp5", 32], ["icp6", 64], ["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024]];
  const entries = icnsTypes.map(([type, size]) => {
    const entry = Buffer.alloc(8);
    entry.write(type);
    entry.writeUInt32BE(8 + images.get(size).length, 4);
    return Buffer.concat([entry, images.get(size)]);
  });
  const icnsHeader = Buffer.alloc(8);
  icnsHeader.write("icns");
  icnsHeader.writeUInt32BE(8 + entries.reduce((sum, entry) => sum + entry.length, 0), 4);
  fs.writeFileSync(path.join(root, "build/icon.icns"), Buffer.concat([icnsHeader, ...entries]));
  console.log(`Built SVG, transparent PNG, ${sizes.length} PNG sizes, ICO and ICNS from mark.svg.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
