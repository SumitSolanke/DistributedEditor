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
  addProject?: (data: {
    projectName: string;
    connections: Array<{ username: string; ip: string; email: string }>;
  }) => Promise<{ success: boolean; message?: string }>;
  getProjects?: () => Promise<{
    success: boolean;
    data?: string[] | ProjectListItem[];
    message?: string;
  }>;
  deleteProject?: (data: {
    projectName: string;
  }) => Promise<{ success: boolean; message?: string }>;
  loadProject?: (data: { path: string; projectName?: string }) => Promise<BackendProjectNode[]>;
  createFile?: (data: { relativePath: string }) => Promise<void>;
  editFile?: (data: { relativePath: string; content: string }) => Promise<void>;
  deleteFile?: (data: { relativePath: string }) => Promise<void>;
  readFile?: (data: { relativePath: string }) => Promise<string>;
  createFolder?: (data: { relativePath: string }) => Promise<void>;
  deleteFolder?: (data: { relativePath: string }) => Promise<void>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
