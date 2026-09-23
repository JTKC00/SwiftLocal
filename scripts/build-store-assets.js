"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const root = path.resolve(__dirname, "..");
const sizes = { "StoreLogo.png": [50, 50], "Square150x150Logo.png": [150, 150],
  "Square44x44Logo.png": [44, 44], "Wide310x150Logo.png": [310, 150] };
async function main() {
  const source = fs.readFileSync(path.join(root, "frontend/assets/brand/app-icon.svg"));
  const icon = await loadImage(source);
  const output = path.join(root, "build/store/appx");
  fs.mkdirSync(output, { recursive: true });
  const receipt = { source: "frontend/assets/brand/app-icon.svg", sourceSha256: crypto.createHash("sha256").update(source).digest("hex"), assets: {} };
  for (const [name, [width, height]] of Object.entries(sizes)) {
    const canvas = createCanvas(width, height); const context = canvas.getContext("2d");
    context.fillStyle = "#1f7a68"; context.fillRect(0, 0, width, height);
    const side = Math.min(width, height); context.drawImage(icon, (width - side) / 2, 0, side, side);
    const png = canvas.toBuffer("image/png"); fs.writeFileSync(path.join(output, name), png);
    receipt.assets[name] = { width, height, sha256: crypto.createHash("sha256").update(png).digest("hex") };
  }
  fs.writeFileSync(path.join(root, "build/store/assets-receipt.json"), JSON.stringify(receipt, null, 2));
  console.log("Generated four Store assets from the existing SVG master");
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { sizes, main };
