import type { User, NetworkConnection } from "../types/user.types";

// Utility module for Electron store access
// This abstracts the IPC communication with the main process

export const electronStoreAPI = {
  // User data
  async getUser(): Promise<User | null> {
    return window.electron?.store?.get("user") ?? null;
  },

  async setUser(user: User): Promise<void> {
    if (window.electron?.store?.set) {
      window.electron.store.set("user", user);
    }
  },

  // Network connections
  async getConnections(): Promise<NetworkConnection[]> {
    return window.electron?.store?.get("connections") ?? [];
  },

  async setConnections(connections: NetworkConnection[]): Promise<void> {
    if (window.electron?.store?.set) {
      window.electron.store.set("connections", connections);
    }
  },

  async addConnection(connection: NetworkConnection): Promise<void> {
    const connections = await this.getConnections();
    // Prevent duplicates by IP and email
    const exists = connections.some(
      (c) =>
        c.ipAddress === connection.ipAddress && c.email === connection.email,
    );
    if (!exists) {
      connections.push(connection);
      await this.setConnections(connections);
    }
  },

  async updateConnection(connection: NetworkConnection): Promise<void> {
    const connections = await this.getConnections();
    const index = connections.findIndex((c) => c.id === connection.id);
    if (index !== -1) {
      connections[index] = connection;
      await this.setConnections(connections);
    }
  },

  async removeConnection(connectionId: string): Promise<void> {
    const connections = await this.getConnections();
    const filtered = connections.filter((c) => c.id !== connectionId);
    await this.setConnections(filtered);
  },

  async clearAllData(): Promise<void> {
    if (window.electron?.store?.clear) {
      window.electron.store.clear();
    }
  },
};

// Type declaration for window.electron
declare global {
  interface Window {
    electron?: {
      store?: {
        get: (key: string) => unknown;
        set: (key: string, value: unknown) => void;
        clear: () => void;
      };
    };
  }
}
