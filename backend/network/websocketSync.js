import { getProjectById, getProjects } from "../storage/project.js";
import { getSelf } from "../storage/store.js";
import { getSocket, isSocketActive, removeSocket } from "./socketStore.js";
import {
  getOrCreateSocketForPeer,
  registerExternalMessageHandler,
} from "./websockets.js";
import {
  askPeerProjectStatus,
  handlePeerProjectStatus,
  handleSyncRefs,
  handleSyncHave,
  handleSyncObjects,
  handleProjectMetadata,
  handleProjectRefs,
  syncWithPeer,
} from "./peerSyncManager.js";

function socketReady(socket) {
  return isSocketActive(socket);
}

function sendMessage(socket, payload) {
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

async function ensurePeerSocket(peer) {
  if (!peer || !peer.email || !peer.ip) {
    return null;
  }

  const existing = getSocket(peer.email);
  if (socketReady(existing)) {
    return existing;
  }

  if (existing) {
    removeSocket(peer.email);
  }

  return await getOrCreateSocketForPeer(peer, {
    sendDeviceSyncOnOpen: true,
  });
}

async function routeMessage(socket, data) {
  const self = getSelf();
  const userEmail = self?.email || "";

  switch (data?.type) {
    case "PROJECT_STATUS": {
      const project = getProjectById(data.projectId);
      const hasProject = Boolean(project);

      sendMessage(socket, {
        type: "PROJECT_STATUS_RESPONSE",
        projectId: data.projectId,
        hasProject,
      });

      if (hasProject) {
        await syncWithPeer(socket, project);
      }
      break;
    }

    case "PROJECT_STATUS_RESPONSE":
      await handlePeerProjectStatus(socket, data);
      break;

    case "PROJECT_METADATA":
      await handleProjectMetadata(data);
      break;

    case "PROJECT_REFS":
      await handleProjectRefs(socket, data.projectId, data.refs || {});
      break;

    case "SYNC_REFS":
      await handleSyncRefs(socket, data.projectId, data.refs || {});
      break;

    case "SYNC_HAVE":
      await handleSyncHave(socket, data.projectId, data.have || []);
      break;

    case "SYNC_OBJECTS":
      await handleSyncObjects(
        data.projectId,
        data.objects || [],
        data.refs || {},
        userEmail,
      );
      break;

    default:
      break;
  }
}

registerExternalMessageHandler((socket, data) => routeMessage(socket, data));

export async function connectToPeer(peer) {
  return await ensurePeerSocket(peer);
}

export function startSyncServer() {
  // Sync now reuses the network server from websockets.js.
}

export async function triggerProjectSync(projectId) {
  const project = getProjectById(projectId);
  const self = getSelf();

  if (!project || !project.public || !Array.isArray(project.members)) {
    return;
  }

  for (const member of project.members) {
    if (!member || member.email === self?.email) continue;

    const socket = await ensurePeerSocket(member);
    if (!socketReady(socket)) continue;

    await askPeerProjectStatus(socket, project.id);
  }
}

export async function triggerSyncAllProjectsWithPeer(socket) {
  if (!socketReady(socket)) return;

  const projects = getProjects().filter((project) => project?.public);
  for (const project of projects) {
    await askPeerProjectStatus(socket, project.id);
  }
}

export async function triggerSyncAllProjects() {
  const projects = getProjects().filter((project) => project?.public);

  for (const project of projects) {
    await triggerProjectSync(project.id);
  }
}

export async function triggerSyncAllProjectsAtStartup() {
  await triggerSyncAllProjects();
}
