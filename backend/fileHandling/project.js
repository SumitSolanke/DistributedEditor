// main/ipcHandlers.js
import { ipcMain } from "electron";
import {
  addProject,
  getProjects,
  deleteProject,
  setProjectPublic,
} from "../storage/project.js";
import { addProjectFolder, deleteProjectFolder } from "./fileOperations.js";

export function registerProjectHandlers() {
  ipcMain.handle("add-project", async (event, data) => {
    let projectAdded = false;
    let createdProjectId = null;
    const projectName = data?.projectName;
    try {
      const { connections, isPublic } = data;

      createdProjectId = addProject(
        projectName,
        connections || [],
        isPublic || false,
      );
      projectAdded = true;
      await addProjectFolder(projectName);
      return { success: true };
    } catch (error) {
      if (projectAdded && createdProjectId) {
        try {
          deleteProject(createdProjectId);
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
      const { projectName, id } = data;

      await deleteProjectFolder(projectName);
      deleteProject(id);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("set-project-public", async (event, data) => {
    try {
      const { id } = data;

      setProjectPublic(id);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
}
