import type { ProjectMetadata } from "../types/project.types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeBranches(value: unknown): ProjectMetadata["branches"] {
  if (!isObject(value)) return {};

  const normalized: ProjectMetadata["branches"] = {};
  for (const [branchName, meta] of Object.entries(value)) {
    if (!isObject(meta)) continue;
    const owner = readString(meta.owner);
    const visibility = meta.visibility === "public" ? "public" : "private";
    normalized[branchName] = { owner, visibility };
  }
  return normalized;
}

function normalizeProject(raw: unknown): ProjectMetadata | null {
  if (typeof raw === "string") {
    return {
      id: raw,
      name: raw,
      public: false,
      owner: {},
      branches: {},
    };
  }

  if (!isObject(raw)) return null;
  const name = readString(raw.name);
  if (!name) return null;

  const id = readString(raw.id) || name;
  const isPublic = raw.public === true;
  const owner = isObject(raw.owner) ? raw.owner : {};

  return {
    id,
    name,
    public: isPublic,
    owner: {
      id: readString(owner.id),
      name: readString(owner.name),
      email: readString(owner.email),
      ip: readString(owner.ip),
    },
    branches: normalizeBranches(raw.branches),
  };
}

export function normalizeProjects(raw: unknown): ProjectMetadata[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeProject).filter(Boolean) as ProjectMetadata[];
}

export function findProjectByIdOrName(
  projects: ProjectMetadata[],
  args: { id?: string; name?: string },
): ProjectMetadata | null {
  const id = args.id?.trim();
  const name = args.name?.trim();

  if (id) {
    const byId = projects.find((project) => project.id === id);
    if (byId) return byId;
  }

  if (name) {
    const byName = projects.find((project) => project.name === name);
    if (byName) return byName;
  }

  return null;
}
