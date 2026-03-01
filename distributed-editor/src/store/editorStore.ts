import { create } from "zustand";
import type {
  CursorPos,
  ExplorerAction,
  FileNode,
  SidebarView,
} from "../types/editor.types";

interface ProjectInfo {
  id: string;
  name: string;
  connections: string[];
  rootPath?: string;
}

interface EditorState {
  // left sidebar view
  activeSidebar: SidebarView;
  setActiveSidebar: (view: SidebarView) => void;

  // project
  currentProject: ProjectInfo | null;
  createProject: (project: ProjectInfo, initialTree?: FileNode[]) => void;
  openProject: (project: ProjectInfo, tree: FileNode[]) => void;
  closeProject: () => void;

  // file system
  fileTree: FileNode[];
  setFileTree: (tree: FileNode[]) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  explorerAction: ExplorerAction;
  startCreate: (parentId: string, nodeType: "file" | "folder") => void;
  startRename: (nodeId: string) => void;
  clearExplorerAction: () => void;

  addNodeWithName: (
    parentId: string,
    type: "file" | "folder",
    name: string,
  ) => { ok: true } | { ok: false; reason: string };

  renameNodeSafe: (
    id: string,
    newName: string,
  ) => { ok: true } | { ok: false; reason: string };

  deleteNode: (id: string) => void;

  // editor tabs
  openFiles: FileNode[];
  activeFileId: string | null;
  openFile: (file: FileNode) => void;
  openFileById: (fileId: string) => void;
  closeFile: (id: string) => void;
  setActiveFile: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;

  // cursor + reveal
  cursor: CursorPos;
  setCursor: (pos: CursorPos) => void;
  pendingReveal: { fileId: string; line: number } | null;
  clearPendingReveal: () => void;

  highlightLine: number | null;
  revealInEditor: (fileId: string, line: number) => void;
}

const generateId = () => Math.random().toString(36).slice(2, 10);

function firstNodeId(nodes: FileNode[]): string | null {
  if (!nodes.length) return null;
  return nodes[0].id;
}

function collectFileMap(nodes: FileNode[], map: Map<string, FileNode> = new Map()) {
  for (const node of nodes) {
    if (node.type === "file") map.set(node.id, node);
    if (node.type === "folder" && node.children?.length) collectFileMap(node.children, map);
  }
  return map;
}

function findNodeById(nodes: FileNode[], id: string): FileNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.type === "folder" && n.children?.length) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findFileById(nodes: FileNode[], id: string): FileNode | null {
  const node = findNodeById(nodes, id);
  if (node && node.type === "file") return node;
  return null;
}

function updateTree(
  nodes: FileNode[],
  callback: (node: FileNode) => FileNode | null,
): FileNode[] {
  return nodes
    .map((node) => {
      const updated = callback(node);
      if (!updated) return null;

      if (updated.type === "folder" && updated.children) {
        updated.children = updateTree(updated.children, callback);
      }
      return updated;
    })
    .filter(Boolean) as FileNode[];
}

