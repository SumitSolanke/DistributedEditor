export interface UserData {
  name: string;
  ip: string;
  email: string;
}

export interface ElectronAPI {
  sendUserData: (data: UserData) => Promise<void>;
  isUserRegistered: () => Promise<boolean>;
  connectDevice?: (device: string) => Promise<{ success: boolean }>;
  getConnections?: () => Promise<{ success: boolean; connections?: any[] }>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
