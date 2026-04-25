(function () {
  "use strict";

  const state = {
    activePanel: "image-panel",
    imageDownloads: [],
    pdfDownloads: [],
    dataMode: "json-format",
    textMode: "base64-encode",
    zipUrl: null,
    zipName: "",
    diffText: "",
    splitDownloads: [],
    backendFiles: [],
    backendConfig: { toolPaths: {} },
    backendConnected: false,
    backendPollTimer: null,
    hashRows: [],
    renameRows: []
  };

  const titles = {
    "image-panel": "圖片轉換",
    "pdf-panel": "PDF 處理",
    "data-panel": "資料格式",
    "text-panel": "文字編碼",
    "hash-panel": "檔案雜湊",
    "zip-panel": "ZIP 壓縮",
    "diff-panel": "文字比對",
    "split-panel": "檔案切割",
    "rename-panel": "批量改名",
    "backend-panel": "本地後端"
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const CRC_TABLE = createCrcTable();
  const BACKEND_API_BASE = "http://127.0.0.1:8787/api";
  const BACKEND_ORIGIN = "http://127.0.0.1:8787";
  let pdfjsPromise = null;

  function init() {
    bindNavigation();
    bindImageTool();
    bindPdfTool();
    bindDataTool();
    bindTextTool();
    bindHashTool();
    bindZipTool();
    bindDiffTool();
    bindSplitTool();
    bindRenameTool();
    bindBackendTool();
    bindGlobalActions();
  }

  function bindNavigation() {
    $$(".nav-item").forEach((button) => {
      button.addEventListener("click", () => {
        const panelId = button.dataset.panel;
        state.activePanel = panelId;
        $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item === button));
        $$(".panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === panelId));
        $("#panel-title").textContent = titles[panelId] || "快轉通 SwiftLocal";
      });
    });
  }

  function bindGlobalActions() {
    $("#clear-all").addEventListener("click", () => clearPanel(state.activePanel));
    $$("[data-clear-panel]").forEach((button) => {
      button.addEventListener("click", () => clearPanel(button.dataset.clearPanel));
    });
  }

  function clearPanel(panelId) {
    if (panelId === "image-panel") {
      revokeImageUrls();
      $("#image-form").reset();
      $("#image-keep-ratio").checked = true;
      $("#image-quality").value = "0.85";
      $("#quality-output").textContent = "85%";
      setEmpty("#image-results", "尚未產生檔案");
      $("#download-all-images").disabled = true;
    }
    if (panelId === "pdf-panel") {
      revokePdfUrls();
      $("#pdf-form").reset();
      $("#pdf-output-name").value = "swiftlocal-output.pdf";
      $("#pdf-watermark-opacity").value = "0.25";
      $("#pdf-watermark-opacity-output").textContent = "25%";
      setEmpty("#pdf-results", "尚未產生 PDF");
      $("#download-all-pdfs").disabled = true;
      updatePdfControls();
    }
    if (panelId === "data-panel") {
      $("#data-input").value = "";
      $("#data-output").value = "";
      setStatus("#data-status", "待處理");
    }
    if (panelId === "text-panel") {
      $("#text-input").value = "";
      $("#text-output").value = "";
      $("#text-count").textContent = "0 字元";
    }
    if (panelId === "hash-panel") {
      $("#hash-form").reset();
      state.hashRows = [];
      setEmpty("#hash-results", "尚未計算");
      $("#download-hash-csv").disabled = true;
    }
    if (panelId === "zip-panel") {
      revokeZipUrl();
      $("#zip-form").reset();
      $("#zip-name").value = "swiftlocal-files.zip";
      setStatus("#zip-status", "待處理");
      setEmpty("#zip-results", "尚未建立壓縮檔");
      $("#download-zip").disabled = true;
    }
    if (panelId === "diff-panel") {
      $("#diff-form").reset();
      state.diffText = "";
      setStatus("#diff-status", "待處理");
      setEmpty("#diff-output", "尚未比對");
      $("#download-diff-output").disabled = true;
    }
    if (panelId === "split-panel") {
      revokeSplitUrls();
      $("#split-form").reset();
      $("#split-size").value = "10";
      $("#split-unit").value = "1048576";
      setStatus("#split-status", "待處理");
      setEmpty("#split-results", "尚未產生分割檔");
      $("#download-all-parts").disabled = true;
    }
    if (panelId === "rename-panel") {
      $("#rename-form").reset();
      $("#rename-pattern").value = "{name}_{n}.{ext}";
      $("#rename-start").value = "1";
      $("#rename-pad").value = "3";
      state.renameRows = [];
      setEmpty("#rename-results", "尚未產生預覽");
      $("#download-rename-script").disabled = true;
    }
    if (panelId === "backend-panel") {
      state.backendFiles = [];
      $("#backend-files").value = "";
      renderBackendSelectedFiles();
      renderBackendJobs([]);
      setStatus("#backend-status", state.backendConnected ? "已連線" : "FastAPI 未連線");
    }
  }

  function bindImageTool() {
    $("#image-quality").addEventListener("input", (event) => {
      const percent = Math.round(Number(event.target.value) * 100);
      $("#quality-output").textContent = `${percent}%`;
    });

    $("#image-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from($("#image-files").files || []);
      if (!files.length) {
        setEmpty("#image-results", "請先選擇圖片");
        return;
      }

      revokeImageUrls();
      const container = $("#image-results");
      container.classList.remove("empty");
      container.textContent = "";

      const format = $("#image-format").value;
      const quality = Number($("#image-quality").value);
      const maxWidth = Number($("#image-width").value) || null;
      const maxHeight = Number($("#image-height").value) || null;
      const keepRatio = $("#image-keep-ratio").checked;
      const rotation = Number($("#image-rotate").value) || 0;
      const flip = $("#image-flip").value;
      const watermarkText = $("#image-watermark").value.trim();
      const watermarkPosition = $("#image-watermark-position").value;
      const outputExt = extensionFromMime(format);

      for (const file of files) {
        try {
          const converted = await convertImage(file, {
            format,
            quality,
            maxWidth,
            maxHeight,
            keepRatio,
            rotation,
            flip,
            watermarkText,
            watermarkPosition
          });
          const url = URL.createObjectURL(converted.blob);
          const outputName = `${stripExtension(file.name)}.${outputExt}`;
          state.imageDownloads.push({ url, name: outputName });
          container.appendChild(renderImageResult(file, converted, url, outputName));
        } catch (error) {
          container.appendChild(renderErrorItem(file.name, readableError(error)));
        }
      }

      $("#download-all-images").disabled = state.imageDownloads.length === 0;
    });

    $("#download-all-images").addEventListener("click", () => {
      state.imageDownloads.forEach((item, index) => {
        window.setTimeout(() => triggerDownload(item.url, item.name), index * 180);
      });
    });
  }

  async function convertImage(file, options) {
    const bitmap = await createImageBitmap(file);
    const size = resolveImageSize(bitmap.width, bitmap.height, options.maxWidth, options.maxHeight, options.keepRatio);
    const canvas = document.createElement("canvas");
    const rotatedSideways = options.rotation === 90 || options.rotation === 270;
    canvas.width = rotatedSideways ? size.height : size.width;
    canvas.height = rotatedSideways ? size.width : size.height;
    const context = canvas.getContext("2d", { alpha: options.format !== "image/jpeg" });

    if (!context) {
      throw new Error("瀏覽器無法建立圖片畫布");
    }

    if (options.format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawTransformedImage(context, bitmap, size, canvas, options);
    if (options.watermarkText) {
      drawWatermark(context, canvas, options.watermarkText, options.watermarkPosition);
    }
    bitmap.close();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("這個輸出格式不受目前瀏覽器支援"));
        }
      }, options.format, options.quality);
    });

    return { blob, width: canvas.width, height: canvas.height };
  }

  function drawTransformedImage(context, bitmap, size, canvas, options) {
    const flipX = options.flip === "horizontal" || options.flip === "both";
    const flipY = options.flip === "vertical" || options.flip === "both";

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((options.rotation * Math.PI) / 180);
    context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    context.drawImage(bitmap, -size.width / 2, -size.height / 2, size.width, size.height);
    context.restore();
  }

  function drawWatermark(context, canvas, text, position) {
    const margin = Math.max(18, Math.round(Math.min(canvas.width, canvas.height) * 0.035));
    const fontSize = Math.max(18, Math.round(Math.min(canvas.width, canvas.height) * 0.055));
    context.save();
    context.font = `700 ${fontSize}px "Segoe UI", "Noto Sans TC", Arial, sans-serif`;
    context.textBaseline = "middle";
    const metrics = context.measureText(text);
    const boxWidth = metrics.width + margin * 1.2;
    const boxHeight = fontSize * 1.75;
    let x = canvas.width - margin - boxWidth / 2;
    let y = canvas.height - margin - boxHeight / 2;

    if (position === "sw") {
      x = margin + boxWidth / 2;
    }
    if (position === "ne") {
      y = margin + boxHeight / 2;
    }
    if (position === "nw") {
      x = margin + boxWidth / 2;
      y = margin + boxHeight / 2;
    }
    if (position === "center") {
      x = canvas.width / 2;
      y = canvas.height / 2;
    }

    context.fillStyle = "rgba(0, 0, 0, 0.42)";
    roundRect(context, x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, 8);
    context.fill();
    context.fillStyle = "rgba(255, 255, 255, 0.92)";
    context.textAlign = "center";
    context.fillText(text, x, y);
    context.restore();
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function resolveImageSize(width, height, maxWidth, maxHeight, keepRatio) {
    if (!maxWidth && !maxHeight) {
      return { width, height };
    }

    if (!keepRatio) {
      return {
        width: maxWidth || width,
        height: maxHeight || height
      };
    }

    const widthRatio = maxWidth ? maxWidth / width : Infinity;
    const heightRatio = maxHeight ? maxHeight / height : Infinity;
    const ratio = Math.min(widthRatio, heightRatio, 1);
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function renderImageResult(file, converted, url, outputName) {
    const item = document.createElement("div");
    item.className = "result-item";

    const preview = document.createElement("img");
    preview.src = url;
    preview.alt = outputName;

    const meta = document.createElement("div");
    meta.className = "result-meta";
    meta.innerHTML = `<strong>${escapeHtml(outputName)}</strong><span>${formatBytes(file.size)} → ${formatBytes(converted.blob.size)} · ${converted.width}×${converted.height}</span>`;

    const link = document.createElement("a");
    link.className = "secondary-button compact";
    link.href = url;
    link.download = outputName;
    link.textContent = "下載";

    item.append(preview, meta, link);
    return item;
  }

  function renderErrorItem(name, message) {
    const item = document.createElement("div");
    item.className = "result-item";
    item.innerHTML = `<span></span><div class="result-meta"><strong>${escapeHtml(name)}</strong><span class="error">${escapeHtml(message)}</span></div>`;
    return item;
  }

  function revokeImageUrls() {
    state.imageDownloads.forEach((item) => URL.revokeObjectURL(item.url));
    state.imageDownloads = [];
  }

  function bindPdfTool() {
    $("#pdf-mode").addEventListener("change", updatePdfControls);
    $("#pdf-watermark-opacity").addEventListener("input", (event) => {
      $("#pdf-watermark-opacity-output").textContent = `${Math.round(Number(event.target.value) * 100)}%`;
    });

    $("#pdf-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from($("#pdf-files").files || []);
      const mode = $("#pdf-mode").value;
      if (!files.length) {
        setEmpty("#pdf-results", "請先選擇 PDF");
        return;
      }
      if (!window.PDFLib) {
        setEmpty("#pdf-results", "PDF 函式庫未載入，請確認 vendor/pdf-lib.min.js 存在");
        return;
      }

      revokePdfUrls();
      const container = $("#pdf-results");
      container.classList.remove("empty");
      container.textContent = "處理中...";
      $("#download-all-pdfs").disabled = true;

      try {
        const results = await runPdfTool(mode, files);
        container.textContent = "";
        results.forEach((result) => {
          const url = URL.createObjectURL(result.blob);
          state.pdfDownloads.push({ url, name: result.name });
          container.appendChild(renderFileResult(fileLabelFromName(result.name), result.name, result.blob.size, url));
        });
        $("#download-all-pdfs").disabled = state.pdfDownloads.length === 0;
      } catch (error) {
        container.textContent = "";
        container.appendChild(renderErrorItem(files[0].name, readableError(error)));
      }
    });

    $("#download-all-pdfs").addEventListener("click", () => {
      state.pdfDownloads.forEach((item, index) => {
        window.setTimeout(() => triggerDownload(item.url, item.name), index * 180);
      });
    });

    updatePdfControls();
  }

  function updatePdfControls() {
    const mode = $("#pdf-mode").value;
    const showRange = mode === "extract" || mode === "rotate" || mode === "watermark" || mode === "text" || mode === "images";
    const showRotation = mode === "rotate";
    const showWatermark = mode === "watermark";
    const showImages = mode === "images";
    $(".pdf-range-controls").style.display = showRange ? "" : "none";
    $("#pdf-rotation").closest("label").style.display = showRotation ? "" : "none";
    $(".pdf-watermark-controls").style.display = showWatermark ? "" : "none";
    $(".pdf-image-controls").style.display = showImages ? "" : "none";
  }

  async function runPdfTool(mode, files) {
    if (mode === "merge") {
      return [await mergePdfs(files)];
    }
    if (mode === "split") {
      return splitPdf(files[0]);
    }
    if (mode === "extract") {
      return [await extractPdf(files[0])];
    }
    if (mode === "rotate") {
      return [await rotatePdf(files[0])];
    }
    if (mode === "watermark") {
      return [await watermarkPdf(files[0])];
    }
    if (mode === "text") {
      return [await extractPdfText(files[0])];
    }
    if (mode === "images") {
      return renderPdfImages(files[0]);
    }
    throw new Error("未知 PDF 模式");
  }

  async function mergePdfs(files) {
    const { PDFDocument } = window.PDFLib;
    const output = await PDFDocument.create();
    for (const file of files) {
      const input = await PDFDocument.load(await file.arrayBuffer());
      const copiedPages = await output.copyPages(input, input.getPageIndices());
      copiedPages.forEach((page) => output.addPage(page));
    }
    return makePdfResult(output, normalizePdfName($("#pdf-output-name").value || "merged.pdf"));
  }

  async function splitPdf(file) {
    const { PDFDocument } = window.PDFLib;
    const input = await PDFDocument.load(await file.arrayBuffer());
    const pageCount = input.getPageCount();
    if (pageCount > 300) {
      throw new Error("逐頁分割最多支援 300 頁，請先抽頁縮小範圍");
    }

    const base = stripExtension(file.name);
    const digits = String(pageCount).length;
    const results = [];
    for (let index = 0; index < pageCount; index += 1) {
      const output = await PDFDocument.create();
      const [page] = await output.copyPages(input, [index]);
      output.addPage(page);
      const pageName = `${base}_page_${String(index + 1).padStart(Math.max(3, digits), "0")}.pdf`;
      results.push(await makePdfResult(output, pageName));
    }
    return results;
  }

  async function extractPdf(file) {
    const { PDFDocument } = window.PDFLib;
    const input = await PDFDocument.load(await file.arrayBuffer());
    const pageIndexes = parsePageRanges($("#pdf-pages").value, input.getPageCount());
    const output = await PDFDocument.create();
    const pages = await output.copyPages(input, pageIndexes);
    pages.forEach((page) => output.addPage(page));
    return makePdfResult(output, normalizePdfName($("#pdf-output-name").value || `${stripExtension(file.name)}_extract.pdf`));
  }

  async function rotatePdf(file) {
    const { PDFDocument, degrees } = window.PDFLib;
    const input = await PDFDocument.load(await file.arrayBuffer());
    const pageIndexes = parsePageRanges($("#pdf-pages").value, input.getPageCount());
    const rotation = Number($("#pdf-rotation").value) || 90;
    pageIndexes.forEach((index) => {
      const page = input.getPage(index);
      const current = page.getRotation().angle || 0;
      page.setRotation(degrees((current + rotation) % 360));
    });
    return makePdfResult(input, normalizePdfName($("#pdf-output-name").value || `${stripExtension(file.name)}_rotated.pdf`));
  }

  async function watermarkPdf(file) {
    const { PDFDocument, StandardFonts, degrees, rgb } = window.PDFLib;
    const input = await PDFDocument.load(await file.arrayBuffer());
    const pageIndexes = parsePageRanges($("#pdf-pages").value, input.getPageCount());
    const text = $("#pdf-watermark-text").value.trim();
    if (!text) {
      throw new Error("請輸入浮水印文字");
    }
    const opacity = Number($("#pdf-watermark-opacity").value) || 0.25;
    const font = await input.embedFont(StandardFonts.HelveticaBold);

    pageIndexes.forEach((index) => {
      const page = input.getPage(index);
      const { width, height } = page.getSize();
      const size = Math.max(24, Math.min(width, height) * 0.08);
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: height / 2,
        size,
        font,
        color: rgb(0.35, 0.35, 0.35),
        opacity,
        rotate: degrees(-30)
      });
    });

    return makePdfResult(input, normalizePdfName($("#pdf-output-name").value || `${stripExtension(file.name)}_watermark.pdf`));
  }

  async function extractPdfText(file) {
    const pdfjs = await loadPdfJs();
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument(createPdfJsDocumentOptions(data)).promise;
    const pageIndexes = parsePageRanges($("#pdf-pages").value, pdf.numPages);
    const sections = [];

    for (const index of pageIndexes) {
      const page = await pdf.getPage(index + 1);
      const textContent = await page.getTextContent();
      const lines = textItemsToLines(textContent.items);
      sections.push([`--- Page ${index + 1} ---`, ...lines].join("\n"));
    }

    const text = sections.join("\n\n");
    const name = normalizeExtension($("#pdf-output-name").value || `${stripExtension(file.name)}.txt`, "txt");
    return {
      name,
      blob: new Blob([text], { type: "text/plain;charset=utf-8" })
    };
  }

  async function renderPdfImages(file) {
    const pdfjs = await loadPdfJs();
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument(createPdfJsDocumentOptions(data)).promise;
    const pageIndexes = parsePageRanges($("#pdf-pages").value, pdf.numPages);
    if (pageIndexes.length > 100) {
      throw new Error("PDF 轉圖片一次最多處理 100 頁，請指定較小頁碼範圍");
    }

    const mime = $("#pdf-image-format").value;
    const scale = Number($("#pdf-image-scale").value) || 1.5;
    const ext = extensionFromMime(mime);
    const baseName = stripExtension(file.name);
    const results = [];

    for (const index of pageIndexes) {
      const page = await pdf.getPage(index + 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: mime !== "image/jpeg" });
      if (!context) {
        throw new Error("瀏覽器無法建立 PDF 渲染畫布");
      }
      if (mime === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvasToBlob(canvas, mime, 0.9);
      results.push({
        name: `${baseName}_page_${String(index + 1).padStart(3, "0")}.${ext}`,
        blob
      });
    }
    return results;
  }

  async function makePdfResult(pdfDoc, name) {
    const bytes = await pdfDoc.save();
    return {
      name: normalizePdfName(name),
      blob: new Blob([bytes], { type: "application/pdf" })
    };
  }

  function parsePageRanges(value, pageCount) {
    const text = value.trim();
    if (!text) {
      return Array.from({ length: pageCount }, (_, index) => index);
    }

    const indexes = new Set();
    text.split(",").forEach((part) => {
      const token = part.trim();
      if (!token) {
        return;
      }
      const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (start > end) {
          throw new Error(`頁碼範圍不正確：${token}`);
        }
        for (let page = start; page <= end; page += 1) {
          addPageIndex(indexes, page, pageCount);
        }
        return;
      }
      addPageIndex(indexes, Number(token), pageCount);
    });

    if (!indexes.size) {
      throw new Error("請輸入有效頁碼");
    }
    return Array.from(indexes).sort((a, b) => a - b);
  }

  function addPageIndex(indexes, pageNumber, pageCount) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw new Error(`頁碼超出範圍：${pageNumber}`);
    }
    indexes.add(pageNumber - 1);
  }

  function normalizePdfName(name) {
    const clean = sanitizeZipName(name || "swiftlocal-output.pdf");
    return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean}.pdf`;
  }

  function normalizeExtension(name, extension) {
    const clean = sanitizeZipName(name || `swiftlocal-output.${extension}`);
    return clean.toLowerCase().endsWith(`.${extension}`) ? clean : `${clean}.${extension}`;
  }

  async function loadPdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import("./vendor/pdfjs/pdf.min.mjs").then((module) => {
        module.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.min.mjs";
        return module;
      });
    }
    return pdfjsPromise;
  }

  function createPdfJsDocumentOptions(data) {
    return {
      data,
      cMapUrl: "./vendor/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "./vendor/pdfjs/standard_fonts/",
      wasmUrl: "./vendor/pdfjs/wasm/"
    };
  }

  function fileLabelFromName(name) {
    const ext = (name.split(".").pop() || "FILE").slice(0, 4).toUpperCase();
    return ext || "FILE";
  }

  function textItemsToLines(items) {
    const lines = [];
    let currentY = null;
    let currentLine = [];
    items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (currentY !== null && Math.abs(y - currentY) > 2) {
        lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
        currentLine = [];
      }
      currentY = y;
      if (item.str && item.str.trim()) {
        currentLine.push(item.str);
      }
    });
    if (currentLine.length) {
      lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
    }
    return lines.filter(Boolean);
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("無法輸出圖片"));
        }
      }, mime, quality);
    });
  }

  function renderFileResult(label, name, size, url) {
    const item = document.createElement("div");
    item.className = "result-item file-result";
    item.innerHTML = [
      `<span class="file-icon">${escapeHtml(label)}</span>`,
      `<div class="result-meta"><strong>${escapeHtml(name)}</strong><span>${formatBytes(size)}</span></div>`
    ].join("");

    const link = document.createElement("a");
    link.className = "secondary-button compact";
    link.href = url;
    link.download = name;
    link.textContent = "下載";
    item.appendChild(link);
    return item;
  }

  function revokePdfUrls() {
    state.pdfDownloads.forEach((item) => URL.revokeObjectURL(item.url));
    state.pdfDownloads = [];
  }

  function bindDataTool() {
    $$("[data-data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.dataMode = button.dataset.dataMode;
        $$("[data-data-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
      });
    });

    $("#data-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = $("#data-input").value;
      try {
        const output = runDataTool(input);
        $("#data-output").value = output;
        setStatus("#data-status", "完成");
      } catch (error) {
        $("#data-output").value = "";
        setStatus("#data-status", "錯誤");
        alert(readableError(error));
      }
    });

    $("#copy-data-output").addEventListener("click", () => copyText($("#data-output").value));
    $("#download-data-output").addEventListener("click", () => {
      const ext = dataOutputExtension();
      downloadText($("#data-output").value, `data-output.${ext}`);
    });
  }

  function dataOutputExtension() {
    if (state.dataMode === "json-csv") {
      return "csv";
    }
    if (state.dataMode === "json-xml") {
      return "xml";
    }
    if (state.dataMode === "xml-json" || state.dataMode === "json-format" || state.dataMode === "json-minify" || state.dataMode === "csv-json") {
      return "json";
    }
    return "txt";
  }

  function runDataTool(input) {
    if (state.dataMode === "json-format") {
      return JSON.stringify(JSON.parse(input), null, Number($("#json-indent").value));
    }
    if (state.dataMode === "json-minify") {
      return JSON.stringify(JSON.parse(input));
    }
    if (state.dataMode === "csv-json") {
      return JSON.stringify(csvToJson(input), null, Number($("#json-indent").value));
    }
    if (state.dataMode === "json-csv") {
      return jsonToCsv(JSON.parse(input));
    }
    if (state.dataMode === "xml-json") {
      return JSON.stringify(xmlToJson(input), null, Number($("#json-indent").value));
    }
    if (state.dataMode === "json-xml") {
      return jsonToXml(JSON.parse(input));
    }
    throw new Error("未知資料模式");
  }

  function csvToJson(text) {
    const delimiter = resolveDelimiter(text);
    const rows = parseCsv(text, delimiter).filter((row) => row.some((cell) => cell.trim() !== ""));
    if (!rows.length) {
      return [];
    }
    const headers = rows[0].map((header, index) => header.trim() || `column_${index + 1}`);
    return rows.slice(1).map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index] ?? "";
      });
      return item;
    });
  }

  function jsonToCsv(value) {
    const rows = Array.isArray(value) ? value : [value];
    const objects = rows.map((row) => {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        return row;
      }
      return { value: row };
    });
    const headers = Array.from(new Set(objects.flatMap((row) => Object.keys(row))));
    const csvRows = [headers.map(escapeCsvCell).join(",")];
    objects.forEach((row) => {
      csvRows.push(headers.map((header) => escapeCsvCell(normalizeCsvValue(row[header]))).join(","));
    });
    return csvRows.join("\r\n");
  }

  function parseCsv(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"' && quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") {
          index += 1;
        }
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    row.push(cell);
    rows.push(row);
    return rows;
  }

  function resolveDelimiter(text) {
    const selected = $("#csv-delimiter").value;
    if (selected !== "auto") {
      return selected;
    }
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const candidates = [",", ";", "\t"];
    return candidates
      .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
      .sort((a, b) => b.count - a.count)[0].delimiter;
  }

  function xmlToJson(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      throw new Error("XML 格式無法解析");
    }
    const root = doc.documentElement;
    return { [root.nodeName]: xmlElementToObject(root) };
  }

  function xmlElementToObject(element) {
    const attributes = Array.from(element.attributes || []);
    const childElements = Array.from(element.children || []);
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
      .map((node) => node.nodeValue.trim())
      .filter(Boolean)
      .join(" ");

    if (!attributes.length && !childElements.length) {
      return text;
    }

    const result = {};
    if (attributes.length) {
      result["@attributes"] = Object.fromEntries(attributes.map((attr) => [attr.name, attr.value]));
    }
    childElements.forEach((child) => {
      const value = xmlElementToObject(child);
      if (Object.prototype.hasOwnProperty.call(result, child.nodeName)) {
        if (!Array.isArray(result[child.nodeName])) {
          result[child.nodeName] = [result[child.nodeName]];
        }
        result[child.nodeName].push(value);
      } else {
        result[child.nodeName] = value;
      }
    });
    if (text) {
      result["#text"] = text;
    }
    return result;
  }

  function jsonToXml(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return buildXmlElement("root", value, 0);
    }
    const keys = Object.keys(value);
    if (keys.length === 1) {
      return buildXmlElement(sanitizeXmlName(keys[0]), value[keys[0]], 0);
    }
    return buildXmlElement("root", value, 0);
  }

  function buildXmlElement(name, value, level) {
    const indent = "  ".repeat(level);
    const safeName = sanitizeXmlName(name);

    if (Array.isArray(value)) {
      return value.map((item) => buildXmlElement(safeName, item, level)).join("\n");
    }
    if (value === null || value === undefined) {
      return `${indent}<${safeName}/>`;
    }
    if (typeof value !== "object") {
      return `${indent}<${safeName}>${escapeXml(value)}</${safeName}>`;
    }

    const attributes = value["@attributes"] && typeof value["@attributes"] === "object" ? value["@attributes"] : {};
    const attributeText = Object.entries(attributes)
      .map(([key, attrValue]) => ` ${sanitizeXmlName(key)}="${escapeXml(attrValue)}"`)
      .join("");
    const childKeys = Object.keys(value).filter((key) => key !== "@attributes" && key !== "#text");
    const text = value["#text"];

    if (!childKeys.length && (text === undefined || text === null || text === "")) {
      return `${indent}<${safeName}${attributeText}/>`;
    }
    if (!childKeys.length) {
      return `${indent}<${safeName}${attributeText}>${escapeXml(text)}</${safeName}>`;
    }

    const children = childKeys.map((key) => buildXmlElement(key, value[key], level + 1)).join("\n");
    const textLine = text === undefined || text === null || text === "" ? "" : `\n${"  ".repeat(level + 1)}${escapeXml(text)}`;
    return `${indent}<${safeName}${attributeText}>${textLine}\n${children}\n${indent}</${safeName}>`;
  }

  function bindTextTool() {
    $$("[data-text-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.textMode = button.dataset.textMode;
        $$("[data-text-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
      });
    });

    $("#text-form").addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const output = runTextTool($("#text-input").value);
        $("#text-output").value = output;
        $("#text-count").textContent = `${Array.from(output).length} 字元`;
      } catch (error) {
        $("#text-output").value = "";
        $("#text-count").textContent = "錯誤";
        alert(readableError(error));
      }
    });

    $("#copy-text-output").addEventListener("click", () => copyText($("#text-output").value));
  }

  function runTextTool(input) {
    if (state.textMode === "base64-encode") {
      const bytes = new TextEncoder().encode(input);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    }
    if (state.textMode === "base64-decode") {
      const binary = atob(input.trim());
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    if (state.textMode === "url-encode") {
      return encodeURIComponent(input);
    }
    if (state.textMode === "url-decode") {
      return decodeURIComponent(input);
    }
    if (state.textMode === "html-encode") {
      return escapeHtml(input);
    }
    if (state.textMode === "html-decode") {
      const element = document.createElement("textarea");
      element.innerHTML = input;
      return element.value;
    }
    if (state.textMode === "trim-lines") {
      return splitLines(input).map((line) => line.trim()).join("\n");
    }
    if (state.textMode === "remove-empty-lines") {
      return splitLines(input).filter((line) => line.trim() !== "").join("\n");
    }
    if (state.textMode === "dedupe-lines") {
      return Array.from(new Set(splitLines(input))).join("\n");
    }
    if (state.textMode === "sort-lines") {
      return splitLines(input).sort((a, b) => a.localeCompare(b, "zh-Hant")).join("\n");
    }
    if (state.textMode === "text-stats") {
      return buildTextStats(input);
    }
    throw new Error("未知文字模式");
  }

  function splitLines(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  }

  function buildTextStats(text) {
    const lines = text === "" ? 0 : splitLines(text).length;
    const nonEmptyLines = splitLines(text).filter((line) => line.trim() !== "").length;
    const characters = Array.from(text).length;
    const charactersNoSpaces = Array.from(text.replace(/\s/g, "")).length;
    const words = (text.match(/[\p{L}\p{N}_'-]+/gu) || []).length;
    const bytes = new TextEncoder().encode(text).length;
    return [
      `字元數: ${characters}`,
      `不含空白字元: ${charactersNoSpaces}`,
      `單字 / 詞組數: ${words}`,
      `行數: ${lines}`,
      `非空行數: ${nonEmptyLines}`,
      `UTF-8 位元組: ${bytes}`
    ].join("\n");
  }

  function bindHashTool() {
    $("#hash-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from($("#hash-files").files || []);
      const algorithm = $("#hash-algorithm").value;
      if (!files.length) {
        setEmpty("#hash-results", "請先選擇檔案");
        return;
      }

      state.hashRows = [];
      setEmpty("#hash-results", "計算中...");

      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest(algorithm, buffer);
        state.hashRows.push({
          name: file.name,
          size: file.size,
          algorithm,
          hash: bufferToHex(digest)
        });
      }

      renderHashTable();
      $("#download-hash-csv").disabled = false;
    });

    $("#download-hash-csv").addEventListener("click", () => {
      const rows = [["file", "size", "algorithm", "hash"], ...state.hashRows.map((row) => [row.name, row.size, row.algorithm, row.hash])];
      downloadText(arrayToCsv(rows), "file-hashes.csv");
    });
  }

  function renderHashTable() {
    const html = [
      "<table>",
      "<thead><tr><th>檔案</th><th>大小</th><th>演算法</th><th>雜湊值</th></tr></thead>",
      "<tbody>",
      ...state.hashRows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${formatBytes(row.size)}</td><td>${row.algorithm}</td><td class="code-cell">${row.hash}</td></tr>`),
      "</tbody></table>"
    ].join("");
    const container = $("#hash-results");
    container.classList.remove("empty");
    container.innerHTML = html;
  }

  function bindZipTool() {
    $("#zip-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = Array.from($("#zip-files").files || []);
      if (!files.length) {
        setEmpty("#zip-results", "請先選擇檔案");
        return;
      }

      revokeZipUrl();
      setStatus("#zip-status", "處理中");
      setEmpty("#zip-results", "建立中...");
      $("#download-zip").disabled = true;

      try {
        const zipName = normalizeZipName($("#zip-name").value);
        const result = await createZip(files);
        state.zipUrl = URL.createObjectURL(result.blob);
        state.zipName = zipName;
        renderZipResult(result, zipName);
        setStatus("#zip-status", "完成");
        $("#download-zip").disabled = false;
      } catch (error) {
        setStatus("#zip-status", "錯誤");
        setEmpty("#zip-results", readableError(error));
      }
    });

    $("#download-zip").addEventListener("click", () => {
      if (state.zipUrl) {
        triggerDownload(state.zipUrl, state.zipName);
      }
    });
  }

  async function createZip(files) {
    const chunks = [];
    const centralDirectory = [];
    const usedNames = new Set();
    let offset = 0;

    for (const file of files) {
      const name = uniqueZipName(sanitizeZipName(file.name), usedNames);
      const nameBytes = new TextEncoder().encode(name);
      const data = new Uint8Array(await file.arrayBuffer());
      const crc = crc32(data);
      const dos = dateToDos(file.lastModified ? new Date(file.lastModified) : new Date());
      const localHeader = createZipLocalHeader(nameBytes, data.length, crc, dos);
      const centralHeader = createZipCentralHeader(nameBytes, data.length, crc, dos, offset);

      chunks.push(localHeader, data);
      centralDirectory.push(centralHeader);
      offset += localHeader.length + data.length;
    }

    const centralOffset = offset;
    const centralSize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
    const endRecord = createZipEndRecord(files.length, centralSize, centralOffset);
    const blob = new Blob([...chunks, ...centralDirectory, endRecord], { type: "application/zip" });
    return { blob, count: files.length };
  }

  function createZipLocalHeader(nameBytes, size, crc, dos) {
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x04034b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 0x0800);
    writeUint16(view, 8, 0);
    writeUint16(view, 10, dos.time);
    writeUint16(view, 12, dos.date);
    writeUint32(view, 14, crc);
    writeUint32(view, 18, size);
    writeUint32(view, 22, size);
    writeUint16(view, 26, nameBytes.length);
    writeUint16(view, 28, 0);
    header.set(nameBytes, 30);
    return header;
  }

  function createZipCentralHeader(nameBytes, size, crc, dos, offset) {
    const header = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x02014b50);
    writeUint16(view, 4, 20);
    writeUint16(view, 6, 20);
    writeUint16(view, 8, 0x0800);
    writeUint16(view, 10, 0);
    writeUint16(view, 12, dos.time);
    writeUint16(view, 14, dos.date);
    writeUint32(view, 16, crc);
    writeUint32(view, 20, size);
    writeUint32(view, 24, size);
    writeUint16(view, 28, nameBytes.length);
    writeUint16(view, 30, 0);
    writeUint16(view, 32, 0);
    writeUint16(view, 34, 0);
    writeUint16(view, 36, 0);
    writeUint32(view, 38, 0);
    writeUint32(view, 42, offset);
    header.set(nameBytes, 46);
    return header;
  }

  function createZipEndRecord(count, centralSize, centralOffset) {
    const record = new Uint8Array(22);
    const view = new DataView(record.buffer);
    writeUint32(view, 0, 0x06054b50);
    writeUint16(view, 4, 0);
    writeUint16(view, 6, 0);
    writeUint16(view, 8, count);
    writeUint16(view, 10, count);
    writeUint32(view, 12, centralSize);
    writeUint32(view, 16, centralOffset);
    writeUint16(view, 20, 0);
    return record;
  }

  function renderZipResult(result, zipName) {
    const container = $("#zip-results");
    container.classList.remove("empty");
    container.innerHTML = "";

    const item = document.createElement("div");
    item.className = "result-item file-result";
    item.innerHTML = [
      '<span class="file-icon">ZIP</span>',
      `<div class="result-meta"><strong>${escapeHtml(zipName)}</strong><span>${result.count} 個檔案 · ${formatBytes(result.blob.size)}</span></div>`
    ].join("");

    const link = document.createElement("a");
    link.className = "secondary-button compact";
    link.href = state.zipUrl;
    link.download = zipName;
    link.textContent = "下載";
    item.appendChild(link);
    container.appendChild(item);
  }

  function revokeZipUrl() {
    if (state.zipUrl) {
      URL.revokeObjectURL(state.zipUrl);
    }
    state.zipUrl = null;
    state.zipName = "";
  }

  function bindDiffTool() {
    $("#diff-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const left = $("#diff-left").value;
      const right = $("#diff-right").value;
      const ignoreSpace = $("#diff-ignore-space").checked;

      try {
        const diff = createLineDiff(left, right, ignoreSpace);
        state.diffText = diffToText(diff.rows);
        renderDiff(diff);
        setStatus("#diff-status", `${diff.added} 新增 / ${diff.removed} 刪除`);
        $("#download-diff-output").disabled = false;
      } catch (error) {
        state.diffText = "";
        setStatus("#diff-status", "錯誤");
        setEmpty("#diff-output", readableError(error));
        $("#download-diff-output").disabled = true;
      }
    });

    $("#download-diff-output").addEventListener("click", () => {
      if (state.diffText) {
        downloadText(state.diffText, "text-diff.txt");
      }
    });
  }

  function createLineDiff(leftText, rightText, ignoreSpace) {
    const left = splitLines(leftText);
    const right = splitLines(rightText);
    if (left.length * right.length > 2500000) {
      throw new Error("文字行數太多，請先縮小範圍後再比對");
    }

    const normalize = (line) => (ignoreSpace ? line.trim() : line);
    const leftCompare = left.map(normalize);
    const rightCompare = right.map(normalize);
    const matrix = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));

    for (let row = left.length - 1; row >= 0; row -= 1) {
      for (let col = right.length - 1; col >= 0; col -= 1) {
        matrix[row][col] = leftCompare[row] === rightCompare[col]
          ? matrix[row + 1][col + 1] + 1
          : Math.max(matrix[row + 1][col], matrix[row][col + 1]);
      }
    }

    const rows = [];
    let row = 0;
    let col = 0;
    while (row < left.length && col < right.length) {
      if (leftCompare[row] === rightCompare[col]) {
        rows.push({ type: "same", text: left[row] });
        row += 1;
        col += 1;
      } else if (matrix[row + 1][col] >= matrix[row][col + 1]) {
        rows.push({ type: "remove", text: left[row] });
        row += 1;
      } else {
        rows.push({ type: "add", text: right[col] });
        col += 1;
      }
    }
    while (row < left.length) {
      rows.push({ type: "remove", text: left[row] });
      row += 1;
    }
    while (col < right.length) {
      rows.push({ type: "add", text: right[col] });
      col += 1;
    }

    return {
      rows,
      added: rows.filter((item) => item.type === "add").length,
      removed: rows.filter((item) => item.type === "remove").length
    };
  }

  function renderDiff(diff) {
    const container = $("#diff-output");
    container.classList.remove("empty");
    container.innerHTML = "";
    const fragment = document.createDocumentFragment();

    diff.rows.forEach((row, index) => {
      const line = document.createElement("div");
      line.className = `diff-line diff-${row.type}`;
      const sign = row.type === "add" ? "+" : row.type === "remove" ? "-" : " ";
      line.innerHTML = `<span class="diff-number">${index + 1}</span><span class="diff-sign">${sign}</span><code></code>`;
      line.querySelector("code").textContent = row.text;
      fragment.appendChild(line);
    });

    container.appendChild(fragment);
  }

  function diffToText(rows) {
    return rows.map((row) => {
      const sign = row.type === "add" ? "+" : row.type === "remove" ? "-" : " ";
      return `${sign} ${row.text}`;
    }).join("\n");
  }

  function bindSplitTool() {
    $("#split-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const file = $("#split-file").files && $("#split-file").files[0];
      const sizeValue = Number($("#split-size").value);
      const unit = Number($("#split-unit").value);

      if (!file) {
        setEmpty("#split-results", "請先選擇檔案");
        return;
      }
      if (!Number.isFinite(sizeValue) || sizeValue <= 0) {
        setEmpty("#split-results", "請輸入有效的分割大小");
        return;
      }

      revokeSplitUrls();
      const partSize = Math.floor(sizeValue * unit);
      const totalParts = Math.ceil(file.size / partSize);
      if (totalParts > 500) {
        setEmpty("#split-results", "分割份數超過 500，請調大每份大小");
        return;
      }

      const baseName = sanitizeZipName(file.name);
      const digits = String(totalParts).length;
      for (let index = 0; index < totalParts; index += 1) {
        const start = index * partSize;
        const end = Math.min(file.size, start + partSize);
        const blob = file.slice(start, end);
        const name = `${baseName}.part${String(index + 1).padStart(Math.max(3, digits), "0")}`;
        state.splitDownloads.push({
          url: URL.createObjectURL(blob),
          name,
          size: blob.size
        });
      }

      const manifest = buildSplitManifest(file, partSize, state.splitDownloads);
      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json;charset=utf-8" });
      state.splitDownloads.push({
        url: URL.createObjectURL(manifestBlob),
        name: `${baseName}.manifest.json`,
        size: manifestBlob.size
      });

      renderSplitResults(file, partSize);
      setStatus("#split-status", `${totalParts} 份`);
      $("#download-all-parts").disabled = false;
    });

    $("#download-all-parts").addEventListener("click", () => {
      state.splitDownloads.forEach((item, index) => {
        window.setTimeout(() => triggerDownload(item.url, item.name), index * 180);
      });
    });
  }

  function buildSplitManifest(file, partSize, downloads) {
    const partFiles = downloads.filter((item) => item.name.includes(".part"));
    return {
      tool: "SwiftLocal",
      originalName: file.name,
      originalSize: file.size,
      partSize,
      partCount: partFiles.length,
      createdAt: new Date().toISOString(),
      parts: partFiles.map((item, index) => ({
        index: index + 1,
        name: item.name,
        size: item.size
      }))
    };
  }

  function renderSplitResults(file, partSize) {
    const container = $("#split-results");
    container.classList.remove("empty");
    container.innerHTML = "";

    const summary = document.createElement("div");
    summary.className = "result-summary";
    summary.textContent = `${file.name} · ${formatBytes(file.size)} · 每份 ${formatBytes(partSize)}`;
    container.appendChild(summary);

    state.splitDownloads.forEach((item) => {
      const row = document.createElement("div");
      row.className = "result-item file-result";
      row.innerHTML = [
        '<span class="file-icon">PART</span>',
        `<div class="result-meta"><strong>${escapeHtml(item.name)}</strong><span>${formatBytes(item.size)}</span></div>`
      ].join("");
      const link = document.createElement("a");
      link.className = "secondary-button compact";
      link.href = item.url;
      link.download = item.name;
      link.textContent = "下載";
      row.appendChild(link);
      container.appendChild(row);
    });
  }

  function revokeSplitUrls() {
    state.splitDownloads.forEach((item) => URL.revokeObjectURL(item.url));
    state.splitDownloads = [];
  }

  function bindBackendTool() {
    $("#detect-backend-tools").addEventListener("click", detectBackendTools);
    $("#backend-job-type").addEventListener("change", updateBackendJobControls);
    $("#backend-pick-files").addEventListener("click", pickBackendFiles);
    $("#backend-files").addEventListener("change", updateBackendFilesFromInput);
    $("#refresh-backend-jobs").addEventListener("click", refreshBackendJobs);
    $("#backend-form").addEventListener("submit", enqueueBackendJob);
    $$("[data-tool-pick]").forEach((button) => {
      button.addEventListener("click", () => pickBackendToolPath(button.dataset.toolPick));
    });
    $$("[data-tool-clear]").forEach((button) => {
      button.addEventListener("click", () => clearBackendToolPath(button.dataset.toolClear));
    });
    ["libreOffice", "ffmpeg", "tesseract"].forEach((key) => {
      const input = $(`#tool-path-${key}`);
      input.addEventListener("change", () => setBackendToolPath(key, input.value));
    });

    checkBackendHealth();
    updateBackendJobControls();
  }

  function backendApiAvailable() {
    return state.backendConnected;
  }

  function electronBridgeAvailable() {
    return Boolean(window.swiftLocalBackend && window.swiftLocalBackend.isAvailable);
  }

  async function checkBackendHealth() {
    setStatus("#backend-status", "連線中");
    try {
      await backendFetch("/health");
      state.backendConnected = true;
      $("#backend-mode").textContent = "FastAPI 已連線";
      setStatus("#backend-status", "已連線");
      await detectBackendTools();
      await refreshBackendJobs();
    } catch (error) {
      state.backendConnected = false;
      $("#backend-mode").textContent = "FastAPI 未連線";
      setStatus("#backend-status", "FastAPI 未連線");
      renderBackendTools(null);
      renderBackendJobs([]);
    }
  }

  async function detectBackendTools() {
    if (!backendApiAvailable()) {
      await checkBackendHealth();
      return;
    }
    setStatus("#backend-status", "偵測中");
    try {
      const tools = await backendFetch("/tools");
      renderBackendTools(tools);
      setStatus("#backend-status", "已偵測");
    } catch (error) {
      state.backendConnected = false;
      setStatus("#backend-status", "偵測失敗");
      renderBackendTools(null);
      alert(readableError(error));
    }
  }

  async function setBackendToolPath(key, toolPath) {
    if (!backendApiAvailable()) {
      alert("請先啟動 FastAPI 後端");
      return;
    }
    try {
      const tools = await backendFetch(`/tools/${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: toolPath })
      });
      renderBackendTools(tools);
      setStatus("#backend-status", "路徑已更新");
    } catch (error) {
      setStatus("#backend-status", "路徑更新失敗");
      alert(readableError(error));
    }
  }

  function renderBackendTools(tools) {
    const container = $("#backend-tools");
    const items = [
      ["libreOffice", "LibreOffice"],
      ["ffmpeg", "FFmpeg"],
      ["tesseract", "Tesseract"]
    ];

    container.innerHTML = "";
    items.forEach(([key, label]) => {
      const tool = tools && tools[key];
      const row = document.createElement("div");
      row.className = `tool-status ${tool && tool.available ? "available" : "missing"}`;
      row.innerHTML = [
        `<strong>${label}</strong>`,
        `<span>${tool && tool.available ? escapeHtml(tool.version || tool.path) : backendApiAvailable() ? "未找到" : "FastAPI 未連線"}</span>`,
        tool && tool.path ? `<small>${escapeHtml(tool.path)}</small>` : ""
      ].join("");
      container.appendChild(row);
      const input = $(`#tool-path-${key}`);
      if (input && tool && tool.path) {
        input.value = tool.path;
      }
    });
  }

  function updateBackendJobControls() {
    const type = $("#backend-job-type").value;
    const extensionField = $(".backend-extension-field");
    const languageRow = $(".backend-language-row");
    const pdfPagesRow = $(".backend-pdf-pages-row");
    const pdfAngleRow = $(".backend-pdf-angle-row");
    extensionField.style.display = type === "media-convert" ? "" : "none";
    languageRow.style.display = type === "ocr-image" ? "" : "none";
    pdfPagesRow.style.display = type === "pdf-split" ? "" : "none";
    pdfAngleRow.style.display = type === "pdf-rotate" ? "" : "none";
    const filesInput = $("#backend-files");
    if (filesInput) {
      filesInput.accept = backendFileAccept(type);
    }
  }

  async function pickBackendToolPath(key) {
    const toolName = backendToolLabel(key);
    if (!electronBridgeAvailable()) {
      $(`#tool-path-${key}`).focus();
      return;
    }
    const toolPath = await window.swiftLocalBackend.chooseExecutable({
      title: `選擇 ${toolName} 執行檔`,
      filters: [{ name: toolName, extensions: ["exe", "*"] }]
    });
    if (!toolPath) {
      return;
    }
    $(`#tool-path-${key}`).value = toolPath;
    await setBackendToolPath(key, toolPath);
  }

  async function clearBackendToolPath(key) {
    if (!backendApiAvailable()) {
      $(`#tool-path-${key}`).value = "";
      alert("請先啟動 FastAPI 後端");
      return;
    }
    try {
      const tools = await backendFetch(`/tools/${encodeURIComponent(key)}`, { method: "DELETE" });
      $(`#tool-path-${key}`).value = "";
      renderBackendTools(tools);
      setStatus("#backend-status", "路徑已清除");
    } catch (error) {
      alert(readableError(error));
    }
  }

  function pickBackendFiles() {
    $("#backend-files").click();
  }

  function updateBackendFilesFromInput() {
    state.backendFiles = Array.from($("#backend-files").files || []);
    renderBackendSelectedFiles();
  }

  function backendFileAccept(type) {
    if (type === "office-to-pdf") {
      return ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp";
    }
    if (type === "pdf-to-docx" || type === "pdf-merge" || type === "pdf-split" || type === "pdf-rotate") {
      return ".pdf";
    }
    if (type === "media-convert") {
      return ".mp3,.wav,.m4a,.flac,.aac,.ogg,.mp4,.mov,.mkv,.avi,.webm";
    }
    if (type === "ocr-image") {
      return ".png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp";
    }
    return "";
  }

  function renderBackendSelectedFiles() {
    const container = $("#backend-selected-files");
    if (!state.backendFiles.length) {
      container.classList.add("empty");
      container.textContent = "尚未選擇檔案";
      return;
    }
    container.classList.remove("empty");
    container.innerHTML = state.backendFiles.map((file) => `<span>${escapeHtml(file.name)} · ${formatBytes(file.size)}</span>`).join("");
  }

  async function enqueueBackendJob(event) {
    event.preventDefault();
    if (!backendApiAvailable()) {
      await checkBackendHealth();
    }
    if (!backendApiAvailable()) {
      alert("請先啟動 FastAPI 後端");
      return;
    }
    if (!state.backendFiles.length) {
      alert("請先選擇輸入檔案");
      return;
    }

    const type = $("#backend-job-type").value;
    const payload = new FormData();
    payload.append("type", type);
    state.backendFiles.forEach((file) => payload.append("files", file, file.name));
    if (type === "media-convert") {
      payload.append("extension", $("#backend-output-extension").value);
    }
    if (type === "ocr-image") {
      payload.append("language", $("#backend-ocr-language").value.trim() || "eng");
    }
    if (type === "pdf-split") {
      payload.append("pages", $("#backend-pdf-pages").value.trim());
    }
    if (type === "pdf-rotate") {
      payload.append("angle", $("#backend-pdf-angle").value);
    }

    try {
      await backendFetch("/jobs", {
        method: "POST",
        body: payload
      });
      await refreshBackendJobs();
      setStatus("#backend-status", "已加入佇列");
    } catch (error) {
      alert(readableError(error));
    }
  }

  async function refreshBackendJobs() {
    if (!backendApiAvailable()) {
      await checkBackendHealth();
      return;
    }
    try {
      const jobs = await backendFetch("/jobs");
      renderBackendJobs(jobs);
      scheduleBackendPolling(jobs);
    } catch (error) {
      state.backendConnected = false;
      setStatus("#backend-status", "FastAPI 未連線");
      renderBackendJobs([]);
    }
  }

  function renderBackendJobs(jobs) {
    const container = $("#backend-jobs");
    if (!jobs.length) {
      container.classList.add("empty");
      container.textContent = "尚未建立任務";
      return;
    }

    container.classList.remove("empty");
    container.innerHTML = jobs.map((job) => {
      const outputs = job.outputPaths && job.outputPaths.length
        ? job.outputPaths.map((item) => renderBackendOutputLink(item)).join("")
        : "<span>尚未產生輸出</span>";
      const log = job.error || (job.log && job.log.length ? job.log[job.log.length - 1] : "");
      return [
        `<div class="backend-job ${escapeHtml(job.status)}">`,
        `<div><strong>${escapeHtml(jobTypeLabel(job.type))}</strong><span>${escapeHtml(job.status)}</span></div>`,
        `<small>${job.inputPaths.map((item) => escapeHtml(item)).join("<br>")}</small>`,
        `<div class="backend-output-paths">${outputs}</div>`,
        log ? `<pre>${escapeHtml(log)}</pre>` : "",
        "</div>"
      ].join("");
    }).join("");
  }

  function renderBackendOutputLink(item) {
    const url = `${BACKEND_ORIGIN}${item.url}`;
    return `<a href="${escapeHtml(url)}" download="${escapeHtml(item.name)}">${escapeHtml(item.name)} · ${formatBytes(item.size || 0)}</a>`;
  }

  function scheduleBackendPolling(jobs) {
    if (state.backendPollTimer) {
      window.clearTimeout(state.backendPollTimer);
      state.backendPollTimer = null;
    }
    const hasActiveJobs = jobs.some((job) => job.status === "queued" || job.status === "running");
    if (hasActiveJobs) {
      state.backendPollTimer = window.setTimeout(refreshBackendJobs, 1200);
    }
  }

  async function backendFetch(path, options = {}) {
    const response = await fetch(`${BACKEND_API_BASE}${path}`, options);
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        message = payload.detail || message;
      } catch {
        message = await response.text() || message;
      }
      throw new Error(message);
    }
    return response.json();
  }

  function jobTypeLabel(type) {
    if (type === "office-to-pdf") {
      return "Office → PDF";
    }
    if (type === "pdf-to-docx") {
      return "PDF → DOCX";
    }
    if (type === "pdf-merge") {
      return "PDF 合併";
    }
    if (type === "pdf-split") {
      return "PDF 分割";
    }
    if (type === "pdf-rotate") {
      return "PDF 旋轉";
    }
    if (type === "media-convert") {
      return "音訊 / 影片轉換";
    }
    if (type === "ocr-image") {
      return "圖片 OCR → TXT";
    }
    return type;
  }

  function backendToolLabel(key) {
    if (key === "libreOffice") {
      return "LibreOffice";
    }
    if (key === "ffmpeg") {
      return "FFmpeg";
    }
    if (key === "tesseract") {
      return "Tesseract";
    }
    return key;
  }

  function bindRenameTool() {
    $("#rename-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const files = Array.from($("#rename-files").files || []);
      if (!files.length) {
        setEmpty("#rename-results", "請先選擇檔案");
        return;
      }

      const pattern = $("#rename-pattern").value.trim() || "{name}_{n}.{ext}";
      const start = Number($("#rename-start").value) || 0;
      const pad = Number($("#rename-pad").value) || 1;
      const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");

      state.renameRows = files.map((file, index) => {
        const parts = splitName(file.name);
        const n = String(start + index).padStart(pad, "0");
        const target = pattern
          .replaceAll("{name}", parts.base)
          .replaceAll("{ext}", parts.ext)
          .replaceAll("{n}", n)
          .replaceAll("{date}", date);
        return { original: file.name, target };
      });

      renderRenameTable();
      $("#download-rename-script").disabled = false;
    });

    $("#download-rename-script").addEventListener("click", () => {
      const script = buildRenameScript(state.renameRows);
      downloadText(script, "rename-files.ps1");
    });
  }

  function renderRenameTable() {
    const html = [
      "<table>",
      "<thead><tr><th>原檔名</th><th>新檔名</th></tr></thead>",
      "<tbody>",
      ...state.renameRows.map((row) => `<tr><td>${escapeHtml(row.original)}</td><td>${escapeHtml(row.target)}</td></tr>`),
      "</tbody></table>"
    ].join("");
    const container = $("#rename-results");
    container.classList.remove("empty");
    container.innerHTML = html;
  }

  function buildRenameScript(rows) {
    const lines = [
      "# Save this script in the folder that contains the target files, then run it with PowerShell.",
      "$ErrorActionPreference = 'Stop'",
      ""
    ];
    rows.forEach((row) => {
      lines.push(`Rename-Item -LiteralPath ${psQuote(row.original)} -NewName ${psQuote(row.target)}`);
    });
    lines.push("");
    return lines.join("\r\n");
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function dateToDos(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createCrcTable() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  }

  function normalizeZipName(name) {
    const trimmed = name.trim() || "swiftlocal-files.zip";
    return trimmed.toLowerCase().endsWith(".zip") ? trimmed : `${trimmed}.zip`;
  }

  function sanitizeZipName(name) {
    return name
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/^\.+$/, "_")
      .trim() || "file";
  }

  function uniqueZipName(name, usedNames) {
    const parts = splitName(name);
    let candidate = name;
    let index = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = parts.ext ? `${parts.base}_${index}.${parts.ext}` : `${parts.base}_${index}`;
      index += 1;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  function setEmpty(selector, message) {
    const element = $(selector);
    element.classList.add("empty");
    element.textContent = message;
  }

  function setStatus(selector, message) {
    $(selector).textContent = message;
  }

  async function copyText(value) {
    if (!value) {
      return;
    }
    await navigator.clipboard.writeText(value);
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function triggerDownload(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function extensionFromMime(mime) {
    if (mime === "image/png") {
      return "png";
    }
    if (mime === "image/webp") {
      return "webp";
    }
    return "jpg";
  }

  function stripExtension(filename) {
    return filename.replace(/\.[^.]+$/, "");
  }

  function splitName(filename) {
    const match = filename.match(/^(.*?)(?:\.([^.]+))?$/);
    return {
      base: match && match[1] ? match[1] : filename,
      ext: match && match[2] ? match[2] : ""
    };
  }

  function normalizeCsvValue(value) {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function escapeCsvCell(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  }

  function arrayToCsv(rows) {
    return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  }

  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function formatBytes(bytes) {
    if (bytes === 0) {
      return "0 B";
    }
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function sanitizeXmlName(name) {
    const cleaned = String(name || "item").trim().replace(/[^A-Za-z0-9_.:-]/g, "_");
    return /^[A-Za-z_:]/.test(cleaned) ? cleaned : `item_${cleaned || "value"}`;
  }

  function psQuote(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
  }

  function readableError(error) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  window.addEventListener("DOMContentLoaded", init);
})();
