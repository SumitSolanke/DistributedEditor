import { user, addDevice, devices } from "../storage/store.js";
import { ipcMain } from "electron/main";
import { sendDeviceListToDevice } from "./websockets.js";

export function registerUser(data) {
  user.set("userInfo", data);
  addDevice(data);
  console.log("Backend: user registered", data?.name ?? "(no name)");
  return { success: true };
}

/**
 * Check whether a user is registered in the backend store.
 * @returns {boolean}
 */
export function isUserRegistered() {
  const has = user.has("userInfo");
  console.log("Backend: isUserRegistered ->", has);
  return has;
}

/**
 * Optional cleanup helper: delete stored user info.
 * Intended to be called by backend on application shutdown during development.
 */
export function deleteUser() {
  user.delete("userInfo");
  console.log("Backend: user info deleted");
  return { success: true };
}

export function registerHandlers() {
  // IPC: expose minimal backend user API for renderer
  ipcMain.handle("isUserRegistered", async () => {
    try {
      return Boolean(isUserRegistered());
    } catch (e) {
      console.error("IPC isUserRegistered error:", e);
      return false;
    }
  });

  ipcMain.handle("userRegistration", async (event, data) => {
    try {
      const res = registerUser(data);
      return res;
    } catch (e) {
      console.error("IPC userRegistration error:", e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle("connectDevice", async (event, device) => {
    try {
      device = device.trim();
      sendDeviceListToDevice(device);
      return { success: true };
    } catch (e) {
      console.error("IPC connectDevice error:", e);
      return { success: false, error: String(e) };
    }
  });

  ipcMain.handle("getConnections", async () => {
    try {
      const list = devices.get("list") || [];
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
  deleteUser,
  registerHandlers,
};
