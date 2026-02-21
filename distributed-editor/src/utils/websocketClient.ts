import type {
  User,
  NetworkMessage,
  NetworkConnection,
  HeartbeatConfig,
} from "../types/user.types";

/**
 * Event payloads
 */
type PongTimeoutPayload = { targetIp: string; connectionId: string };

type EventPayloadMap = {
  HELLO: NetworkMessage;
  PEER_UPDATE: NetworkMessage;

  CONNECTION_REQUEST: NetworkMessage;
  CONNECTION_RESPONSE: NetworkMessage;
  PING: NetworkMessage;
  PONG: NetworkMessage;
  SYNC_NETWORK_DATA: NetworkMessage;

  // fallback
  MESSAGE: NetworkMessage;

  // special payload (NOT a NetworkMessage)
  PONG_TIMEOUT: PongTimeoutPayload;
};

type WsEvent = keyof EventPayloadMap;

export type NetworkEventListener<E extends WsEvent> = (
  payload: EventPayloadMap[E],
) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private user: User;

  /**
   * Internally store as unknown functions to avoid TS intersection issues.
   * Type-safety is enforced at the on/off/emit boundary.
   */
  private listeners: Map<WsEvent, Set<(payload: unknown) => void>> = new Map();

  private heartbeatConfig: HeartbeatConfig;

  private heartbeatIntervals: Map<string, ReturnType<typeof setInterval>> =
    new Map();

  private pendingPongs: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private connections: NetworkConnection[] = [];

  constructor(
    wsUrl: string,
    user: User,
    heartbeatConfig?: Partial<HeartbeatConfig>,
  ) {
    this.url = wsUrl;
    this.user = user;
    this.heartbeatConfig = {
      intervalMs: 5000,
      timeoutMs: 3000,
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

          // ✅ register myself on server
          this.send({
            type: "HELLO",
            from: this.user,
            timestamp: Date.now(),
          } as NetworkMessage);

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
    this.heartbeatIntervals.forEach((interval) => clearInterval(interval));
    this.heartbeatIntervals.clear();

    this.pendingPongs.forEach((t) => clearTimeout(t));
    this.pendingPongs.clear();
  }

  send(message: NetworkMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[WebSocket] Not connected, cannot send message");
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

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

  /**
   * Ping a peer and schedule a PONG timeout.
   * Key timeouts by targetIp to clear easily when PONG arrives.
   */
  ping(connectionId: string, targetIp: string): void {
    const message: NetworkMessage = {
      type: "PING",
      from: this.user,
      targetIp,
      timestamp: Date.now(),
    };
    this.send(message);

    // clear old timeout for same peer
    const old = this.pendingPongs.get(targetIp);
    if (old) clearTimeout(old);

    const timeoutId = setTimeout(() => {
      this.emit("PONG_TIMEOUT", { targetIp, connectionId });
    }, this.heartbeatConfig.timeoutMs);

    this.pendingPongs.set(targetIp, timeoutId);
  }

  pong(targetIp: string): void {
    const message: NetworkMessage = {
      type: "PONG",
      from: this.user,
      targetIp,
      timestamp: Date.now(),
    };
    this.send(message);
  }

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

  startHeartbeat(connectionId: string, connectionIp: string): void {
    const existing = this.heartbeatIntervals.get(connectionId);
    if (existing) clearInterval(existing);

    const interval = setInterval(() => {
      this.ping(connectionId, connectionIp);
    }, this.heartbeatConfig.intervalMs);

    this.heartbeatIntervals.set(connectionId, interval);
  }

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
        this.pong(message.from.ipAddress);
        this.emit("PING", message);
        break;

      case "PONG": {
        this.emit("PONG", message);

        const t = this.pendingPongs.get(message.from.ipAddress);
        if (t) {
          clearTimeout(t);
          this.pendingPongs.delete(message.from.ipAddress);
        }
        break;
      }

      case "SYNC_NETWORK_DATA":
        this.emit("SYNC_NETWORK_DATA", message);
        break;

      case "PEER_UPDATE":
        this.emit("PEER_UPDATE", message);
        break;

      case "HELLO":
        this.emit("HELLO", message);
        break;

      default:
        this.emit("MESSAGE", message);
        break;
    }
  }

  on<E extends WsEvent>(eventType: E, listener: NetworkEventListener<E>): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener as (p: unknown) => void);
  }

  off<E extends WsEvent>(eventType: E, listener: NetworkEventListener<E>): void {
    this.listeners.get(eventType)?.delete(listener as (p: unknown) => void);
  }

  private emit<E extends WsEvent>(eventType: E, payload: EventPayloadMap[E]): void {
    const set = this.listeners.get(eventType);
    if (!set) return;
    set.forEach((fn) => (fn as (p: EventPayloadMap[E]) => void)(payload));
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