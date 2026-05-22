import { useCallback, useState } from "react";
import {
  PanelLeft,
  PanelRight,
  Github,
  Save,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { useAuthStore } from "../../store/authStore";

interface Props {
  toggleLeft: () => void;
  toggleRight: () => void;
}

const roleLabel = (role: string) => {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  return "Viewer";
};

const roleChipClass = (role: string) => {
  if (role === "owner")
    return "bg-purple-600/20 border-purple-500 text-purple-200";
  if (role === "admin") return "bg-blue-600/20 border-blue-500 text-blue-200";
  if (role === "member")
    return "bg-green-600/20 border-green-500 text-green-200";
  return "bg-gray-600/20 border-gray-500 text-gray-200";
};

export default function TopNavbar({ toggleLeft, toggleRight }: Props) {
  const { setActiveSidebar, activeFileId } = useEditorStore();
  const [syncingAll, setSyncingAll] = useState(false);

  const user = useAuthStore((s) => s.user);
  const reset = useAuthStore((s) => s.reset);

  const handleSave = () => {
    if (activeFileId) {
    }
  };

  const handleSyncAll = useCallback(async () => {
    if (syncingAll) return;
    setSyncingAll(true);
    try {
      if (window.api?.syncNetworkAndProjects) {
        const res = await window.api.syncNetworkAndProjects();
        if (!res?.success) {
          throw new Error(res?.error || "Unable to sync network and projects.");
        }
        return;
      }

      if (window.api?.syncAllProjects) {
        const res = await window.api.syncAllProjects();
        if (!res?.success) {
          throw new Error(res?.error || "Unable to sync projects.");
        }
      }
    } catch (error) {
      console.error("Manual full sync failed:", error);
    } finally {
      setSyncingAll(false);
    }
  }, [syncingAll]);

  const displayName = user?.name ?? "Guest";
  const displayRole = user?.role ?? "viewer";

  return (
    <div className="h-14 bg-[#1e1e1e] border-b border-gray-700 flex items-center justify-between px-4 text-white">
      <div className="flex items-center gap-4">
        <button onClick={toggleLeft} title="Toggle Left Sidebar">
          <PanelLeft size={20} />
        </button>

        <button
          onClick={() => setActiveSidebar("explorer")}
          className="text-sm px-2 py-1 bg-[#2a2d2e] rounded"
        >
          Explorer
        </button>

        {/* <button
          onClick={() => setActiveSidebar("connection")}
          className="text-sm px-2 py-1 bg-[#2a2d2e] rounded"
        >
          Connection
        </button> */}

        <span className="font-semibold text-sm">Distributed Code Editor</span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          title="Save (Ctrl + S)"
          className="hover:text-green-400"
        >
          <Save size={20} />
        </button>

        <button
          onClick={() => void handleSyncAll()}
          title="Sync network and all public projects"
          className="hover:text-cyan-300 disabled:opacity-50"
          disabled={syncingAll}
        >
          <RefreshCw size={20} className={syncingAll ? "animate-spin" : ""} />
        </button>

        <button
          onClick={reset}
          title="Reset profile (clears localStorage)"
          className="hover:text-yellow-300"
        >
          <RotateCcw size={20} />
        </button>

        {/* <button title="GitHub"> */}
          {/* <Github size={20} /> */}
        {/* </button> */}

        <button onClick={toggleRight} title="Toggle Right Sidebar">
          <PanelRight size={20} />
        </button>

        <div className="flex items-center gap-2 ml-2">
          <div className="text-lg text-gray-300 capitalize font-bold">{displayName}</div>
          {/* <div
            className={`text-[11px] px-2 py-1 rounded border ${roleChipClass(displayRole)}`}
          >
            {roleLabel(displayRole)}
          </div> */}
        </div>
      </div>
    </div>
  );
}
