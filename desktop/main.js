"use strict";

const path = require("node:path");
const { app, BrowserWindow, Menu, shell } = require("electron");

const isDev = !app.isPackaged;

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

  window.loadFile(path.join(__dirname, "..", "index.html"));

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

app.whenReady().then(() => {
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
