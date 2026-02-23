import { app, BrowserWindow, Menu } from "electron/main";
import registerUserHandlers from "./network/connections.js";
import userStore from "./storage/store.js";
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
  registerUserHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  userStore.clear(); // Clear all stored data before app closes
});
