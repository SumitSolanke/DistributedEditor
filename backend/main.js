import { app, BrowserWindow, Menu, ipcMain } from "electron/main";
import connections from "./network/connections.js";
import files from "./fileHandling/fileOperations.js";
import { sendDeviceListToAll } from "./network/websockets.js";
import { user as userStore, devices } from "./storage/store.js";
import { registerProjectHandlers } from "./fileHandling/project.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadURL("http://localhost:5173/");
  // Open dev tools for debugging
  win.webContents.openDevTools();
};

app.whenReady().then(() => {
  // Register IPC handlers before creating the window so renderer can call them immediately
  connections.registerHandlers();
  files.fileHandlers();
  registerProjectHandlers();
  createWindow();
  try {
    sendDeviceListToAll();
  } catch (e) {
    // if sendDeviceListToAll is not available, ignore
    console.warn(
      "sendDeviceListToAll not available at startup:",
      e?.message || e,
    );
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Note: deletion of user data is handled by backend on shutdown (see app.on('before-quit')).
// We do NOT expose a `clearUserData` IPC endpoint to the renderer in production.

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  userStore.clear();
  devices.set("list", []);
});
