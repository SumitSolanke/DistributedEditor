import {
  registerSelf,
  hasSelf,
  deleteSelf,
  getFullListIncludingSelf,
  getSelf,
} from "../storage/store.js";
import { ipcMain } from "electron/main";
import { syncWithDevice } from "./websockets.js";

export function registerUser(data) {
  registerSelf(data);
  console.log(data);
  return { success: true };
}

export function isUserRegistered() {
  return hasSelf();
}

export function getRegisteredUserData() {
  return getSelf() || null;
}

export function deleteUser() {
  deleteSelf();
  return { success: true };
}

export function registerHandlers() {
  ipcMain.handle("isUserRegistered", async () => {
    try {
      return Boolean(isUserRegistered());
    } catch (e) {
      console.error("IPC isUserRegistered error:", e);
      return false;
    }
  });

  ipcMain.handle("getRegisteredUser", async () => {
    try {
      const user = getRegisteredUserData();
      return { success: true, user };
    } catch (e) {
      console.error("IPC getRegisteredUser error:", e);
      return { success: false, user: null, error: String(e) };
    }
  });

  ipcMain.handle("userRegistration", async (event, data) => {
    try {
      return registerUser(data);
    } catch (e) {
      console.error("IPC userRegistration error:", e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle("connectDevice", async (event, device) => {
    try {
      device = device.trim();
      syncWithDevice(device);
      return { success: true };
    } catch (e) {
      console.error("IPC connectDevice error:", e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle("getConnections", async () => {
    try {
      const list = getFullListIncludingSelf();
      return { success: true, connections: list };
    } catch (e) {
      console.error("IPC getConnections error:", e);
      return { success: false, error: String(e), connections: [] };
    }
  });
}

export default {
  registerUser,
  isUserRegistered,
  getRegisteredUserData,
  deleteUser,
  registerHandlers,
};
