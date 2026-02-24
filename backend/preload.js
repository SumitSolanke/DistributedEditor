import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  sendUserData: (data) => ipcRenderer.invoke("userRegistration", data),
  isUserRegistered: () => ipcRenderer.invoke("isUserRegistered"),
  // Note: clearing user data is handled by the backend on app shutdown for development.
});
