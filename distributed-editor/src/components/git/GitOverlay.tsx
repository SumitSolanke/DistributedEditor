import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GitBranch,
  RefreshCw,
  X,
  Undo2,
  Split,
  ArrowUpFromLine,
} from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { useGitStore } from "../../store/gitStore";
import { useAuthStore } from "../../store/authStore";
import type {
  BranchVisibility,
  GitCommitHistoryItem,
  ProjectMetadata,
} from "../../types/project.types";
import {
  backendNodesToFileNodes,
  buildProjectTree,
} from "../../utils/projectTree";
import {
  findProjectByIdOrName,
  normalizeProjects,
} from "../../utils/projectMetadata";
import Toast from "../ui/Toast";

interface CommitContextState {
  open: boolean;
  x: number;
  y: number;
  commit: GitCommitHistoryItem | null;
}

const shortOid = (oid: string) => oid.slice(0, 8);

function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export default function GitOverlay() {
  const { overlayOpen, closeOverlay } = useGitStore();
  const { user } = useAuthStore();
  const {
    currentProject,
    openProject,
    setFileTree,
    updateCurrentProjectMeta,
  } = useEditorStore();

  const [projectMeta, setProjectMeta] = useState<ProjectMetadata | null>(null);
  const [branchList, setBranchList] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState("");
  const [checkoutBranch, setCheckoutBranch] = useState("");
  const [historyBranch, setHistoryBranch] = useState("");
  const [activeCommitOid, setActiveCommitOid] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [history, setHistory] = useState<GitCommitHistoryItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [mergeFrom, setMergeFrom] = useState("");
  const [rebaseOnto, setRebaseOnto] = useState("");

  const [newBranchName, setNewBranchName] = useState("");
  const [defaultPublicBranch, setDefaultPublicBranch] = useState(false);
  const [newBranchVisibility, setNewBranchVisibility] =
    useState<BranchVisibility>("private");
  const [branchSourceCommit, setBranchSourceCommit] = useState<string | null>(
    null,
  );

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastTone, setToastTone] = useState<"error" | "success">("error");
  const [busy, setBusy] = useState(false);
  const [syncingProject, setSyncingProject] = useState(false);

  const [ctx, setCtx] = useState<CommitContextState>({
    open: false,
    x: 0,
    y: 0,
    commit: null,
  });

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

  const currentProjectName = currentProject?.name || "";

  const branchMeta = useMemo(
    () => projectMeta?.branches ?? currentProject?.branches ?? {},
    [currentProject?.branches, projectMeta?.branches],
  );
  const currentBranchMeta = currentBranch ? branchMeta[currentBranch] : undefined;
  const selectedBranchMeta = checkoutBranch ? branchMeta[checkoutBranch] : undefined;

  const myEmail = user?.email || "";
  const isDetached = !currentBranch;
  const isProjectPublic = projectMeta?.public ?? currentProject?.public ?? false;
  const isProjectOwner =
    (projectMeta?.owner.email || currentProject?.ownerEmail || "") === myEmail;
  const isCurrentOwner = currentBranchMeta?.owner === myEmail;
  const canMutateCurrentBranch =
    Boolean(currentBranchMeta) &&
    isCurrentOwner &&
    (currentBranch !== "global-main" || isProjectOwner);

  const sortedBranches = useMemo(
    () => [...branchList].sort((a, b) => a.localeCompare(b)),
    [branchList],
  );
  const otherBranches = useMemo(
    () => sortedBranches.filter((branch) => branch !== currentBranch),
    [currentBranch, sortedBranches],
  );

  const apiRevertUntil =
    window.api?.gitRevertUntil || window.api?.gitReverUntil;
  const apiDiscard =
    window.api?.gitDiscardUncommittedChanges || window.api?.gitDiscardUncommiteChanges;

  const fetchCurrentProjectMeta = useCallback(async () => {
    if (!currentProjectName || !window.api?.getProjects) return null;

    const projectsRes = await window.api.getProjects();
    if (!projectsRes?.success) {
      showError(projectsRes?.message || "Unable to load project metadata.");
      return null;
    }

    const parsed = normalizeProjects(projectsRes.data);
    const found = findProjectByIdOrName(parsed, {
      id: currentProject?.id,
      name: currentProjectName,
    });

    if (!found) return null;

    setProjectMeta(found);
    updateCurrentProjectMeta({
      id: found.id,
      public: found.public,
      ownerEmail: found.owner.email || "",
      branches: found.branches,
    });
    return found;
  }, [
    currentProject?.id,
    currentProjectName,
    showError,
    updateCurrentProjectMeta,
  ]);

  const reloadProjectFiles = useCallback(
    async (nextProject: ProjectMetadata | null, resetTabs: boolean) => {
      if (!currentProjectName || !window.api?.loadProject) return;

      const loaded = await window.api.loadProject({
        path: "",
        projectName: currentProjectName,
      });
      const children = Array.isArray(loaded) ? backendNodesToFileNodes(loaded) : [];
      const tree = buildProjectTree(currentProjectName, children);

      const projectInfo = {
        id: nextProject?.id || currentProject?.id || currentProjectName,
        name: currentProjectName,
        connections: currentProject?.connections || [],
        public: nextProject?.public ?? currentProject?.public,
        ownerEmail:
          nextProject?.owner.email || currentProject?.ownerEmail || "",
        branches: nextProject?.branches || currentProject?.branches,
      };

      if (resetTabs) {
        openProject(projectInfo, tree);
      } else {
        setFileTree(tree);
        updateCurrentProjectMeta({
          id: projectInfo.id,
          public: projectInfo.public,
          ownerEmail: projectInfo.ownerEmail,
          branches: projectInfo.branches,
        });
      }
    },
    [
      currentProject,
      currentProjectName,
      openProject,
      setFileTree,
      updateCurrentProjectMeta,
    ],
  );

  const refreshGitState = useCallback(async () => {
    if (!currentProjectName) {
      setProjectMeta(null);
      setBranchList([]);
      setCurrentBranch("");
      setCheckoutBranch("");
      setHistoryBranch("");
      setActiveCommitOid("");
      setHistory([]);
      setDirty(false);
      return;
    }

    const nextProject = await fetchCurrentProjectMeta();

    const [branchRes, currentRes, dirtyRes, headRes] = await Promise.all([
      window.api?.getAllBranches?.({ projectName: currentProjectName }),
      window.api?.gitCurrentBranch?.({ projectName: currentProjectName }),
      window.api?.gitDirty?.({ projectName: currentProjectName }),
      window.api?.gitHeadCommit?.({ projectName: currentProjectName }),
    ]);

    if (branchRes && !branchRes.success) {
      showError(branchRes.message || "Unable to load branches.");
    }
    if (currentRes && !currentRes.success) {
      showError(currentRes.message || "Unable to read current branch.");
    }
    if (dirtyRes && !dirtyRes.success) {
      showError(dirtyRes.message || "Unable to read working tree state.");
    }
    if (headRes && !headRes.success) {
      showError(headRes.message || "Unable to read current HEAD commit.");
    }

    const nextBranches = Array.isArray(branchRes?.data) ? branchRes.data : [];
    const nextCurrentBranch =
      typeof currentRes?.data === "string" ? currentRes.data : "";
    const validCurrentBranch = nextBranches.includes(nextCurrentBranch)
      ? nextCurrentBranch
      : "";

    setBranchList(nextBranches);
    setCurrentBranch(nextCurrentBranch);
    setDirty(Boolean(dirtyRes?.dirty));

    const nextCheckoutBranch =
      checkoutBranch && nextBranches.includes(checkoutBranch)
        ? checkoutBranch
        : validCurrentBranch || nextBranches[0] || "";
    if (nextCheckoutBranch !== checkoutBranch) {
      setCheckoutBranch(nextCheckoutBranch);
    }

    const nextHistoryBranch =
      validCurrentBranch ||
      (historyBranch && nextBranches.includes(historyBranch)
        ? historyBranch
        : nextCheckoutBranch);
    if (nextHistoryBranch !== historyBranch) {
      setHistoryBranch(nextHistoryBranch);
    }

    if (nextHistoryBranch && nextProject?.id && window.api?.gitBranchHistory) {
      const historyRes = await window.api.gitBranchHistory({
        projectId: nextProject.id,
        projectName: currentProjectName,
        branchName: nextHistoryBranch,
      });
      if (!historyRes.success) {
        showError(historyRes.message || "Unable to load commit history.");
        setHistory([]);
        setActiveCommitOid("");
      } else {
        const nextHistory = historyRes.data || [];
        const headOid = typeof headRes?.data === "string" ? headRes.data : "";
        setHistory(nextHistory);

        if (headOid) {
          setActiveCommitOid(headOid);
        } else if (validCurrentBranch) {
          setActiveCommitOid(nextHistory[0]?.oid || "");
        } else {
          setActiveCommitOid((prev) =>
            prev && nextHistory.some((entry) => entry.oid === prev)
              ? prev
              : nextHistory[0]?.oid || "",
          );
        }
      }
    } else {
      setHistory([]);
      setActiveCommitOid("");
    }
  }, [
    checkoutBranch,
    currentProjectName,
    fetchCurrentProjectMeta,
    historyBranch,
    showError,
  ]);

  useEffect(() => {
    if (!overlayOpen) return;
    void refreshGitState();
  }, [overlayOpen, refreshGitState]);

  useEffect(() => {
    if (!overlayOpen) return;
    void refreshGitState();
  }, [currentProject?.id, currentProject?.name, overlayOpen, refreshGitState]);

  useEffect(() => {
    if (!isProjectPublic) {
      setDefaultPublicBranch(false);
      setNewBranchVisibility("private");
      return;
    }

    setNewBranchVisibility(defaultPublicBranch ? "public" : "private");
  }, [defaultPublicBranch, isProjectPublic]);

  useEffect(() => {
    setMergeFrom((prev) => {
      if (prev && otherBranches.includes(prev)) return prev;
      return otherBranches[0] || "";
    });
    setRebaseOnto((prev) => {
      if (prev && otherBranches.includes(prev)) return prev;
      return otherBranches[0] || "";
    });
  }, [otherBranches]);

  useEffect(() => {
    const closeCtx = () => {
      setCtx((prev) => ({ ...prev, open: false, commit: null }));
    };

    window.addEventListener("click", closeCtx);
    window.addEventListener("scroll", closeCtx, true);
    return () => {
      window.removeEventListener("click", closeCtx);
      window.removeEventListener("scroll", closeCtx, true);
    };
  }, []);

  const projectId = projectMeta?.id || currentProject?.id || "";
  const projectName = projectMeta?.name || currentProjectName;

  const canCommit =
    Boolean(projectId) &&
    !isDetached &&
    currentBranch !== "global-main" &&
    isCurrentOwner &&
    dirty &&
    !busy;

  const canCheckout =
    Boolean(projectName) &&
    Boolean(checkoutBranch) &&
    checkoutBranch !== currentBranch &&
    !dirty &&
    !busy;

  const canDiscard =
    Boolean(projectName) &&
    Boolean(projectId) &&
    Boolean(currentBranch) &&
    canMutateCurrentBranch;

  const canMerge =
    Boolean(projectId) &&
    Boolean(currentBranch) &&
    Boolean(mergeFrom) &&
    canMutateCurrentBranch &&
    !dirty &&
    !busy;

  const canRebase =
    Boolean(projectId) &&
    Boolean(currentBranch) &&
    Boolean(rebaseOnto) &&
    canMutateCurrentBranch &&
    !dirty &&
    !busy;

  const canRevertLast =
    Boolean(projectId) &&
    Boolean(currentBranch) &&
    canMutateCurrentBranch &&
    !dirty &&
    !busy;

  const canDeleteSelectedBranch =
    Boolean(projectId) &&
    Boolean(projectName) &&
    Boolean(checkoutBranch) &&
    checkoutBranch !== "global-main" &&
    !checkoutBranch.endsWith("/local-main") &&
    selectedBranchMeta?.visibility === "private" &&
    selectedBranchMeta.owner === myEmail &&
    !dirty &&
    !busy;
  const canSetSelectedBranchPublic =
    Boolean(projectId) &&
    isProjectPublic &&
    Boolean(checkoutBranch) &&
    selectedBranchMeta?.owner === myEmail &&
    selectedBranchMeta?.visibility === "private" &&
    !busy;

  const runAndRefresh = useCallback(
    async (
      runner: () => Promise<{ success: boolean; message?: string }>,
      opts?: {
        successMessage?: string;
        reload?: boolean;
        resetTabs?: boolean;
      },
    ) => {
      setBusy(true);
      try {
        const res = await runner();
        if (!res.success) {
          showError(res.message || "Operation failed.");
          return false;
        }

        if (opts?.successMessage) {
          showSuccess(opts.successMessage);
        } else if (res.message) {
          showSuccess(res.message);
        }

        if (opts?.reload) {
          await reloadProjectFiles(projectMeta, Boolean(opts.resetTabs));
        }
        await refreshGitState();
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Operation failed.";
        showError(message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [projectMeta, refreshGitState, reloadProjectFiles, showError, showSuccess],
  );

  const handleCheckout = useCallback(async () => {
    if (!window.api?.gitCheckoutBranch || !projectName || !checkoutBranch) return;
    await runAndRefresh(
      () =>
        window.api.gitCheckoutBranch!({
          projectName,
          branchName: checkoutBranch,
        }),
      {
        successMessage: `Checked out ${checkoutBranch}`,
        reload: true,
        resetTabs: true,
      },
    );
  }, [checkoutBranch, projectName, runAndRefresh]);

  const handleCommit = useCallback(async () => {
    const msg = commitMessage.trim();
    if (!msg) {
      showError("Commit message is required.");
      return;
    }
    if (!window.api?.gitCommit || !projectId || !projectName) return;

    const ok = await runAndRefresh(
      () =>
        window.api.gitCommit!({
          projectId,
          projectName,
          message: msg,
        }),
      { successMessage: "Commit created." },
    );
    if (ok) {
      setCommitMessage("");
    }
  }, [commitMessage, projectId, projectName, runAndRefresh, showError]);

  const handleDiscardAll = useCallback(async () => {
    if (!apiDiscard || !projectId || !projectName || !currentBranch) return;
    const confirmed = window.confirm(
      "Discard all uncommitted changes on the current branch?",
    );
    if (!confirmed) return;

    await runAndRefresh(
      () =>
        apiDiscard({
          projectId,
          projectName,
          branchName: currentBranch,
        }),
      {
        successMessage: "Uncommitted changes discarded.",
        reload: true,
        resetTabs: true,
      },
    );
  }, [apiDiscard, currentBranch, projectId, projectName, runAndRefresh]);

  const handleCreateBranch = useCallback(async () => {
    const trimmed = newBranchName.trim();
    if (!trimmed) {
      showError("Branch name is required.");
      return;
    }
    if (!projectId || !projectName) return;

    const visibility = isProjectPublic ? newBranchVisibility : "private";
    const ok = branchSourceCommit
      ? await (async () => {
          const creator = window.api?.gitCreateBranchFromCommit;
          if (!creator) {
            showError("Branch API is not available.");
            return false;
          }
          return runAndRefresh(
            () =>
              creator({
                projectId,
                projectName,
                branchName: trimmed,
                commitOid: branchSourceCommit,
                visibility,
              }),
            { successMessage: "Branch created from selected commit." },
          );
        })()
      : await (async () => {
          const creator = window.api?.gitCreateBranch;
          if (!creator) {
            showError("Branch API is not available.");
            return false;
          }
          return runAndRefresh(
            () =>
              creator({
                projectId,
                projectName,
                branchName: trimmed,
                visibility,
              }),
            { successMessage: "Branch created." },
          );
        })();

    if (ok) {
      setNewBranchName("");
      setBranchSourceCommit(null);
      setCheckoutBranch((prev) => prev || currentBranch);
    }
  }, [
    branchSourceCommit,
    currentBranch,
    isProjectPublic,
    newBranchName,
    newBranchVisibility,
    projectId,
    projectName,
    runAndRefresh,
    showError,
  ]);

  const handleDeleteBranch = useCallback(async () => {
    if (!window.api?.gitDeleteBranch || !window.api?.gitCheckoutBranch) return;
    if (!projectId || !projectName || !checkoutBranch) return;

    const confirmed = window.confirm(
      `Delete branch "${checkoutBranch}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const checkoutGlobal = await window.api.gitCheckoutBranch({
        projectName,
        branchName: "global-main",
      });
      if (!checkoutGlobal.success) {
        showError(checkoutGlobal.message || "Unable to switch to global-main.");
        return;
      }

      const deleteRes = await window.api.gitDeleteBranch({
        projectId,
        projectName,
        branchName: checkoutBranch,
      });
      if (!deleteRes.success) {
        showError(deleteRes.message || "Unable to delete branch.");
        return;
      }

      showSuccess(`Deleted ${checkoutBranch}.`);
      await reloadProjectFiles(projectMeta, true);
      await refreshGitState();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete branch.";
      showError(message);
    } finally {
      setBusy(false);
    }
  }, [
    checkoutBranch,
    projectId,
    projectMeta,
    projectName,
    refreshGitState,
    reloadProjectFiles,
    showError,
    showSuccess,
  ]);

  const handleSetProjectPublic = useCallback(async () => {
    if (!window.api?.setProjectPublic || !projectId) return;
    await runAndRefresh(
      () =>
        window.api.setProjectPublic!({
          id: projectId,
        }),
      { successMessage: "Project is now public." },
    );
  }, [projectId, runAndRefresh]);

  const handleSetSelectedBranchPublic = useCallback(async () => {
    if (!window.api?.gitSetBranchPublic || !projectId || !checkoutBranch) return;

    await runAndRefresh(
      () =>
        window.api.gitSetBranchPublic!({
          projectId,
          branchName: checkoutBranch,
        }),
      {
        successMessage: `Branch "${checkoutBranch}" is now public.`,
      },
    );
  }, [checkoutBranch, projectId, runAndRefresh]);

  const handleSyncProject = useCallback(async () => {
    if (!window.api?.syncProject || !projectId) return;
    if (syncingProject) return;

    setSyncingProject(true);
    try {
      const res = await window.api.syncProject({ projectId });
      if (!res?.success) {
        showError(res?.error || "Unable to trigger project sync.");
        return;
      }
      showSuccess("Project sync triggered.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to trigger project sync.";
      showError(message);
    } finally {
      setSyncingProject(false);
    }
  }, [projectId, showError, showSuccess, syncingProject]);

  const handleMerge = useCallback(async () => {
    if (
      !window.api?.gitMerge ||
      !projectId ||
      !projectName ||
      !currentBranch ||
      !mergeFrom
    ) {
      return;
    }

    await runAndRefresh(
      () =>
        window.api.gitMerge!({
          projectId,
          projectName,
          ours: currentBranch,
          theirs: mergeFrom,
        }),
      {
        reload: true,
        resetTabs: true,
      },
    );
  }, [currentBranch, mergeFrom, projectId, projectName, runAndRefresh]);

  const handleRebase = useCallback(async () => {
    if (
      !window.api?.gitRebase ||
      !projectId ||
      !projectName ||
      !currentBranch ||
      !rebaseOnto
    ) {
      return;
    }

    await runAndRefresh(
      () =>
        window.api.gitRebase!({
          projectId,
          projectName,
          branch: currentBranch,
          onto: rebaseOnto,
        }),
      {
        successMessage: `Rebased ${currentBranch} onto ${rebaseOnto}.`,
        reload: true,
        resetTabs: true,
      },
    );
  }, [currentBranch, projectId, projectName, rebaseOnto, runAndRefresh]);

  const handleRevertLast = useCallback(async () => {
    if (!window.api?.gitRevert || !projectId || !projectName || !currentBranch) {
      return;
    }
    await runAndRefresh(
      () =>
        window.api.gitRevert!({
          projectId,
          projectName,
          branchName: currentBranch,
        }),
      {
        successMessage: "Reverted last commit.",
        reload: true,
        resetTabs: true,
      },
    );
  }, [currentBranch, projectId, projectName, runAndRefresh]);

  const handleRevertUntil = useCallback(
    async (targetCommit: string) => {
      if (!apiRevertUntil || !projectId || !projectName || !currentBranch) return;
      await runAndRefresh(
        () =>
          apiRevertUntil({
            projectId,
            projectName,
            branchName: currentBranch,
            targetCommit,
          }),
        {
          successMessage: "Reverted commits until selected commit.",
          reload: true,
          resetTabs: true,
        },
      );
    },
    [apiRevertUntil, currentBranch, projectId, projectName, runAndRefresh],
  );

  const handleRevertCommit = useCallback(
    async (commitOid: string) => {
      if (!window.api?.gitRevertCommit || !projectId || !projectName || !currentBranch) {
        return;
      }
      await runAndRefresh(
        () =>
          window.api.gitRevertCommit!({
            projectId,
            projectName,
            branchName: currentBranch,
            commitOid,
          }),
        {
          successMessage: "Reverted selected commit.",
          reload: true,
          resetTabs: true,
        },
      );
    },
    [currentBranch, projectId, projectName, runAndRefresh],
  );

  const handleOpenCommit = useCallback(
    async (commitOid: string) => {
      if (!window.api?.gitCheckoutCommit || !projectName) return;
      if (busy) return;
      if (currentBranch && commitOid === activeCommitOid) {
        return;
      }
      const prevActive = activeCommitOid;
      setActiveCommitOid(commitOid);
      const ok = await runAndRefresh(
        () =>
          window.api.gitCheckoutCommit!({
            projectName,
            commitOid,
          }),
        {
          successMessage: "Loaded selected commit in detached HEAD.",
          reload: true,
          resetTabs: true,
        },
      );
      if (!ok) {
        setActiveCommitOid(prevActive);
      }
    },
    [activeCommitOid, busy, currentBranch, projectName, runAndRefresh],
  );

  const canContextActions = canMutateCurrentBranch && !dirty && !busy;
  const canOpenCommit = Boolean(projectName) && !busy;

  if (!overlayOpen) return null;

  return (
    <>
      <Toast
        open={toastOpen}
        message={toastMessage}
        onClose={() => setToastOpen(false)}
        tone={toastTone}
      />

      <div className="fixed inset-0 z-[10000]" onMouseDown={closeOverlay}>
        <div className="absolute inset-0 bg-black/40 z-0 pointer-events-none" />

        <div
          className="absolute top-0 left-0 h-full w-[620px] bg-[#252526] border-r border-gray-700 shadow-xl z-20 pointer-events-auto text-gray-100"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-12 px-3 flex items-center justify-between border-b border-gray-700">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch size={18} /> Git Operations
            </div>
            <button
              onClick={closeOverlay}
              className="p-2 hover:bg-[#2a2d2e] rounded"
            >
              <X size={16} />
            </button>
          </div>

          {!currentProjectName ? (
            <div className="p-4 text-sm text-gray-400">
              Open a project to use Git operations.
            </div>
          ) : (
            <div className="p-3 space-y-3 h-[calc(100%-48px)] overflow-auto">
              <section className="bg-[#1f1f1f] border border-gray-700 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{currentProjectName}</div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border ${
                      isProjectPublic
                        ? "border-emerald-500/70 text-emerald-300"
                        : "border-gray-600 text-gray-300"
                    }`}
                  >
                    {isProjectPublic ? "Public Project" : "Private Project"}
                  </span>
                </div>

                <div className="text-xs text-gray-400">
                  Current branch:{" "}
                  <span className="text-gray-200 font-mono">
                    {currentBranch || "DETACHED_HEAD"}
                  </span>
                </div>

                {isDetached ? (
                  <div className="text-xs text-yellow-300">
                    Detached HEAD is read-only: commit, merge, revert and rebase are blocked.
                  </div>
                ) : null}

                <div className="flex items-center gap-2">
                  {!isProjectPublic && window.api?.setProjectPublic ? (
                    <button
                      className="px-3 py-1.5 text-xs rounded bg-[#2d2d2d] hover:bg-[#3a3a3a]"
                      onClick={() => void handleSetProjectPublic()}
                      disabled={busy || syncingProject}
                    >
                      Make Project Public
                    </button>
                  ) : null}

                  <button
                    className="px-3 py-1.5 text-xs rounded bg-[#2d2d2d] hover:bg-[#3a3a3a] disabled:opacity-50 inline-flex items-center gap-1"
                    onClick={() => void handleSyncProject()}
                    disabled={!projectId || !isProjectPublic || busy || syncingProject}
                    title={
                      isProjectPublic
                        ? "Sync current project across connected peers"
                        : "Project must be public before sync"
                    }
                  >
                    <RefreshCw
                      size={13}
                      className={syncingProject ? "animate-spin" : ""}
                    />
                    Sync Project
                  </button>
                </div>
              </section>

              <section className="bg-[#1f1f1f] border border-gray-700 rounded p-3 space-y-2">
                <div className="text-xs uppercase text-gray-400">Checkout & Reset</div>
                <div className="flex items-center gap-2">
                  <select
                    value={checkoutBranch}
                    onChange={(e) => setCheckoutBranch(e.target.value)}
                    className="flex-1 bg-[#1a1a1a] border border-gray-600 rounded px-2 py-2 text-sm text-gray-100 outline-none"
                  >
                    {sortedBranches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                  <button
                    className="px-3 py-2 text-sm rounded bg-[#007acc] disabled:opacity-50"
                    onClick={() => void handleCheckout()}
                    disabled={!canCheckout}
                  >
                    Checkout
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1.5 text-xs rounded bg-[#2d2d2d] hover:bg-[#3a3a3a] disabled:opacity-50"
                    onClick={() => void handleSetSelectedBranchPublic()}
                    disabled={!canSetSelectedBranchPublic}
                  >
                    Make Selected Branch Public
                  </button>

                  <button
                    className="px-3 py-1.5 text-xs rounded bg-[#2d2d2d] hover:bg-[#3a3a3a] disabled:opacity-50 inline-flex items-center gap-1"
                    onClick={() => void handleDiscardAll()}
                    disabled={!canDiscard || !dirty}
                  >
                    <RefreshCw size={13} />
                    Reset Changes
                  </button>

                  <button
                    className="px-3 py-1.5 text-xs rounded bg-[#3b1a1f] hover:bg-[#4a2027] disabled:opacity-50"
                    onClick={() => void handleDeleteBranch()}
                    disabled={!canDeleteSelectedBranch}
                  >
                    Delete Selected Branch
                  </button>
                </div>

                {dirty ? (
                  <div className="text-xs text-yellow-300">
                    Working directory has uncommitted changes.
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Working directory is clean.</div>
                )}
              </section>

              <section className="bg-[#1f1f1f] border border-gray-700 rounded p-3 space-y-2">
                <div className="text-xs uppercase text-gray-400">Commit</div>
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  rows={2}
                  placeholder="Write commit message..."
                  className="w-full resize-none bg-[#1a1a1a] border border-gray-600 rounded px-2 py-2 text-sm text-gray-100 outline-none"
                />
                <button
                  className="px-3 py-2 text-sm rounded bg-[#007acc] disabled:opacity-50"
                  onClick={() => void handleCommit()}
                  disabled={!canCommit}
                >
                  Create Commit
                </button>
              </section>

              <section className="bg-[#1f1f1f] border border-gray-700 rounded p-3 space-y-2">
                <div className="text-xs uppercase text-gray-400">Branch Creation</div>

                {isProjectPublic ? (
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={defaultPublicBranch}
                      onChange={(e) => setDefaultPublicBranch(e.target.checked)}
                    />
                    New branches public by default
                  </label>
                ) : (
                  <div className="text-xs text-gray-500">
                    Project is private, so new branches are private by default.
                  </div>
                )}

                {branchSourceCommit ? (
                  <div className="text-xs text-gray-300 bg-[#2a2d2e] border border-gray-700 rounded px-2 py-1">
                    Creating from commit{" "}
                    <span className="font-mono">{shortOid(branchSourceCommit)}</span>
                    <button
                      className="ml-2 text-red-300 hover:underline"
                      onClick={() => setBranchSourceCommit(null)}
                    >
                      clear
                    </button>
                  </div>
                ) : null}

                <div className="flex items-center gap-2">
                  <input
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="new-branch-name"
                    className="flex-1 bg-[#1a1a1a] border border-gray-600 rounded px-2 py-2 text-sm text-gray-100 outline-none"
                  />
                  <select
                    value={newBranchVisibility}
                    onChange={(e) =>
                      setNewBranchVisibility(e.target.value as BranchVisibility)
                    }
                    disabled={!isProjectPublic}
                    className="w-28 bg-[#1a1a1a] border border-gray-600 rounded px-2 py-2 text-sm text-gray-100 outline-none disabled:opacity-60"
                  >
                    <option value="private">private</option>
                    <option value="public">public</option>
                  </select>
                  <button
                    className="px-3 py-2 text-sm rounded bg-[#007acc] disabled:opacity-50"
                    onClick={() => void handleCreateBranch()}
                    disabled={!projectId || busy}
                  >
                    Create
                  </button>
                </div>
              </section>

              <section className="bg-[#1f1f1f] border border-gray-700 rounded p-3 space-y-2">
                <div className="text-xs uppercase text-gray-400">Merge / Rebase</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <div className="text-xs text-gray-400">Merge branch into current</div>
                    <select
                      value={mergeFrom}
                      onChange={(e) => setMergeFrom(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-gray-600 rounded px-2 py-2 text-sm text-gray-100 outline-none"
                    >
                      {otherBranches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                    <button
                      className="w-full px-3 py-1.5 text-xs rounded bg-[#2d2d2d] hover:bg-[#3a3a3a] disabled:opacity-50 inline-flex items-center justify-center gap-1"
                      onClick={() => void handleMerge()}
                      disabled={!canMerge}
                    >
                      <Split size={13} />
                      Merge
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-gray-400">Rebase current onto</div>
                    <select
                      value={rebaseOnto}
                      onChange={(e) => setRebaseOnto(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-gray-600 rounded px-2 py-2 text-sm text-gray-100 outline-none"
                    >
                      {otherBranches.map((branch) => (
                        <option key={branch} value={branch}>
                          {branch}
                        </option>
                      ))}
                    </select>
                    <button
                      className="w-full px-3 py-1.5 text-xs rounded bg-[#2d2d2d] hover:bg-[#3a3a3a] disabled:opacity-50 inline-flex items-center justify-center gap-1"
                      onClick={() => void handleRebase()}
                      disabled={!canRebase}
                    >
                      <ArrowUpFromLine size={13} />
                      Rebase
                    </button>
                  </div>
                </div>
              </section>

              <section className="bg-[#1f1f1f] border border-gray-700 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase text-gray-400">History</div>
                  <button
                    className="px-3 py-1.5 text-xs rounded bg-[#2d2d2d] hover:bg-[#3a3a3a] disabled:opacity-50 inline-flex items-center gap-1"
                    onClick={() => void handleRevertLast()}
                    disabled={!canRevertLast}
                  >
                    <Undo2 size={13} />
                    Revert Last Commit
                  </button>
                </div>

                <div className="space-y-1 max-h-[340px] overflow-auto pr-1">
                  {history.length === 0 ? (
                    <div className="text-xs text-gray-500 p-2">No commits on this branch.</div>
                  ) : (
                    history.map((commit) => (
                      <div
                        key={commit.oid}
                        onClick={() => {
                          if (!canOpenCommit) return;
                          void handleOpenCommit(commit.oid);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCtx({
                            open: true,
                            x: e.clientX,
                            y: e.clientY,
                            commit,
                          });
                        }}
                        className={`bg-[#252526] border rounded px-3 py-2 cursor-pointer ${
                          activeCommitOid === commit.oid
                            ? "border-[#007acc] bg-[#1f3142]"
                            : "border-gray-700 hover:border-gray-500"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm truncate">{commit.message || "(no message)"}</div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            {shortOid(commit.oid)}
                          </div>
                        </div>
                        <div className="text-[11px] text-gray-400 truncate">
                          {commit.author} ({commit.email})
                        </div>
                        <div className="text-[10px] text-gray-500">{formatDate(commit.date)}</div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        {ctx.open && ctx.commit ? (
          <div
            className="fixed z-[10020] w-60 bg-[#252526] border border-gray-700 rounded shadow-lg text-sm overflow-hidden"
            style={{ left: ctx.x, top: ctx.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-700 disabled:opacity-50"
              onClick={() => {
                setBranchSourceCommit(ctx.commit?.oid || null);
                setCtx((prev) => ({ ...prev, open: false, commit: null }));
              }}
              disabled={busy || !projectId}
            >
              Create branch from this commit
            </button>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-700 disabled:opacity-50"
              onClick={() => {
                void handleRevertUntil(ctx.commit?.oid || "");
                setCtx((prev) => ({ ...prev, open: false, commit: null }));
              }}
              disabled={!canContextActions}
            >
              Revert until this commit
            </button>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-700 disabled:opacity-50"
              onClick={() => {
                void handleRevertCommit(ctx.commit?.oid || "");
                setCtx((prev) => ({ ...prev, open: false, commit: null }));
              }}
              disabled={!canContextActions}
            >
              Revert this specific commit
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
