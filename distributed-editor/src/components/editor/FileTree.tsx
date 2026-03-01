import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File as FileIcon,
  FileCode2,
  FileJson2,
  FileText,
  FileType2,
  Trash2,
} from "lucide-react";
import type { FileNode } from "../../types/editor.types";
import { useEditorStore } from "../../store/editorStore";
import { joinRelativePath } from "../../utils/projectTree";

interface Props {
  nodes: FileNode[];
  reloadProjectTree: () => Promise<void>;
  onDeleteOpenProject?: () => Promise<void>;
}

type CtxState = {
  open: boolean;
  x: number;
  y: number;
  node: FileNode | null;
};

function getIconByName(name: string) {
  const lower = name.toLowerCase();
  if (
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".js") ||
    lower.endsWith(".jsx")
  )
    return <FileCode2 size={14} />;
  if (lower.endsWith(".json")) return <FileJson2 size={14} />;
  if (lower.endsWith(".md")) return <FileText size={14} />;
  if (lower.endsWith(".css") || lower.endsWith(".html")) return <FileType2 size={14} />;
  return <FileIcon size={14} />;
}

const FileTree = ({ nodes, reloadProjectTree, onDeleteOpenProject }: Props) => {
  return (
    <div className="text-sm select-none">
      {nodes.map((node) => (
        <FileNodeItem
          key={node.id}
          node={node}
          depth={0}
          reloadProjectTree={reloadProjectTree}
          onDeleteOpenProject={onDeleteOpenProject}
        />
      ))}
    </div>
  );
};

const FileNodeItem = ({
  node,
  depth,
  reloadProjectTree,
  onDeleteOpenProject,
}: {
  node: FileNode;
  depth: number;
  reloadProjectTree: () => Promise<void>;
  onDeleteOpenProject?: () => Promise<void>;
}) => {
  const [open, setOpen] = useState(true);
  const [ctx, setCtx] = useState<CtxState>({
    open: false,
    x: 0,
    y: 0,
    node: null,
  });
  const [inputValue, setInputValue] = useState("");

  const {
    openFile,
    selectedNodeId,
    setSelectedNodeId,
    explorerAction,
    startCreate,
    clearExplorerAction,
    activeFileId,
  } = useEditorStore();

  const isSelected = selectedNodeId === node.id;
  const isActiveFile = node.type === "file" && activeFileId === node.id;
  const isRoot = node.path === "";

  const isCreateModeForThisFolder =
    explorerAction?.mode === "create" &&
    node.type === "folder" &&
    explorerAction.parentId === node.id;

  const paddingLeft = useMemo(() => 8 + depth * 14, [depth]);

  useEffect(() => {
    const close = () => setCtx((s) => ({ ...s, open: false, node: null }));
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtx({ open: true, x: e.clientX, y: e.clientY, node });
    setSelectedNodeId(node.id);
  };

  const submitCreate = async () => {
    if (!explorerAction || explorerAction.mode !== "create") return;
    const name = inputValue.trim();
    if (!name) {
      alert("Name cannot be empty.");
      return;
    }

    const relativePath = joinRelativePath(node.path || "", name);
    try {
      if (explorerAction.nodeType === "file") {
        await window.api?.createFile?.({ relativePath });
      } else {
        await window.api?.createFolder?.({ relativePath });
      }
      clearExplorerAction();
      await reloadProjectTree();
    } catch (error) {
      console.error("Create operation failed:", error);
      alert("Unable to create item.");
    }
  };

  const onDelete = async () => {
    if (isRoot) return;
    try {
      if (node.type === "file") {
        await window.api?.deleteFile?.({ relativePath: node.path || "" });
      } else {
        await window.api?.deleteFolder?.({ relativePath: node.path || "" });
      }
      await reloadProjectTree();
    } catch (error) {
      console.error("Delete operation failed:", error);
      alert("Unable to delete item.");
    }
  };

  const openFileFromBackend = async () => {
    if (node.type !== "file") return;
    const relativePath = node.path || "";
    try {
      const content = (await window.api?.readFile?.({ relativePath })) || "";
      openFile({ ...node, content });
      setSelectedNodeId(node.id);
    } catch (error) {
      console.error("readFile failed:", error);
      alert("Unable to read file.");
    }
  };

  const cancelAction = () => clearExplorerAction();

  const rowClass = `flex items-center gap-1 cursor-pointer px-2 py-1 ${
    isSelected ? "bg-gray-700" : "hover:bg-gray-700"
  } ${isActiveFile ? "border-l-2 border-[#007acc]" : "border-l-2 border-transparent"}`;

  if (node.type === "folder") {
    return (
      <div>
        <div
          className={rowClass}
          style={{ paddingLeft }}
          onClick={() => {
            setOpen(!open);
            setSelectedNodeId(node.id);
          }}
          onContextMenu={onContextMenu}
        >
          {isRoot ? (
            <button
              title="Delete Open Project"
              className="p-0.5 rounded hover:bg-red-700/40 text-red-300"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void onDeleteOpenProject?.();
              }}
            >
              <Trash2 size={13} />
            </button>
          ) : null}
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} />
          <span>{node.name}</span>
        </div>

        {open && node.children && (
          <div>
            {node.children.map((child) => (
                <FileNodeItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  reloadProjectTree={reloadProjectTree}
                  onDeleteOpenProject={onDeleteOpenProject}
                />
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
              onBlur={() => void submitCreate()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCreate();
                if (e.key === "Escape") cancelAction();
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
            hideDelete={isRoot}
            onNewFile={() => startCreate(node.id, "file")}
            onNewFolder={() => startCreate(node.id, "folder")}
            onDelete={() => void onDelete()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={rowClass}
        style={{ paddingLeft: paddingLeft + 18 }}
        onClick={() => void openFileFromBackend()}
        onContextMenu={onContextMenu}
      >
        {getIconByName(node.name)}
        <span className={isActiveFile ? "text-[#cce8ff]" : ""}>{node.name}</span>
      </div>

      {ctx.open && ctx.node?.id === node.id && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          node={ctx.node}
          hideCreate
          onNewFile={() => {}}
          onNewFolder={() => {}}
          onDelete={() => void onDelete()}
        />
      )}
    </div>
  );
};

function ContextMenu({
  x,
  y,
  node,
  onNewFile,
  onNewFolder,
  onDelete,
  hideCreate,
  hideDelete,
}: {
  x: number;
  y: number;
  node: FileNode;
  onNewFile: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  hideCreate?: boolean;
  hideDelete?: boolean;
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
          {!hideDelete ? <div className="h-px bg-gray-700" /> : null}
        </>
      )}

      {!hideDelete ? (
        <button
          className="w-full text-left px-3 py-2 hover:bg-gray-700 text-red-300 flex items-center gap-2"
          onClick={onDelete}
        >
          <Trash2 size={14} /> Delete
        </button>
      ) : null}
    </div>
  );
}

export default FileTree;
