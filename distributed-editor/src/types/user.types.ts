// User identity information stored in Electron store
export interface User {
  name: string;
  ipAddress: string;
  email: string;
  id?: string; // Generated UUID for unique identification
}

// Network connection info - stored when receiving connection data from other users
export interface NetworkConnection {
  id: string; // Unique identifier for the connection
  name: string;
  ipAddress: string;
  email: string;
  isActive: boolean;
  lastPingTime: number; // Timestamp of last successful ping
  createdAt: number; // When connection was established
  metadata?: Record<string, unknown>; // Additional connection metadata
}

// Message types for WebSocket communication
export type NetworkMessageType =
  | "HELLO"
  | "PEER_UPDATE"
  | "CONNECTION_REQUEST"
  | "CONNECTION_RESPONSE"
  | "PING"
  | "PONG"
  | "SYNC_NETWORK_DATA"
  | "ERROR";

export interface NetworkMessage {
  type: NetworkMessageType;
  from: User;
  connections?: NetworkConnection[];
  targetIp?: string;
  timestamp: number;

  // ✅ server sends this for PEER_UPDATE
  peers?: Array<{
    id: string;
    name: string;
    ipAddress: string;
    email: string;
  }>;

  payload?: Record<string, unknown>;
}

// Heartbeat config
export interface HeartbeatConfig {
  intervalMs: number; // Interval between pings
  timeoutMs: number; // How long to wait for PONG before marking inactive
  maxRetries: number; // Number of retries before removal
}
