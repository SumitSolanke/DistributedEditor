import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import Store from "electron-store";
import { getProjectById, getProjects } from "./project.js";

const STORE_SCHEMA_VERSION = 1;
const storeCache = new Map();

function normalizeProjectId(projectId) {
  return typeof projectId === "string" ? projectId.trim() : "";
}

function normalizeProjectName(projectName) {
  return typeof projectName === "string" ? projectName.trim() : "";
}

function normalizeBranchName(branchName) {
  if (typeof branchName !== "string") return "";
  const trimmed = branchName.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("refs/heads/")) {
    return trimmed.slice("refs/heads/".length);
  }
  return trimmed;
}

function normalizeFilePath(filePath) {
  if (typeof filePath !== "string") return "";
  return filePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function normalizeLine(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function normalizeTimestamp(value) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return Date.now();
  return Math.floor(ts);
}

function toStoreName(projectId) {
  return `${projectId.replace(/[^a-zA-Z0-9_-]/g, "_")}_messages`;
}

function getCommunicationRoot() {
  return path.join(app.getPath("userData"), "communication");
}

export function ensureCommunicationRoot() {
  fs.mkdirSync(getCommunicationRoot(), { recursive: true });
}

function emptyStoreData(projectId, projectName = "") {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    projectId,
    projectName,
    threadsById: {},
    threadIds: [],
    indexByCommitFile: {},
  };
}

function getStore(projectId, projectName = "") {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) {
    throw new Error("projectId is required");
  }

  if (storeCache.has(normalizedProjectId)) {
    return storeCache.get(normalizedProjectId);
  }

  ensureCommunicationRoot();

  const store = new Store({
    name: toStoreName(normalizedProjectId),
    cwd: getCommunicationRoot(),
    defaults: emptyStoreData(normalizedProjectId, normalizeProjectName(projectName)),
  });

  storeCache.set(normalizedProjectId, store);
  return store;
}

function commitFileKey(commitHash, filePath) {
  return `${commitHash}::${normalizeFilePath(filePath)}`;
}

function normalizeMessage(raw) {
  const messageId =
    typeof raw?.messageId === "string" && raw.messageId.trim()
      ? raw.messageId.trim()
      : randomUUID();

  return {
    messageId,
    author:
      typeof raw?.author === "string" && raw.author.trim() ? raw.author.trim() : "unknown",
    authorName:
      typeof raw?.authorName === "string" && raw.authorName.trim()
        ? raw.authorName.trim()
        : "",
    messageText:
      typeof raw?.messageText === "string" ? raw.messageText : "",
    timestamp: normalizeTimestamp(raw?.timestamp),
    resolved: raw?.resolved === true,
  };
}

function sortMessages(messages = []) {
  return [...messages].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.messageId.localeCompare(b.messageId);
  });
}

function normalizeThread(raw, fallbackProjectId, fallbackProjectName = "") {
  const normalizedProjectId = normalizeProjectId(
    raw?.projectId || fallbackProjectId,
  );
  const normalizedProjectName = normalizeProjectName(
    raw?.projectName || fallbackProjectName,
  );

  const messages = sortMessages(
    Array.isArray(raw?.messages) ? raw.messages.map(normalizeMessage) : [],
  );
  const startLine = normalizeLine(raw?.startLine, 1);
  const endLine = normalizeLine(raw?.endLine, startLine);
  const firstLine = Math.min(startLine, endLine);
  const lastLine = Math.max(startLine, endLine);
  const createdTimestamp = normalizeTimestamp(raw?.createdTimestamp);
  const latestMessageTs = messages.length
    ? messages[messages.length - 1].timestamp
    : createdTimestamp;
  const resolvedByMessages = messages.some((message) => message.resolved);

  return {
    threadId:
      typeof raw?.threadId === "string" && raw.threadId.trim()
        ? raw.threadId.trim()
        : randomUUID(),
    projectId: normalizedProjectId,
    projectName: normalizedProjectName,
    filePath: normalizeFilePath(raw?.filePath || ""),
    commitHash:
      typeof raw?.commitHash === "string" ? raw.commitHash.trim() : "",
    branch: normalizeBranchName(raw?.branch || ""),
    branchOwner:
      typeof raw?.branchOwner === "string" && raw.branchOwner.trim()
        ? raw.branchOwner.trim()
        : "",
    startLine: firstLine,
    endLine: lastLine,
    createdBy:
      typeof raw?.createdBy === "string" && raw.createdBy.trim()
        ? raw.createdBy.trim()
        : "unknown",
    createdByName:
      typeof raw?.createdByName === "string" && raw.createdByName.trim()
        ? raw.createdByName.trim()
        : "",
    createdTimestamp,
    resolved: raw?.resolved === true || resolvedByMessages,
    messages,
    updatedTimestamp: Math.max(
      normalizeTimestamp(raw?.updatedTimestamp || 0),
      latestMessageTs,
      createdTimestamp,
    ),
  };
}

