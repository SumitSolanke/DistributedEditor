import git from "isomorphic-git";
import fs from "fs-extra";

/*
Git-style P2P sync module
Works over WebSockets instead of HTTP.

Flow:

1. exchangeRefs
2. negotiateCommonCommits
3. collectMissingObjects
4. sendObjects
5. applyObjects
6. updateRefs
*/

/* ------------------------------------------------ */
/* REFS */
/* ------------------------------------------------ */

export async function getAllRefs(projectPath) {
  const branches = await git.listBranches({
    fs,
    dir: projectPath,
  });

  const refs = {};

  for (const branch of branches) {
    const oid = await git.resolveRef({
      fs,
      dir: projectPath,
      ref: branch,
    });

    refs[branch] = oid;
  }

  return refs;
}

/* ------------------------------------------------ */
/* COMMIT GRAPH WALKER */
/* ------------------------------------------------ */

export async function walkCommitGraph(projectPath, startOid) {
  const visited = new Set();
  const stack = [startOid];

  while (stack.length) {
    const oid = stack.pop();

    if (!oid || visited.has(oid)) continue;

    visited.add(oid);

    const { commit } = await git.readCommit({
      fs,
      dir: projectPath,
      oid,
    });

    const parents = commit.parent || [];

    for (const parent of parents) {
      stack.push(parent);
    }
  }

  return visited;
}

/* ------------------------------------------------ */
/* BUILD LOCAL GRAPH */
/* ------------------------------------------------ */

export async function buildLocalCommitGraph(projectPath) {
  const refs = await getAllRefs(projectPath);

  const graph = new Set();

  for (const oid of Object.values(refs)) {
    const commits = await walkCommitGraph(projectPath, oid);

    commits.forEach((c) => graph.add(c));
  }

  return graph;
}

/* ------------------------------------------------ */
/* NEGOTIATION STEP (GIT-LIKE) */
/* ------------------------------------------------ */

export async function findCommonCommits(projectPath, remoteRefs) {
  const localGraph = await buildLocalCommitGraph(projectPath);

  const common = [];

  for (const oid of Object.values(remoteRefs)) {
    if (localGraph.has(oid)) {
      common.push(oid);
    }
  }

  return common;
}

/* ------------------------------------------------ */
/* OBJECT COLLECTION */
/* ------------------------------------------------ */

async function collectTreeObjects(projectPath, treeOid, visitedObjects, objects) {
  const treeKey = `tree:${treeOid}`;
  if (visitedObjects.has(treeKey)) return;
  visitedObjects.add(treeKey);

  const tree = await git.readTree({
    fs,
    dir: projectPath,
    oid: treeOid,
  });

  objects.push({
    type: "tree",
    oid: treeOid,
    data: tree.tree,
  });

  for (const entry of tree.tree) {
    if (entry.type === "blob") {
      const blobKey = `blob:${entry.oid}`;
      if (visitedObjects.has(blobKey)) {
        continue;
      }

      visitedObjects.add(blobKey);
      const blob = await git.readBlob({
        fs,
        dir: projectPath,
        oid: entry.oid,
      });

      objects.push({
        type: "blob",
        oid: entry.oid,
        encoding: "base64",
        data: Buffer.from(blob.blob).toString("base64"),
      });
      continue;
    }

    if (entry.type === "tree") {
      await collectTreeObjects(projectPath, entry.oid, visitedObjects, objects);
    }
  }
}

export async function collectObjects(projectPath, startOid, stopOids = []) {
  const visitedCommits = new Set();
  const visitedObjects = new Set();
  const stop = new Set(stopOids);
  const objects = [];

  const stack = [startOid];

  while (stack.length) {
    const oid = stack.pop();

    if (!oid) continue;
    if (visitedCommits.has(oid)) continue;
    if (stop.has(oid)) continue;

    visitedCommits.add(oid);

    const { commit } = await git.readCommit({
      fs,
      dir: projectPath,
      oid,
    });

    const commitKey = `commit:${oid}`;
    if (!visitedObjects.has(commitKey)) {
      visitedObjects.add(commitKey);
      objects.push({
        type: "commit",
        oid,
        data: commit,
      });
    }

    await collectTreeObjects(projectPath, commit.tree, visitedObjects, objects);

    for (const parent of commit.parent || []) {
      stack.push(parent);
    }
  }

  return objects;
}

/* ------------------------------------------------ */
/* APPLY RECEIVED OBJECTS */
/* ------------------------------------------------ */

