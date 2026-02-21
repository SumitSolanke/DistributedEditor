import { create } from "zustand";
import type { NetworkPeer, PeerIdentity } from "../types/network.types";
import type { NetworkConnection, NetworkMessage } from "../types/user.types";
import { useAuthStore } from "./authStore";
import { WebSocketClient } from "../utils/websocketClient";
import { electronStoreAPI } from "../utils/electronStore";

const now = () => Date.now();
const genId = () => Math.random().toString(36).slice(2, 10);

interface NetworkState {
  overlayOpen: boolean;
  toggleOverlay: () => void;
  openOverlay: () => void;
  closeOverlay: () => void;

  peers: NetworkPeer[];
  seenMessageIds: Record<string, true>;
  connections: NetworkConnection[];
  wsClient: WebSocketClient | null;
  isConnecting: boolean;
  pingTargetIp: string; // For network panel input

  initSelf: () => void;
  pingByIp: (targetIp: string) => void;
  mergePeers: (
    incoming: PeerIdentity[],
    status?: NetworkPeer["status"],
  ) => void;

  // New network functions
  initWebSocket: (wsUrl: string) => Promise<void>;
  disconnectWebSocket: () => void;
  requestConnectionToPeer: (targetIp: string) => void;
  handleConnectionRequest: (message: NetworkMessage) => Promise<void>;
  handleConnectionResponse: (message: NetworkMessage) => Promise<void>;
  handlePing: (message: NetworkMessage) => void;
  handlePongTimeout: (data: { targetIp: string; connectionId: string }) => void;
  handleSyncNetworkData: (message: NetworkMessage) => Promise<void>;
  syncActiveConnections: () => void;
  updateConnectionStatus: (connectionId: string, isActive: boolean) => void;
  setPingTargetIp: (ip: string) => void;
  loadConnectionsFromStorage: () => Promise<void>;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  overlayOpen: false,
  toggleOverlay: () => set({ overlayOpen: !get().overlayOpen }),
  openOverlay: () => set({ overlayOpen: true }),
  closeOverlay: () => set({ overlayOpen: false }),

  peers: [],
  seenMessageIds: {},
  connections: [],
  wsClient: null,
  isConnecting: false,
  pingTargetIp: "",

  initSelf: () => {
    const u = useAuthStore.getState().user;
    if (!u) return;

    const me: PeerIdentity = {
      peerId: u.id,
      name: u.name,
      ip: u.ip,
      email: u.email,
    };

    get().mergePeers([me], "connected");
  },

  mergePeers: (incoming, status = "discovered") => {
    const current = get().peers;
    const map = new Map(current.map((p) => [p.peerId, p]));

    for (const peer of incoming) {
      const existing = map.get(peer.peerId);

      if (!existing) {
        map.set(peer.peerId, {
          ...peer,
          status,
          lastSeen: now(),
        });
      } else {
        map.set(peer.peerId, {
          ...existing,
          ...peer,
          status: existing.status === "connected" ? "connected" : status,
          lastSeen: now(),
        });
      }
    }

    set({ peers: Array.from(map.values()) });
  },

  pingByIp: (targetIp) => {
    const u = useAuthStore.getState().user;
    if (!u) return;

    const me: PeerIdentity = {
      peerId: u.id,
      name: u.name,
      ip: u.ip,
      email: u.email,
    };

    const msgId = genId();
    if (get().seenMessageIds[msgId]) return;
    set({ seenMessageIds: { ...get().seenMessageIds, [msgId]: true } });

    const mockDirectory: Record<
      string,
      { target: PeerIdentity; knownPeers: PeerIdentity[] }
    > = {
      "10.0.0.55": {
        target: {
          peerId: "dam",
          name: "Dam",
          ip: "10.0.0.55",
          email: "dam@mail.com",
        },
        knownPeers: [
          { peerId: "a1", name: "A1", ip: "10.0.0.11", email: "a1@mail.com" },
          { peerId: "a2", name: "A2", ip: "10.0.0.12", email: "a2@mail.com" },
        ],
      },
      "10.0.0.22": {
        target: {
          peerId: "sham",
          name: "Sham",
          ip: "10.0.0.22",
          email: "sham@mail.com",
        },
        knownPeers: [],
      },
      "10.0.0.33": {
        target: {
          peerId: "ram",
          name: "Ram",
          ip: "10.0.0.33",
          email: "ram@mail.com",
        },
        knownPeers: [],
      },
    };

    const entry = mockDirectory[targetIp];
    if (!entry) {
      alert("No peer found in mock directory. Try 10.0.0.55");
      return;
    }

    const target = entry.target;
    const targetKnown = entry.knownPeers;

    // merge: target + target-known + me
    get().mergePeers([me], "connected");
    get().mergePeers([target, ...targetKnown], "connected");
  },