function mergeMessages(existingMessages = [], incomingMessages = []) {
  const byId = new Map();

  for (const raw of existingMessages) {
    const message = normalizeMessage(raw);
    byId.set(message.messageId, message);
  }

  for (const raw of incomingMessages) {
    const incoming = normalizeMessage(raw);
    const existing = byId.get(incoming.messageId);
    if (!existing) {
      byId.set(incoming.messageId, incoming);
      continue;
    }

    const newer = incoming.timestamp >= existing.timestamp ? incoming : existing;
    byId.set(incoming.messageId, {
      ...existing,
      ...newer,
      resolved: existing.resolved || incoming.resolved,
    });
  }

  return sortMessages(Array.from(byId.values()));
}

function mergeThreads(existingRaw, incomingRaw, fallbackProjectId, fallbackProjectName) {
  const existing = normalizeThread(existingRaw, fallbackProjectId, fallbackProjectName);
  const incoming = normalizeThread(incomingRaw, fallbackProjectId, fallbackProjectName);
  const messages = mergeMessages(existing.messages, incoming.messages);
  const createdTimestamp = Math.min(existing.createdTimestamp, incoming.createdTimestamp);
  const latestMessageTs = messages.length
    ? messages[messages.length - 1].timestamp
    : createdTimestamp;

  return {
    ...existing,
    ...incoming,
    threadId: existing.threadId || incoming.threadId,
    projectId: existing.projectId || incoming.projectId,
    projectName: incoming.projectName || existing.projectName,
    branch: incoming.branch || existing.branch,
    branchOwner: incoming.branchOwner || existing.branchOwner,
    startLine: Math.min(existing.startLine, incoming.startLine),
    endLine: Math.max(existing.endLine, incoming.endLine),
    createdBy: existing.createdBy || incoming.createdBy,
    createdByName: existing.createdByName || incoming.createdByName,
    createdTimestamp,
    messages,
    resolved:
      existing.resolved ||
      incoming.resolved ||
      messages.some((message) => message.resolved),
    updatedTimestamp: Math.max(
      existing.updatedTimestamp,
      incoming.updatedTimestamp,
      latestMessageTs,
      createdTimestamp,
    ),
  };
}

function buildIndex(threadsById) {
  const index = {};
  for (const thread of Object.values(threadsById || {})) {
    if (!thread?.threadId || !thread?.commitHash || !thread?.filePath) continue;
    const key = commitFileKey(thread.commitHash, thread.filePath);
    if (!Array.isArray(index[key])) index[key] = [];
    index[key].push(thread.threadId);
  }

  for (const ids of Object.values(index)) {
    ids.sort((a, b) => a.localeCompare(b));
  }

  return index;
}

function readData(projectId, fallbackProjectName = "") {
  const store = getStore(projectId, fallbackProjectName);
  const normalizedProjectId = normalizeProjectId(projectId);
  const fallbackName = normalizeProjectName(fallbackProjectName);
  const rawThreadsById = store.get("threadsById", {});

  const threadsById = {};
  const threadIds = [];
  for (const [threadId, rawThread] of Object.entries(rawThreadsById || {})) {
    const normalizedThread = normalizeThread(
      { ...(rawThread || {}), threadId },
      normalizedProjectId,
      fallbackName,
    );
    if (!normalizedThread.threadId || !normalizedThread.commitHash || !normalizedThread.filePath) {
      continue;
    }
    threadsById[normalizedThread.threadId] = normalizedThread;
    threadIds.push(normalizedThread.threadId);
  }

  const uniqueIds = Array.from(new Set(threadIds));
  const projectName =
    normalizeProjectName(store.get("projectName", "")) || fallbackName;
  const indexByCommitFile = buildIndex(threadsById);

  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    projectId: normalizedProjectId,
    projectName,
    threadsById,
    threadIds: uniqueIds,
    indexByCommitFile,
  };
}

