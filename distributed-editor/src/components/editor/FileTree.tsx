import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File as FileIcon,
  FileCode2,
  FileJson2,
  FileText,
  FileType2,
  Pencil,
  Trash2,
} from "lucide-react"
import type { FileNode } from "../../types/editor.types"
import { useEditorStore } from "../../store/editorStore"

interface Props {
  nodes: FileNode[]
}

type CtxState = {
  open: boolean
  x: number
  y: number
  node: FileNode | null
}

function getIconByName(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".js") || lower.endsWith(".jsx"))
    return <FileCode2 size={14} />
  if (lower.endsWith(".json")) return <FileJson2 size={14} />
  if (lower.endsWith(".md")) return <FileText size={14} />
  if (lower.endsWith(".css") || lower.endsWith(".html")) return <FileType2 size={14} />
  return <FileIcon size={14} />
}

const FileTree = ({ nodes }: Props) => {
  return (
    <div className="text-sm select-none">
      {nodes.map((node) => (
        <FileNodeItem key={node.id} node={node} depth={0} />
      ))}
    </div>
  )
}

const FileNodeItem = ({ node, depth }: { node: FileNode; depth: number }) => {
  const [open, setOpen] = useState(true)

  const {
    openFile,
    selectedNodeId,
    setSelectedNodeId,
    explorerAction,
    startCreate,
    startRename,
    clearExplorerAction,
    addNodeWithName,
    renameNodeSafe,
    deleteNode,
    activeFileId,
  } = useEditorStore()

  const [ctx, setCtx] = useState<CtxState>({
    open: false,
    x: 0,
    y: 0,
    node: null,
  })

  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  const paddingLeft = useMemo(() => 8 + depth * 14, [depth])

  const isSelected = selectedNodeId === node.id
  const isActiveFile = node.type === "file" && activeFileId === node.id

  const isRenameMode =
    explorerAction?.mode === "rename" && explorerAction.nodeId === node.id

  const isCreateModeForThisFolder =
    explorerAction?.mode === "create" &&
    node.type === "folder" &&
    explorerAction.parentId === node.id

  useEffect(() => {
    const close = () => setCtx((s) => ({ ...s, open: false, node: null }))
    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [])

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setCtx({ open: true, x: e.clientX, y: e.clientY, node })
    setSelectedNodeId(node.id)
  }

  const submitRename = () => {
    const res = renameNodeSafe(node.id, inputValue)
    if (!res.ok) {
      alert(res.reason)
      return
    }
    clearExplorerAction()
  }

  const submitCreate = () => {
    if (!explorerAction || explorerAction.mode !== "create") return
    const res = addNodeWithName(explorerAction.parentId, explorerAction.nodeType, inputValue)
    if (!res.ok) {
      alert(res.reason)
      return
    }
    clearExplorerAction()
  }

  const cancelAction = () => clearExplorerAction()

  const rowClass = `flex items-center gap-1 cursor-pointer px-2 py-1 ${
    isSelected ? "bg-gray-700" : "hover:bg-gray-700"
  } ${isActiveFile ? "border-l-2 border-[#007acc]" : "border-l-2 border-transparent"}`

  if (node.type === "folder") {
    return (
      <div>
        <div
          className={rowClass}
          style={{ paddingLeft }}
          onClick={() => {
            setOpen(!open)
            setSelectedNodeId(node.id)
          }}
          onContextMenu={onContextMenu}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} />

          {isRenameMode ? (
            <input
              key={`rename-${node.id}-${node.name}`}
              ref={inputRef}
              autoFocus
              defaultValue={node.name}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename()
                if (e.key === "Escape") cancelAction()
              }}
              className="bg-[#1e1e1e] border border-gray-600 rounded px-2 py-1 text-sm w-full outline-none"
            />
          ) : (
            <span>{node.name}</span>
          )}
        </div>

        {open && node.children && (
          <div>
            {node.children.map((child) => (
              <FileNodeItem key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}

        {open && isCreateModeForThisFolder && (
          <div
            className="flex items-center gap-1 px-2 py-1 hover:bg-gray-700 border-l-2 border-transparent"
            style={{ paddingLeft: paddingLeft + 18 }}
          >
            <FileIcon size={14} />
            <input
              key={`create-${node.id}-${explorerAction?.nodeType ?? "file"}`}
              autoFocus
              defaultValue={
                explorerAction?.mode === "create" && explorerAction.nodeType === "folder"
                  ? "newFolder"
                  : "newFile.ts"
              }
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={submitCreate}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate()
                if (e.key === "Escape") cancelAction()
              }}
              className="bg-[#1e1e1e] border border-gray-600 rounded px-2 py-1 text-sm w-full outline-none"
            />
          </div>
        )}

        {ctx.open && ctx.node?.id === node.id && (
          <ContextMenu
            x={ctx.x}
            y={ctx.y}
            node={ctx.node}
            onNewFile={() => startCreate(node.id, "file")}
            onNewFolder={() => startCreate(node.id, "folder")}
            onRename={() => startRename(node.id)}
            onDelete={() => deleteNode(node.id)}
          />
        )}
      </div>
    )
  }

  // FILE NODE
  return (
    <div className="relative">
      <div
        className={rowClass}
        style={{ paddingLeft: paddingLeft + 18 }}
        onClick={() => {
          setSelectedNodeId(node.id)
          openFile(node)
        }}
        onContextMenu={onContextMenu}
      >
        {getIconByName(node.name)}

        {isRenameMode ? (
          <input
            key={`rename-${node.id}-${node.name}`}
            autoFocus
            defaultValue={node.name}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename()
              if (e.key === "Escape") cancelAction()
            }}
            className="bg-[#1e1e1e] border border-gray-600 rounded px-2 py-1 text-sm w-full outline-none"
          />
        ) : (
          <span className={`${isActiveFile ? "text-[#cce8ff]" : ""}`}>{node.name}</span>
        )}
      </div>

      {ctx.open && ctx.node?.id === node.id && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          node={ctx.node}
          hideCreate
          onNewFile={() => {}}
          onNewFolder={() => {}}
          onRename={() => startRename(node.id)}
          onDelete={() => deleteNode(node.id)}
        />
      )}
    </div>
  )
}

function ContextMenu({
  x,
  y,
  node,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  hideCreate,
}: {
  x: number
  y: number
  node: FileNode
  onNewFile: () => void
  onNewFolder: () => void
  onRename: () => void
  onDelete: () => void
  hideCreate?: boolean
}) {
  return (
    <div
      className="fixed z-50 w-48 bg-[#252526] border border-gray-700 rounded shadow-lg text-sm overflow-hidden"
      style={{ left: x, top: y }}
    >
      {!hideCreate && node.type === "folder" && (
        <>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-700" onClick={onNewFile}>
            New File
          </button>
          <button className="w-full text-left px-3 py-2 hover:bg-gray-700" onClick={onNewFolder}>
            New Folder
          </button>
          <div className="h-px bg-gray-700" />
        </>
      )}

      <button
        className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2"
        onClick={onRename}
      >
        <Pencil size={14} /> Rename
      </button>

      <button
        className="w-full text-left px-3 py-2 hover:bg-gray-700 text-red-300 flex items-center gap-2"
        onClick={onDelete}
      >
        <Trash2 size={14} /> Delete
      </button>
    </div>
  )
}

export default FileTree