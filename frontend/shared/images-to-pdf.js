(function (root) {
  "use strict";

  function accepts(file) {
    return /\.(png|jpe?g)$/i.test(file.name || "");
  }

  async function create(files, { PDFDocument, pageSize = "image", margin = 0, prepare } = {}) {
    files = Array.from(files);
    if (!files.length) throw new Error("請先加入 JPG 或 PNG 圖片。");
    if (!["image", "a4-portrait", "a4-landscape"].includes(pageSize)) throw new Error("不支援的頁面大小。");
    if (!Number.isFinite(margin) || margin < 0 || margin > 72) throw new Error("頁邊距必須介乎 0 至 72 pt。");
    const doc = await PDFDocument.create();
    for (const file of files) {
      if (!accepts(file)) throw new Error(`${file.name}：請使用 JPG 或 PNG 圖片。`);
      try {
        const data = prepare ? await prepare(file) : { bytes: await file.arrayBuffer(), png: /\.png$/i.test(file.name) };
        const img = data.png ? await doc.embedPng(data.bytes) : await doc.embedJpg(data.bytes);
        // Image-sized pages use 96 px per inch; A4 preserves aspect ratio without cropping.
        const [width, height] = pageSize === "image" ? [img.width * 0.75 + margin * 2, img.height * 0.75 + margin * 2]
          : pageSize === "a4-portrait" ? [595.28, 841.89] : [841.89, 595.28];
        const scale = Math.min((width - margin * 2) / img.width, (height - margin * 2) / img.height);
        const page = doc.addPage([width, height]);
        page.drawImage(img, { x: (width - img.width * scale) / 2, y: (height - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
      } catch (error) {
        throw new Error(`${file.name}：未能讀取圖片，請確認檔案完整或重新另存為 JPG／PNG。`, { cause: error });
      }
    }
    return doc.save();
  }

  const api = Object.freeze({ accepts, create });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SwiftLocalImagesToPdf = api;
})(typeof window !== "undefined" ? window : globalThis);
