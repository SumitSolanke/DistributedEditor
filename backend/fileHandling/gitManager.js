import git from "isomorphic-git";
import fs from "fs-extra";
import path from "path";

const DEFAULT_AUTHOR = {
  name: "system",
  email: "system@local",
};

function normalizeAuthor(author) {
  if (!author || typeof author !== "object") return DEFAULT_AUTHOR;
  const name =
    typeof author.name === "string" && author.name.trim()
      ? author.name.trim()
      : DEFAULT_AUTHOR.name;
  const email =
    typeof author.email === "string" && author.email.trim()
      ? author.email.trim()
      : DEFAULT_AUTHOR.email;
  return { name, email };
}

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
    author: normalizeAuthor(author),
  });
}

function buffersEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

async function ensureRevertContext(projectPath, branchName) {
  const currentBranch = await getCurrentBranch(projectPath);
  if (!currentBranch) {
    throw new Error("Cannot revert in detached HEAD");
  }
  if (branchName && currentBranch !== branchName) {
    throw new Error(`Branch "${branchName}" must be checked out first`);
  }

  const dirty = await hasUncommittedChanges(projectPath);
  if (dirty) {
    throw new Error(
      "Uncommitted changes detected. Commit or discard before reverting.",
    );
  }

  return currentBranch;
}

async function getChangedPathsBetweenRefs(projectPath, fromRef, toRef) {
  const fromFiles = await git.listFiles({
    fs,
    dir: projectPath,
    ref: fromRef,
  });
  const toFiles = await git.listFiles({
    fs,
    dir: projectPath,
    ref: toRef,
  });

  const fromSet = new Set(fromFiles);
  const toSet = new Set(toFiles);
  const allPaths = new Set([...fromFiles, ...toFiles]);
  const changed = [];

  for (const filepath of allPaths) {
    const inFrom = fromSet.has(filepath);
    const inTo = toSet.has(filepath);

    if (!inFrom || !inTo) {
      changed.push(filepath);
      continue;
    }

    const [fromBlobRes, toBlobRes] = await Promise.all([
      git.readBlob({
        fs,
        dir: projectPath,
        oid: fromRef,
        filepath,
      }),
      git.readBlob({
        fs,
        dir: projectPath,
        oid: toRef,
        filepath,
      }),
    ]);

    const fromBlob = Buffer.from(fromBlobRes.blob);
    const toBlob = Buffer.from(toBlobRes.blob);
    if (!buffersEqual(fromBlob, toBlob)) {
      changed.push(filepath);
    }
  }

  return { changed, fromSet };
}

async function applyRefSnapshotForPaths(
  projectPath,
  sourceRef,
  sourceSet,
  paths,
) {
  for (const filepath of paths) {
    const absolutePath = path.join(projectPath, filepath);

    if (sourceSet.has(filepath)) {
      const { blob } = await git.readBlob({
        fs,
        dir: projectPath,
        oid: sourceRef,
        filepath,
      });
      await fs.outputFile(absolutePath, Buffer.from(blob));
      await git.add({
        fs,
        dir: projectPath,
        filepath,
      });
      continue;
    }

    await fs.remove(absolutePath);
    try {
      await git.remove({
        fs,
        dir: projectPath,
        filepath,
      });
    } catch {
      // Path may already be absent from index/worktree in current HEAD.
    }
  }
}

async function createRevertCommit(projectPath, commitOid, author) {
  const source = await git.readCommit({
    fs,
    dir: projectPath,
    oid: commitOid,
  });
  const subject = source.commit.message.split("\n")[0] || commitOid.slice(0, 8);
  const message = `Revert "${subject}"\n\nThis reverts commit ${commitOid}.`;

  return await git.commit({
    fs,
    dir: projectPath,
    message,
    author: normalizeAuthor(author),
  });
}

async function revertCommitInternal(projectPath, commitOid, author) {
  const { commit } = await git.readCommit({
    fs,
    dir: projectPath,
    oid: commitOid,
  });
  const parentOid = commit.parent?.[0];
  if (!parentOid) {
    throw new Error("Cannot revert the initial commit");
  }

  const { changed, fromSet } = await getChangedPathsBetweenRefs(
    projectPath,
    parentOid,
    commitOid,
  );

  if (!changed.length) {
    throw new Error("Nothing to revert");
  }

  await applyRefSnapshotForPaths(projectPath, parentOid, fromSet, changed);

  const dirty = await hasUncommittedChanges(projectPath);
  if (!dirty) {
    throw new Error("Nothing to revert");
  }

  return await createRevertCommit(projectPath, commitOid, author);
}

export async function revertLastCommit(projectPath, branchName, author) {
  const currentBranch = await ensureRevertContext(projectPath, branchName);
  const log = await git.log({
    fs,
    dir: projectPath,
    depth: 1,
    ref: currentBranch,
  });
  if (!log.length) {
    throw new Error("No commits to revert");
  }

  return await revertCommitInternal(projectPath, log[0].oid, author);
}

