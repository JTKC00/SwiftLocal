"use strict";

const path = require("node:path");
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require("electron");
const { BackendService } = require("./backend");
const {
  assertTrustedIpcSender,
  isAllowedExternalUrl,
  isTrustedRendererUrl,
  buildTrustedRendererUrls
} = require("./security");
const { createPdfWorkspaceWindow } = require("./pdf-window");
const {
  getOpenFilesFromArgv,
  getAssociationStatus,
  openPdfAssociationSettings,
  isPdfPath
} = require("./file-associations");

const APP_NAME = "快轉通 SwiftLocal";
const isDev = !app.isPackaged;
let backend = null;
let mainWindow = null;
let pdfWorkspaceWindow = null;
/** PDF paths received before app ready (macOS open-file). */
const pendingOpenFiles = [];
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const FRONTEND_PATH = path.join(FRONTEND_DIR, "index.html");
const PRELOAD_PATH = path.join(__dirname, "preload.js");
const TRUSTED_RENDERER_URLS = buildTrustedRendererUrls(FRONTEND_DIR);

// Single instance: second "Open with" should focus existing app and open the PDF.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, workingDirectory) => {
    const files = getOpenFilesFromArgv(argv, { cwd: workingDirectory || process.cwd() });
    if (files.length) {
      openPdfFiles(files);
      return;
    }
    focusMainOrWorkspace();
  });
}

// macOS: open PDF via Finder (may fire before ready).
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (!isPdfPath(filePath)) return;
  if (app.isReady()) {
    openPdfFiles([filePath]);
  } else {
    pendingOpenFiles.push(filePath);
  }
});

function resolveWindowIcon() {
  if (process.platform === "win32") {
    return path.join(__dirname, "..", "build", "icon.ico");
  }
  return path.join(__dirname, "..", "frontend", "assets", "swiftlocal-logo.png");
}

function createBackend() {
  backend = new BackendService({
    configPath: path.join(app.getPath("userData"), "tools.json"),
    defaultOutputDir: path.join(app.getPath("downloads"), "SwiftLocal"),
    onJobsUpdated: (jobs) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("backend:jobs-updated", jobs);
      });
    }
  });
}

