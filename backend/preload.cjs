const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  sendUserData: (data) => ipcRenderer.invoke("userRegistration", data),
  isUserRegistered: () => ipcRenderer.invoke("isUserRegistered"),
  getRegisteredUser: () => ipcRenderer.invoke("getRegisteredUser"),
  connectDevice: (device) => ipcRenderer.invoke("connectDevice", device),
  getConnections: () => ipcRenderer.invoke("getConnections"),
  syncProject: (data) => ipcRenderer.invoke("sync-project", data),
  syncAllProjects: () => ipcRenderer.invoke("sync-all-projects"),
  syncNetworkAndProjects: () => ipcRenderer.invoke("sync-network-and-projects"),
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
  gitCurrentBranch: (data) => ipcRenderer.invoke("git-current-branch", data),
  gitHeadCommit: (data) => ipcRenderer.invoke("git-head-commit", data),
  gitCheckoutBranch: (data) => ipcRenderer.invoke("git-checkout-branch", data),
  gitCheckoutCommit: (data) => ipcRenderer.invoke("git-checkout-commit", data),
  gitCommit: (data) => ipcRenderer.invoke("git-commit", data),
  gitCreateBranch: (data) => ipcRenderer.invoke("git-create-branch", data),
  gitCreateBranchFromCommit: (data) =>
    ipcRenderer.invoke("git-create-branch-from-commit", data),
  gitDeleteBranch: (data) => ipcRenderer.invoke("git-delete-branch", data),
  gitSetBranchPublic: (data) =>
    ipcRenderer.invoke("git-set-branch-public", data),
  gitMerge: (data) => ipcRenderer.invoke("git-merge", data),
  gitRebase: (data) => ipcRenderer.invoke("git-rebase", data),
  gitRevert: (data) => ipcRenderer.invoke("git-revert", data),
  gitReverUntil: (data) => ipcRenderer.invoke("git-revert-until", data),
  gitRevertCommit: (data) => ipcRenderer.invoke("git-revert-commit", data),
  getAllBranches: (data) => ipcRenderer.invoke("git-branches", data),
  gitRepoMap: (data) => ipcRenderer.invoke("git-repo-map", data),
  gitReadCommit: (data) => ipcRenderer.invoke("git-read-commit", data),
  gitReadFileFromCommit: (data) =>
    ipcRenderer.invoke("git-read-file-from-commit", data),
  gitDiscardUncommiteChanges: (data) =>
    ipcRenderer.invoke("git-discard-all", data),
  gitBranchHistory: (data) => ipcRenderer.invoke("git-branch-history", data),
  gitDirty: (data) => ipcRenderer.invoke("git-is-dirty", data),
  commCreateThread: (data) => ipcRenderer.invoke("comm-create-thread", data),
  commReplyThread: (data) => ipcRenderer.invoke("comm-reply-thread", data),
  commResolveThread: (data) => ipcRenderer.invoke("comm-resolve-thread", data),
  commGetFileThreads: (data) => ipcRenderer.invoke("comm-get-file-threads", data),
  commGetProjectThreads: (data) =>
    ipcRenderer.invoke("comm-get-project-threads", data),
  commGetAllThreads: () => ipcRenderer.invoke("comm-get-all-threads"),
  onCommunicationUpdated: (handler) => {
    if (typeof handler !== "function") {
      return () => {};
    }
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("comm-updated", listener);
    return () => ipcRenderer.removeListener("comm-updated", listener);
  },
});
