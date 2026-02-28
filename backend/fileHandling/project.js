// main/ipcHandlers.js
import { ipcMain } from "electron";
import {
  addProject,
  getProjects,
  deleteProject,
  addConnection,
  removeConnection,
} from "../storage/project.js";
import { addProjectFolder, deleteProjectFolder } from "./fileOperations.js";

export function registerProjectHandlers() {
  ipcMain.handle("add-project", async (event, data) => {
    let projectAdded = false;
    const projectName = data?.projectName;
    try {
      const { connections } = data;

      addProject(projectName, connections || []);
      projectAdded = true;
      await addProjectFolder(projectName);
      return { success: true };
    } catch (error) {
      if (projectAdded) {
        try {
          deleteProject(projectName);
        } catch {
          // best effort rollback
        }
      }
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("get-projects", async () => {
    try {
      const projects = getProjects();
      return { success: true, data: projects };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("delete-project", async (event, data) => {
    try {
      const { projectName } = data;

      await deleteProjectFolder(projectName);
      deleteProject(projectName);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("add-connection", async (event, data) => {
    try {
      const { projectName, connection } = data;

      addConnection(projectName, connection);

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("remove-connection", async (event, data) => {
    try {
      const { projectName, email } = data;

      removeConnection(projectName, email);

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
}
