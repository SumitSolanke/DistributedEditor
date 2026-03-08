import {
  initRepo,
  getCurrentBranch,
  createBranch,
  createBranchFromCommit,
  deleteBranch as deleteGitBranch,
  commitChanges,
  revertLastCommit,
  revertCommit,
  mergeBranch,
  rebaseBranch,
  getAllBranches,
  getRepoMap,
  readCommit,
  readFileFromCommit,
  safeCheckoutBranch,
  safeCheckoutCommit,
  hasUncommittedChanges,
  analyzeBranch,
  getBranchCommitHistory,
  discardAllUncommittedChanges,
  revertUntilCommit,
} from "./gitManager.js";
import {
  registerBranch,
  deleteBranch,
  setBranchPublic,
} from "../storage/project.js";
import { getProjectById } from "../storage/project.js";
import { getSelf } from "../storage/store.js";
import { triggerProjectSync } from "../network/websocketSync.js";
import path from "path";
import { app } from "electron";
import git from "isomorphic-git";
import fs from "fs";
import { ipcMain } from "electron/main";

export function registerGitHandlers() {
  const userDataPath = app.getPath("userData");
  const projectsRoot = path.join(userDataPath, "projects");

  function getProjectPath(projectName) {
    return path.join(projectsRoot, projectName);
  }

  async function triggerProjectSyncForPublicBranch(projectId, branchName) {
    try {
      if (!projectId || !branchName) return;

      const project = getProjectById(projectId);
      if (!project?.public) return;

      const branchMeta = project.branches?.[branchName];
      if (!branchMeta) {
        return;
      }

      if (branchMeta.visibility !== "public") {
        return;
      }

      await triggerProjectSync(projectId);
    } catch (error) {
      console.warn(
        `Project sync trigger failed for ${projectId}/${branchName}:`,
        error?.message || error,
      );
    }
  }

  // // INIT REPO (called after project creation)
  // ipcMain.handle("git-init", async (event, { projectName }) => {
  //   try {
  //     await initRepo(getProjectPath(projectName));
  //     return { success: true };
  //   } catch (error) {
  //     return { success: false, message: error.message };
  //   }
  // });

  // GET CURRENT BRANCH
  ipcMain.handle("git-current-branch", async (event, { projectName }) => {
    try {
      const branch = await getCurrentBranch(getProjectPath(projectName));
      return { success: true, data: branch };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("git-head-commit", async (event, { projectName }) => {
    try {
      const commits = await git.log({
        fs,
        dir: getProjectPath(projectName),
        ref: "HEAD",
        depth: 1,
      });
      return { success: true, data: commits[0]?.oid || "" };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // SAFE CHECKOUT BRANCH
  ipcMain.handle(
    "git-checkout-branch",
    async (event, { projectName, branchName }) => {
      try {
        await safeCheckoutBranch(getProjectPath(projectName), branchName);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          message: error.message,
          files: error.files || [],
        };
      }
    },
  );

  // SAFE CHECKOUT COMMIT (DETACHED)
  ipcMain.handle(
    "git-checkout-commit",
    async (event, { projectName, commitOid }) => {
      try {
        await safeCheckoutCommit(getProjectPath(projectName), commitOid);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          message: error.message,
          files: error.files || [],
        };
      }
    },
  );

  // COMMIT (BLOCK IF DETACHED)
  ipcMain.handle(
    "git-commit",
    async (event, { projectId, projectName, message }) => {
      try {
        const self = getSelf();
        const projectPath = getProjectPath(projectName);

        const currentBranch = await getCurrentBranch(projectPath);

        const branchInfo = analyzeBranch(currentBranch, self.email);

        // 1️⃣ Detached HEAD
        if (branchInfo.type === "detached") {
          return {
            success: false,
            code: "DETACHED_HEAD",
            message:
              "You are viewing a historical commit. Create or checkout a branch before committing.",
          };
        }

        // 2️⃣ Protected branch
        if (branchInfo.type === "global") {
          return {
            success: false,
            code: "PROTECTED_BRANCH",
            message:
              "Direct commits to global-main are not allowed. Create your own branch and merge your changes.",
          };
        }

        // 3️⃣ Ownership enforcement
        if (!branchInfo.isEditable) {
          return {
            success: false,
            code: "BRANCH_OWNERSHIP_VIOLATION",
            message: `This branch is owned by ${branchInfo.owner}. Only the branch owner can commit.`,
          };
        }

        // 4️⃣ Safe commit
        const oid = await commitChanges(projectPath, message, self);
        await triggerProjectSyncForPublicBranch(projectId, currentBranch);

        return {
          success: true,
          oid,
          branch: currentBranch,
        };
      } catch (error) {
        return {
          success: false,
          code: "COMMIT_FAILED",
          message: error.message,
        };
      }
    },
  );

  // CREATE BRANCH
  ipcMain.handle(
    "git-create-branch",
    async (event, { projectId, projectName, branchName, visibility }) => {
      try {
        const self = getSelf();
        const projectPath = getProjectPath(projectName);

        // 1️⃣ Auto-prefix email
        const fullBranchName = `${self.email}/${branchName}`;

        // 2️⃣ Create git branch first
        await createBranch(projectPath, fullBranchName);

        try {
          // 3️⃣ Register metadata (reuse your existing function)
          registerBranch(projectId, fullBranchName, visibility);
        } catch (metaError) {
          // 🔁 Rollback git branch if metadata fails
          await deleteGitBranch(projectPath, fullBranchName);
          throw metaError;
        }

        if (visibility === "public") {
          await triggerProjectSyncForPublicBranch(projectId, fullBranchName);
        }

        return {
          success: true,
          branchName: fullBranchName,
        };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
  );

  // CREATE BRANCH FROM COMMIT
  ipcMain.handle(
    "git-create-branch-from-commit",
    async (
      event,
      { projectId, projectName, branchName, commitOid, visibility },
    ) => {
      try {
        const self = getSelf();
        const projectPath = getProjectPath(projectName);

        // 1️⃣ Auto-prefix email
        const fullBranchName = `${self.email}/${branchName}`;

        // 2️⃣ Create git branch from specific commit
        await createBranchFromCommit(projectPath, fullBranchName, commitOid);

        try {
          // 3️⃣ Register metadata (reuse existing function)
          registerBranch(projectId, fullBranchName, visibility);
        } catch (metaError) {
          // 🔁 Rollback git branch if metadata fails
          await deleteGitBranch(projectPath, fullBranchName);
          throw metaError;
        }

        if (visibility === "public") {
          await triggerProjectSyncForPublicBranch(projectId, fullBranchName);
        }

        return {
          success: true,
          branchName: fullBranchName,
        };
      } catch (error) {
        return {
          success: false,
          message: error.message,
        };
      }
    },
  );

  // DELETE BRANCH (Git layer only — metadata already validated)
  ipcMain.handle(
    "git-delete-branch",
    async (event, { projectId, projectName, branchName }) => {
      try {
        const projectPath = getProjectPath(projectName);

        // 1️⃣ Validate + remove metadata first
        deleteBranch(projectId, branchName);

        try {
          // 2️⃣ Delete git branch
          await deleteGitBranch(projectPath, branchName);
        } catch (gitError) {
          throw gitError;
        }

        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
  );

  ipcMain.handle(
    "git-set-branch-public",
    async (event, { projectId, branchName }) => {
      try {
        setBranchPublic(projectId, branchName);
        await triggerProjectSyncForPublicBranch(projectId, branchName);

        return {
          success: true,
          message: "Branch is now public",
        };
      } catch (error) {
        return {
          success: false,
          message: error.message,
        };
      }
    },
  );

  // MERGE (ONLY OWNER CAN MERGE INTO global-main)
  ipcMain.handle(
    "git-merge",
    async (event, { projectId, projectName, ours, theirs }) => {
      try {
        const project = getProjectById(projectId);
        const self = getSelf();
        const requesterEmail = self.email;

        if (!project) throw new Error("Project not found");

        const targetBranch = project.branches[ours];
        const sourceBranch = project.branches[theirs];

        if (!targetBranch) throw new Error("Target branch not found");
        if (!sourceBranch) throw new Error("Source branch not found");

        // 🔒 RULE 1 & 2: User can merge only into branch they own
        if (targetBranch.owner !== requesterEmail) {
          throw new Error("You can only merge into branches you own");
        }

        // 🔒 RULE 3 & 4: Only project owner can merge into global-main
        if (ours === "global-main") {
          if (project.owner.email !== requesterEmail) {
            throw new Error("Only project owner can merge into global-main");
          }
        }

        const result = await mergeBranch(
          getProjectPath(projectName),
          ours,
          theirs,
          self,
        );

        const message = result?.alreadyMerged
          ? "Already up to date."
          : result?.fastForward
            ? `Fast-forward merged ${theirs} into ${ours}.`
            : `Merged ${theirs} into ${ours}.`;

        await triggerProjectSyncForPublicBranch(projectId, ours);

        return { success: true, result, message };
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : "MERGE_FAILED";
        return { success: false, code, message: error.message };
      }
    },
  );

  // REBASE
  ipcMain.handle(
    "git-rebase",
    async (event, { projectId, projectName, branch, onto }) => {
      try {
        const project = getProjectById(projectId);
        const self = getSelf();
        const requesterEmail = self.email;

        if (!project) throw new Error("Project not found");

        const targetBranch = project.branches[branch];
        const baseBranch = project.branches[onto];

        if (!targetBranch) throw new Error("Branch to rebase not found");
        if (!baseBranch) throw new Error("Base branch not found");

        // 🔒 RULE 1 & 3 — User can only rebase their own branch
        if (targetBranch.owner !== requesterEmail) {
          throw new Error("You can only rebase branches you own");
        }

        // 🔒 RULE 2 — Protect global-main
        if (branch === "global-main") {
          if (project.owner.email !== requesterEmail) {
            throw new Error("Only project owner can rebase global-main");
          }
        }

        await rebaseBranch(getProjectPath(projectName), branch, onto, self);
        await triggerProjectSyncForPublicBranch(projectId, branch);

        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
  );

  // REVERT LAST
  ipcMain.handle(
    "git-revert",
    async (event, { projectId, projectName, branchName }) => {
      try {
        const project = getProjectById(projectId);
        const self = getSelf();
        const requesterEmail = self.email;

        if (!project) throw new Error("Project not found");

        const branch = project.branches[branchName];
        if (!branch) throw new Error("Branch not found");

        // 🔒 Rule 1 & 3 — Only branch owner can revert
        if (branch.owner !== requesterEmail) {
          throw new Error("You can only revert your own branch");
        }

        // 🔒 Rule 2 — Protect global-main
        if (branchName === "global-main") {
          if (project.owner.email !== requesterEmail) {
            throw new Error("Only project owner can revert global-main");
          }
        }

        await revertLastCommit(getProjectPath(projectName), branchName, self);
        await triggerProjectSyncForPublicBranch(projectId, branchName);

        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
  );

  ipcMain.handle(
    "git-revert-until",
    async (event, { projectId, projectName, branchName, targetCommit }) => {
      try {
        const project = getProjectById(projectId);
        const self = getSelf();
        const requesterEmail = self.email;

        if (!project) throw new Error("Project not found");

        const branch = project.branches[branchName];
        if (!branch) throw new Error("Branch not found");

        // 🔒 Ownership check
        if (branch.owner !== requesterEmail) {
          throw new Error("You can only revert your own branch");
        }

        // 🔒 Protect global-main
        if (branchName === "global-main") {
          if (project.owner.email !== requesterEmail) {
            throw new Error("Only project owner can revert global-main");
          }
        }

        await revertUntilCommit(
          getProjectPath(projectName),
          branchName,
          targetCommit,
          self,
        );
        await triggerProjectSyncForPublicBranch(projectId, branchName);

        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
  );

  // REVERT SPECIFIC
  ipcMain.handle(
    "git-revert-commit",
    async (event, { projectId, projectName, branchName, commitOid }) => {
      try {
        const project = getProjectById(projectId);
        const self = getSelf();
        const requesterEmail = self.email;

        if (!project) throw new Error("Project not found");

        const branch = project.branches[branchName];
        if (!branch) throw new Error("Branch not found");

        // 🔒 Ownership enforcement
        if (branch.owner !== requesterEmail) {
          throw new Error("You can only revert your own branch");
        }

        // 🔒 Protect global-main
        if (branchName === "global-main") {
          if (project.owner.email !== requesterEmail) {
            throw new Error("Only project owner can revert global-main");
          }
        }

        // 🔎 Validate commit belongs to this branch
        const commits = await git.log({
          fs,
          dir: getProjectPath(projectName),
          ref: branchName,
        });

        const commitExists = commits.some((c) => c.oid === commitOid);
        if (!commitExists) {
          throw new Error("Commit does not belong to this branch");
        }

        await revertCommit(getProjectPath(projectName), branchName, commitOid, self);
        await triggerProjectSyncForPublicBranch(projectId, branchName);

        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
  );

  // GET ALL BRANCHES
  ipcMain.handle("git-branches", async (event, { projectName }) => {
    try {
      const branches = await getAllBranches(getProjectPath(projectName));
      return { success: true, data: branches };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // GET REPO MAP
  ipcMain.handle("git-repo-map", async (event, { projectName }) => {
    try {
      const map = await getRepoMap(getProjectPath(projectName));
      return { success: true, data: map };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // READ COMMIT
  ipcMain.handle(
    "git-read-commit",
    async (event, { projectName, commitOid }) => {
      try {
        const commit = await readCommit(getProjectPath(projectName), commitOid);
        return { success: true, data: commit };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
  );

  // // DISCARD ALL UNCOMMITTED CHANGES
  ipcMain.handle(
    "git-discard-all",
    async (event, { projectId, projectName, branchName }) => {
      try {
        const project = getProjectById(projectId);
        const self = getSelf();
        const requesterEmail = self.email;

        if (!project) {
          throw new Error("Project not found");
        }

        const branch = project.branches[branchName];
        if (!branch) {
          throw new Error("Branch not found");
        }

        const projectPath = getProjectPath(projectName);

        // Ensure at least one commit exists
        const commits = await git.log({
          fs,
          dir: projectPath,
          depth: 1,
        });

        if (!commits.length) {
          throw new Error("No commits exist to restore to");
        }

        await discardAllUncommittedChanges(projectPath);

        return { success: true };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
  );

  ipcMain.handle(
    "git-branch-history",
    async (event, { projectId, projectName, branchName }) => {
      try {
        const project = getProjectById(projectId);

        if (!project) {
          throw new Error("Project not found");
        }

        const history = await getBranchCommitHistory(
          getProjectPath(projectName),
          branchName,
        );

        return { success: true, data: history };
      } catch (error) {
        return { success: false, message: error.message };
      }
    },
  );
  // // READ FILE FROM COMMIT
  // ipcMain.handle(
  //   "git-read-file-from-commit",
  //   async (event, { projectName, filepath, commitOid }) => {
  //     try {
  //       const blob = await readFileFromCommit(
  //         getProjectPath(projectName),
  //         filepath,
  //         commitOid,
  //       );
  //       return { success: true, data: blob };
  //     } catch (error) {
  //       return { success: false, message: error.message };
  //     }
  //   },
  // );

  // CHECK DIRTY STATE
  ipcMain.handle("git-is-dirty", async (event, { projectName }) => {
    try {
      const dirty = await hasUncommittedChanges(getProjectPath(projectName));
      return { success: true, dirty };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
}

