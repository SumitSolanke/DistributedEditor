import type {
  User,
  NetworkMessage,
  NetworkConnection,
  HeartbeatConfig,
} from "../types/user.types";

export type NetworkEventListener = (message: NetworkMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private user: User;
  private listeners: Map<string, Set<NetworkEventListener>> = new Map();
  private heartbeatConfig: HeartbeatConfig;
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private pendingPongs: Map<string, number> = new Map(); // Track PONG timeouts
  private connections: NetworkConnection[] = [];

  constructor(
    wsUrl: string,
    user: User,
    heartbeatConfig?: Partial<HeartbeatConfig>,
  ) {
    this.url = wsUrl;
    this.user = user;
    this.heartbeatConfig = {
      intervalMs: 5000, // Ping every 5 seconds
      timeoutMs: 3000, // Wait 3 seconds for PONG
      maxRetries: 3,
      ...heartbeatConfig,
    };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("[WebSocket] Connected");
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const message: NetworkMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error("[WebSocket] Failed to parse message:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error("[WebSocket] Error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("[WebSocket] Disconnected");
          this.cleanup();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private cleanup(): void {
    // Clear all heartbeat intervals
    this.heartbeatIntervals.forEach((interval) => clearInterval(interval));
    this.heartbeatIntervals.clear();
    this.pendingPongs.clear();
  }

  send(message: NetworkMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[WebSocket] Not connected, cannot send message");
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  // Request connection from another user
  requestConnection(
    targetIp: string,
    currentConnections: NetworkConnection[],
  ): void {
    const message: NetworkMessage = {
      type: "CONNECTION_REQUEST",
      from: this.user,
      connections: currentConnections,
      targetIp,
      timestamp: Date.now(),
    };
    this.send(message);
  }

  // Send connection response with current connections list
  respondConnection(
    targetUser: User,
    currentConnections: NetworkConnection[],
  ): void {
    const message: NetworkMessage = {
      type: "CONNECTION_RESPONSE",
      from: this.user,
      connections: currentConnections,
      targetIp: targetUser.ipAddress,
      timestamp: Date.now(),
    };
    this.send(message);
  }

  // Send ping to a specific connection
  ping(connectionId: string, targetIp: string): void {
    const message: NetworkMessage = {
      type: "PING",
      from: this.user,
      targetIp,
      timestamp: Date.now(),
    };
    this.send(message);

    // Set timeout to track PONG response
    const timeoutId = setTimeout(() => {
      this.emit("PONG_TIMEOUT", { targetIp, connectionId });
    }, this.heartbeatConfig.timeoutMs);

    this.pendingPongs.set(`${targetIp}:${Date.now()}`, timeoutId);
  }

  // Send PONG response
  pong(targetIp: string): void {
    const message: NetworkMessage = {
      type: "PONG",
      from: this.user,
      targetIp,
      timestamp: Date.now(),
    };
    this.send(message);
  }

  // Send network data sync
  syncNetworkData(connections: NetworkConnection[], targetIp?: string): void {
    const message: NetworkMessage = {
      type: "SYNC_NETWORK_DATA",
      from: this.user,
      connections,
      targetIp,
      timestamp: Date.now(),
    };
    this.send(message);
  }

  // Start heartbeat for a connection
  startHeartbeat(connectionId: string, connectionIp: string): void {
    // Clear existing interval if any
    if (this.heartbeatIntervals.has(connectionId)) {
      clearInterval(this.heartbeatIntervals.get(connectionId));
    }

    const interval = setInterval(() => {
      this.ping(connectionId, connectionIp);
    }, this.heartbeatConfig.intervalMs);

    this.heartbeatIntervals.set(connectionId, interval);
  }

  // Stop heartbeat for a connection
  stopHeartbeat(connectionId: string): void {
    const interval = this.heartbeatIntervals.get(connectionId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(connectionId);
    }
  }

  private handleMessage(message: NetworkMessage): void {
    switch (message.type) {
      case "CONNECTION_REQUEST":
        this.emit("CONNECTION_REQUEST", message);
        break;
      case "CONNECTION_RESPONSE":
        this.emit("CONNECTION_RESPONSE", message);
        break;
      case "PING":
        // Auto-respond to PING
        this.pong(message.from.ipAddress);
        this.emit("PING", message);
        break;
      case "PONG":
        this.emit("PONG", message);
        // Clear pending timeout
        const pending = Array.from(this.pendingPongs.entries()).find(([key]) =>
          key.startsWith(message.from.ipAddress),
        );
        if (pending) {
          clearTimeout(pending[1]);
          this.pendingPongs.delete(pending[0]);
        }
        break;
      case "SYNC_NETWORK_DATA":
        this.emit("SYNC_NETWORK_DATA", message);
        break;
      default:
        this.emit("MESSAGE", message);
    }
  }

  on(
    eventType: NetworkMessage["type"] | "MESSAGE" | "PONG_TIMEOUT",
    listener: NetworkEventListener,
  ): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
  }

  off(
    eventType: NetworkMessage["type"] | "MESSAGE" | "PONG_TIMEOUT",
    listener: NetworkEventListener,
  ): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  private emit(eventType: string, data: unknown): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => listener(data as NetworkMessage));
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  setUser(user: User): void {
    this.user = user;
  }

  setConnections(connections: NetworkConnection[]): void {
    this.connections = connections;
  }
}