function focusMainOrWorkspace() {
  if (pdfWorkspaceWindow && !pdfWorkspaceWindow.isDestroyed()) {
    if (pdfWorkspaceWindow.isMinimized()) pdfWorkspaceWindow.restore();
    pdfWorkspaceWindow.focus();
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

function openPdfWorkspace(filePath) {
  pdfWorkspaceWindow = createPdfWorkspaceWindow({
    frontendDir: FRONTEND_DIR,
    preloadPath: PRELOAD_PATH,
    icon: resolveWindowIcon(),
    trustedRendererUrls: TRUSTED_RENDERER_URLS,
    filePath: filePath || "",
    existing: pdfWorkspaceWindow && !pdfWorkspaceWindow.isDestroyed() ? pdfWorkspaceWindow : null
  });
  if (!pdfWorkspaceWindow._swiftLocalClosedBound) {
    pdfWorkspaceWindow._swiftLocalClosedBound = true;
    pdfWorkspaceWindow.on("closed", () => {
      pdfWorkspaceWindow = null;
    });
  }
  return { ok: true };
}

/**
 * Open one or more PDFs (currently one workspace window; first file loads,
 * additional files are sent sequentially so user can open next if needed).
 */
function openPdfFiles(filePaths) {
  const list = (Array.isArray(filePaths) ? filePaths : [filePaths]).filter(isPdfPath);
  if (!list.length) {
    openPdfWorkspace("");
    return { ok: true, count: 0 };
  }
  // Primary: open / focus workspace with the first file.
  openPdfWorkspace(list[0]);
  // If multiple files were dropped, queue the rest after a short delay.
  if (list.length > 1 && pdfWorkspaceWindow && !pdfWorkspaceWindow.isDestroyed()) {
    list.slice(1).forEach((filePath, index) => {
      setTimeout(() => {
        if (pdfWorkspaceWindow && !pdfWorkspaceWindow.isDestroyed()) {
          pdfWorkspaceWindow.webContents.send("pdf-workspace:open-path", filePath);
        }
      }, 400 * (index + 1));
    });
  }
  return { ok: true, count: list.length };
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
    icon: resolveWindowIcon(),
    backgroundColor: "#f6f4ee",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow = window;

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, TRUSTED_RENDERER_URLS)) {
      event.preventDefault();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  window.loadFile(FRONTEND_PATH);

  if (isDev && process.env.SWIFTLOCAL_DEVTOOLS === "1") {
    window.webContents.openDevTools({ mode: "detach" });
  }
  return window;
}

function installMenu() {
  const template = [
    {
      label: "檔案",
      submenu: [
        {
          label: "開啟 PDF 工作區",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => {
            openPdfWorkspace("");
          }
        },
        {
          label: "開啟 PDF 檔案…",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const result = await dialog.showOpenDialog({
              title: "開啟 PDF",
              properties: ["openFile", "multiSelections"],
              filters: [{ name: "PDF", extensions: ["pdf"] }]
            });
            if (!result.canceled && result.filePaths.length) {
              openPdfFiles(result.filePaths);
            }
          }
        },
        { type: "separator" },
        {
          label: "設為 PDF 開啟程式…",
          click: async () => {
            await openPdfAssociationSettings();
          }
        },
        { type: "separator" },
        {
          label: "開啟工具箱",
          click: () => {
            createMainWindow();
          }
        },
        { type: "separator" },
        { role: "reload", label: "重新載入" },
        { type: "separator" },
        { role: "quit", label: "結束" }
      ]
    },
    {
      label: "編輯",
      submenu: [
        { role: "undo", label: "復原" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪下" },
        { role: "copy", label: "複製" },
        { role: "paste", label: "貼上" },
        { role: "selectAll", label: "全選" }
      ]
    },
    {
      label: "檢視",
      submenu: [
        { role: "resetZoom", label: "重設縮放" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "縮小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "全螢幕" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function installBackendIpc() {
  const handleTrusted = (channel, handler) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedIpcSender(event, TRUSTED_RENDERER_URLS);
      return handler(event, ...args);
    });
  };
  handleTrusted("backend:detect-tools", () => backend.detectTools());
  handleTrusted("backend:get-config", () => backend.getConfig());
  handleTrusted("backend:set-default-output-dir", (_event, outputDir) => backend.setDefaultOutputDir(outputDir));
  handleTrusted("backend:set-tool-path", (_event, key, toolPath) => backend.setToolPath(key, toolPath));
  handleTrusted("backend:get-jobs", () => backend.getJobs());
  handleTrusted("backend:enqueue-job", (_event, payload) => backend.enqueue(payload));
  handleTrusted("backend:delete-job", (_event, jobId) => backend.deleteJob(jobId));
  handleTrusted("backend:cancel-job", (_event, jobId) => backend.cancelJob(jobId));
  handleTrusted("backend:retry-job", (_event, jobId) => backend.retryJob(jobId));
  handleTrusted("backend:copy-job", (_event, jobId) => backend.copyJob(jobId));
  handleTrusted("backend:job-diagnostic", (_event, jobId) => backend.buildDiagnosticReport(jobId));
  handleTrusted("backend:cleanup-jobs", (_event, options) => backend.pruneJobs(options || {}));
  handleTrusted("backend:choose-executable", async (_event, options = {}) => {
    const result = await dialog.showOpenDialog({
      title: options.title || "選擇工具執行檔",
      properties: ["openFile"],
      filters: options.filters || [{ name: "Executable", extensions: process.platform === "win32" ? ["exe"] : ["*"] }]
    });
    return result.canceled ? "" : result.filePaths[0];
  });
  handleTrusted("backend:choose-files", async (_event, options = {}) => {
    const result = await dialog.showOpenDialog({
      title: options.title || "選擇檔案",
      properties: ["openFile", "multiSelections"],
      filters: options.filters || [{ name: "All Files", extensions: ["*"] }]
    });
    return result.canceled ? [] : result.filePaths;
  });
  handleTrusted("backend:choose-directory", async () => {
    const result = await dialog.showOpenDialog({
      title: "選擇輸出資料夾",
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? "" : result.filePaths[0];
  });
  handleTrusted("backend:open-path", async (_event, targetPath) => {
    if (!targetPath) {
      return "No path provided";
    }
    return shell.openPath(targetPath);
  });
  handleTrusted("pdf-workspace:open", (_event, filePath) => openPdfWorkspace(filePath || ""));
  handleTrusted("pdf-workspace:open-files", (_event, filePaths) => openPdfFiles(filePaths || []));
  handleTrusted("pdf-workspace:association-status", () => getAssociationStatus(app));
  handleTrusted("pdf-workspace:open-association-settings", () => openPdfAssociationSettings());
  handleTrusted("pdf-workspace:read-file", (_event, filePath) => {
    const fs = require("node:fs");
    const resolved = path.resolve(String(filePath || ""));
    if (!resolved || path.extname(resolved).toLowerCase() !== ".pdf") {
      throw new Error("只允許讀取 PDF 檔案");
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`找不到檔案：${path.basename(resolved)}`);
    }
    const stat = fs.statSync(resolved);
    const maxBytes = 120 * 1024 * 1024;
    if (stat.size > maxBytes) {
      throw new Error("PDF 超過 120 MB，請改用較小的檔案");
    }
    // Read fully into memory then release the OS handle (no long-lived lock).
    const buffer = fs.readFileSync(resolved);
    return {
      name: path.basename(resolved),
      path: resolved,
      size: buffer.length,
      data: new Uint8Array(buffer)
    };
  });
  handleTrusted("pdf-workspace:choose-save-path", async (_event, options = {}) => {
    const result = await dialog.showSaveDialog({
      title: options.title || "另存 PDF",
      defaultPath: options.defaultPath || "document.pdf",
      filters: options.filters || [{ name: "PDF", extensions: ["pdf"] }]
    });
    return result.canceled ? "" : (result.filePath || "");
  });
  handleTrusted("pdf-workspace:sanitize-pdf", async (_event, data) => {
    const fs = require("node:fs");
    const os = require("node:os");
    const { spawn } = require("node:child_process");
    if (!backend) throw new Error("後端尚未就緒");
    if (!backend.tools) {
      await backend.detectTools();
    }
    const tool = backend.tools && backend.tools.qpdf;
    if (!tool || !tool.available || !tool.path) {
      const err = new Error("需要 QPDF 才能修復／解除此 PDF 的限制加密以便填表。請安裝 QPDF 或使用 Full／內建 tools 版本。");
      err.code = "missing_tool";
      throw err;
    }
    let bytes;
    if (data instanceof Uint8Array) bytes = Buffer.from(data);
    else if (data && data.type === "Buffer" && Array.isArray(data.data)) bytes = Buffer.from(data.data);
    else if (Array.isArray(data)) bytes = Buffer.from(data);
    else if (data && data.byteLength != null) bytes = Buffer.from(new Uint8Array(data));
    else throw new Error("PDF 資料格式不正確");
    if (bytes.length > 120 * 1024 * 1024) throw new Error("PDF 過大，無法淨化");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swiftlocal-pdf-"));
    const inPath = path.join(dir, "in.pdf");
    const outPath = path.join(dir, "out.pdf");
    fs.writeFileSync(inPath, bytes);

    const runQpdf = (args) => new Promise((resolve, reject) => {
      const child = spawn(tool.path, args, { windowsHide: true });
      const chunks = [];
      child.stderr.on("data", (c) => chunks.push(c));
      child.stdout.on("data", (c) => chunks.push(c));
      child.on("error", reject);
      child.on("close", (code) => {
        // qpdf exit 3 = warnings but success
        if (code === 0 || code === 3) resolve();
        else reject(new Error((Buffer.concat(chunks).toString("utf8") || `qpdf exit ${code}`).slice(0, 400)));
      });
    });

    try {
      try {
        await runQpdf(["--decrypt", inPath, outPath]);
      } catch {
        // Retry with empty password and rewrite object streams.
        await runQpdf(["--password=", "--decrypt", "--object-streams=disable", inPath, outPath]);
      }
      if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 64) {
        throw new Error("QPDF 未產生有效輸出");
      }
      const cleaned = fs.readFileSync(outPath);
      return {
        ok: true,
        size: cleaned.length,
        data: new Uint8Array(cleaned)
      };
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
  handleTrusted("pdf-workspace:write-file", async (_event, filePath, data) => {
    const fs = require("node:fs");
    const resolved = path.resolve(String(filePath || ""));
    if (!resolved || path.extname(resolved).toLowerCase() !== ".pdf") {
      throw new Error("只允許寫入 PDF 檔案");
    }
    let bytes;
    if (data instanceof Uint8Array) {
      bytes = Buffer.from(data);
    } else if (data && data.type === "Buffer" && Array.isArray(data.data)) {
      bytes = Buffer.from(data.data);
    } else if (Array.isArray(data)) {
      bytes = Buffer.from(data);
    } else if (data && data.byteLength != null) {
      bytes = Buffer.from(new Uint8Array(data));
    } else {
      throw new Error("寫入內容格式不正確");
    }
    if (bytes.length > 200 * 1024 * 1024) {
      throw new Error("輸出檔案過大");
    }
    // Temp-then-replace: avoid truncating the original if write fails mid-way.
    const dir = path.dirname(resolved);
    const base = path.basename(resolved);
    const tempPath = path.join(dir, `.swiftlocal-save-${process.pid}-${Date.now()}-${base}`);
    fs.writeFileSync(tempPath, bytes);
    try {
      fs.renameSync(tempPath, resolved);
    } catch {
      // Cross-device or Windows replace: copy then unlink temp.
      fs.copyFileSync(tempPath, resolved);
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // ignore
      }
    }
    return { ok: true, path: resolved, size: bytes.length };
  });
  handleTrusted("app:open-toolbox", () => {
    createMainWindow();
    return { ok: true };
  });
}

app.setName(APP_NAME);

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    createBackend();
    installBackendIpc();
    installMenu();

    const launchFiles = [
      ...pendingOpenFiles.splice(0, pendingOpenFiles.length),
      ...getOpenFilesFromArgv(process.argv)
    ];
    // Deduplicate
    const unique = [];
    const seen = new Set();
    for (const file of launchFiles) {
      const key = process.platform === "win32" ? String(file).toLowerCase() : String(file);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(file);
    }

    if (unique.length) {
      // Open-with PDF: go straight to PDF workspace (no toolbox home first).
      openPdfFiles(unique);
    } else {
      createMainWindow();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
