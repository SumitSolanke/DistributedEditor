export type SidebarView = "explorer" | "connection"

export interface FileNode {
  id: string
  name: string
  type: "file" | "folder"
  children?: FileNode[]
  content?: string
}

export type ExplorerAction =
  | { mode: "create"; parentId: string; nodeType: "file" | "folder" }
  | { mode: "rename"; nodeId: string }
  | null

export interface CursorPos {
  line: number
  col: number
}