function writeData(projectId, data) {
  const store = getStore(projectId, data?.projectName || "");
  store.set("schemaVersion", STORE_SCHEMA_VERSION);
  store.set("projectId", normalizeProjectId(projectId));
  store.set("projectName", normalizeProjectName(data?.projectName || ""));
  store.set("threadsById", data?.threadsById || {});
  store.set("threadIds", data?.threadIds || []);
  store.set("indexByCommitFile", data?.indexByCommitFile || {});
}

function asThreadArray(data) {
  return (data?.threadIds || [])
    .map((threadId) => data?.threadsById?.[threadId])
    .filter(Boolean)
    .map((thread) => ({
      ...thread,
      messages: sortMessages(thread.messages || []),
    }));
}

function resolveProjectBranch(project, branchName) {
  const normalizedBranch = normalizeBranchName(branchName);
  if (!normalizedBranch) {
    return { branch: "", branchOwner: "" };
  }

  const meta = project?.branches?.[normalizedBranch];
  return {
    branch: normalizedBranch,
    branchOwner:
      typeof meta?.owner === "string" && meta.owner.trim() ? meta.owner.trim() : "",
  };
}

export function ensureProjectCommunicationStore(projectId) {
  const project = getProjectById(projectId);
  if (!project?.public) return false;
  ensureCommunicationRoot();
  const store = getStore(projectId, project.name || "");
  if (!store.has("threadsById")) {
    store.set("threadsById", {});
  }
  if (!store.has("threadIds")) {
    store.set("threadIds", []);
  }
  if (!store.has("indexByCommitFile")) {
    store.set("indexByCommitFile", {});
  }
  store.set("projectId", normalizeProjectId(projectId));
  store.set("projectName", normalizeProjectName(project.name || ""));
  return true;
}

export function deleteProjectCommunicationStore(projectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return;
  const storeName = toStoreName(normalizedProjectId);
  const filePath = path.join(getCommunicationRoot(), `${storeName}.json`);
  storeCache.delete(normalizedProjectId);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.warn(
      `Failed to delete communication store file ${filePath}:`,
      error?.message || error,
    );
  }
}

export function canCreateCommunicationOnBranch(projectId, branchName = "") {
  const project = getProjectById(projectId);
  if (!project?.public) {
    return {
      ok: false,
      reason: "Communication is allowed only for public projects.",
      project: null,
      branch: "",
      branchOwner: "",
    };
  }

  const resolved = resolveProjectBranch(project, branchName);
  if (!resolved.branch) {
    return {
      ok: true,
      reason: "",
      project,
      branch: "",
      branchOwner: "",
    };
  }

  if (resolved.branch === "global-main") {
    return {
      ok: true,
      reason: "",
      project,
      branch: resolved.branch,
      branchOwner:
        resolved.branchOwner ||
        (typeof project?.owner?.email === "string" ? project.owner.email : ""),
    };
  }

  const branchMeta = project?.branches?.[resolved.branch];
  if (!branchMeta || branchMeta.visibility !== "public") {
    return {
      ok: false,
      reason: `Branch "${resolved.branch}" is not public.`,
      project,
      branch: resolved.branch,
      branchOwner: resolved.branchOwner,
    };
  }

  return {
    ok: true,
    reason: "",
    project,
    branch: resolved.branch,
    branchOwner: resolved.branchOwner,
  };
}

