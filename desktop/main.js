"use strict";

const path = require("node:path");
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require("electron");
const { BackendService } = require("./backend");

const isDev = !app.isPackaged;
let backend = null;

function createBackend() {
  backend = new BackendService({
    configPath: path.join(app.getPath("userData"), "tools.json"),
    onJobsUpdated: (jobs) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send("backend:jobs-updated", jobs);
      });
    }
  });
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: "快轉通 SwiftLocal",
    backgroundColor: "#f6f4ee",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.loadFile(path.join(__dirname, "..", "frontend", "index.html"));

  if (isDev && process.env.SWIFTLOCAL_DEVTOOLS === "1") {
    window.webContents.openDevTools({ mode: "detach" });
  }
}

function installMenu() {
  const template = [
    {
      label: "檔案",
      submenu: [
        { role: "reload", label: "重新載入" },
        { type: "separator" },
        { role: "quit", label: "離開" }
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
        { role: "resetZoom", label: "實際大小" },
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
  ipcMain.handle("backend:detect-tools", () => backend.detectTools());
  ipcMain.handle("backend:get-config", () => backend.getConfig());
  ipcMain.handle("backend:set-tool-path", (_event, key, toolPath) => backend.setToolPath(key, toolPath));
  ipcMain.handle("backend:get-jobs", () => backend.getJobs());
  ipcMain.handle("backend:enqueue-job", (_event, payload) => backend.enqueue(payload));
  ipcMain.handle("backend:choose-executable", async (_event, options = {}) => {
    const result = await dialog.showOpenDialog({
      title: options.title || "選擇工具執行檔",
      properties: ["openFile"],
      filters: options.filters || [{ name: "Executable", extensions: process.platform === "win32" ? ["exe"] : ["*"] }]
    });
    return result.canceled ? "" : result.filePaths[0];
  });
  ipcMain.handle("backend:choose-files", async (_event, options = {}) => {
    const result = await dialog.showOpenDialog({
      title: options.title || "選擇檔案",
      properties: ["openFile", "multiSelections"],
      filters: options.filters || [{ name: "All Files", extensions: ["*"] }]
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle("backend:choose-directory", async () => {
    const result = await dialog.showOpenDialog({
      title: "選擇輸出資料夾",
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? "" : result.filePaths[0];
  });
  ipcMain.handle("backend:open-path", async (_event, targetPath) => {
    if (!targetPath) {
      return "No path provided";
    }
    return shell.openPath(targetPath);
  });
}

app.whenReady().then(() => {
  createBackend();
  installBackendIpc();
  installMenu();
  createMainWindow();

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
