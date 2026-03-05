const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  sendUserData: (data) => ipcRenderer.invoke("userRegistration", data),
  isUserRegistered: () => ipcRenderer.invoke("isUserRegistered"),
  getRegisteredUser: () => ipcRenderer.invoke("getRegisteredUser"),
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
  setProjectPublic: (data) => ipcRenderer.invoke("set-project-public", data),
  registerBranch: (data) => ipcRenderer.invoke("register-branch", data),
  deleteBranch: (data) => ipcRenderer.invoke("delete-branch", data),
});