export function createThreadWithMessage(input) {
  const projectId = normalizeProjectId(input?.projectId);
  if (!projectId) throw new Error("projectId is required");

  const gate = canCreateCommunicationOnBranch(projectId, input?.branch || "");
  if (!gate.ok) {
    throw new Error(gate.reason || "Communication is not allowed on this branch.");
  }

  ensureProjectCommunicationStore(projectId);

  const commitHash =
    typeof input?.commitHash === "string" ? input.commitHash.trim() : "";
  const filePath = normalizeFilePath(input?.filePath || "");
  const messageText =
    typeof input?.messageText === "string" ? input.messageText.trim() : "";
  if (!commitHash) throw new Error("commitHash is required");
  if (!filePath) throw new Error("filePath is required");
  if (!messageText) throw new Error("messageText is required");

  const startLine = normalizeLine(input?.startLine, 1);
  const endLine = normalizeLine(input?.endLine, startLine);
  const firstLine = Math.min(startLine, endLine);
  const lastLine = Math.max(startLine, endLine);
  const createdTimestamp = normalizeTimestamp(input?.createdTimestamp);
  const threadId = randomUUID();
  const message = normalizeMessage({
    messageId: randomUUID(),
    author: input?.createdBy,
    authorName: input?.createdByName,
    messageText,
    timestamp: createdTimestamp,
    resolved: false,
  });

  const thread = normalizeThread(
    {
      threadId,
      projectId,
      projectName: gate.project?.name || input?.projectName || "",
      filePath,
      commitHash,
      branch: gate.branch || "",
      branchOwner: gate.branchOwner || "",
      startLine: firstLine,
      endLine: lastLine,
      createdBy: input?.createdBy,
      createdByName: input?.createdByName,
      createdTimestamp,
      resolved: false,
      messages: [message],
      updatedTimestamp: createdTimestamp,
    },
    projectId,
    gate.project?.name || input?.projectName || "",
  );

  const data = readData(projectId, gate.project?.name || input?.projectName || "");
  data.threadsById[thread.threadId] = thread;
  if (!data.threadIds.includes(thread.threadId)) {
    data.threadIds.push(thread.threadId);
  }
  data.indexByCommitFile = buildIndex(data.threadsById);
  data.projectName = normalizeProjectName(gate.project?.name || data.projectName);
  writeData(projectId, data);
  return thread;
}

export function appendThreadReply(input) {
  const projectId = normalizeProjectId(input?.projectId);
  const threadId = typeof input?.threadId === "string" ? input.threadId.trim() : "";
  const messageText =
    typeof input?.messageText === "string" ? input.messageText.trim() : "";

  if (!projectId) throw new Error("projectId is required");
  if (!threadId) throw new Error("threadId is required");
  if (!messageText) throw new Error("messageText is required");

  const project = getProjectById(projectId);
  if (!project?.public) {
    throw new Error("Communication is allowed only for public projects.");
  }

  const data = readData(projectId, project.name || "");
  const existing = data.threadsById[threadId];
  if (!existing) throw new Error("Thread not found");

  const message = normalizeMessage({
    messageId: randomUUID(),
    author: input?.author,
    authorName: input?.authorName,
    messageText,
    timestamp: normalizeTimestamp(input?.timestamp),
    resolved: existing.resolved,
  });

  const merged = mergeThreads(
    existing,
    {
      ...existing,
      messages: [...(existing.messages || []), message],
      updatedTimestamp: message.timestamp,
    },
    projectId,
    project.name || "",
  );
  data.threadsById[threadId] = merged;
  data.indexByCommitFile = buildIndex(data.threadsById);
  writeData(projectId, data);
  return merged;
}

export function getThread(projectId, threadId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const normalizedThreadId =
    typeof threadId === "string" ? threadId.trim() : "";
  if (!normalizedProjectId || !normalizedThreadId) return null;

  const project = getProjectById(normalizedProjectId);
  if (!project?.public) return null;

  const data = readData(normalizedProjectId, project.name || "");
  const thread = data.threadsById[normalizedThreadId];
  if (!thread) return null;
  return normalizeThread(thread, normalizedProjectId, project.name || "");
}

export function resolveThreadById(input) {
  const projectId = normalizeProjectId(input?.projectId);
  const threadId = typeof input?.threadId === "string" ? input.threadId.trim() : "";
  const resolved = input?.resolved !== false;
  if (!projectId) throw new Error("projectId is required");
  if (!threadId) throw new Error("threadId is required");

  const project = getProjectById(projectId);
  if (!project?.public) {
    throw new Error("Communication is allowed only for public projects.");
  }

  const data = readData(projectId, project.name || "");
  const existing = data.threadsById[threadId];
  if (!existing) throw new Error("Thread not found");

  const next = normalizeThread(
    {
      ...existing,
      resolved,
      updatedTimestamp: normalizeTimestamp(input?.timestamp),
    },
    projectId,
    project.name || "",
  );
  data.threadsById[threadId] = next;
  data.indexByCommitFile = buildIndex(data.threadsById);
  writeData(projectId, data);
  return next;
}

