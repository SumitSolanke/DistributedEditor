import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import store from "../storage/project.js";

const userDataPath = app.getPath("userData");
console.log("User data path:", userDataPath);
const projectsRoot = path.join(userDataPath, "projects");

function getProjectRoot() {
  const currentProjectName = store.get("currentProject");
  if (!currentProjectName) {
    throw new Error("No project selected");
  }

  return path.join(projectsRoot, currentProjectName);
}

export function setCurrentProject(projectName) {
  const safeProjectName = typeof projectName === "string" ? projectName.trim() : "";
  const projects = store.get("projects", {});
  if (!safeProjectName || !projects[safeProjectName]) {
    throw new Error("Project not found");
  }
  store.set("currentProject", safeProjectName);
}

function resolveSafePath(relativePath) {
  const projectRoot = getProjectRoot();

  const resolvedPath = path.resolve(projectRoot, relativePath);

  // SECURITY CHECK: prevent path traversal
  if (!resolvedPath.startsWith(projectRoot)) {
    throw new Error("Invalid path access");
  }

  return resolvedPath;
}
export function fileHandlers() {
  ipcMain.handle("createFile", async (event, data) => {
    await createFile(data);
  });

  ipcMain.handle("editFile", async (event, data) => {
    await editFile(data);
  });

  ipcMain.handle("deleteFile", async (event, data) => {
    await deleteFile(data);
  });

  ipcMain.handle("readFile", async (event, data) => {
    return await readFile(data);
  });

  ipcMain.handle("createFolder", async (event, data) => {
    await createFolder(data);
  });

  ipcMain.handle("deleteFolder", async (event, data) => {
    await deleteFolder(data);
  });

  ipcMain.handle("loadProject", async (event, data) => {
    try {
      if (data?.projectName) {
        setCurrentProject(data.projectName);
      }
      return await buildTree(data?.path || "");
    } catch (error) {
      console.error("Error loading project:", error);
      return;
    }
  });
}
export async function createFile(data) {
  const fullPath = resolveSafePath(data.relativePath);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, "");
}

export async function editFile(data) {
  const fullPath = resolveSafePath(data.relativePath);

  await fs.writeFile(fullPath, data.content);
}

export async function deleteFile(data) {
  const fullPath = resolveSafePath(data.relativePath);

  await fs.unlink(fullPath);
}

export async function readFile(data) {
  const fullPath = resolveSafePath(data.relativePath);

  return await fs.readFile(fullPath, "utf8");
}

export async function createFolder(data) {
  const fullPath = resolveSafePath(data.relativePath);

  await fs.mkdir(fullPath, { recursive: true });
}

export async function deleteFolder(data) {
  const fullPath = resolveSafePath(data.relativePath);

  await fs.rm(fullPath, { recursive: true, force: true });
}

export async function buildTree(relativePath = "") {
  const projectRoot = getProjectRoot();
  const dirPath = resolveSafePath(relativePath);

  const items = await fs.readdir(dirPath, { withFileTypes: true });

  const children = await Promise.all(
    items.map(async (item) => {
      const itemRelativePath = path.join(relativePath, item.name);

      if (item.isDirectory()) {
        return {
          name: item.name,
          path: itemRelativePath,
          type: "folder",
          children: await buildTree(itemRelativePath),
        };
      } else {
        return {
          name: item.name,
          path: itemRelativePath,
          type: "file",
        };
      }
    }),
  );

  return children;
}

async function ensureProjectsRoot() {
  try {
    await fs.mkdir(projectsRoot, { recursive: true });
  } catch (err) {
    console.error("Error creating projects root:", err);
  }
}

export async function addProjectFolder(projectName) {
  const safeProjectName =
    typeof projectName === "string" ? projectName.trim() : "";
  if (!safeProjectName) {
    throw new Error("Project name is required");
  }
  await ensureProjectsRoot();
  const projectPath = path.join(projectsRoot, safeProjectName);
  try {
    await fs.mkdir(projectPath, { recursive: false });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      throw new Error("Project already exists");
    }
    throw error;
  }
  store.set("currentProject", safeProjectName);
  return true;
}

export async function deleteProjectFolder(projectName) {
  const projects = store.get("projects", {});

  if (!projects[projectName]) {
    throw new Error("Project not found");
  }

  // 1️⃣ Delete folder recursively
  const projectPath = path.join(projectsRoot, projectName);
  await fs.rm(projectPath, { recursive: true, force: true });

  // 2️⃣ Remove from store
  delete projects[projectName];
  store.set("projects", projects);
  store.set("currentProject", null);
  return true;
}

export default {
  fileHandlers,
  createFile,
  editFile,
  deleteFile,
  readFile,
  createFolder,
  deleteFolder,
  buildTree,
  addProjectFolder,
  deleteProjectFolder,
};
