import { useCallback, useMemo, useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import type { ConnectionItem } from "../../types/electron.types";
import {
  backendNodesToFileNodes,
  buildProjectTree,
} from "../../utils/projectTree";
import FileTree from "../editor/FileTree";
import MemberList from "../members/MemberList";

interface LeftSidebarProps {
  isOpen: boolean;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ConnectionOption {
  id: string;
  label: string;
  username: string;
  ip: string;
  email: string;
}

function toConnectionOptions(items: ConnectionItem[]): ConnectionOption[] {
  return items.map((item) => {
    const email = item.email || "";
    const ip = item.ip || "";
    const username = item.username || item.name || email || ip || "unknown";
    const id = email || ip || username;
    return {
      id,
      label: item.name || item.email || item.ip || "Unknown",
      username,
      ip,
      email,
    };
  });
}

export default function LeftSidebar({ isOpen }: LeftSidebarProps) {
  const { activeSidebar, fileTree, currentProject, openProject, setFileTree, closeProject } =
    useEditorStore();

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showOpenProject, setShowOpenProject] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>([]);
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const [loadingConnections, setLoadingConnections] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [createError, setCreateError] = useState("");
  const [openError, setOpenError] = useState("");

  const selectedConnections = useMemo(
    () => connections.filter((c) => selectedConnectionIds.includes(c.id)),
    [connections, selectedConnectionIds],
  );

  const reloadProjectTree = useCallback(
    async (projectToLoad?: string) => {
      const project = projectToLoad || currentProject?.name;
      if (!project || !window.api?.loadProject) return;

      const loaded = await window.api.loadProject({ path: "", projectName: project });
      const children = Array.isArray(loaded) ? backendNodesToFileNodes(loaded) : [];
      const nextTree = buildProjectTree(project, children);
      if (!currentProject || currentProject.name !== project) {
        openProject({ id: project, name: project, connections: [] }, nextTree);
      } else {
        setFileTree(nextTree);
      }
    },
    [currentProject, openProject, setFileTree],
  );

  const fetchConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const res = await window.api?.getConnections?.();
      if (res?.success && Array.isArray(res.connections)) {
        setConnections(toConnectionOptions(res.connections));
      } else {
        setConnections([]);
      }
    } catch {
      setConnections([]);
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    setOpenError("");
    try {
      const res = await window.api?.getProjects?.();
      if (!res?.success) {
        setProjects([]);
        return;
      }

      const raw = res.data;
      if (Array.isArray(raw)) {
        const parsed = raw
          .map((item) => {
            if (typeof item === "string") return { id: item, name: item };
            if (item && typeof item === "object" && "name" in item) {
              return { id: String(item.id || item.name), name: String(item.name) };
            }
            return null;
          })
          .filter(Boolean) as ProjectOption[];
        setProjects(parsed);
      } else {
        setProjects([]);
      }
    } catch {
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const onOpenCreateProject = useCallback(async () => {
    setShowOpenProject(false);
    setShowCreateProject(true);
    setCreateError("");
    await fetchConnections();
  }, [fetchConnections]);

  const onOpenProjectPicker = useCallback(async () => {
    setShowCreateProject(false);
    setShowOpenProject(true);
    await fetchProjects();
  }, [fetchProjects]);

  const onCreateProject = useCallback(async () => {
    const trimmed = projectName.trim();
    if (!trimmed) {
      setCreateError("Project name is required.");
      return;
    }
    if (!window.api?.addProject) {
      setCreateError("addProject API is not available.");
      return;
    }

    setCreateError("");
    try {
      const connectionsPayload = selectedConnections.map((c) => ({
        username: c.username,
        ip: c.ip,
        email: c.email,
      }));
      const addRes = await window.api.addProject({
        projectName: trimmed,
        connections: connectionsPayload,
      });
      if (!addRes?.success) {
        setCreateError(addRes?.message || "Unable to create project.");
        return;
      }

      await reloadProjectTree(trimmed);
      setShowCreateProject(false);
      setProjectName("");
      setSelectedConnectionIds([]);
    } catch {
      setCreateError("Unable to create project.");
    }
  }, [projectName, reloadProjectTree, selectedConnections]);

  const onChooseProject = useCallback(
    async (project: ProjectOption) => {
      try {
        setOpenError("");
        await reloadProjectTree(project.name);
        setShowOpenProject(false);
      } catch {
        setOpenError("Unable to open selected project.");
      }
    },
    [reloadProjectTree],
  );

  const onDeleteOpenProject = useCallback(async () => {
    if (!currentProject?.name || !window.api?.deleteProject) return;

    const confirmed = window.confirm(
      `Delete project "${currentProject.name}"? This will remove all files in this project.`,
    );
    if (!confirmed) return;

    try {
      const res = await window.api.deleteProject({ projectName: currentProject.name });
      if (!res?.success) {
        alert(res?.message || "Unable to delete project.");
        return;
      }
      closeProject();
      setShowOpenProject(false);
      setShowCreateProject(false);
      setOpenError("");
      setCreateError("");
    } catch {
      alert("Unable to delete project.");
    }
  }, [closeProject, currentProject?.name]);

  const toggleConnection = useCallback((id: string) => {
    setSelectedConnectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  if (!isOpen) return null;

  return (
    <div className="w-full h-full bg-zinc-800 text-white flex flex-col overflow-hidden">
      {activeSidebar === "explorer" && (
        <>
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-700">
            <div className="text-xs uppercase text-zinc-400">Explorer</div>
            <div className="flex items-center gap-2">
              <button
                title="Create Project"
                className="p-1 rounded hover:bg-gray-700"
                onClick={() => void onOpenCreateProject()}
              >
                <Plus size={16} />
              </button>
              <button
                title="Open Project"
                className="p-1 rounded hover:bg-gray-700"
                onClick={() => void onOpenProjectPicker()}
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
            {!currentProject && (
              <div className="text-xs text-gray-500 px-1">
                No project is opened. Use the top-right icons to create or open one.
              </div>
            )}

            {showCreateProject && (
              <div className="bg-[#1f1f1f] border border-gray-700 rounded p-3 space-y-3">
                <div className="text-sm font-semibold">Create Project</div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-400">Project Name</label>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Project name"
                    className="w-full bg-[#1a1a1a] border border-gray-600 rounded px-2 py-2 text-sm outline-none focus:border-[#007acc]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-400">Connections</label>
                    <button
                      className="text-xs text-[#4aa3ff] hover:underline"
                      onClick={() => void fetchConnections()}
                      disabled={loadingConnections}
                    >
                      {loadingConnections ? "Loading..." : "Refresh"}
                    </button>
                  </div>

                  <div className="text-xs text-gray-500">
                    {selectedConnectionIds.length
                      ? `${selectedConnectionIds.length} connection(s) selected`
                      : "No connections selected"}
                  </div>

                  <div className="max-h-40 overflow-auto space-y-1 pr-1">
                    {connections.length === 0 ? (
                      <div className="text-xs text-gray-500 border border-gray-700 rounded px-2 py-2">
                        No connections found.
                      </div>
                    ) : (
                      connections.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 bg-[#252526] border border-gray-700 rounded px-2 py-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedConnectionIds.includes(c.id)}
                            onChange={() => toggleConnection(c.id)}
                          />
                          <span>{c.label}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {createError ? <div className="text-xs text-red-300">{createError}</div> : null}

                <div className="flex items-center justify-end gap-2">
                  <button
                    className="px-3 py-1.5 text-sm rounded bg-[#2d2d2d] hover:bg-[#3a3a3a]"
                    onClick={() => setShowCreateProject(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm rounded bg-[#007acc] hover:opacity-90"
                    onClick={() => void onCreateProject()}
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            {showOpenProject && (
              <div className="bg-[#1f1f1f] border border-gray-700 rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Open Project</div>
                  <button
                    className="text-xs text-[#4aa3ff] hover:underline"
                    onClick={() => void fetchProjects()}
                    disabled={loadingProjects}
                  >
                    {loadingProjects ? "Loading..." : "Refresh"}
                  </button>
                </div>

                <div className="max-h-56 overflow-auto space-y-1 pr-1">
                  {loadingProjects ? (
                    <div className="text-xs text-gray-400">Loading projects...</div>
                  ) : projects.length === 0 ? (
                    <div className="text-xs text-gray-500 border border-gray-700 rounded px-2 py-2">
                      No projects received from backend.
                    </div>
                  ) : (
                    projects.map((project) => (
                      <button
                        key={project.id}
                        className="w-full text-left bg-[#252526] border border-gray-700 rounded px-3 py-2 hover:bg-[#2e2e2e]"
                        onClick={() => void onChooseProject(project)}
                      >
                        <div className="text-sm">{project.name}</div>
                      </button>
                    ))
                  )}
                </div>

                {openError ? <div className="text-xs text-red-300">{openError}</div> : null}

                <div className="flex justify-end">
                  <button
                    className="px-3 py-1.5 text-sm rounded bg-[#2d2d2d] hover:bg-[#3a3a3a]"
                    onClick={() => setShowOpenProject(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {currentProject ? (
              <>
                <div className="text-xs text-gray-400 px-1">Project: {currentProject.name}</div>
                <div className="min-h-0 overflow-auto">
                  <FileTree
                    nodes={fileTree}
                    reloadProjectTree={reloadProjectTree}
                    onDeleteOpenProject={onDeleteOpenProject}
                  />
                </div>
              </>
            ) : null}
          </div>
        </>
      )}

      {activeSidebar === "connection" && (
        <div className="flex-1 min-h-0 overflow-auto">
          <MemberList />
        </div>
      )}
    </div>
  );
}
