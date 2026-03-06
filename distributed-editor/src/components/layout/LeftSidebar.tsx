import { useCallback, useMemo, useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import type { ConnectionItem } from "../../types/electron.types";
import type { ProjectMetadata } from "../../types/project.types";
import {
  backendNodesToFileNodes,
  buildProjectTree,
} from "../../utils/projectTree";
import {
  findProjectByIdOrName,
  normalizeProjects,
} from "../../utils/projectMetadata";
import FileTree from "../editor/FileTree";
import MemberList from "../members/MemberList";

interface LeftSidebarProps {
  isOpen: boolean;
}

type ProjectOption = ProjectMetadata;

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
  const {
    activeSidebar,
    fileTree,
    currentProject,
    openProject,
    setFileTree,
    closeProject,
    updateCurrentProjectMeta,
  } = useEditorStore();

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showOpenProject, setShowOpenProject] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [isProjectPublic, setIsProjectPublic] = useState(false);
  const [selectedConnectionIds, setSelectedConnectionIds] = useState<string[]>(
    [],
  );
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

  const fetchProjects = useCallback(async (): Promise<ProjectOption[]> => {
    setLoadingProjects(true);
    setOpenError("");
    try {
      const res = await window.api?.getProjects?.();
      if (!res?.success) {
        setProjects([]);
        return [];
      }

      const parsed = normalizeProjects(res.data);
      setProjects(parsed);
      return parsed;
    } catch {
      setProjects([]);
      return [];
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const reloadProjectTree = useCallback(
    async (projectToLoad?: ProjectOption | string) => {
      let targetProject: ProjectOption | null =
        typeof projectToLoad === "string" || !projectToLoad
          ? null
          : projectToLoad;

      const fallbackName =
        typeof projectToLoad === "string"
          ? projectToLoad
          : targetProject?.name || currentProject?.name;

      if (!targetProject && fallbackName) {
        const latestProjects = await fetchProjects();
        targetProject = findProjectByIdOrName(latestProjects, {
          id: currentProject?.id,
          name: fallbackName,
        });
      }

      if (!targetProject && fallbackName) {
        targetProject = {
          id: fallbackName,
          name: fallbackName,
          public: false,
          owner: {},
          branches: {},
        };
      }

      if (!targetProject || !window.api?.loadProject) return;

      const loaded = await window.api.loadProject({
        path: "",
        projectName: targetProject.name,
      });
      const children = Array.isArray(loaded) ? backendNodesToFileNodes(loaded) : [];
      const nextTree = buildProjectTree(targetProject.name, children);

      const metaPatch = {
        public: targetProject.public,
        ownerEmail: targetProject.owner.email || "",
        branches: targetProject.branches,
      };

      if (!currentProject || currentProject.name !== targetProject.name) {
        openProject(
          {
            id: targetProject.id,
            name: targetProject.name,
            connections: [],
            ...metaPatch,
          },
          nextTree,
        );
      } else {
        setFileTree(nextTree);
        updateCurrentProjectMeta({ id: targetProject.id, ...metaPatch });
      }
    },
    [
      currentProject,
      fetchProjects,
      openProject,
      setFileTree,
      updateCurrentProjectMeta,
    ],
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

  const onOpenCreateProject = useCallback(async () => {
    setShowOpenProject(false);
    setShowCreateProject(true);
    setCreateError("");
    setProjectName("");
    setIsProjectPublic(false);
    setSelectedConnectionIds([]);
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
        isPublic: isProjectPublic,
      });
      if (!addRes?.success) {
        setCreateError(addRes?.message || "Unable to create project.");
        return;
      }

      const latestProjects = await fetchProjects();
      const createdProject = findProjectByIdOrName(latestProjects, {
        name: trimmed,
      });
      await reloadProjectTree(createdProject || trimmed);
      setShowCreateProject(false);
      setProjectName("");
      setIsProjectPublic(false);
      setSelectedConnectionIds([]);
    } catch {
      setCreateError("Unable to create project.");
    }
  }, [
    fetchProjects,
    isProjectPublic,
    projectName,
    reloadProjectTree,
    selectedConnections,
  ]);

  const onChooseProject = useCallback(
    async (project: ProjectOption) => {
      try {
        setOpenError("");
        await reloadProjectTree(project);
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
      const res = await window.api.deleteProject({
        projectName: currentProject.name,
        id: currentProject.id,
      });
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
  }, [closeProject, currentProject]);

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

                <label className="flex items-start gap-2 text-xs text-gray-300 bg-[#252526] border border-gray-700 rounded px-2 py-2">
                  <input
                    type="checkbox"
                    checked={isProjectPublic}
                    onChange={(e) => setIsProjectPublic(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Make project public (this cannot be reverted to private later).
                  </span>
                </label>

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
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm">{project.name}</div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border ${
                              project.public
                                ? "border-emerald-500/70 text-emerald-300"
                                : "border-gray-600 text-gray-300"
                            }`}
                          >
                            {project.public ? "Public" : "Private"}
                          </span>
                        </div>
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
                <div className="text-xs text-gray-400 px-1 flex items-center justify-between">
                  <span>Project: {currentProject.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] ${
                      currentProject.public
                        ? "border-emerald-500/70 text-emerald-300"
                        : "border-gray-600 text-gray-300"
                    }`}
                  >
                    {currentProject.public ? "Public" : "Private"}
                  </span>
                </div>
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
