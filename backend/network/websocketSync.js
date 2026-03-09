import { getProjectById, getProjects } from "../storage/project.js";
import { getSelf } from "../storage/store.js";
import { BrowserWindow } from "electron";
import {
  ensureProjectCommunicationStore,
  getProjectThreadSummaries,
  getProjectThreadsByIds,
  upsertProjectThreads,
} from "../storage/communication.js";
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

function normalizeThreadIds(threadIds) {
  return Array.from(
    new Set(
      (Array.isArray(threadIds) ? threadIds : [])
        .map((threadId) =>
          typeof threadId === "string" ? threadId.trim() : "",
        )
        .filter(Boolean),
    ),
  );
}

function normalizeThreadSummaries(raw) {
  const map = new Map();
  const entries = Array.isArray(raw) ? raw : [];

  for (const entry of entries) {
    if (typeof entry === "string") {
      const threadId = entry.trim();
      if (!threadId || map.has(threadId)) continue;
      map.set(threadId, 0);
      continue;
    }

    if (!entry || typeof entry !== "object") continue;
    const threadId =
      typeof entry.threadId === "string" ? entry.threadId.trim() : "";
    if (!threadId) continue;

    const rawTimestamp = Number(entry.updatedTimestamp);
    const updatedTimestamp =
      Number.isFinite(rawTimestamp) && rawTimestamp > 0
        ? Math.floor(rawTimestamp)
        : 0;

    const previous = map.get(threadId);
    if (typeof previous !== "number" || updatedTimestamp > previous) {
      map.set(threadId, updatedTimestamp);
    }
  }

  return map;
}

function ensurePublicProject(projectId) {
  const project = getProjectById(projectId);
  if (!project || !project.public) return null;
  return project;
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

function notifyCommunicationUpdated(projectId, summary = {}) {
  if (!projectId) return;
  const added = Number(summary?.added || 0);
  const updated = Number(summary?.updated || 0);

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window?.isDestroyed()) {
      window.webContents.send("comm-updated", {
        projectId,
        added,
        updated,
        timestamp: Date.now(),
      });
    }
  }
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

async function handleCommSyncIds(socket, projectId, threadSummaryPayload = []) {
  const project = ensurePublicProject(projectId);
  if (!project) return;

  ensureProjectCommunicationStore(projectId);
  const remoteSummaryMap = normalizeThreadSummaries(threadSummaryPayload);
  const localSummaries = getProjectThreadSummaries(projectId);
  const localSummaryMap = new Map(
    localSummaries.map((item) => [item.threadId, item.updatedTimestamp]),
  );

  const missingOrStaleOnRemote = localSummaries
    .filter((item) => {
      const remoteTimestamp = remoteSummaryMap.get(item.threadId);
      if (typeof remoteTimestamp !== "number") return true;
      return item.updatedTimestamp > remoteTimestamp;
    })
    .map((item) => item.threadId);

  const missingOrStaleLocally = Array.from(remoteSummaryMap.entries())
    .filter(([threadId, remoteTimestamp]) => {
      const localTimestamp = localSummaryMap.get(threadId);
      if (typeof localTimestamp !== "number") return true;
      return remoteTimestamp > localTimestamp;
    })
    .map(([threadId]) => threadId);

  if (missingOrStaleOnRemote.length) {
    const threads = getProjectThreadsByIds(projectId, missingOrStaleOnRemote);
    if (threads.length) {
      sendMessage(socket, {
        type: "COMM_SYNC_THREADS",
        projectId,
        threads,
      });
    }
  }

  if (missingOrStaleLocally.length) {
    sendMessage(socket, {
      type: "COMM_SYNC_REQUEST",
      projectId,
      threadIds: missingOrStaleLocally,
    });
  }
}

async function handleCommSyncRequest(socket, projectId, threadIds = []) {
  const project = ensurePublicProject(projectId);
  if (!project) return;

  ensureProjectCommunicationStore(projectId);
  const requestedIds = normalizeThreadIds(threadIds);
  if (!requestedIds.length) return;

  const threads = getProjectThreadsByIds(projectId, requestedIds);
  if (!threads.length) return;

  sendMessage(socket, {
    type: "COMM_SYNC_THREADS",
    projectId,
    threads,
  });
}

async function handleCommSyncThreads(projectId, threads = []) {
  const project = ensurePublicProject(projectId);
  if (!project) return;

  ensureProjectCommunicationStore(projectId);
  const summary = upsertProjectThreads(projectId, Array.isArray(threads) ? threads : []);
  if ((summary?.added || 0) > 0 || (summary?.updated || 0) > 0) {
    notifyCommunicationUpdated(projectId, summary);
  }
}

async function sendCommThreadIds(socket, projectId) {
  const project = ensurePublicProject(projectId);
  if (!project) return;

  ensureProjectCommunicationStore(projectId);
  const threadSummaries = getProjectThreadSummaries(projectId);
  const threadIds = threadSummaries.map((item) => item.threadId);

  sendMessage(socket, {
    type: "COMM_SYNC_IDS",
    projectId,
    threadIds,
    threadSummaries,
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
        await sendCommThreadIds(socket, project.id);
      }
      break;
    }

    case "PROJECT_STATUS_RESPONSE":
      await handlePeerProjectStatus(socket, data);
      if (data?.projectId) {
        await sendCommThreadIds(socket, data.projectId);
      }
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

    case "COMM_SYNC_IDS":
      await handleCommSyncIds(
        socket,
        data.projectId,
        data.threadSummaries || data.threadIds || [],
      );
      break;

    case "COMM_SYNC_REQUEST":
      await handleCommSyncRequest(socket, data.projectId, data.threadIds || []);
      break;

    case "COMM_SYNC_THREADS":
      await handleCommSyncThreads(data.projectId, data.threads || []);
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

function isValidProjectMember(member, self) {
  return Boolean(
    member &&
      typeof member.email === "string" &&
      typeof member.ip === "string" &&
      member.email !== self?.email,
  );
}

export async function triggerProjectSync(projectId) {
  const project = getProjectById(projectId);
  const self = getSelf();

  if (!project || !project.public || !Array.isArray(project.members)) {
    return;
  }

  for (const member of project.members) {
    if (!isValidProjectMember(member, self)) continue;

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

export async function triggerProjectCommunicationSync(projectId) {
  const project = getProjectById(projectId);
  const self = getSelf();

  if (!project || !project.public || !Array.isArray(project.members)) {
    return;
  }

  ensureProjectCommunicationStore(project.id);

  for (const member of project.members) {
    if (!isValidProjectMember(member, self)) continue;

    const socket = await ensurePeerSocket(member);
    if (!socketReady(socket)) continue;

    await sendCommThreadIds(socket, project.id);
  }
}

export async function triggerCommunicationSyncAllProjectsWithPeer(socket) {
  if (!socketReady(socket)) return;

  const projects = getProjects().filter((project) => project?.public);
  for (const project of projects) {
    ensureProjectCommunicationStore(project.id);
    await sendCommThreadIds(socket, project.id);
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

export async function triggerCommunicationSyncAllProjects() {
  const projects = getProjects().filter((project) => project?.public);

  for (const project of projects) {
    await triggerProjectCommunicationSync(project.id);
  }
}

export async function triggerCommunicationSyncAllProjectsAtStartup() {
  await triggerCommunicationSyncAllProjects();
}
