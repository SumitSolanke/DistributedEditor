export type SidebarView = "explorer" | "connection";

export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;

  // ✅ added
  isDirty?: boolean;
}

export type ExplorerAction =
  | { mode: "create"; parentId: string; nodeType: "file" | "folder" }
  | { mode: "rename"; nodeId: string }
  | null;

export interface CursorPos {
  line: number;
  col: number;
}

export type PendingReveal = {
  fileId: string;
  line: number;
  column?: number;
};