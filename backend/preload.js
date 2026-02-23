import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  sendUserData: (data) => ipcRenderer.invoke("userRegistration", data),
  isUserRegistered: () => ipcRenderer.invoke("isUserRegistered"),
  clearUserData: () => ipcRenderer.invoke("clearUserData"),
  resetRegistration: () => ipcRenderer.invoke("resetRegistration"),
});
