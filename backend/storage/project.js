// main/store.js
import { ipcMain } from "electron";
import Store from "electron-store";
import { v4 as uuidv4 } from "uuid";
import { getSelf } from "./store.js";

const store = new Store({
  name: "project",
  defaults: {
    projects: [],
  },
});

export default store;

function getProjectsArray() {
  const projects = store.get("projects");

  if (Array.isArray(projects)) {
    return projects;
  }

  if (projects && typeof projects === "object") {
    const migrated = Object.values(projects).filter(
      (entry) => entry && typeof entry === "object",
    );
    store.set("projects", migrated);
    return migrated;
  }

  return [];
}

function getSelfOrThrow() {
  const self = getSelf();
  if (!self || typeof self.email !== "string" || !self.email.trim()) {
    throw new Error(
      "User profile is missing. Please register again before creating a project.",
    );
  }

  return {
    ...self,
    email: self.email.trim(),
  };
}

export function addProject(projectName, connections = [], isPublic = false) {
  if (typeof projectName !== "string" || !projectName.trim()) {
    throw new Error("Project name is required");
  }

  const safeProjectName = projectName.trim();
  const projects = getProjectsArray();

  if (projects.find((p) => p.name === safeProjectName)) {
    throw new Error("Project already exists");
  }

  const self = getSelfOrThrow(); // { name, email, ip }
  const projectId = uuidv4();

  const allMembers = [
    self,
    ...connections.map((conn) => ({
      username: conn.name,
      email: conn.email,
      ip: conn.ip,
    })),
  ];

  const newProject = {
    id: projectId,
    name: safeProjectName,
    owner: self,
    members: allMembers,
    public: isPublic,
    branches: {
      "global-main": {
        owner: self.email,
        visibility: "public",
      },
      [`${self.email}/local-main`]: {
        owner: self.email,
        visibility: isPublic ? "public" : "private",
      },
    },
  };

  projects.push(newProject);
  store.set("projects", projects);

  return projectId;
}

export function getProjects() {
  return getProjectsArray();
}

export function getProjectById(projectId) {
  const projects = getProjectsArray();
  return projects.find((p) => p.id === projectId);
}

export function deleteProject(projectId) {
  let projects = getProjectsArray();
  projects = projects.filter((p) => p.id !== projectId);
  store.set("projects", projects);
}

export function setProjectPublic(projectId) {
  const projects = getProjectsArray();
  const project = projects.find((p) => p.id === projectId);

  if (!project) throw new Error("Project not found");

  if (project.public) {
    return; // already public
  }

  project.public = true;

  // When project becomes public:
  // All local-main branches become public
  Object.keys(project.branches).forEach((branchName) => {
    if (branchName.endsWith("local-main")) {
      project.branches[branchName].visibility = "public";
    }
  });

  store.set("projects", projects);
}

export function registerBranch(projectId, branchName, visibility = "private") {
  const projects = getProjectsArray();
  const project = projects.find((p) => p.id === projectId);
  const self = getSelfOrThrow();

  if (!project) throw new Error("Project not found");

  if (project.branches[branchName]) {
    throw new Error("Branch already exists in metadata");
  }

  // Public branches cannot exist if project is private
  if (visibility === "public" && !project.public) {
    throw new Error("Cannot create public branch in private project");
  }

  project.branches[branchName] = {
    owner: self.email,
    visibility,
  };

  store.set("projects", projects);
}

export function deleteBranch(projectId, branchName) {
  const projects = getProjectsArray();
  const project = projects.find((p) => p.id === projectId);
  const self = getSelfOrThrow();
  const requesterEmail = self.email;
  if (!project) throw new Error("Project not found");

  const branch = project.branches[branchName];

  if (!branch) throw new Error("Branch not found");

  if (branch.visibility === "public") {
    throw new Error("Public branches cannot be deleted");
  }

  if (branch.owner !== requesterEmail) {
    throw new Error("Only branch owner can delete this branch");
  }

  if (branchName === "global-main") {
    throw new Error("global-main branch cannot be deleted");
  }

  if (branchName.endsWith("local-main")) {
    throw new Error("local-main branches cannot be deleted");
  }

  delete project.branches[branchName];

  store.set("projects", projects);
}

export function setBranchPublic(projectId, branchName) {
  const projects = getProjectsArray();
  const project = projects.find((p) => p.id === projectId);
  const self = getSelfOrThrow();
  const requesterEmail = self.email;
  if (!project) throw new Error("Project not found");

  if (!project.public) {
    throw new Error("Project must be public before branch can be public");
  }

  const branch = project.branches[branchName];

  if (!branch) throw new Error("Branch not found");

  if (branch.owner !== requesterEmail) {
    throw new Error("Only branch owner can make it public");
  }

  if (branch.visibility === "public") {
    return; // already public
  }

  branch.visibility = "public";

  store.set("projects", projects);
}