export async function revertCommit(projectPath, branchName, commitOid, author) {
  const currentBranch = await ensureRevertContext(projectPath, branchName);
  const history = await git.log({
    fs,
    dir: projectPath,
    ref: currentBranch,
  });
  const commitExists = history.some((entry) => entry.oid === commitOid);
  if (!commitExists) {
    throw new Error("Commit does not belong to this branch");
  }

  return await revertCommitInternal(projectPath, commitOid, author);
}

export async function mergeBranch(projectPath, ours, theirs, author) {
  const currentBranch = await getCurrentBranch(projectPath);
  if (!currentBranch) {
    throw new Error("Cannot merge while in detached HEAD");
  }
  if (currentBranch !== ours) {
    throw new Error(`Branch "${ours}" must be checked out before merging`);
  }

  const dirty = await hasUncommittedChanges(projectPath);
  if (dirty) {
    throw new Error(
      "Uncommitted changes detected. Commit or discard before merging.",
    );
  }

  try {
    const result = await git.merge({
      fs,
      dir: projectPath,
      ours,
      theirs,
      fastForwardOnly: false,
      abortOnConflict: true,
      author: normalizeAuthor(author),
    });

    // Ensure working tree and index are aligned with the merged HEAD.
    await discardAllUncommittedChanges(projectPath);
    return result;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "MergeConflictError" ||
        error.code === "MergeNotSupportedError")
    ) {
      const conflicts =
        "data" in error && Array.isArray(error.data) && error.data.length
          ? ` Conflicts: ${error.data.join(", ")}.`
          : "";
      throw new Error(
        `Merge conflict while merging "${theirs}" into "${ours}".${conflicts}`,
      );
    }

    throw error;
  }
}

