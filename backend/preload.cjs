const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  sendUserData: (data) => ipcRenderer.invoke("userRegistration", data),
  isUserRegistered: () => ipcRenderer.invoke("isUserRegistered"),
  connectDevice: (device) => ipcRenderer.invoke("connectDevice", device),
  getConnections: () => ipcRenderer.invoke("getConnections"),
  // Note: clearing user data is handled by the backend on app shutdown for development.
});
