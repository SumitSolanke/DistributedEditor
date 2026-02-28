// main/store.js
import { ipcMain } from "electron";
import Store from "electron-store";

const store = new Store({
  name: "project",
  defaults: {
    projects: {},
  },
});

export default store;

export function addProject(projectName, connections = []) {
  if (typeof projectName !== "string" || !projectName.trim()) {
    throw new Error("Project name is required");
  }
  const safeProjectName = projectName.trim();
  const projects = store.get("projects");

  if (projects[safeProjectName]) {
    throw new Error("Project already exists");
  }

  projects[safeProjectName] = {
    connections: connections.map((conn) => ({
      username: conn.username,
      ip: conn.ip,
      email: conn.email,
    })),
  };

  store.set("projects", projects);
  return true;
}

export function getProjects() {
  const projects = store.get("projects");
  return Object.keys(projects);
}

export function deleteProject(projectName) {
  const projects = store.get("projects");

  if (!projects[projectName]) return;

  delete projects[projectName];

  store.set("projects", projects);
}

export function addConnection(projectName, connectionData) {
  const projects = store.get("projects");

  if (!projects[projectName]) {
    console.log("Project not found");
    return;
  }

  const exists = projects[projectName].connections.find(
    (conn) => conn.email === connectionData.email,
  );

  if (exists) {
    console.log("Connection already exists");
    return;
  }

  projects[projectName].connections.push({
    username: connectionData.username,
    ip: connectionData.ip,
    email: connectionData.email,
  });

  store.set("projects", projects);
}

export function removeConnection(projectName, email) {
  const projects = store.get("projects");

  if (!projects[projectName]) return;

  projects[projectName].connections = projects[projectName].connections.filter(
    (conn) => conn.email !== email,
  );

  store.set("projects", projects);
}
