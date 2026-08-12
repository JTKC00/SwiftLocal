"use strict";

const fs = require("node:fs");
const path = require("node:path");

const endpoint = process.argv[2] || "http://127.0.0.1:9222/json";
const ocrFixturePath = process.argv[3] || "";
const ocrOutputDir = process.argv[4] || "";
const imageFixturePath = process.argv[5] || "";

function contrastRatio(rgbA, rgbB) {
  const parse = (value) => {
    const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) throw new Error(`無法解析顏色：${value}`);
    return match.slice(1, 4).map(Number);
  };
  const luminance = (rgb) => {
    const channels = rgb.map((value) => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const first = luminance(parse(rgbA));
  const second = luminance(parse(rgbB));
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function connectDebugger(url) {
  let response = null;
  let lastError = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      response = await fetch(url);
      if (response.ok) break;
      lastError = new Error(`DevTools endpoint 回應 ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!response || !response.ok) throw new Error(`無法連接 packaged app：${lastError?.message || "DevTools endpoint 未就緒"}`);
  const pages = await response.json();
  const page = pages.find((item) => item.type === "page" && /frontend\/index\.html$/.test(item.url));
  if (!page || !page.webSocketDebuggerUrl) throw new Error("找不到 SwiftLocal renderer page");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("無法連接 renderer DevTools")), { once: true });
  });
  let requestId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { page, send, close: () => socket.close() };
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function evaluateWhenReady(send, expression) {
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await evaluate(send, expression);
    } catch (error) {
      lastError = error;
      if (!/Execution context was destroyed|Cannot find context/i.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError || new Error("renderer execution context 未就緒");
}

async function waitForValue(send, expression, predicate, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(send, expression);
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待 UI 狀態逾時：${expression}`);
}

async function main(debuggerEndpoint = endpoint) {
  const debuggerClient = await connectDebugger(debuggerEndpoint);
  try {
    const home = await evaluateWhenReady(debuggerClient.send, `(async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && (
        document.readyState === 'loading' ||
        !document.querySelector('[data-home-panel="pdf-hub-panel"]') ||
        !document.querySelector('[data-home-panel="ocr-panel"]') ||
        !window.swiftLocalBackend
      )) await new Promise((resolve) => setTimeout(resolve, 100));
      const pdfButton = document.querySelector('[data-home-panel="pdf-hub-panel"]');
      const ocrButton = document.querySelector('[data-home-panel="ocr-panel"]');
      const officeButton = document.querySelector('[data-home-panel="office-panel"]');
      if (!pdfButton || !ocrButton || !officeButton || !window.swiftLocalBackend) {
        return { missing: '首頁或 preload 尚未就緒', readyState: document.readyState };
      }
      const style = getComputedStyle(ocrButton);
      const config = await window.swiftLocalBackend.getConfig();
      return {
        title: document.title,
        pdfButtonText: pdfButton?.textContent?.trim(),
        ocrButtonText: ocrButton?.textContent?.trim(),
        officeButtonText: officeButton?.textContent?.trim(),
        secondaryButtonColor: style.color,
        secondaryButtonBackground: style.backgroundColor,
        corePanels: Array.from(document.querySelectorAll('.core-nav-group [data-panel]')).map((button) => button.dataset.panel),
        searchLiveRegion: document.querySelector('#quick-actions')?.getAttribute('aria-live'),
        backendConnected: Boolean(config && typeof config === 'object'),
        inlineTransformCount: document.querySelectorAll('[style*="transform"]').length
      };
    })()`);

    if (home.missing) throw new Error(`${home.missing}（document.readyState=${home.readyState}）`);
    if (home.title !== "快轉通 SwiftLocal") throw new Error(`視窗標題異常：${home.title}`);
    if (home.pdfButtonText !== "開啟 PDF") throw new Error("PDF 主入口按鈕文字異常");
    if (home.ocrButtonText !== "掃描文件 OCR") throw new Error("OCR 主入口按鈕文字異常");
    if (home.officeButtonText !== "處理 Office") throw new Error("Office 主入口按鈕文字異常");
    const requiredCorePanels = ["pdf-hub-panel", "ocr-panel", "office-panel", "image-panel", "media-panel"];
    if (JSON.stringify(home.corePanels) !== JSON.stringify(requiredCorePanels)) {
      throw new Error(`核心導航異常：${JSON.stringify(home.corePanels)}`);
    }
    if (home.searchLiveRegion !== "polite") throw new Error("工具搜尋結果缺少 aria-live");
    const contrast = contrastRatio(home.secondaryButtonColor, home.secondaryButtonBackground);
    if (contrast < 4.5) throw new Error(`首頁次要按鈕對比不足：${contrast.toFixed(2)}:1`);
    if (!home.backendConnected) throw new Error("packaged IPC backend 未連線");
    if (home.inlineTransformCount !== 0) throw new Error("頁面仍含 CSP 不允許的 inline transform");

    const pdf = await evaluate(debuggerClient.send, `(async () => {
      document.querySelector('[data-home-panel="pdf-hub-panel"]').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const panel = document.querySelector('#pdf-hub-panel');
      return {
        active: panel?.classList.contains('is-active'),
        ariaHidden: panel?.getAttribute('aria-hidden'),
        heading: document.querySelector('#panel-title')?.textContent?.trim()
      };
    })()`);
    if (!pdf.active || pdf.ariaHidden !== "false" || pdf.heading !== "PDF") {
      throw new Error(`PDF 主入口導航失敗：${JSON.stringify(pdf)}`);
    }

    const workspaceOcr = await evaluate(debuggerClient.send, `(async () => {
      const mode = document.querySelector('#pdf-mode');
      mode.value = 'workspace';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      const workspace = document.querySelector('#pdf-workspace');
      const preview = document.querySelector('#pdf-live-preview');
      const resultPanel = document.querySelector('#pdf-workspace-ocr-panel');
      const grid = document.querySelector('#pdf-workspace-grid');
      const pageAction = document.querySelector('#pdf-workspace-ocr-page');
      const documentAction = document.querySelector('#pdf-workspace-ocr-document');
      const resultText = document.querySelector('#pdf-workspace-ocr-text');
      const previewRect = preview?.getBoundingClientRect();
      const resultRect = resultPanel?.getBoundingClientRect();
      const gridRect = grid?.getBoundingClientRect();
      return {
        visible: Boolean(workspace && !workspace.hidden),
        pageAction: pageAction?.textContent?.trim(),
        documentAction: documentAction?.textContent?.trim(),
        languageVisible: workspace?.textContent?.includes('繁體中文 + English'),
        resultReadonly: Boolean(resultText?.readOnly),
        resultPanelVisible: Boolean(resultPanel && getComputedStyle(resultPanel).display !== 'none'),
        resultBesidePreview: Boolean(
          previewRect && resultRect &&
          (resultRect.left > previewRect.left || resultRect.top >= previewRect.bottom)
        ),
        thumbnailsBelow: Boolean(previewRect && gridRect && gridRect.top >= previewRect.bottom)
      };
    })()`);
    if (!workspaceOcr.visible) throw new Error("PDF 工作區未顯示");
    if (workspaceOcr.pageAction !== "目前頁面" || workspaceOcr.documentAction !== "整份 PDF") {
      throw new Error(`OCR actions 異常：${JSON.stringify(workspaceOcr)}`);
    }
    if (!workspaceOcr.languageVisible || !workspaceOcr.resultReadonly || !workspaceOcr.resultPanelVisible) {
      throw new Error(`OCR result panel 異常：${JSON.stringify(workspaceOcr)}`);
    }
    if (!workspaceOcr.resultBesidePreview || !workspaceOcr.thumbnailsBelow) {
      throw new Error(`OCR workspace layout 異常：${JSON.stringify(workspaceOcr)}`);
    }

    const imageWorkspace = await evaluate(debuggerClient.send, `(async () => {
      document.querySelector('[data-panel="image-panel"]').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const panel = document.querySelector('#image-panel');
      const preview = document.querySelector('#image-preview-stage');
      const inspector = document.querySelector('.image-workspace-inspector');
      const thumbnails = document.querySelector('#image-workspace-thumbnails');
      const previewRect = preview?.getBoundingClientRect();
      const inspectorRect = inspector?.getBoundingClientRect();
      const thumbnailRect = thumbnails?.getBoundingClientRect();
      return {
        active: panel?.classList.contains('is-active'),
        ariaHidden: panel?.getAttribute('aria-hidden'),
        heading: document.querySelector('#panel-title')?.textContent?.trim(),
        selectAction: document.querySelector('#image-select-region')?.textContent?.trim(),
        cropAction: document.querySelector('#image-apply-crop')?.textContent?.trim(),
        ocrActions: [
          document.querySelector('#image-ocr-current')?.textContent?.trim(),
          document.querySelector('#image-ocr-all')?.textContent?.trim(),
          document.querySelector('#image-ocr-region')?.textContent?.trim()
        ],
        resultReadonly: Boolean(document.querySelector('#image-ocr-text')?.readOnly),
        inspectorBesidePreview: Boolean(previewRect && inspectorRect && (innerWidth <= 940 || inspectorRect.left > previewRect.left)),
        thumbnailsBelow: Boolean(previewRect && thumbnailRect && thumbnailRect.top >= previewRect.bottom)
      };
    })()`);
    if (!imageWorkspace.active || imageWorkspace.ariaHidden !== "false" || imageWorkspace.heading !== "圖片轉換") {
      throw new Error(`圖片工作區導航失敗：${JSON.stringify(imageWorkspace)}`);
    }
    if (imageWorkspace.selectAction !== "▣ 框選區域" || imageWorkspace.cropAction !== "套用裁切") {
      throw new Error(`圖片編輯 actions 異常：${JSON.stringify(imageWorkspace)}`);
    }
    if (imageWorkspace.ocrActions.join("|") !== "目前圖片|全部圖片|辨識框選" || !imageWorkspace.resultReadonly) {
      throw new Error(`圖片 OCR actions 異常：${JSON.stringify(imageWorkspace)}`);
    }
    if (!imageWorkspace.inspectorBesidePreview || !imageWorkspace.thumbnailsBelow) {
      throw new Error(`圖片工作區 layout 異常：${JSON.stringify(imageWorkspace)}`);
    }

    if (imageFixturePath) {
      await evaluate(debuggerClient.send, `document.querySelector('[data-clear-panel="image-panel"]').click()`);
      if (ocrOutputDir) {
        await evaluate(
          debuggerClient.send,
          `window.swiftLocalBackend.setDefaultOutputDir(${JSON.stringify(ocrOutputDir)})`
        );
      }
      const documentNode = await debuggerClient.send("DOM.getDocument", { depth: 1 });
      const inputNode = await debuggerClient.send("DOM.querySelector", {
        nodeId: documentNode.root.nodeId,
        selector: "#image-files"
      });
      if (!inputNode.nodeId) throw new Error("找不到圖片 file input");
      await debuggerClient.send("DOM.setFileInputFiles", {
        nodeId: inputNode.nodeId,
        files: [imageFixturePath]
      });
      const preview = await waitForValue(
        debuggerClient.send,
        `({count: document.querySelector('#image-workspace-count')?.textContent || '', hidden: document.querySelector('#image-preview-canvas')?.hidden, dimensions: document.querySelector('#image-preview-dimensions')?.textContent || ''})`,
        (value) => value.count === "1 張圖片" && value.hidden === false && /\d+×\d+/.test(value.dimensions)
      );

      await evaluate(debuggerClient.send, `document.querySelector('#image-select-region').click()`);
      const rect = await evaluate(debuggerClient.send, `(() => {
        const value = document.querySelector('#image-preview-canvas').getBoundingClientRect();
        return {left: value.left, top: value.top, width: value.width, height: value.height};
      })()`);
      const startX = rect.left + rect.width * 0.05;
      const startY = rect.top + rect.height * 0.08;
      const endX = rect.left + rect.width * 0.95;
      const endY = rect.top + rect.height * 0.72;
      await debuggerClient.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX, y: startY });
      await debuggerClient.send("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y: startY, button: "left", clickCount: 1 });
      await debuggerClient.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: endX, y: endY, button: "left" });
      await debuggerClient.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: endX, y: endY, button: "left", clickCount: 1 });
      await waitForValue(
        debuggerClient.send,
        `({cropDisabled: document.querySelector('#image-apply-crop')?.disabled, regionDisabled: document.querySelector('#image-ocr-region')?.disabled, selection: document.querySelector('#image-preview-selection')?.textContent || ''})`,
        (value) => value.cropDisabled === false && value.regionDisabled === false && /已有框選/.test(value.selection)
      );

      await evaluate(debuggerClient.send, `document.querySelector('#image-apply-crop').click()`);
      await waitForValue(
        debuggerClient.send,
        `document.querySelector('#image-preview-crop')?.textContent || ''`,
        (value) => /已套用非破壞式裁切/.test(value)
      );
      await evaluate(debuggerClient.send, `document.querySelector('#image-rotate-right').click()`);
      const cleared = await waitForValue(
        debuggerClient.send,
        `({crop: document.querySelector('#image-preview-crop')?.textContent || '', selection: document.querySelector('#image-preview-selection')?.textContent || ''})`,
        (value) => value.crop === "尚未裁切" && value.selection === "尚未框選"
      );
      await evaluate(debuggerClient.send, `document.querySelector('#image-reset-edits').click()`);

      await evaluate(debuggerClient.send, `document.querySelector('#image-select-region').click()`);
      const currentRect = await evaluate(debuggerClient.send, `(() => {
        const value = document.querySelector('#image-preview-canvas').getBoundingClientRect();
        return {left: value.left, top: value.top, width: value.width, height: value.height};
      })()`);
      const ocrStartX = currentRect.left + currentRect.width * 0.03;
      const ocrStartY = currentRect.top + currentRect.height * 0.05;
      const ocrEndX = currentRect.left + currentRect.width * 0.97;
      const ocrEndY = currentRect.top + currentRect.height * 0.72;
      await debuggerClient.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ocrStartX, y: ocrStartY });
      await debuggerClient.send("Input.dispatchMouseEvent", { type: "mousePressed", x: ocrStartX, y: ocrStartY, button: "left", clickCount: 1 });
      await debuggerClient.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ocrEndX, y: ocrEndY, button: "left" });
      await debuggerClient.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: ocrEndX, y: ocrEndY, button: "left", clickCount: 1 });
      await waitForValue(
        debuggerClient.send,
        `document.querySelector('#image-ocr-region')?.disabled`,
        (value) => value === false
      );
      await evaluate(debuggerClient.send, `document.querySelector('#image-ocr-region').click()`);
      const result = await waitForValue(
        debuggerClient.send,
        `({status: document.querySelector('#image-ocr-status')?.textContent || '', text: document.querySelector('#image-ocr-text')?.value || '', error: document.querySelector('#image-ocr-error')?.textContent || ''})`,
        (value) => value.status === "已完成" || value.status === "未能辨識",
        60000
      );
      if (result.status !== "已完成") {
        throw new Error(`packaged 圖片框選 OCR 失敗：${result.error || JSON.stringify(result)}`);
      }
      if (!/香港特別行政區/.test(result.text) || !/HONG KONG/i.test(result.text)) {
        throw new Error(`packaged 圖片框選 OCR 中英結果不完整：${result.text.slice(0, 500)}`);
      }
      if (ocrOutputDir) {
        await evaluate(debuggerClient.send, `document.querySelector('#image-ocr-panel').scrollIntoView({block: 'center'})`);
        const screenshot = await debuggerClient.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false
        });
        fs.mkdirSync(ocrOutputDir, { recursive: true });
        const screenshotPath = path.join(ocrOutputDir, "packaged-image-workspace.png");
        fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
        console.log(`OK packaged image workspace screenshot (${screenshotPath})`);
      }
      console.log(`OK packaged image immediate preview (${preview.dimensions})`);
      console.log(`OK packaged non-destructive crop and rotate-clears-selection (${JSON.stringify(cleared)})`);
      console.log("OK packaged selected-region chi_tra+eng OCR in same workspace");
    }

    if (ocrFixturePath) {
      if (ocrOutputDir) {
        await evaluate(
          debuggerClient.send,
          `window.swiftLocalBackend.setDefaultOutputDir(${JSON.stringify(ocrOutputDir)})`
        );
      }
      const documentNode = await debuggerClient.send("DOM.getDocument", { depth: 1 });
      const inputNode = await debuggerClient.send("DOM.querySelector", {
        nodeId: documentNode.root.nodeId,
        selector: "#pdf-files"
      });
      if (!inputNode.nodeId) throw new Error("找不到 PDF file input");
      await debuggerClient.send("DOM.setFileInputFiles", {
        nodeId: inputNode.nodeId,
        files: [ocrFixturePath]
      });
      const loaded = await waitForValue(
        debuggerClient.send,
        `({count: document.querySelector('#pdf-workspace-count')?.textContent || '', disabled: document.querySelector('#pdf-workspace-ocr-page')?.disabled})`,
        (value) => /\d+ 頁/.test(value.count) && value.disabled === false
      );
      await evaluate(debuggerClient.send, `document.querySelector('#pdf-workspace-ocr-page').click()`);
      const result = await waitForValue(
        debuggerClient.send,
        `({status: document.querySelector('#pdf-workspace-ocr-status')?.textContent || '', text: document.querySelector('#pdf-workspace-ocr-text')?.value || '', error: document.querySelector('#pdf-workspace-ocr-error')?.textContent || ''})`,
        (value) => value.status === "已完成" || value.status === "未能辨識",
        60000
      );
      if (result.status !== "已完成") {
        throw new Error(`packaged OCR 失敗：${result.error || JSON.stringify(result)}`);
      }
      if (!/香港特別行政區/.test(result.text) || !/HONG KONG/i.test(result.text)) {
        throw new Error(`packaged OCR 中英結果不完整：${result.text.slice(0, 500)}`);
      }
      console.log(`OK packaged current-page chi_tra+eng OCR (${loaded.count})`);
    }

    console.log(`OK packaged IPC backend connected`);
    console.log("OK five core workspace navigation");
    console.log(`OK home secondary action contrast ${contrast.toFixed(2)}:1`);
    console.log("OK strict CSP has no inline transform styles");
    console.log("OK PDF product hub navigation");
    console.log("OK PDF workspace navigation");
    console.log("OK PDF workspace OCR actions and result panel layout");
    console.log("OK image workspace navigation, actions, and responsive layout");
  } finally {
    debuggerClient.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAIL ${error.message}`);
    process.exit(1);
  });
}

module.exports = { contrastRatio, connectDebugger, evaluateWhenReady, main };
