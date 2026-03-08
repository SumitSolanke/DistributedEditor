import path from "node:path";
import { app } from "electron";
import git from "isomorphic-git";
import fs from "fs-extra";

import {
  getAllRefs,
  prepareFetch,
  prepareObjectsForPeer,
  applyFetch,
} from "./gitSync.js";
import {
  hasUncommittedChanges,
  discardAllUncommittedChanges,
  getCurrentBranch,
  analyzeBranch,
} from "../fileHandling/gitManager.js";
import projectStore, { getProjectById, getProjects } from "../storage/project.js";
import { getSelf } from "../storage/store.js";

function getProjectsRoot() {
  return path.join(app.getPath("userData"), "projects");
}

export function getProjectPath(projectName) {
  return path.join(getProjectsRoot(), projectName);
}

function socketReady(socket) {
  return Boolean(socket) && socket.readyState === 1;
}

function sendToPeer(socket, payload) {
  if (!socketReady(socket)) return false;

  const self = getSelf();
  socket.send(
    JSON.stringify({
      ...payload,
      senderEmail: self?.email || "",
    }),
  );
  return true;
}

function isPublicProject(project) {
  return Boolean(project?.public);
}

function getUserLocalMainBranch(email) {
  return `${email}/local-main`;
}

function resolveBranchOwner(branchName, project) {
  if (branchName === "global-main") {
    return project?.owner?.email || project?.owner || "system";
  }

  if (typeof branchName === "string" && branchName.includes("/")) {
    return branchName.split("/")[0];
  }

  return project?.owner?.email || project?.owner || "system";
}

function upsertPublicBranchMetadata(projectId, refs = {}) {
  const project = getProjectById(projectId);
  if (!project || !project.public) return;

  const projects = getProjects();
  const index = projects.findIndex((item) => item?.id === projectId);
  if (index === -1) return;

  const nextProject = { ...projects[index] };
  const currentBranches = { ...(nextProject.branches || {}) };
  let changed = false;

  for (const branchName of Object.keys(refs || {})) {
    const existing = currentBranches[branchName];
    const owner = resolveBranchOwner(branchName, nextProject);

    if (!existing) {
      currentBranches[branchName] = {
        owner,
        visibility: "public",
      };
      changed = true;
      continue;
    }

    if (existing.visibility !== "public" || existing.owner !== owner) {
      currentBranches[branchName] = {
        ...existing,
        owner,
        visibility: "public",
      };
      changed = true;
    }
  }

  if (!changed) return;

  nextProject.branches = currentBranches;
  projects[index] = nextProject;
  projectStore.set("projects", projects);
}

function getPublicBranchNames(project) {
  const branches = project?.branches || {};
  const publicBranchNames = Object.entries(branches)
    .filter(([, meta]) => meta && meta.visibility === "public")
    .map(([name]) => name);

  if (!publicBranchNames.length && branches["global-main"]) {
    return ["global-main"];
  }

  return publicBranchNames;
}

async function getPublicRefs(projectPath, project) {
  const allRefs = await getAllRefs(projectPath);
  const allowed = new Set(getPublicBranchNames(project));
  const filtered = {};

  for (const [branch, oid] of Object.entries(allRefs)) {
    if (allowed.has(branch)) {
      filtered[branch] = oid;
    }
  }

  return filtered;
}

async function ensureProjectRepo(projectName) {
  const projectPath = getProjectPath(projectName);
  await fs.ensureDir(projectPath);

  const gitDir = path.join(projectPath, ".git");
  const exists = await fs.pathExists(gitDir);
  if (!exists) {
    await git.init({
      fs,
      dir: projectPath,
      defaultBranch: "global-main",
    });
  }

  return projectPath;
}

async function ensureLocalMainBranchAndCheckout(project) {
  const self = getSelf();
  if (!project || !self?.email) return;

  const projectPath = await ensureProjectRepo(project.name);
  const localMain = getUserLocalMainBranch(self.email);

  const branches = await git.listBranches({
    fs,
    dir: projectPath,
  });
  let createdLocalMain = false;

  if (!branches.includes(localMain)) {
    let sourceOid = null;

    try {
      sourceOid = await git.resolveRef({
        fs,
        dir: projectPath,
        ref: "global-main",
      });
    } catch {
      // fallback to first branch if global-main is missing
    }

    if (!sourceOid && branches.length) {
      try {
        sourceOid = await git.resolveRef({
          fs,
          dir: projectPath,
          ref: branches[0],
        });
      } catch {
        // keep null, branch creation below will fallback
      }
    }

    if (!sourceOid) {
      return;
    }

    await git.branch({
      fs,
      dir: projectPath,
      ref: localMain,
      object: sourceOid,
    });
    createdLocalMain = true;
  }

  const currentBranch = await git.currentBranch({
    fs,
    dir: projectPath,
    fullname: false,
  });

  if (createdLocalMain && currentBranch !== localMain) {
    await git.checkout({
      fs,
      dir: projectPath,
      ref: localMain,
      force: true,
    });
  }

  const projects = getProjects();
  const index = projects.findIndex((item) => item?.id === project.id);
  if (index === -1) return;

  const existing = projects[index];
  if (!existing.branches) {
    existing.branches = {};
  }

  const desiredVisibility = project.public ? "public" : "private";
  const localMainMeta = existing.branches[localMain];
  if (
    !localMainMeta ||
    localMainMeta.owner !== self.email ||
    localMainMeta.visibility !== desiredVisibility
  ) {
    existing.branches[localMain] = {
      owner: self.email,
      visibility: desiredVisibility,
    };
    projectStore.set("projects", projects);
  }
}

