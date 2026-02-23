export interface UserData {
  name: string;
  ip: string;
  email: string;
}

export interface ElectronAPI {
  sendUserData: (data: UserData) => Promise<void>;
  isUserRegistered: () => Promise<boolean>;
  clearUserData: () => Promise<{ success: boolean }>;
  resetRegistration: () => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
