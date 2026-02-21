import type { User, NetworkConnection } from "../types/user.types";

/** Runtime validator for User coming from Electron store (unknown). */
function isUser(value: unknown): value is User {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;
  return (
    typeof v.name === "string" &&
    typeof v.ipAddress === "string" &&
    typeof v.email === "string"
  );
}

/** Runtime validator for NetworkConnection */
function isNetworkConnection(value: unknown): value is NetworkConnection {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.ipAddress === "string" &&
    typeof v.email === "string" &&
    typeof v.isActive === "boolean" &&
    typeof v.lastPingTime === "number" &&
    typeof v.createdAt === "number"
  );
}

function safeArray<T>(
  value: unknown,
  isItem: (x: unknown) => x is T,
): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isItem);
}

export const electronStoreAPI = {
  // ✅ User data
  async getUser(): Promise<User | null> {
    const raw = window.electron?.store?.get?.("user");
    if (isUser(raw)) return raw;
    return null;
  },

  async setUser(user: User): Promise<void> {
    window.electron?.store?.set?.("user", user);
  },

  // ✅ Network connections
  async getConnections(): Promise<NetworkConnection[]> {
    const raw = window.electron?.store?.get?.("connections");
    return safeArray(raw, isNetworkConnection);
  },

  async setConnections(connections: NetworkConnection[]): Promise<void> {
    window.electron?.store?.set?.("connections", connections);
  },

  async addConnection(connection: NetworkConnection): Promise<void> {
    const connections = await this.getConnections();

    const exists = connections.some(
      (c) => c.ipAddress === connection.ipAddress && c.email === connection.email,
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
    window.electron?.store?.clear?.();
  },
};

// Type declaration for window.electron
declare global {
  interface Window {
    electron?: {
      store?: {
        get?: (key: string) => unknown;
        set?: (key: string, value: unknown) => void;
        clear?: () => void;
      };
    };
  }
}