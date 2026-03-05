import git from "isomorphic-git";
import fs from "fs-extra";
import path from "path";

export async function initRepo(projectPath) {
  await git.init({
    fs,
    dir: projectPath,
    defaultBranch: "global-main",
  });
}

export async function getCurrentBranch(projectPath) {
  return await git.currentBranch({
    fs,
    dir: projectPath,
    fullname: false,
  });
}

export async function createBranch(projectPath, branchName) {
  await git.branch({
    fs,
    dir: projectPath,
    ref: branchName,
  });
}

export async function createBranchFromCommit(
  projectPath,
  branchName,
  commitOid,
) {
  await git.branch({
    fs,
    dir: projectPath,
    ref: branchName,
    object: commitOid,
  });
}

export async function deleteBranch(projectPath, branchName) {
  await git.deleteBranch({
    fs,
    dir: projectPath,
    ref: branchName,
  });
}

export async function commitChanges(projectPath, message, author) {
  await git.add({
    fs,
    dir: projectPath,
    filepath: ".",
  });

  return await git.commit({
    fs,
    dir: projectPath,
    message,
    author: {
      name: author.name,
      email: author.email,
    },
  });
}

export async function revertLastCommit(projectPath) {
  const log = await git.log({
    fs,
    dir: projectPath,
    depth: 1,
  });

  if (!log.length) throw new Error("No commits to revert");

  await git.revert({
    fs,
    dir: projectPath,
    oid: log[0].oid,
  });
}

export async function revertCommit(projectPath, branchName, commitOid) {
  // 1️⃣ Ensure branch is checked out
  const currentBranch = await git.currentBranch({
    fs,
    dir: projectPath,
    fullname: false,
  });

  if (currentBranch !== branchName) {
    throw new Error(
      `Branch "${branchName}" must be checked out before reverting`,
    );
  }

  // 2️⃣ Ensure commit exists in this branch history
  const history = await git.log({
    fs,
    dir: projectPath,
    ref: branchName,
  });

  const commitExists = history.some((entry) => entry.oid === commitOid);

  if (!commitExists) {
    throw new Error("Commit does not belong to this branch");
  }

  // 3️⃣ Revert commit
  await git.revert({
    fs,
    dir: projectPath,
    oid: commitOid,
  });

  return true;
}

export async function mergeBranch(projectPath, ours, theirs) {
  const result = await git.merge({
    fs,
    dir: projectPath,
    ours,
    theirs,
    fastForwardOnly: false,
  });

  return result;
}

export async function rebaseBranch(projectPath, branch, onto) {
  await git.rebase({
    fs,
    dir: projectPath,
    ref: branch,
    onto,
  });
}

export async function getAllBranches(projectPath) {
  return await git.listBranches({
    fs,
    dir: projectPath,
  });
}

export async function getRepoMap(projectPath) {
  const branches = await git.listBranches({
    fs,
    dir: projectPath,
  });

  const map = {};

  for (const branch of branches) {
    const oid = await git.resolveRef({
      fs,
      dir: projectPath,
      ref: branch,
    });

    map[branch] = oid;
  }

  return map;
}

export async function readCommit(projectPath, commitOid) {
  return await git.readCommit({
    fs,
    dir: projectPath,
    oid: commitOid,
  });
}

export async function readFileFromCommit(projectPath, filepath, commitOid) {
  return await git.readBlob({
    fs,
    dir: projectPath,
    oid: commitOid,
    filepath,
  });
}

export async function hasUncommittedChanges(projectPath) {
  const matrix = await git.statusMatrix({
    fs,
    dir: projectPath,
  });

  return matrix.some(([filepath, head, workdir, stage]) => {
    return head !== workdir || workdir !== stage;
  });
}

export async function safeCheckoutBranch(projectPath, branchName) {
  const dirty = await hasUncommittedChanges(projectPath);

  if (dirty) {
    const files = await getChangedFiles(projectPath);

    throw {
      type: "DIRTY_WORKING_DIRECTORY",
      message: "Uncommitted changes detected. Commit before switching branch.",
      files,
    };
  }

  await git.checkout({
    fs,
    dir: projectPath,
    ref: branchName,
  });

  return true;
}

export async function getChangedFiles(projectPath) {
  const matrix = await git.statusMatrix({
    fs,
    dir: projectPath,
  });

  const changed = [];

  for (const [filepath, head, workdir, stage] of matrix) {
    if (head !== workdir || workdir !== stage) {
      changed.push(filepath);
    }
  }

  return changed;
}

