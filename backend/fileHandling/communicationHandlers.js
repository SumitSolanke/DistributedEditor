import { ipcMain } from "electron";
import { getProjectById } from "../storage/project.js";
import { getSelf } from "../storage/store.js";
import {
  appendThreadReply,
  createThreadWithMessage,
  getAllThreads,
  getProjectThreads,
  getThread,
  getThreadsForFile,
  resolveThreadById,
} from "../storage/communication.js";
import { triggerProjectCommunicationSync } from "../network/websocketSync.js";

function getRequester() {
  const self = getSelf();
  if (!self || typeof self.email !== "string" || !self.email.trim()) {
    throw new Error("User profile is missing.");
  }
  return {
    email: self.email.trim(),
    name: typeof self.name === "string" ? self.name.trim() : "",
  };
}

function canResolveThread(project, thread, requesterEmail) {
  if (!project || !thread || !requesterEmail) return false;
  if (thread.createdBy === requesterEmail) return true;

  const branch = typeof thread.branch === "string" ? thread.branch.trim() : "";
  if (branch) {
    const meta = project?.branches?.[branch];
    if (meta?.owner === requesterEmail) return true;
    if (thread.branchOwner === requesterEmail) return true;
    if (branch === "global-main" && project?.owner?.email === requesterEmail) {
      return true;
    }
  }

  return false;
}

export function registerCommunicationHandlers() {
  ipcMain.handle("comm-create-thread", async (_event, payload) => {
    try {
      const requester = getRequester();
      const thread = createThreadWithMessage({
        ...payload,
        createdBy: requester.email,
        createdByName: requester.name,
      });
      await triggerProjectCommunicationSync(thread.projectId);
      return { success: true, data: thread };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("comm-reply-thread", async (_event, payload) => {
    try {
      const requester = getRequester();
      const thread = appendThreadReply({
        ...payload,
        author: requester.email,
        authorName: requester.name,
      });
      await triggerProjectCommunicationSync(thread.projectId);
      return { success: true, data: thread };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("comm-resolve-thread", async (_event, payload) => {
    try {
      const requester = getRequester();
      const projectId =
        typeof payload?.projectId === "string" ? payload.projectId.trim() : "";
      const threadId =
        typeof payload?.threadId === "string" ? payload.threadId.trim() : "";
      if (!projectId || !threadId) {
        throw new Error("projectId and threadId are required");
      }

      const project = getProjectById(projectId);
      if (!project?.public) {
        throw new Error("Communication is available only for public projects.");
      }

      const thread = getThread(projectId, threadId);
      if (!thread) {
        throw new Error("Thread not found.");
      }

      if (!canResolveThread(project, thread, requester.email)) {
        throw new Error("Only thread creator or branch owner can resolve.");
      }

      const updated = resolveThreadById({
        projectId,
        threadId,
        resolved: true,
      });
      await triggerProjectCommunicationSync(projectId);
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("comm-get-file-threads", async (_event, payload) => {
    try {
      const projectId =
        typeof payload?.projectId === "string" ? payload.projectId.trim() : "";
      const commitHash =
        typeof payload?.commitHash === "string" ? payload.commitHash.trim() : "";
      const filePath =
        typeof payload?.filePath === "string" ? payload.filePath.trim() : "";

      const data = getThreadsForFile(projectId, commitHash, filePath);
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message, data: [] };
    }
  });

  ipcMain.handle("comm-get-project-threads", async (_event, payload) => {
    try {
      const projectId =
        typeof payload?.projectId === "string" ? payload.projectId.trim() : "";
      const data = getProjectThreads(projectId);
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message, data: [] };
    }
  });

  ipcMain.handle("comm-get-all-threads", async () => {
    try {
      const data = getAllThreads();
      return { success: true, data };
    } catch (error) {
      return { success: false, message: error.message, data: [] };
    }
  });
}

