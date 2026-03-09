import type {
  BranchVisibility,
  GitCommitHistoryItem,
  ProjectMetadata,
} from "./project.types";

export interface UserData {
  name: string;
  ip: string;
  email: string;
}

export interface RegisteredUserData extends UserData {
  id?: string;
}

export interface ConnectionItem {
  id?: string;
  name?: string;
  username?: string;
  ip?: string;
  email?: string;
}

export interface ProjectListItem {
  id?: string;
  name: string;
  path?: string;
}

export interface BackendProjectNode {
  name: string;
  path?: string;
  type: "file" | "folder";
  children?: BackendProjectNode[];
}

export interface CommunicationMessage {
  messageId: string;
  author: string;
  authorName?: string;
  messageText: string;
  timestamp: number;
  resolved: boolean;
}

export interface CommunicationThread {
  threadId: string;
  projectId: string;
  projectName: string;
  filePath: string;
  commitHash: string;
  branch?: string;
  branchOwner?: string;
  startLine: number;
  endLine: number;
  createdBy: string;
  createdByName?: string;
  createdTimestamp: number;
  resolved: boolean;
  updatedTimestamp: number;
  messages: CommunicationMessage[];
}

export interface CommunicationUpdateEvent {
  projectId: string;
  added: number;
  updated: number;
  timestamp: number;
}

export interface ElectronAPI {
  sendUserData: (data: UserData) => Promise<void>;
  isUserRegistered: () => Promise<boolean>;
  getRegisteredUser: () => Promise<{
    success: boolean;
    user?: RegisteredUserData | null;
    error?: string;
  }>;
  connectDevice?: (device: string) => Promise<{ success: boolean }>;
  getConnections?: () => Promise<{
    success: boolean;
    connections?: ConnectionItem[];
  }>;
  syncProject?: (data: { projectId: string }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  syncAllProjects?: () => Promise<{
    success: boolean;
    error?: string;
  }>;
  syncNetworkAndProjects?: () => Promise<{
    success: boolean;
    error?: string;
  }>;
  addProject?: (data: {
    projectName: string;
    connections: Array<{ username: string; ip: string; email: string }>;
    isPublic?: boolean;
  }) => Promise<{ success: boolean; message?: string }>;
  getProjects?: () => Promise<{
    success: boolean;
    data?: ProjectMetadata[] | string[] | ProjectListItem[];
    message?: string;
  }>;
  deleteProject?: (data: {
    projectName: string;
    id?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  setProjectPublic?: (data: { id: string }) => Promise<{ success: boolean; message?: string }>;
  loadProject?: (data: { path: string; projectName?: string }) => Promise<BackendProjectNode[]>;
  createFile?: (data: { relativePath: string }) => Promise<void>;
  editFile?: (data: { relativePath: string; content: string }) => Promise<void>;
  deleteFile?: (data: { relativePath: string }) => Promise<void>;
  readFile?: (data: { relativePath: string }) => Promise<string>;
  createFolder?: (data: { relativePath: string }) => Promise<void>;
  deleteFolder?: (data: { relativePath: string }) => Promise<void>;
  gitCurrentBranch?: (data: { projectName: string }) => Promise<{
    success: boolean;
    data?: string | null;
    message?: string;
  }>;
  gitHeadCommit?: (data: { projectName: string }) => Promise<{
    success: boolean;
    data?: string;
    message?: string;
  }>;
  gitCheckoutBranch?: (data: {
    projectName: string;
    branchName: string;
  }) => Promise<{ success: boolean; message?: string; files?: string[] }>;
  gitCheckoutCommit?: (data: {
    projectName: string;
    commitOid: string;
  }) => Promise<{ success: boolean; message?: string; files?: string[] }>;
  gitCommit?: (data: {
    projectId: string;
    projectName: string;
    message: string;
  }) => Promise<{ success: boolean; oid?: string; branch?: string; message?: string; code?: string }>;
  gitCreateBranch?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
    visibility: BranchVisibility;
  }) => Promise<{ success: boolean; branchName?: string; message?: string }>;
  gitCreateBranchFromCommit?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
    commitOid: string;
    visibility: BranchVisibility;
  }) => Promise<{ success: boolean; branchName?: string; message?: string }>;
  gitDeleteBranch?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
  }) => Promise<{ success: boolean; message?: string }>;
  gitSetBranchPublic?: (data: {
    projectId: string;
    branchName: string;
  }) => Promise<{ success: boolean; message?: string }>;
  gitMerge?: (data: {
    projectId: string;
    projectName: string;
    ours: string;
    theirs: string;
  }) => Promise<{ success: boolean; message?: string }>;
  gitRebase?: (data: {
    projectId: string;
    projectName: string;
    branch: string;
    onto: string;
  }) => Promise<{ success: boolean; message?: string }>;
  gitRevert?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
  }) => Promise<{ success: boolean; message?: string }>;
  gitRevertUntil?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
    targetCommit: string;
  }) => Promise<{ success: boolean; message?: string }>;
  gitReverUntil?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
    targetCommit: string;
  }) => Promise<{ success: boolean; message?: string }>;
  gitRevertCommit?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
    commitOid: string;
  }) => Promise<{ success: boolean; message?: string }>;
  getAllBranches?: (data: { projectName: string }) => Promise<{
    success: boolean;
    data?: string[];
    message?: string;
  }>;
  gitRepoMap?: (data: { projectName: string }) => Promise<{
    success: boolean;
    data?: Record<string, string>;
    message?: string;
  }>;
  gitReadCommit?: (data: { projectName: string; commitOid: string }) => Promise<{
    success: boolean;
    data?: unknown;
    message?: string;
  }>;
  gitReadFileFromCommit?: (data: {
    projectName: string;
    filepath: string;
    commitOid: string;
  }) => Promise<{
    success: boolean;
    data?: string;
    message?: string;
  }>;
  gitDiscardUncommiteChanges?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
  }) => Promise<{ success: boolean; message?: string }>;
  gitDiscardUncommittedChanges?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
  }) => Promise<{ success: boolean; message?: string }>;
  gitBranchHistory?: (data: {
    projectId: string;
    projectName: string;
    branchName: string;
  }) => Promise<{ success: boolean; data?: GitCommitHistoryItem[]; message?: string }>;
  gitDirty?: (data: { projectName: string }) => Promise<{
    success: boolean;
    dirty?: boolean;
    message?: string;
  }>;
  commCreateThread?: (data: {
    projectId: string;
    projectName?: string;
    filePath: string;
    commitHash: string;
    branch?: string;
    startLine: number;
    endLine: number;
    messageText: string;
  }) => Promise<{ success: boolean; data?: CommunicationThread; message?: string }>;
  commReplyThread?: (data: {
    projectId: string;
    threadId: string;
    messageText: string;
  }) => Promise<{ success: boolean; data?: CommunicationThread; message?: string }>;
  commResolveThread?: (data: {
    projectId: string;
    threadId: string;
  }) => Promise<{ success: boolean; data?: CommunicationThread; message?: string }>;
  commGetFileThreads?: (data: {
    projectId: string;
    commitHash: string;
    filePath: string;
  }) => Promise<{ success: boolean; data?: CommunicationThread[]; message?: string }>;
  commGetProjectThreads?: (data: {
    projectId: string;
  }) => Promise<{ success: boolean; data?: CommunicationThread[]; message?: string }>;
  commGetAllThreads?: () => Promise<{
    success: boolean;
    data?: CommunicationThread[];
    message?: string;
  }>;
  onCommunicationUpdated?: (
    handler: (payload: CommunicationUpdateEvent) => void,
  ) => () => void;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
