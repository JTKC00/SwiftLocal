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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`DevTools endpoint 回應 ${response.status}`);
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

async function main() {
  const debuggerClient = await connectDebugger(endpoint);
  try {
    const home = await evaluate(debuggerClient.send, `(async () => {
      const pdfButton = document.querySelector('[data-home-panel="pdf-panel"]');
      const imageButton = document.querySelector('[data-home-panel="image-panel"]');
      const style = getComputedStyle(imageButton);
      const config = await window.swiftLocalBackend.getConfig();
      return {
        title: document.title,
        pdfButtonText: pdfButton?.textContent?.trim(),
        imageButtonText: imageButton?.textContent?.trim(),
        imageButtonColor: style.color,
        imageButtonBackground: style.backgroundColor,
        backendConnected: Boolean(config && typeof config === 'object'),
        inlineTransformCount: document.querySelectorAll('[style*="transform"]').length
      };
    })()`);

    if (home.title !== "快轉通 SwiftLocal") throw new Error(`視窗標題異常：${home.title}`);
    if (home.pdfButtonText !== "開啟 PDF 工作台") throw new Error("PDF 工作台按鈕文字異常");
    if (home.imageButtonText !== "處理圖片") throw new Error("圖片按鈕文字異常");
    const contrast = contrastRatio(home.imageButtonColor, home.imageButtonBackground);
    if (contrast < 4.5) throw new Error(`圖片按鈕對比不足：${contrast.toFixed(2)}:1`);
    if (!home.backendConnected) throw new Error("packaged IPC backend 未連線");
    if (home.inlineTransformCount !== 0) throw new Error("頁面仍含 CSP 不允許的 inline transform");

    const pdf = await evaluate(debuggerClient.send, `(async () => {
      document.querySelector('[data-home-panel="pdf-panel"]').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const panel = document.querySelector('#pdf-panel');
      return {
        active: panel?.classList.contains('is-active'),
        ariaHidden: panel?.getAttribute('aria-hidden'),
        heading: document.querySelector('#panel-title')?.textContent?.trim()
      };
    })()`);
    if (!pdf.active || pdf.ariaHidden !== "false" || pdf.heading !== "PDF 處理") {
      throw new Error(`PDF 工作台導航失敗：${JSON.stringify(pdf)}`);
    }

    console.log(`OK packaged IPC backend connected`);
    console.log(`OK home secondary action contrast ${contrast.toFixed(2)}:1`);
    console.log("OK strict CSP has no inline transform styles");
    console.log("OK PDF workspace navigation");
  } finally {
    debuggerClient.close();
  }
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
});
