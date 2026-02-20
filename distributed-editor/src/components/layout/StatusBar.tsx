import { useEditorStore } from "../../store/editorStore"

const StatusBar = () => {
  const { openFiles, activeFileId, cursor } = useEditorStore()

  const activeFile = openFiles.find((f) => f.id === activeFileId)

  return (
    <div className="h-7 bg-[#007acc] text-white flex items-center justify-between px-3 text-xs">
      {/* Left */}
      <div className="flex items-center gap-3">
        <span>🟢 Connected</span>
        <span className="opacity-90">Room: 12345</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <span className="opacity-90">
          {activeFile ? activeFile.name : "No file"}
        </span>
        <span className="opacity-90">
          Ln {cursor.line}, Col {cursor.col}
        </span>
      </div>
    </div>
  )
}

export default StatusBar