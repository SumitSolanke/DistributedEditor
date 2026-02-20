import { X } from "lucide-react"
import { useEditorStore } from "../../store/editorStore"

const EditorTabs = () => {
  const { openFiles, activeFileId, setActiveFile, closeFile } = useEditorStore()

  if (openFiles.length === 0) {
    return (
      <div className="h-10 bg-[#252526] border-b border-gray-700 flex items-center px-3 text-xs text-gray-400">
        No files opened
      </div>
    )
  }

  return (
    <div className="h-10 bg-[#252526] border-b border-gray-700 flex items-center overflow-x-auto">
      {openFiles.map((file) => {
        const isActive = file.id === activeFileId

        return (
          <div
            key={file.id}
            onClick={() => setActiveFile(file.id)}
            className={`h-full flex items-center gap-2 px-3 border-r border-gray-700 cursor-pointer whitespace-nowrap ${
              isActive ? "bg-[#1e1e1e] text-white" : "bg-[#2d2d2d] text-gray-200"
            } hover:bg-[#1e1e1e]`}
          >
            <span className="text-sm flex items-center gap-2">
              {file.name}
              {file.isDirty && <span className="text-xs">●</span>}
            </span>

            <button
              className="p-1 rounded hover:bg-gray-700"
              onClick={(e) => {
                e.stopPropagation()

                if (file.isDirty) {
                  const ok = window.confirm(
                    `You have unsaved changes in "${file.name}". Close anyway?`
                  )
                  if (!ok) return
                }

                closeFile(file.id)
              }}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default EditorTabs