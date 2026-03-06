export type BranchVisibility = "public" | "private";

export interface BranchMetadata {
  owner: string;
  visibility: BranchVisibility;
}

export interface ProjectOwner {
  id?: string;
  name?: string;
  email?: string;
  ip?: string;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  public: boolean;
  owner: ProjectOwner;
  branches: Record<string, BranchMetadata>;
}

export interface GitCommitHistoryItem {
  oid: string;
  message: string;
  author: string;
  email: string;
  date: string | Date;
  parent: string[];
}
