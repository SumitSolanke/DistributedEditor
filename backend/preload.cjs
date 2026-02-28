const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  sendUserData: (data) => ipcRenderer.invoke("userRegistration", data),
  isUserRegistered: () => ipcRenderer.invoke("isUserRegistered"),
  connectDevice: (device) => ipcRenderer.invoke("connectDevice", device),
  getConnections: () => ipcRenderer.invoke("getConnections"),
  createFile: (data) => ipcRenderer.invoke("createFile", data),
  editFile: (data) => ipcRenderer.invoke("editFile", data),
  deleteFile: (data) => ipcRenderer.invoke("deleteFile", data),
  readFile: (data) => ipcRenderer.invoke("readFile", data),
  createFolder: (data) => ipcRenderer.invoke("createFolder", data),
  deleteFolder: (data) => ipcRenderer.invoke("deleteFolder", data),
  loadProject: (data) => ipcRenderer.invoke("loadProject", data),
  addProject: (data) => ipcRenderer.invoke("add-project", data),
  getProjects: () => ipcRenderer.invoke("get-projects"),
  deleteProject: (data) => ipcRenderer.invoke("delete-project", data),
  addConnection: (data) => ipcRenderer.invoke("add-connection", data),
  removeConnection: (data) => ipcRenderer.invoke("remove-connection", data),
  // Note: clearing user data is handled by the backend on app shutdown for development.
});
