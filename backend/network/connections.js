import { ipcMain } from "electron";
import user from "../storage/store.js";

function registerUserHandlers() {
  ipcMain.handle("userRegistration", async (event, data) => {
    console.log("User registration data:", data);
    user.set("userInfo", data);
    return { success: true };
  });

  ipcMain.handle("isUserRegistered", async () => {
    const hasUser = user.has("userInfo");
    console.log("Backend has user registered:", hasUser);
    return hasUser;
  });

  ipcMain.handle("clearUserData", async () => {
    user.delete("userInfo");
    console.log("Backend user data cleared");
    return { success: true };
  });

  ipcMain.handle("resetRegistration", async () => {
    user.clear();
    console.log("Backend registration reset");
    return { success: true };
  });
}

export default registerUserHandlers;
