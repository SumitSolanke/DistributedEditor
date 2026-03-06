import { Files, Users, Share2, GitBranch } from "lucide-react"
import { useEditorStore } from "../../store/editorStore"
import { useNetworkStore } from "../../store/networkStore"
import { useGitStore } from "../../store/gitStore"

export default function ActivityBar() {
  const { setActiveSidebar, activeSidebar } = useEditorStore()
  const { toggleOverlay } = useNetworkStore()
  const { toggleOverlay: toggleGitOverlay, overlayOpen: gitOverlayOpen } = useGitStore()

  const iconBtn = (active: boolean) =>
    `w-12 h-12 flex items-center justify-center hover:bg-[#2a2d2e] ${
      active ? "border-l-2 border-[#007acc] bg-[#252526]" : ""
    }`

  return (
    <div className="w-12 bg-[#333333] border-r border-gray-700 flex flex-col">
      <button
        className={iconBtn(activeSidebar === "explorer")}
        title="Explorer"
        onClick={() => setActiveSidebar("explorer")}
      >
        <Files size={20} className="text-white" />
      </button>

      <button
        className={iconBtn(activeSidebar === "connection")}
        title="Connection"
        onClick={() => setActiveSidebar("connection")}
      >
        <Users size={20} className="text-white" />
      </button>

      <button
        className={iconBtn(gitOverlayOpen)}
        title="Git"
        onClick={toggleGitOverlay}
      >
        <GitBranch size={20} className="text-white" />
      </button>

      <button
        className={iconBtn(false)}
        title="Network (Overlay)"
        onClick={toggleOverlay}
      >
        <Share2 size={20} className="text-white" />
      </button>
    </div>
  )
}