export async function applyObjects(projectPath, objects) {
  const typeOrder = {
    blob: 0,
    tree: 1,
    commit: 2,
  };

  const unique = new Map();
  for (const obj of objects || []) {
    if (!obj || !obj.type || !obj.oid) continue;
    unique.set(`${obj.type}:${obj.oid}`, obj);
  }

  const orderedObjects = Array.from(unique.values()).sort((left, right) => {
    const leftOrder = typeOrder[left.type] ?? 99;
    const rightOrder = typeOrder[right.type] ?? 99;
    return leftOrder - rightOrder;
  });

  for (const obj of orderedObjects) {
    if (obj.type === "blob") {
      const blobData = decodeBlobPayload(obj);
      await git.writeBlob({
        fs,
        dir: projectPath,
        blob: blobData,
      });
    }

    if (obj.type === "tree") {
      await git.writeTree({
        fs,
        dir: projectPath,
        tree: obj.data,
      });
    }

    if (obj.type === "commit") {
      await git.writeCommit({
        fs,
        dir: projectPath,
        commit: obj.data,
      });
    }
  }
}

/* ------------------------------------------------ */
/* UPDATE REFS */
/* ------------------------------------------------ */

async function canFastForward(projectPath, branch, remoteOid) {
  let localOid = null;
  try {
    localOid = await git.resolveRef({
      fs,
      dir: projectPath,
      ref: branch,
    });
  } catch {
    return true; // local branch missing -> create/update is safe
  }

  if (localOid === remoteOid) {
    return false; // already up to date
  }

  const bases = await git.findMergeBase({
    fs,
    dir: projectPath,
    oids: [localOid, remoteOid],
  });

  if (!bases.length) {
    return false;
  }

  return bases.includes(localOid);
}

export async function updateRefs(projectPath, remoteRefs) {
  const updatedBranches = new Set();

  for (const branch in remoteRefs) {
    const remoteOid = remoteRefs[branch];
    const shouldUpdate = await canFastForward(projectPath, branch, remoteOid);

    if (!shouldUpdate) {
      continue;
    }

    await git.writeRef({
      fs,
      dir: projectPath,
      ref: `refs/heads/${branch}`,
      value: remoteOid,
      // Safe because we already gate with canFastForward (no rollback).
      force: true,
    });

    updatedBranches.add(branch);
  }

  return updatedBranches;
}

/* ------------------------------------------------ */
/* MAIN SYNC ENTRY */
/* ------------------------------------------------ */

export async function prepareFetch(projectPath, remoteRefs) {
  const common = await findCommonCommits(projectPath, remoteRefs);

  return {
    have: common,
  };
}

export async function prepareObjectsForPeer(projectPath, remoteRefs, peerHave) {
  const objects = [];
  const seen = new Set();

  for (const branch in remoteRefs) {
    const tip = remoteRefs[branch];

    const objs = await collectObjects(projectPath, tip, peerHave);

    for (const obj of objs) {
      const key = `${obj.type}:${obj.oid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      objects.push(obj);
    }
  }

  return objects;
}

/* ------------------------------------------------ */
/* APPLY FETCH */
/* ------------------------------------------------ */

export async function applyFetch(projectPath, objects, remoteRefs) {
  const dirty = await git.statusMatrix({
    fs,
    dir: projectPath,
  });

  const hasChanges = dirty.some(([, head, workdir, stage]) => {
    return head !== workdir || workdir !== stage;
  });

  await applyObjects(projectPath, objects);

  const updatedBranches = await updateRefs(projectPath, remoteRefs);

  const currentBranch = await git.currentBranch({
    fs,
    dir: projectPath,
    fullname: false,
  });

  if (currentBranch && updatedBranches.has(currentBranch) && !hasChanges) {
    await git.checkout({
      fs,
      dir: projectPath,
      ref: currentBranch,
      force: true,
    });
  }
}

function decodeBlobPayload(obj) {
  if (!obj) {
    throw new Error("Invalid blob payload");
  }

  if (obj.encoding === "base64" && typeof obj.data === "string") {
    return Buffer.from(obj.data, "base64");
  }

  if (
    obj.data &&
    typeof obj.data === "object" &&
    obj.data.type === "Buffer" &&
    Array.isArray(obj.data.data)
  ) {
    return Buffer.from(obj.data.data);
  }

  if (Array.isArray(obj.data)) {
    return Uint8Array.from(obj.data);
  }

  if (obj.data && typeof obj.data === "object") {
    const numericKeys = Object.keys(obj.data)
      .filter((key) => /^\d+$/.test(key))
      .map((key) => Number(key))
      .sort((a, b) => a - b);

    if (numericKeys.length) {
      const bytes = new Uint8Array(numericKeys.length);
      for (let i = 0; i < numericKeys.length; i += 1) {
        bytes[i] = obj.data[String(numericKeys[i])] || 0;
      }
      return bytes;
    }
  }

  if (typeof obj.data === "string") {
    return Buffer.from(obj.data);
  }

  throw new Error("Unsupported blob payload format");
}
