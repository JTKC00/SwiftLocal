"use strict";

const endpoint = process.argv[2] || "http://127.0.0.1:9222/json";

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

    console.log(`OK packaged IPC backend connected`);
    console.log("OK five core workspace navigation");
    console.log(`OK home secondary action contrast ${contrast.toFixed(2)}:1`);
    console.log("OK strict CSP has no inline transform styles");
    console.log("OK PDF product hub navigation");
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
