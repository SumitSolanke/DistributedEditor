import { create } from "zustand";
import type { CursorPos, ExplorerAction, FileNode, PendingReveal, SidebarView } from "../types/editor.types";

interface EditorState {
  // left sidebar view
  activeSidebar: SidebarView;
  setActiveSidebar: (view: SidebarView) => void;

  // file system
  fileTree: FileNode[];
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  explorerAction: ExplorerAction;
  startCreate: (parentId: string, nodeType: "file" | "folder") => void;
  startRename: (nodeId: string) => void;
  clearExplorerAction: () => void;

  addNodeWithName: (
    parentId: string,
    type: "file" | "folder",
    name: string
  ) => { ok: true } | { ok: false; reason: string };

  renameNodeSafe: (
    id: string,
    newName: string
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

  // ✅ save
  saveFile: (id: string) => void;

  // cursor + reveal
  cursor: CursorPos;
  setCursor: (line: number, col: number) => void;

  // ✅ for CodeEditor jump-to-line highlight
  pendingReveal: PendingReveal | null;
  clearPendingReveal: () => void;
  revealInEditor: (fileId: string, line: number, column?: number) => void;
}

const ROOT_FOLDER_ID = "1";
const generateId = () => Math.random().toString(36).slice(2, 10);

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
  callback: (node: FileNode) => FileNode | null
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

  fileTree: [
    {
      id: ROOT_FOLDER_ID,
      name: "src",
      type: "folder",
      children: [
        {
          id: "2",
          name: "App.tsx",
          type: "file",
          isDirty: false,
          content: `export default function App() {
  return (
    <div>
      Hello World
    </div>
  )
}
`,
        },
        {
          id: "3",
          name: "main.tsx",
          type: "file",
          isDirty: false,
          content: `import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`,
        },
      ],
    },
  ],

  selectedNodeId: ROOT_FOLDER_ID,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  explorerAction: null,
  startCreate: (parentId, nodeType) => set({ explorerAction: { mode: "create", parentId, nodeType } }),
  startRename: (nodeId) => set({ explorerAction: { mode: "rename", nodeId } }),
  clearExplorerAction: () => set({ explorerAction: null }),

  addNodeWithName: (parentId, type, name) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, reason: "Name cannot be empty." };

    const { fileTree } = get();
    const parent = findNodeById(fileTree, parentId);
    if (!parent || parent.type !== "folder") return { ok: false, reason: "Parent folder not found." };

    const siblings = parent.children || [];
    const exists = siblings.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return { ok: false, reason: "A file/folder with same name already exists." };

    const newNode: FileNode = {
      id: generateId(),
      name: trimmed,
      type,
      isDirty: false,
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

    const findParent = (nodes: FileNode[], childId: string): FileNode | null => {
      for (const n of nodes) {
        if (n.type === "folder" && n.children?.some((c) => c.id === childId)) return n;
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
      const exists = siblings.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase());
      if (exists) return { ok: false, reason: "Same name already exists in this folder." };
    }

    const updatedTree = updateTree(fileTree, (n) => (n.id === id ? { ...n, name: trimmed } : n));
    const updatedOpen = get().openFiles.map((f) => (f.id === id ? { ...f, name: trimmed } : f));

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

    set({ fileTree: updatedTree, openFiles: updatedOpenFiles, activeFileId: updatedActive });
  },

  openFiles: [],
  activeFileId: null,

  openFile: (file) => {
    const { openFiles } = get();
    const already = openFiles.find((f) => f.id === file.id);
    if (!already) {
      set({ openFiles: [...openFiles, file], activeFileId: file.id });
    } else {
      set({ activeFileId: file.id });
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
    // mark dirty
    const updatedOpen = get().openFiles.map((f) => (f.id === id ? { ...f, content, isDirty: true } : f));

    const updatedTree = updateTree(get().fileTree, (node) => {
      if (node.id === id && node.type === "file") return { ...node, content, isDirty: true };
      return node;
    });

    set({ openFiles: updatedOpen, fileTree: updatedTree });
  },

  saveFile: (id) => {
    // just clear dirty (you can add disk save later)
    const updatedOpen = get().openFiles.map((f) => (f.id === id ? { ...f, isDirty: false } : f));
    const updatedTree = updateTree(get().fileTree, (node) => {
      if (node.id === id && node.type === "file") return { ...node, isDirty: false };
      return node;
    });

    set({ openFiles: updatedOpen, fileTree: updatedTree });
  },

  cursor: { line: 1, col: 1 },
  setCursor: (line, col) => set({ cursor: { line, col } }),

  pendingReveal: null,
  clearPendingReveal: () => set({ pendingReveal: null }),

  revealInEditor: (fileId, line, column) => {
    // open & activate file
    get().openFileById(fileId);
    set({ activeFileId: fileId });

    // store pending reveal for Monaco component
    set({
      pendingReveal: {
        fileId,
        line: Math.max(1, line),
        column: column ? Math.max(1, column) : undefined,
      },
      cursor: { line: Math.max(1, line), col: column ? Math.max(1, column) : 1 },
    });
  },
}));