export async function safeCheckoutCommit(projectPath, commitOid) {
  const dirty = await hasUncommittedChanges(projectPath);

  if (dirty) {
    const files = await getChangedFiles(projectPath);

    throw {
      type: "DIRTY_WORKING_DIRECTORY",
      message: "Uncommitted changes detected. Commit before viewing commit.",
      files,
    };
  }

  await git.checkout({
    fs,
    dir: projectPath,
    ref: commitOid,
  });

  return true;
}

import * as git from "isomorphic-git";
import fs from "fs";
import path from "path";

export async function renameBranch(projectPath, oldName, newName) {
  const dir = projectPath;

  // Get current commit of old branch
  const oid = await git.resolveRef({
    fs,
    dir,
    ref: `refs/heads/${oldName}`,
  });

  // Create new branch pointing to same commit
  await git.writeRef({
    fs,
    dir,
    ref: `refs/heads/${newName}`,
    value: oid,
  });

  // Delete old branch
  await git.deleteRef({
    fs,
    dir,
    ref: `refs/heads/${oldName}`,
  });
}

export async function initializeGitForNewProject(projectPath, userEmail) {
  try {
    // 1️⃣ Init repository
    await initRepository(projectPath);

    // 2️⃣ Create initial commit
    await commitChanges(projectPath, "Initial commit");

    // 3️⃣ Rename default branch to global-main
    const current = await getCurrentBranch(projectPath);

    if (current !== "global-main") {
      await renameBranch(projectPath, current, "global-main");
    }

    // 4️⃣ Create user local-main branch
    const userLocalMain = `${userEmail}/local-main`;
    await createBranch(projectPath, userLocalMain);

    // 5️⃣ Checkout user local-main
    await safeCheckoutBranch(projectPath, userLocalMain);

    // 6️⃣ Safety check
    const finalBranch = await getCurrentBranch(projectPath);
    if (finalBranch !== userLocalMain) {
      throw new Error("Failed to switch to user local-main branch");
    }

    return true;
  } catch (err) {
    console.error("Git initialization failed:", err);
    throw err;
  }
}

export function analyzeBranch(branchName, currentUserEmail) {
  // 1️⃣ Detached HEAD
  if (!branchName) {
    return {
      type: "detached",
      owner: null,
      isEditable: false,
    };
  }

  // 2️⃣ Protected global branch
  if (branchName === "global-main") {
    return {
      type: "global",
      owner: "system",
      isEditable: false,
    };
  }

  // 3️⃣ User branch (email/local-main format)
  const parts = branchName.split("/");

  if (parts.length < 2) {
    return {
      type: "unknown",
      owner: null,
      isEditable: false,
    };
  }

  const ownerEmail = parts[0];

  return {
    type: "user",
    owner: ownerEmail,
    isEditable: ownerEmail === currentUserEmail,
  };
}

export async function discardAllUncommittedChanges(projectPath) {
  // 1️⃣ Reset branch to HEAD (clears staging + restores tracked files)
  await git.reset({
    fs,
    dir: projectPath,
    ref: "HEAD",
    hard: true,
  });

  // 2️⃣ Remove untracked files & directories
  const statusMatrix = await git.statusMatrix({
    fs,
    dir: projectPath,
  });

  for (const row of statusMatrix) {
    const [filepath, headStatus, workdirStatus] = row;

    // File not in HEAD but exists in working dir
    if (headStatus === 0 && workdirStatus === 2) {
      await fs.rm(path.join(projectPath, filepath), {
        recursive: true,
        force: true,
      });
    }
  }
}

export async function getBranchCommitHistory(projectPath, branchName) {
  const commits = await git.log({
    fs,
    dir: projectPath,
    ref: branchName,
  });

  return commits.map((entry) => ({
    oid: entry.oid,
    message: entry.commit.message,
    author: entry.commit.author.name,
    email: entry.commit.author.email,
    date: new Date(entry.commit.author.timestamp * 1000),
    parent: entry.commit.parent,
  }));
}

export async function revertUntilCommit(projectPath, branchName, targetCommit) {
  // 1️⃣ Get full branch history
  const history = await git.log({
    fs,
    dir: projectPath,
    ref: branchName,
  });

  if (!history.length) {
    throw new Error("No commits found on branch");
  }

  // 2️⃣ Ensure target commit exists in branch
  const targetIndex = history.findIndex((entry) => entry.oid === targetCommit);

  if (targetIndex === -1) {
    throw new Error("Target commit not found in this branch");
  }

  // 3️⃣ Collect commits to revert (newest → until just before target)
  const commitsToRevert = history.slice(0, targetIndex);

  if (!commitsToRevert.length) {
    throw new Error("Nothing to revert");
  }

  // 4️⃣ Revert each commit one by one
  for (const entry of commitsToRevert) {
    await git.revert({
      fs,
      dir: projectPath,
      oid: entry.oid,
      noCommit: false,
    });
  }

  return true;
}
