const { app, BrowserWindow, ipcMain } = require("electron");
const Store = require("electron-store");
const path = require("path");
const isDev = require("electron-is-dev");
const { spawn } = require("child_process");

const store = new Store({
  defaults: {
    user: null,
    connections: [],
  },
});

let mainWindow;
let wsServer;

// Create Electron application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  const startUrl = isDev
    ? "http://localhost:5173" // Vite dev server
    : `file://${path.join(__dirname, "../distributed-editor/dist/index.html")}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC handlers for Electron store
ipcMain.handle("store:get", (event, key) => {
  return store.get(key);
});

ipcMain.handle("store:set", (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle("store:clear", () => {
  store.clear();
});

// Start WebSocket server
function startWebSocketServer() {
  if (wsServer) return;

  // Path to backend server script
  const backendPath = path.join(__dirname, "./server.js");

  wsServer = spawn("node", [backendPath], {
    stdio: "inherit",
    detached: false,
  });

  wsServer.on("error", (error) => {
    console.error("Failed to start WebSocket server:", error);
  });

  wsServer.on("close", (code) => {
    console.log(`WebSocket server closed with code ${code}`);
    wsServer = null;
  });

  console.log("WebSocket server started");
}

// Stop WebSocket server
function stopWebSocketServer() {
  if (wsServer) {
    wsServer.kill();
    wsServer = null;
  }
}

app.on("ready", () => {
  createWindow();
  startWebSocketServer();
});

app.on("window-all-closed", () => {
  stopWebSocketServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle app termination
process.on("exit", () => {
  stopWebSocketServer();
});