  // WebSocket initialization
  initWebSocket: async (wsUrl: string) => {
    set({ isConnecting: true });
    try {
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) {
        throw new Error("User not registered");
      }

      const client = new WebSocketClient(wsUrl, currentUser);
      await client.connect();

      // Set up event listeners
      client.on("CONNECTION_REQUEST", (msg) =>
        get().handleConnectionRequest(msg),
      );
      client.on("CONNECTION_RESPONSE", (msg) =>
        get().handleConnectionResponse(msg),
      );
      client.on("PING", (msg) => get().handlePing(msg));
      client.on("PONG_TIMEOUT", (msg: any) => get().handlePongTimeout(msg));
      client.on("SYNC_NETWORK_DATA", (msg) => get().handleSyncNetworkData(msg));

      set({ wsClient: client, isConnecting: false });
      console.log("[Network] WebSocket connected");

      // Load existing connections and start heartbeats
      await get().loadConnectionsFromStorage();
      get().syncActiveConnections();
    } catch (error) {
      console.error("[Network] WebSocket init failed:", error);
      set({ isConnecting: false });
    }
  },

  disconnectWebSocket: () => {
    const client = get().wsClient;
    if (client) {
      client.disconnect();
      set({ wsClient: null });
    }
  },

  // Request connection from another peer
  requestConnectionToPeer: (targetIp: string) => {
    const client = get().wsClient;
    if (!client || !client.isConnected()) {
      alert("WebSocket not connected");
      return;
    }

    const connections = get().connections;
    client.requestConnection(targetIp, connections);
  },

  // Handle incoming connection request
  handleConnectionRequest: async (message: NetworkMessage) => {
    const client = get().wsClient;
    if (!client) return;

    // Add the requester as a connection
    const newConnection: NetworkConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: message.from.name,
      ipAddress: message.from.ipAddress,
      email: message.from.email,
      isActive: true,
      lastPingTime: Date.now(),
      createdAt: Date.now(),
    };

    // Check if connection already exists (avoid duplicates)
    const existing = get().connections.find(
      (c) =>
        c.ipAddress === newConnection.ipAddress &&
        c.email === newConnection.email,
    );

    if (!existing) {
      await electronStoreAPI.addConnection(newConnection);
      set({ connections: [...get().connections, newConnection] });
    }

    // Respond with our connection list
    const connections = get().connections;
    client.respondConnection(message.from, connections);

    // Merge received connections
    if (message.connections) {
      for (const conn of message.connections) {
        const exists = get().connections.some(
          (c) => c.ipAddress === conn.ipAddress && c.email === conn.email,
        );
        if (!exists) {
          await electronStoreAPI.addConnection(conn);
        }
      }
      set({ connections: await electronStoreAPI.getConnections() });
    }

    // Start heartbeat for this connection
    client.startHeartbeat(newConnection.id, newConnection.ipAddress);
  },

  // Handle connection response
  handleConnectionResponse: async (message: NetworkMessage) => {
    const client = get().wsClient;
    if (!client) return;

    // Add responder as a connection
    const newConnection: NetworkConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: message.from.name,
      ipAddress: message.from.ipAddress,
      email: message.from.email,
      isActive: true,
      lastPingTime: Date.now(),
      createdAt: Date.now(),
    };

    const existing = get().connections.find(
      (c) =>
        c.ipAddress === newConnection.ipAddress &&
        c.email === newConnection.email,
    );

    if (!existing) {
      await electronStoreAPI.addConnection(newConnection);
      set({ connections: [...get().connections, newConnection] });
    }

    // Merge received connections
    if (message.connections) {
      for (const conn of message.connections) {
        const exists = get().connections.some(
          (c) => c.ipAddress === conn.ipAddress && c.email === conn.email,
        );
        if (!exists) {
          await electronStoreAPI.addConnection(conn);
        }
      }
      set({ connections: await electronStoreAPI.getConnections() });
    }

    // Start heartbeat for this connection
    client.startHeartbeat(newConnection.id, newConnection.ipAddress);
  },

  // Handle ping messages
  handlePing: (message: NetworkMessage) => {
    const conn = get().connections.find(
      (c) => c.ipAddress === message.from.ipAddress,
    );
    if (conn) {
      get().updateConnectionStatus(conn.id, true);
    }
  },

  // Handle PONG timeout
  handlePongTimeout: (data: { targetIp: string; connectionId: string }) => {
    get().updateConnectionStatus(data.connectionId, false);
  },

  // Handle network data sync
  handleSyncNetworkData: async (message: NetworkMessage) => {
    if (!message.connections) return;

    // Merge received connections avoiding duplicates
    for (const conn of message.connections) {
      const exists = get().connections.some(
        (c) => c.ipAddress === conn.ipAddress && c.email === conn.email,
      );
      if (!exists) {
        await electronStoreAPI.addConnection(conn);
      }
    }

    set({ connections: await electronStoreAPI.getConnections() });

    // Forward to all active connections
    get().syncActiveConnections();
  },

  // Sync active connections to all peers
  syncActiveConnections: () => {
    const client = get().wsClient;
    if (!client || !client.isConnected()) return;

    const activeConnections = get().connections.filter((c) => c.isActive);
    client.syncNetworkData(activeConnections);
  },

  // Update connection status
  updateConnectionStatus: async (connectionId: string, isActive: boolean) => {
    const connection = get().connections.find((c) => c.id === connectionId);
    if (!connection) return;

    const updated: NetworkConnection = {
      ...connection,
      isActive,
      lastPingTime: Date.now(),
    };

    await electronStoreAPI.updateConnection(updated);
    set({ connections: await electronStoreAPI.getConnections() });
  },

  setPingTargetIp: (ip: string) => {
    set({ pingTargetIp: ip });
  },

  // Load connections from Electron storage
  loadConnectionsFromStorage: async () => {
    try {
      const connections = await electronStoreAPI.getConnections();
      set({ connections });
    } catch (error) {
      console.error("[Network] Failed to load connections:", error);
    }
  },
}));
