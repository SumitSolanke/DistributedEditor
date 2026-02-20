import EditorTabs from "./EditorTabs"
import CodeEditor from "./CodeEditor"

const EditorArea = () => {
  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e] h-full min-h-0 overflow-hidden">
      {/* Tabs always visible */}
      <EditorTabs />

      {/* Monaco gets remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeEditor />
      </div>
    </div>
  )
}

export default EditorArea