export function getThreadsForFile(projectId, commitHash, filePath) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const normalizedCommitHash =
    typeof commitHash === "string" ? commitHash.trim() : "";
  const normalizedFilePath = normalizeFilePath(filePath);
  if (!normalizedProjectId || !normalizedCommitHash || !normalizedFilePath) {
    return [];
  }

  const project = getProjectById(normalizedProjectId);
  if (!project?.public) return [];

  const data = readData(normalizedProjectId, project.name || "");
  const key = commitFileKey(normalizedCommitHash, normalizedFilePath);
  const ids = Array.isArray(data.indexByCommitFile[key])
    ? data.indexByCommitFile[key]
    : [];

  const threads = ids
    .map((threadId) => data.threadsById[threadId])
    .filter(Boolean)
    .map((thread) => normalizeThread(thread, normalizedProjectId, project.name || ""))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  return threads;
}

export function getProjectThreads(projectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return [];

  const project = getProjectById(normalizedProjectId);
  if (!project?.public) return [];

  const data = readData(normalizedProjectId, project.name || "");
  return asThreadArray(data).sort((a, b) => b.updatedTimestamp - a.updatedTimestamp);
}

export function getAllThreads() {
  const projects = getProjects().filter((project) => project?.public);
  const all = [];

  for (const project of projects) {
    const threads = getProjectThreads(project.id);
    for (const thread of threads) {
      all.push(thread);
    }
  }

  return all.sort((a, b) => b.updatedTimestamp - a.updatedTimestamp);
}

export function getProjectThreadIds(projectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return [];
  const project = getProjectById(normalizedProjectId);
  if (!project?.public) return [];
  const data = readData(normalizedProjectId, project.name || "");
  return [...data.threadIds];
}

export function getProjectThreadSummaries(projectId) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return [];

  const project = getProjectById(normalizedProjectId);
  if (!project?.public) return [];

  const data = readData(normalizedProjectId, project.name || "");
  return data.threadIds
    .map((threadId) => {
      const thread = data.threadsById[threadId];
      if (!thread?.threadId) return null;
      return {
        threadId: thread.threadId,
        updatedTimestamp: normalizeTimestamp(thread.updatedTimestamp),
      };
    })
    .filter(Boolean);
}

export function getProjectThreadsByIds(projectId, threadIds = []) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return [];
  const project = getProjectById(normalizedProjectId);
  if (!project?.public) return [];

  const data = readData(normalizedProjectId, project.name || "");
  const uniqueIds = Array.from(
    new Set(
      (Array.isArray(threadIds) ? threadIds : [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean),
    ),
  );

  return uniqueIds
    .map((threadId) => data.threadsById[threadId])
    .filter(Boolean)
    .map((thread) => normalizeThread(thread, normalizedProjectId, project.name || ""));
}

export function upsertProjectThreads(projectId, incomingThreads = []) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) {
    return { added: 0, updated: 0 };
  }

  const project = getProjectById(normalizedProjectId);
  if (!project?.public) {
    return { added: 0, updated: 0 };
  }

  ensureProjectCommunicationStore(normalizedProjectId);

  const data = readData(normalizedProjectId, project.name || "");
  let added = 0;
  let updated = 0;

  for (const rawThread of Array.isArray(incomingThreads) ? incomingThreads : []) {
    const incoming = normalizeThread(rawThread, normalizedProjectId, project.name || "");
    if (!incoming.threadId || !incoming.commitHash || !incoming.filePath) continue;

    const existing = data.threadsById[incoming.threadId];
    if (!existing) {
      data.threadsById[incoming.threadId] = incoming;
      if (!data.threadIds.includes(incoming.threadId)) {
        data.threadIds.push(incoming.threadId);
      }
      added += 1;
      continue;
    }

    const merged = mergeThreads(
      existing,
      incoming,
      normalizedProjectId,
      project.name || "",
    );
    const before = JSON.stringify(existing);
    const after = JSON.stringify(merged);
    if (before !== after) {
      data.threadsById[incoming.threadId] = merged;
      updated += 1;
    }
  }

  if (added > 0 || updated > 0) {
    data.projectName = normalizeProjectName(project.name || data.projectName);
    data.indexByCommitFile = buildIndex(data.threadsById);
    writeData(normalizedProjectId, data);
  }

  return { added, updated };
}

