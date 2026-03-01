import type { BackendProjectNode } from "../types/electron.types";
import type { FileNode } from "../types/editor.types";

export const PROJECT_ROOT_ID = "__project_root__";

export function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function joinRelativePath(base: string, segment: string): string {
  const cleanBase = normalizeRelativePath(base);
  const cleanSegment = normalizeRelativePath(segment);
  if (!cleanBase) return cleanSegment;
  if (!cleanSegment) return cleanBase;
  return `${cleanBase}/${cleanSegment}`;
}

export function backendNodesToFileNodes(nodes: BackendProjectNode[]): FileNode[] {
  return nodes.map((node) => {
    const relativePath = normalizeRelativePath(node.path || node.name);
    if (node.type === "folder") {
      return {
        id: relativePath,
        name: node.name,
        type: "folder",
        path: relativePath,
        children: backendNodesToFileNodes(node.children || []),
      };
    }
    return {
      id: relativePath,
      name: node.name,
      type: "file",
      path: relativePath,
      content: "",
    };
  });
}

export function buildProjectTree(
  projectName: string,
  children: FileNode[] = [],
): FileNode[] {
  return [
    {
      id: PROJECT_ROOT_ID,
      name: projectName,
      type: "folder",
      path: "",
      children,
    },
  ];
}