export async function askPeerProjectStatus(socket, projectId) {
  sendToPeer(socket, {
    type: "PROJECT_STATUS",
    projectId,
  });
}

export async function handlePeerProjectStatus(socket, data) {
  const { projectId, hasProject } = data || {};
  if (!projectId) return;

  const project = getProjectById(projectId);
  if (!project || !isPublicProject(project)) return;

  if (!hasProject) {
    await sendProjectMetadata(socket, project);
    await sendFullProject(socket, project);
    return;
  }

  await syncWithPeer(socket, project);
}

async function sendProjectMetadata(socket, project) {
  sendToPeer(socket, {
    type: "PROJECT_METADATA",
    project,
  });
}

async function sendFullProject(socket, project) {
  const projectPath = getProjectPath(project.name);
  const refs = await getPublicRefs(projectPath, project);

  sendToPeer(socket, {
    type: "PROJECT_REFS",
    projectId: project.id,
    refs,
  });
}

export async function syncWithPeer(socket, project) {
  if (!project || !isPublicProject(project)) return;

  const projectPath = getProjectPath(project.name);
  const refs = await getPublicRefs(projectPath, project);

  sendToPeer(socket, {
    type: "SYNC_REFS",
    projectId: project.id,
    refs,
  });
}

export async function handleSyncRefs(socket, projectId, remoteRefs = {}) {
  const project = getProjectById(projectId);
  if (!project || !isPublicProject(project)) return;
  upsertPublicBranchMetadata(projectId, remoteRefs);

  const projectPath = getProjectPath(project.name);
  const { have } = await prepareFetch(projectPath, remoteRefs);

  sendToPeer(socket, {
    type: "SYNC_HAVE",
    projectId,
    have,
  });
}

export async function handleSyncHave(socket, projectId, peerHave = []) {
  const project = getProjectById(projectId);
  if (!project || !isPublicProject(project)) return;

  const projectPath = getProjectPath(project.name);
  const refs = await getPublicRefs(projectPath, project);
  const objects = await prepareObjectsForPeer(projectPath, refs, peerHave);

  sendToPeer(socket, {
    type: "SYNC_OBJECTS",
    projectId,
    objects,
    refs,
  });
}

export async function handleSyncObjects(projectId, objects, refs, userEmail) {
  const project = getProjectById(projectId);
  if (!project || !isPublicProject(project)) return;
  upsertPublicBranchMetadata(projectId, refs || {});

  const projectPath = getProjectPath(project.name);
  const dirty = await hasUncommittedChanges(projectPath);

  if (dirty) {
    const currentBranch = await getCurrentBranch(projectPath);
    const branchInfo = analyzeBranch(currentBranch, userEmail);

    if (branchInfo.type === "user" && branchInfo.owner !== userEmail) {
      await discardAllUncommittedChanges(projectPath);
    }
  }

  await applyFetch(projectPath, objects || [], refs || {});
  await ensureLocalMainBranchAndCheckout(project);
}

export async function handleProjectMetadata(data) {
  const project = data?.project;
  if (!project || !project.id || !project.name) return;

  const projects = getProjects();
  const existingIndex = projects.findIndex((entry) => entry?.id === project.id);

  if (existingIndex === -1) {
    projects.push(project);
  } else {
    projects[existingIndex] = {
      ...projects[existingIndex],
      ...project,
      branches: {
        ...(projects[existingIndex]?.branches || {}),
        ...(project.branches || {}),
      },
    };
  }

  projectStore.set("projects", projects);
  await ensureProjectRepo(project.name);
  await ensureLocalMainBranchAndCheckout(project);
}

export async function handleProjectRefs(socket, projectId, refs = {}) {
  const project = getProjectById(projectId);
  if (!project || !isPublicProject(project)) return;
  upsertPublicBranchMetadata(projectId, refs);

  const projectPath = await ensureProjectRepo(project.name);
  const { have } = await prepareFetch(projectPath, refs);

  sendToPeer(socket, {
    type: "SYNC_HAVE",
    projectId,
    have,
  });
}