export async function rebaseBranch(projectPath, branch, onto, author) {
  const currentBranch = await getCurrentBranch(projectPath);
  if (!currentBranch) {
    throw new Error("Cannot rebase while in detached HEAD");
  }
  if (currentBranch !== branch) {
    throw new Error(`Branch "${branch}" must be checked out before rebasing`);
  }
  if (branch === onto) {
    throw new Error("Cannot rebase a branch onto itself");
  }

  const dirty = await hasUncommittedChanges(projectPath);
  if (dirty) {
    throw new Error(
      "Uncommitted changes detected. Commit or discard before rebasing.",
    );
  }

  const [branchOid, ontoOid] = await Promise.all([
    git.resolveRef({
      fs,
      dir: projectPath,
      ref: branch,
    }),
    git.resolveRef({
      fs,
      dir: projectPath,
      ref: onto,
    }),
  ]);

  const mergeBases = await git.findMergeBase({
    fs,
    dir: projectPath,
    oids: [branchOid, ontoOid],
  });
  if (!mergeBases.length) {
    throw new Error("Unable to find a merge base for rebase.");
  }

  const baseOid = mergeBases[0];
  const branchHistory = await git.log({
    fs,
    dir: projectPath,
    ref: branch,
  });

  const commitsToReplay = [];
  for (const entry of branchHistory) {
    if (entry.oid === baseOid) break;
    commitsToReplay.push(entry);
  }

  // No branch-only commits: move branch tip directly to onto.
  if (!commitsToReplay.length) {
    await git.writeRef({
      fs,
      dir: projectPath,
      ref: `refs/heads/${branch}`,
      value: ontoOid,
      force: true,
    });
    await git.checkout({
      fs,
      dir: projectPath,
      ref: branch,
      force: true,
    });
    return { replayed: 0, movedTo: ontoOid };
  }

  const commitsOldestFirst = commitsToReplay.reverse();
  for (const entry of commitsOldestFirst) {
    if ((entry.commit.parent || []).length > 1) {
      throw new Error(
        "Rebase of merge commits is not supported in this application.",
      );
    }
  }

  const tempBranch = `__rebase_tmp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  try {
    await git.branch({
      fs,
      dir: projectPath,
      ref: tempBranch,
      object: ontoOid,
    });
    await git.checkout({
      fs,
      dir: projectPath,
      ref: tempBranch,
      force: true,
    });

    for (const entry of commitsOldestFirst) {
      try {
        await git.cherryPick({
          fs,
          dir: projectPath,
          oid: entry.oid,
          abortOnConflict: true,
          committer: normalizeAuthor(author),
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error.code === "MergeConflictError" ||
            error.code === "MergeNotSupportedError")
        ) {
          const conflicts =
            "data" in error && Array.isArray(error.data) && error.data.length
              ? ` Conflicts: ${error.data.join(", ")}.`
              : "";
          throw new Error(
            `Rebase conflict while replaying commit ${entry.oid.slice(0, 8)}.${conflicts}`,
          );
        }
        throw error;
      }
    }

    const rebasedTip = await git.resolveRef({
      fs,
      dir: projectPath,
      ref: tempBranch,
    });

    await git.writeRef({
      fs,
      dir: projectPath,
      ref: `refs/heads/${branch}`,
      value: rebasedTip,
      force: true,
    });

    await git.checkout({
      fs,
      dir: projectPath,
      ref: branch,
      force: true,
    });

    await git.deleteBranch({
      fs,
      dir: projectPath,
      ref: tempBranch,
    });

    return { replayed: commitsOldestFirst.length, movedTo: rebasedTip };
  } catch (error) {
    try {
      await git.checkout({
        fs,
        dir: projectPath,
        ref: branch,
        force: true,
      });
    } catch {
      // best-effort cleanup
    }
    try {
      await git.deleteBranch({
        fs,
        dir: projectPath,
        ref: tempBranch,
      });
    } catch {
      // best-effort cleanup
    }
    throw error;
  }
}

export async function getAllBranches(projectPath) {
  return await git.listBranches({
    fs,
    dir: projectPath,
  });
}

export async function getRepoMap(projectPath) {
  const branches = await getAllBranches(projectPath);
  const map = {};

  for (const branch of branches) {
    map[branch] = await git.resolveRef({
      fs,
      dir: projectPath,
      ref: branch,
    });
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

  return matrix.some(([, head, workdir, stage]) => {
    return head !== workdir || workdir !== stage;
  });
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

export async function safeCheckoutBranch(projectPath, branchName) {
  const dirty = await hasUncommittedChanges(projectPath);
  if (dirty) {
    throw {
      type: "DIRTY_WORKING_DIRECTORY",
      message: "Uncommitted changes detected. Commit before switching branch.",
      files: await getChangedFiles(projectPath),
    };
  }

  await git.checkout({
    fs,
    dir: projectPath,
    ref: branchName,
  });
}

export async function safeCheckoutCommit(projectPath, commitOid) {
  const dirty = await hasUncommittedChanges(projectPath);
  if (dirty) {
    throw {
      type: "DIRTY_WORKING_DIRECTORY",
      message: "Uncommitted changes detected. Commit before viewing commit.",
      files: await getChangedFiles(projectPath),
    };
  }

  await git.checkout({
    fs,
    dir: projectPath,
    ref: commitOid,
  });
}

export async function renameBranch(projectPath, oldName, newName) {
  const oid = await git.resolveRef({
    fs,
    dir: projectPath,
    ref: `refs/heads/${oldName}`,
  });

  await git.writeRef({
    fs,
    dir: projectPath,
    ref: `refs/heads/${newName}`,
    value: oid,
  });

  await git.deleteRef({
    fs,
    dir: projectPath,
    ref: `refs/heads/${oldName}`,
  });
}

export async function initializeGitForNewProject(projectPath, author) {
  try {
    const normalizedAuthor = normalizeAuthor(author);
    const userEmail = normalizedAuthor.email;

    await initRepo(projectPath);
    await commitChanges(projectPath, "Initial commit", normalizedAuthor);

    const current = await getCurrentBranch(projectPath);
    if (current && current !== "global-main") {
      await renameBranch(projectPath, current, "global-main");
    }

    const userLocalMain = `${userEmail}/local-main`;
    await createBranch(projectPath, userLocalMain);
    await safeCheckoutBranch(projectPath, userLocalMain);

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
  if (!branchName) {
    return {
      type: "detached",
      owner: null,
      isEditable: false,
    };
  }

  if (branchName === "global-main") {
    return {
      type: "global",
      owner: "system",
      isEditable: false,
    };
  }

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
  const current = await getCurrentBranch(projectPath);
  if (!current) {
    throw new Error("Cannot discard changes in detached HEAD");
  }

  await git.checkout({
    fs,
    dir: projectPath,
    ref: current,
    force: true,
  });

  const statusMatrix = await git.statusMatrix({
    fs,
    dir: projectPath,
  });

  const dirtyPaths = statusMatrix
    .filter(([, head, workdir, stage]) => head !== workdir || workdir !== stage)
    .map(([filepath]) => filepath);

  if (!dirtyPaths.length) return;

  const headFiles = await git.listFiles({
    fs,
    dir: projectPath,
    ref: "HEAD",
  });

  await applyRefSnapshotForPaths(
    projectPath,
    "HEAD",
    new Set(headFiles),
    dirtyPaths,
  );

  const stillDirty = await hasUncommittedChanges(projectPath);
  if (stillDirty) {
    const files = await getChangedFiles(projectPath);
    throw new Error(
      `Unable to clean working tree after sync. Dirty files: ${files.join(", ")}`,
    );
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

export async function revertUntilCommit(
  projectPath,
  branchName,
  targetCommit,
  author,
) {
  const currentBranch = await ensureRevertContext(projectPath, branchName);
  const history = await git.log({
    fs,
    dir: projectPath,
    ref: currentBranch,
  });

  if (!history.length) {
    throw new Error("No commits found on branch");
  }

  const targetIndex = history.findIndex((entry) => entry.oid === targetCommit);
  if (targetIndex === -1) {
    throw new Error("Target commit not found in this branch");
  }
  if (targetIndex === 0) {
    throw new Error("Selected commit is already the current HEAD");
  }

  const commitsToRevert = history.slice(0, targetIndex);
  let revertedCount = 0;
  for (const entry of commitsToRevert) {
    await revertCommitInternal(projectPath, entry.oid, author);
    revertedCount += 1;
  }

  return revertedCount;
}