export const useEditorStore = create<EditorState>((set, get) => ({
  activeSidebar: "explorer",
  setActiveSidebar: (view) => set({ activeSidebar: view }),

  currentProject: null,
  createProject: (project, initialTree = []) =>
    set({
      currentProject: project,
      fileTree: initialTree,
      selectedNodeId: firstNodeId(initialTree),
      openFiles: [],
      activeFileId: null,
      explorerAction: null,
    }),
  openProject: (project, tree) =>
    set({
      currentProject: project,
      fileTree: tree,
      selectedNodeId: firstNodeId(tree),
      openFiles: [],
      activeFileId: null,
      explorerAction: null,
    }),
  closeProject: () =>
    set({
      currentProject: null,
      fileTree: [],
      selectedNodeId: null,
      openFiles: [],
      activeFileId: null,
      explorerAction: null,
      pendingReveal: null,
      highlightLine: null,
    }),

  fileTree: [],
  setFileTree: (tree) => {
    const { openFiles, activeFileId, selectedNodeId } = get();
    const nextFilesMap = collectFileMap(tree);
    const nextOpenFiles = openFiles
      .filter((f) => nextFilesMap.has(f.id))
      .map((f) => {
        const next = nextFilesMap.get(f.id);
        if (!next) return f;
        return { ...f, name: next.name, path: next.path };
      });

    const nextActive =
      activeFileId && nextOpenFiles.some((f) => f.id === activeFileId)
        ? activeFileId
        : nextOpenFiles[0]?.id ?? null;

    const nextSelected =
      selectedNodeId && findNodeById(tree, selectedNodeId)
        ? selectedNodeId
        : firstNodeId(tree);

    set({
      fileTree: tree,
      openFiles: nextOpenFiles,
      activeFileId: nextActive,
      selectedNodeId: nextSelected,
    });
  },
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  explorerAction: null,
  startCreate: (parentId, nodeType) =>
    set({ explorerAction: { mode: "create", parentId, nodeType } }),
  startRename: (nodeId) => set({ explorerAction: { mode: "rename", nodeId } }),
  clearExplorerAction: () => set({ explorerAction: null }),

  addNodeWithName: (parentId, type, name) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, reason: "Name cannot be empty." };

    const { fileTree } = get();

    const parent = findNodeById(fileTree, parentId);
    if (!parent || parent.type !== "folder")
      return { ok: false, reason: "Parent folder not found." };

    const siblings = parent.children || [];
    const exists = siblings.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists)
      return {
        ok: false,
        reason: "A file/folder with same name already exists.",
      };

    const newNode: FileNode = {
      id: generateId(),
      name: trimmed,
      type,
      content: type === "file" ? "" : undefined,
      children: type === "folder" ? [] : undefined,
    };

    const updatedTree = updateTree(fileTree, (node) => {
      if (node.id === parentId && node.type === "folder") {
        return { ...node, children: [...(node.children || []), newNode] };
      }
      return node;
    });

    set({ fileTree: updatedTree });
    return { ok: true };
  },

  renameNodeSafe: (id, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return { ok: false, reason: "Name cannot be empty." };

    const { fileTree } = get();
    const node = findNodeById(fileTree, id);
    if (!node) return { ok: false, reason: "Node not found." };

    // find parent to check siblings
    const findParent = (
      nodes: FileNode[],
      childId: string,
    ): FileNode | null => {
      for (const n of nodes) {
        if (n.type === "folder" && n.children?.some((c) => c.id === childId))
          return n;
        if (n.type === "folder" && n.children?.length) {
          const p = findParent(n.children, childId);
          if (p) return p;
        }
      }
      return null;
    };

    const parent = findParent(fileTree, id);
    if (parent) {
      const siblings = parent.children || [];
      const exists = siblings.some(
        (c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (exists)
        return {
          ok: false,
          reason: "Same name already exists in this folder.",
        };
    }

    const updatedTree = updateTree(fileTree, (n) =>
      n.id === id ? { ...n, name: trimmed } : n,
    );

    // also update open tabs
    const updatedOpen = get().openFiles.map((f) =>
      f.id === id ? { ...f, name: trimmed } : f,
    );

    set({ fileTree: updatedTree, openFiles: updatedOpen });
    return { ok: true };
  },

  deleteNode: (id) => {
    const { fileTree, openFiles, activeFileId } = get();

    const updatedTree = updateTree(fileTree, (node) => {
      if (node.id === id) return null;
      return node;
    });

    const updatedOpenFiles = openFiles.filter((f) => f.id !== id);
    const updatedActive =
      activeFileId === id
        ? updatedOpenFiles.length
          ? updatedOpenFiles[updatedOpenFiles.length - 1].id
          : null
        : activeFileId;

    set({
      fileTree: updatedTree,
      openFiles: updatedOpenFiles,
      activeFileId: updatedActive,
    });
  },

  openFiles: [],
  activeFileId: null,

  openFile: (file) => {
    const { openFiles } = get();
    const already = openFiles.find((f) => f.id === file.id);
    if (!already) {
      set({ openFiles: [...openFiles, file], activeFileId: file.id });
    } else {
      set({
        openFiles: openFiles.map((f) => (f.id === file.id ? { ...f, ...file } : f)),
        activeFileId: file.id,
      });
    }
  },

  openFileById: (fileId) => {
    const { fileTree, openFiles } = get();
    const already = openFiles.find((f) => f.id === fileId);
    if (already) {
      set({ activeFileId: fileId });
      return;
    }

    const file = findFileById(fileTree, fileId);
    if (!file) return;

    set({ openFiles: [...openFiles, file], activeFileId: fileId });
  },

  closeFile: (id) => {
    const { openFiles, activeFileId } = get();
    const updated = openFiles.filter((f) => f.id !== id);

    set({
      openFiles: updated,
      activeFileId:
        activeFileId === id && updated.length
          ? updated[updated.length - 1].id
          : updated.length
            ? activeFileId
            : null,
    });
  },

  setActiveFile: (id) => set({ activeFileId: id }),

  updateFileContent: (id, content) => {
    // update open tabs
    const updatedOpen = get().openFiles.map((f) =>
      f.id === id ? { ...f, content } : f,
    );

    // update in fileTree too
    const updatedTree = updateTree(get().fileTree, (node) => {
      if (node.id === id && node.type === "file") return { ...node, content };
      return node;
    });

    set({ openFiles: updatedOpen, fileTree: updatedTree });
  },

  cursor: { line: 1, col: 1 },
  setCursor: (pos) => set({ cursor: pos }),

  pendingReveal: null,
  clearPendingReveal: () => set({ pendingReveal: null }),

  highlightLine: null,

  revealInEditor: (fileId, line) => {
    const safeLine = Math.max(1, line);

    // 1) open file if needed
    get().openFileById(fileId);

    // 2) set cursor + queue reveal for CodeEditor effect
    set({
      cursor: { line: safeLine, col: 1 },
      highlightLine: safeLine,
      pendingReveal: { fileId, line: safeLine },
    });

    // 3) remove highlight after 1.2s
    window.setTimeout(() => {
      // don't wipe if user clicked another highlight quickly
      set((s) => (s.highlightLine === safeLine ? { highlightLine: null } : s));
    }, 1200);
  },
}));
