import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, MessageSquare, RefreshCw, Send } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import type { CommunicationThread } from "../../types/electron.types";
import Toast from "../ui/Toast";

interface Props {
  isOpen: boolean;
}

interface FileCommunicationContext {
  projectId: string;
  projectName: string;
  filePath: string;
  commitHash: string;
  branch: string;
  canCreate: boolean;
  createDisabledReason: string;
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function shortCommit(value: string) {
  return value ? value.slice(0, 10) : "";
}

function formatTime(timestamp: number) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function sortMessages<T extends CommunicationThread>(thread: T): T {
  return {
    ...thread,
    messages: [...(thread.messages || [])].sort((a, b) => a.timestamp - b.timestamp),
  };
}

function sortFileThreads(threads: CommunicationThread[]) {
  return [...threads]
    .map(sortMessages)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function sortGlobalThreads(threads: CommunicationThread[]) {
  return [...threads]
    .map(sortMessages)
    .sort((a, b) => b.updatedTimestamp - a.updatedTimestamp);
}

function branchCreationAccess(
  project: { public?: boolean; branches?: Record<string, { visibility?: string }> } | null,
  branchName: string,
) {
  if (!project?.public) {
    return {
      canCreate: false,
      reason: "Communication is available only for public projects.",
    };
  }

  if (!branchName) {
    return { canCreate: true, reason: "" };
  }

  if (branchName === "global-main") {
    return { canCreate: true, reason: "" };
  }

  const branchMeta = project.branches?.[branchName];
  if (!branchMeta || branchMeta.visibility !== "public") {
    return {
      canCreate: false,
      reason: `Branch "${branchName}" is private. Tagging is blocked.`,
    };
  }

  return { canCreate: true, reason: "" };
}

export default function RightSidebar({ isOpen }: Props) {
  const {
    currentProject,
    openFiles,
    activeFileId,
    selectionRange,
    setSelectionRange,
    setCommunicationPanelOpen,
    openCommunicationViewer,
    setCommunicationThreads,
  } = useEditorStore();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [threads, setThreads] = useState<CommunicationThread[]>([]);
  const [globalThreads, setGlobalThreads] = useState<CommunicationThread[]>([]);
  const [context, setContext] = useState<FileCommunicationContext | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newThreadText, setNewThreadText] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busyThreadId, setBusyThreadId] = useState("");

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastTone, setToastTone] = useState<"error" | "success">("error");

  const contextKeyRef = useRef("");

  const activeFile = useMemo(
    () => openFiles.find((file) => file.id === activeFileId) || null,
    [openFiles, activeFileId],
  );
  const activeFilePath = activeFile?.path ? normalizePath(activeFile.path) : "";

  const showError = useCallback((message: string) => {
    setToastTone("error");
    setToastMessage(message);
    setToastOpen(true);
  }, []);

  const showSuccess = useCallback((message: string) => {
    setToastTone("success");
    setToastMessage(message);
    setToastOpen(true);
  }, []);

  const loadGlobalThreads = useCallback(async () => {
    if (!window.api?.commGetAllThreads) return;
    setLoading(true);
    try {
      const res = await window.api.commGetAllThreads();
      if (!res?.success) {
        throw new Error(res?.message || "Unable to load communication threads.");
      }
      setGlobalThreads(sortGlobalThreads(res.data || []));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load communication threads.";
      showError(message);
      setGlobalThreads([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const loadFileThreads = useCallback(
    async (force: boolean) => {
      if (!window.api?.commGetFileThreads || !currentProject || !activeFilePath) {
        setContext(null);
        setThreads([]);
        setCommunicationThreads([]);
        return;
      }

      const [headRes, branchRes] = await Promise.all([
        window.api?.gitHeadCommit?.({ projectName: currentProject.name }),
        window.api?.gitCurrentBranch?.({ projectName: currentProject.name }),
      ]);

      if (!headRes?.success || !headRes.data) {
        setContext(null);
        setThreads([]);
        setCommunicationThreads([]);
        showError(headRes?.message || "Unable to read current commit.");
        return;
      }

      const branch =
        branchRes?.success && typeof branchRes.data === "string"
          ? branchRes.data.trim()
          : "";
      const creation = branchCreationAccess(currentProject, branch);
      const nextContext: FileCommunicationContext = {
        projectId: currentProject.id,
        projectName: currentProject.name,
        filePath: activeFilePath,
        commitHash: headRes.data,
        branch,
        canCreate: creation.canCreate,
        createDisabledReason: creation.reason,
      };
      setContext(nextContext);

      const contextKey = `${nextContext.projectId}::${nextContext.commitHash}::${nextContext.filePath}`;
      if (!force && contextKeyRef.current === contextKey) {
        return;
      }
      contextKeyRef.current = contextKey;

      setLoading(true);
      try {
        const res = await window.api.commGetFileThreads({
          projectId: nextContext.projectId,
          commitHash: nextContext.commitHash,
          filePath: nextContext.filePath,
        });
        if (!res?.success) {
          throw new Error(res?.message || "Unable to load file communication threads.");
        }
        const nextThreads = sortFileThreads(res.data || []);
        setThreads(nextThreads);
        setCommunicationThreads(nextThreads);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load file communication threads.";
        showError(message);
        setThreads([]);
        setCommunicationThreads([]);
      } finally {
        setLoading(false);
      }
    },
    [activeFilePath, currentProject, setCommunicationThreads, showError],
  );

  const refreshCurrentView = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!currentProject) {
        await loadGlobalThreads();
        return;
      }
      if (!activeFilePath) {
        setThreads([]);
        setCommunicationThreads([]);
        return;
      }
      await loadFileThreads(true);
    } finally {
      setRefreshing(false);
    }
  }, [
    activeFilePath,
    currentProject,
    loadFileThreads,
    loadGlobalThreads,
    setCommunicationThreads,
  ]);

  useEffect(() => {
    if (!isOpen) {
      setCommunicationPanelOpen(false);
      return;
    }
    setCommunicationPanelOpen(true);
    return () => {
      setCommunicationPanelOpen(false);
      setCommunicationThreads([]);
    };
  }, [isOpen, setCommunicationPanelOpen, setCommunicationThreads]);

  useEffect(() => {
    if (!isOpen) return;

    setSearchQuery("");
    setReplyDrafts({});

    if (!currentProject) {
      setContext(null);
      setThreads([]);
      setCommunicationThreads([]);
      contextKeyRef.current = "";
      void loadGlobalThreads();
      return;
    }

    setGlobalThreads([]);

    if (!activeFilePath) {
      setContext(null);
      setThreads([]);
      setCommunicationThreads([]);
      contextKeyRef.current = "";
      return;
    }

    void loadFileThreads(false);
  }, [
    activeFilePath,
    currentProject,
    isOpen,
    loadFileThreads,
    loadGlobalThreads,
    setCommunicationThreads,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const subscribe = window.api?.onCommunicationUpdated;
    if (!subscribe) return;

    const unsubscribe = subscribe((payload) => {
      const incomingProjectId =
        typeof payload?.projectId === "string" ? payload.projectId.trim() : "";
      if (!incomingProjectId) return;

      if (!currentProject) {
        void loadGlobalThreads();
        return;
      }

      if (incomingProjectId !== currentProject.id) return;
      if (!activeFilePath) return;
      void loadFileThreads(true);
    });

    return () => {
      unsubscribe?.();
    };
  }, [activeFilePath, currentProject, isOpen, loadFileThreads, loadGlobalThreads]);

  const handleOpenThread = useCallback(
    async (thread: CommunicationThread) => {
      if (!window.api?.gitReadFileFromCommit) return;

      const projectName =
        thread.projectName ||
        (thread.projectId === currentProject?.id ? currentProject.name : "");

      if (!projectName) {
        showError("Project name is missing for this thread.");
        return;
      }

      try {
        const res = await window.api.gitReadFileFromCommit({
          projectName,
          filepath: thread.filePath,
          commitOid: thread.commitHash,
        });
        if (!res?.success) {
          throw new Error(res?.message || "Unable to open file for this thread.");
        }

        openCommunicationViewer({
          threadId: thread.threadId,
          projectId: thread.projectId,
          projectName,
          filePath: thread.filePath,
          commitHash: thread.commitHash,
          startLine: thread.startLine,
          endLine: thread.endLine,
          content: res.data || "",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to open thread file.";
        showError(message);
      }
    },
    [currentProject, openCommunicationViewer, showError],
  );

  const handleCreateThread = useCallback(async () => {
    if (!window.api?.commCreateThread) return;
    if (!context) {
      showError("Open a file and load its commit context before tagging.");
      return;
    }
    if (!context.canCreate) {
      showError(context.createDisabledReason || "Tagging is blocked in this context.");
      return;
    }
    if (!selectionRange) {
      showError("Select one or more lines in the editor first.");
      return;
    }

    const messageText = newThreadText.trim();
    if (!messageText) {
      showError("Message cannot be empty.");
      return;
    }

    setBusyThreadId("__create__");
    try {
      const res = await window.api.commCreateThread({
        projectId: context.projectId,
        projectName: context.projectName,
        filePath: context.filePath,
        commitHash: context.commitHash,
        branch: context.branch || undefined,
        startLine: Math.min(selectionRange.startLine, selectionRange.endLine),
        endLine: Math.max(selectionRange.startLine, selectionRange.endLine),
        messageText,
      });
      if (!res?.success) {
        throw new Error(res?.message || "Unable to create thread.");
      }
      setNewThreadText("");
      setSelectionRange(null);
      showSuccess("Thread created and synchronized.");
      await loadFileThreads(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create thread.";
      showError(message);
    } finally {
      setBusyThreadId("");
    }
  }, [
    context,
    loadFileThreads,
    newThreadText,
    selectionRange,
    setSelectionRange,
    showError,
    showSuccess,
  ]);

  const handleReply = useCallback(
    async (thread: CommunicationThread) => {
      if (!window.api?.commReplyThread) return;
      const messageText = (replyDrafts[thread.threadId] || "").trim();
      if (!messageText) {
        showError("Reply cannot be empty.");
        return;
      }

      setBusyThreadId(thread.threadId);
      try {
        const res = await window.api.commReplyThread({
          projectId: thread.projectId,
          threadId: thread.threadId,
          messageText,
        });
        if (!res?.success) {
          throw new Error(res?.message || "Unable to send reply.");
        }

        setReplyDrafts((prev) => ({ ...prev, [thread.threadId]: "" }));
        showSuccess("Reply sent and synchronized.");
        await refreshCurrentView();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to send reply.";
        showError(message);
      } finally {
        setBusyThreadId("");
      }
    },
    [refreshCurrentView, replyDrafts, showError, showSuccess],
  );

  const handleResolve = useCallback(
    async (thread: CommunicationThread) => {
      if (!window.api?.commResolveThread) return;
      setBusyThreadId(thread.threadId);
      try {
        const res = await window.api.commResolveThread({
          projectId: thread.projectId,
          threadId: thread.threadId,
        });
        if (!res?.success) {
          throw new Error(res?.message || "Unable to resolve thread.");
        }
        showSuccess("Thread resolved and synchronized.");
        await refreshCurrentView();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to resolve thread.";
        showError(message);
      } finally {
        setBusyThreadId("");
      }
    },
    [refreshCurrentView, showError, showSuccess],
  );

  const displayedThreads = useMemo(() => {
    const source = currentProject ? threads : globalThreads;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return source;

    return source.filter((thread) => {
      const base =
        `${thread.projectName} ${thread.filePath} ${thread.commitHash}`.toLowerCase();
      if (base.includes(q)) return true;
      return (thread.messages || []).some((msg) => {
        const text = `${msg.authorName || msg.author} ${msg.messageText}`.toLowerCase();
        return text.includes(q);
      });
    });
  }, [currentProject, globalThreads, searchQuery, threads]);

  if (!isOpen) return null;

  return (
    <>
      <Toast
        open={toastOpen}
        message={toastMessage}
        onClose={() => setToastOpen(false)}
        tone={toastTone}
      />

      <div className="w-full h-full flex flex-col bg-[#1f1f1f] text-white overflow-hidden">
        <div className="border-b border-gray-700 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare size={16} />
            Public Communication
          </div>
          <button
            onClick={() => void refreshCurrentView()}
            className="p-1.5 rounded hover:bg-[#2a2d2e] disabled:opacity-50"
            title="Refresh communication threads"
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-gray-700 space-y-2">
          <div className="text-xs text-gray-400">
            {currentProject
              ? activeFilePath
                ? `Project ${currentProject.name} | ${activeFilePath}`
                : `Project ${currentProject.name} | Open a file to load contextual threads`
              : "Global view | all project communication threads"}
          </div>

          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full bg-[#2a2d2e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
            placeholder="Search threads and messages..."
          />
        </div>

        {currentProject && context ? (
          <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-300 space-y-1">
            <div>
              commit <span className="font-mono">{shortCommit(context.commitHash)}</span>
            </div>
            <div>
              branch{" "}
              <span className="font-mono">{context.branch || "DETACHED_HEAD"}</span>
            </div>
            <div>
              lines selected:{" "}
              {selectionRange
                ? `${selectionRange.startLine}-${selectionRange.endLine}`
                : "none"}
            </div>
            {!context.canCreate ? (
              <div className="text-yellow-300">{context.createDisabledReason}</div>
            ) : null}
          </div>
        ) : null}

        {currentProject && context?.canCreate ? (
          <div className="px-3 py-3 border-b border-gray-700 space-y-2">
            <textarea
              value={newThreadText}
              onChange={(event) => setNewThreadText(event.target.value)}
              rows={2}
              placeholder={
                selectionRange
                  ? "Start discussion for selected lines..."
                  : "Select lines in editor, then write message..."
              }
              className="w-full resize-none bg-[#2a2d2e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
            />
            <button
              className="w-full px-3 py-2 rounded bg-[#007acc] disabled:opacity-50 text-sm"
              onClick={() => void handleCreateThread()}
              disabled={
                busyThreadId === "__create__" ||
                !selectionRange ||
                !newThreadText.trim() ||
                !context
              }
              title={
                selectionRange
                  ? `Tag lines ${selectionRange.startLine}-${selectionRange.endLine}`
                  : "Select one or more lines first"
              }
            >
              {busyThreadId === "__create__" ? "Creating..." : "Tag this"}
            </button>
          </div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          {loading ? <div className="text-sm text-gray-400">Loading threads...</div> : null}

          {!loading && displayedThreads.length === 0 ? (
            <div className="text-sm text-gray-500">
              {currentProject
                ? "No communication threads for this file and commit."
                : "No communication threads found."}
            </div>
          ) : null}

          {displayedThreads.map((thread) => (
            <div
              key={thread.threadId}
              className={`border rounded ${
                thread.resolved
                  ? "border-gray-700 bg-[#212223]"
                  : "border-[#3c5f84] bg-[#1f2d3b]"
              }`}
            >
              <button
                className="w-full text-left px-3 py-2 border-b border-black/20 hover:bg-white/5"
                onClick={() => void handleOpenThread(thread)}
                title="Open commit snapshot in communication viewer"
              >
                {!currentProject ? (
                  <div className="text-[11px] text-gray-300">{thread.projectName}</div>
                ) : null}
                <div className="text-xs text-gray-200 font-mono truncate">
                  {thread.filePath}
                </div>
                <div className="text-[11px] text-gray-400">
                  commit {shortCommit(thread.commitHash)} | lines {thread.startLine}-
                  {thread.endLine}
                </div>
                <div className="text-[11px] mt-1">
                  {thread.resolved ? (
                    <span className="text-gray-300">Resolved</span>
                  ) : (
                    <span className="text-cyan-200">Open</span>
                  )}
                </div>
              </button>

              <div className="px-3 py-2 space-y-2">
                {thread.messages.map((message) => (
                  <button
                    key={message.messageId}
                    className="w-full text-left bg-[#101214] border border-gray-700 rounded px-2 py-2 hover:bg-[#16191c]"
                    onClick={() => void handleOpenThread(thread)}
                    title="Open this thread in communication viewer"
                  >
                    <div className="text-[11px] text-gray-400">
                      {message.authorName || message.author} | {formatTime(message.timestamp)}
                    </div>
                    <div className="text-sm text-gray-100 whitespace-pre-wrap">
                      {message.messageText}
                    </div>
                  </button>
                ))}

                <div className="flex items-center gap-2">
                  <input
                    value={replyDrafts[thread.threadId] || ""}
                    onChange={(event) =>
                      setReplyDrafts((prev) => ({
                        ...prev,
                        [thread.threadId]: event.target.value,
                      }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleReply(thread);
                      }
                    }}
                    className="flex-1 bg-[#2a2d2e] border border-gray-700 rounded px-2 py-1.5 text-sm outline-none"
                    placeholder="Reply..."
                    disabled={busyThreadId === thread.threadId}
                  />
                  <button
                    className="p-2 rounded bg-[#007acc] hover:opacity-90 disabled:opacity-50"
                    onClick={() => void handleReply(thread)}
                    disabled={
                      busyThreadId === thread.threadId ||
                      !(replyDrafts[thread.threadId] || "").trim()
                    }
                    title="Send reply"
                  >
                    <Send size={14} />
                  </button>
                  {!thread.resolved ? (
                    <button
                      className="p-2 rounded bg-[#2d4e34] hover:bg-[#37613f] disabled:opacity-50"
                      onClick={() => void handleResolve(thread)}
                      disabled={busyThreadId === thread.threadId}
                      title="Mark resolved"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
