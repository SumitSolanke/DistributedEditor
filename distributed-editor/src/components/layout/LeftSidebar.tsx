import { FilePlus, FolderPlus } from "lucide-react"
import { useEditorStore } from "../../store/editorStore"
import FileTree from "../editor/FileTree"
import MemberList from "../members/MemberList"

interface LeftSidebarProps {
  isOpen: boolean
}

export default function LeftSidebar({ isOpen }: LeftSidebarProps) {
  const { activeSidebar, fileTree, selectedNodeId, startCreate } = useEditorStore()

  // ✅ keep hooks always, but UI can return null safely here (no hooks after)
  if (!isOpen) return null

  return (
    <div className="w-full h-full bg-zinc-800 text-white flex flex-col overflow-hidden">
      {/* ========== EXPLORER ========== */}
      {activeSidebar === "explorer" && (
        <>
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-700">
            <div className="text-xs uppercase text-zinc-400">Explorer</div>

            <div className="flex items-center gap-2">
              <button
                title="New File"
                className="p-1 rounded hover:bg-gray-700"
                onClick={() => {
                  // If selected is file, creation should ideally happen in its parent.
                  // For now, we keep it simple: create inside selectedNodeId if it's a folder in store logic.
                  if (selectedNodeId) startCreate(selectedNodeId, "file")
                }}
              >
                <FilePlus size={16} />
              </button>

              <button
                title="New Folder"
                className="p-1 rounded hover:bg-gray-700"
                onClick={() => {
                  if (selectedNodeId) startCreate(selectedNodeId, "folder")
                }}
              >
                <FolderPlus size={16} />
              </button>
            </div>
          </div>

          {/* ✅ allow tree to shrink properly */}
          <div className="flex-1 min-h-0 overflow-auto p-1">
            <FileTree nodes={fileTree} />
          </div>
        </>
      )}

      {/* ========== CONNECTION (NEW) ========== */}
      {activeSidebar === "connection" && (
        <div className="flex-1 min-h-0 overflow-auto">
          <MemberList />
        </div>
      )}
    </div>
  )
}