# Complete API Documentation & Usage Examples

## Table of Contents

1. [Electron Store API](#electron-store-api)
2. [WebSocket Client API](#websocket-client-api)
3. [Zustand Stores API](#zustand-stores-api)
4. [Component References](#component-references)
5. [Complete Usage Examples](#complete-usage-examples)

---

## Electron Store API

Located in: `src/utils/electronStore.ts`

Provides safe access to persistent Electron store data.

### Methods

#### `getUser(): Promise<User | null>`

Retrieve current user profile from store.

```typescript
import { electronStoreAPI } from "../utils/electronStore";

const user = await electronStoreAPI.getUser();
if (user) {
  console.log(`User: ${user.name} (${user.ipAddress})`);
}
```

**Returns:** `User` object or `null` if not set

```typescript
{
  name: string;
  ipAddress: string;
  email: string;
  id?: string;
}
```

---

#### `setUser(user: User): Promise<void>`

Save user profile to persistent store.

```typescript
const newUser: User = {
  name: "Alice",
  ipAddress: "192.168.1.100",
  email: "alice@example.com",
  id: "user_123456",
};

await electronStoreAPI.setUser(newUser);
```

---

#### `getConnections(): Promise<NetworkConnection[]>`

Get all stored connections.

```typescript
const connections = await electronStoreAPI.getConnections();
connections.forEach((conn) => {
  console.log(
    `${conn.name}: ${conn.ipAddress} - ${conn.isActive ? "Active" : "Inactive"}`,
  );
});
```

**Returns:** Array of connections:

```typescript
[
  {
    id: string;
    name: string;
    ipAddress: string;
    email: string;
    isActive: boolean;
    lastPingTime: number;
    createdAt: number;
  }
]
```

---

#### `addConnection(connection: NetworkConnection): Promise<void>`

Add a new connection (prevents duplicates by IP+Email).

```typescript
const newConnection: NetworkConnection = {
  id: "conn_1708402850000_xyz789",
  name: "Bob",
  ipAddress: "192.168.1.101",
  email: "bob@example.com",
  isActive: true,
  lastPingTime: Date.now(),
  createdAt: Date.now(),
};

await electronStoreAPI.addConnection(newConnection);
```

---

#### `updateConnection(connection: NetworkConnection): Promise<void>`

Update existing connection status/info.

```typescript
const updated = { ...existingConnection, isActive: false };
await electronStoreAPI.updateConnection(updated);
```

---

#### `removeConnection(connectionId: string): Promise<void>`

Delete a connection by ID.

```typescript
await electronStoreAPI.removeConnection("conn_xyz");
```

---

#### `clearAllData(): Promise<void>`

Clear all stored data (user + connections).

```typescript
await electronStoreAPI.clearAllData();
```

---

## WebSocket Client API

Located in: `src/utils/websocketClient.ts`

Low-level WebSocket management for peer communication.

### Constructor

```typescript
const client = new WebSocketClient("ws://localhost:8080", currentUser, {
  intervalMs: 5000,
  timeoutMs: 3000,
  maxRetries: 3,
});
```

---

### Connection Methods

#### `connect(): Promise<void>`

Establish WebSocket connection.

```typescript
try {
  await wsClient.connect();
  console.log("Connected to server");
} catch (error) {
  console.error("Connection failed:", error);
}
```

---

#### `disconnect(): void`

Close WebSocket connection.

```typescript
wsClient.disconnect();
```

---

#### `isConnected(): boolean`

Check if currently connected.

```typescript
if (wsClient.isConnected()) {
  console.log("Ready to communicate");
} else {
  console.log("Not connected");
}
```

---

### Network Operations

#### `requestConnection(targetIp: string, currentConnections: NetworkConnection[]): void`

Send connection request to another peer.

```typescript
const connections = await electronStoreAPI.getConnections();
wsClient.requestConnection("192.168.1.101", connections);
```

---

#### `respondConnection(targetUser: User, currentConnections: NetworkConnection[]): void`

Accept incoming connection request.

```typescript
wsClient.respondConnection(incomingUser, currentConnections);
```

---

### Heartbeat / Ping Methods

#### `ping(connectionId: string, targetIp: string): void`

Send PING to a specific connection.

```typescript
wsClient.ping("conn_123", "192.168.1.101");
```

**Note**: Automatically tracked for timeout. If no PONG within 3s, emits 'PONG_TIMEOUT'.

---

#### `pong(targetIp: string): void`

Send PONG response to a PING.

```typescript
// Usually handled automatically by websocketClient.ts
wsClient.pong("192.168.1.101");
```

---

#### `startHeartbeat(connectionId: string, connectionIp: string): void`

Start periodic pinging a connection.

```typescript
wsClient.startHeartbeat("conn_123", "192.168.1.101");
// Now sends PING every 5 seconds
```

---

#### `stopHeartbeat(connectionId: string): void`

Stop pinging a connection.

```typescript
wsClient.stopHeartbeat("conn_123");
```

---

### Data Sync

#### `syncNetworkData(connections: NetworkConnection[], targetIp?: string): void`

Broadcast connection list to all/specific peers.

```typescript
const activeConnections = connections.filter((c) => c.isActive);
wsClient.syncNetworkData(activeConnections);
```

---

### Event Listeners

#### `on(eventType: string, listener: NetworkEventListener): void`

Listen for network events.

```typescript
wsClient.on("CONNECTION_REQUEST", (msg) => {
  console.log(`Connection request from ${msg.from.name}`);
});

wsClient.on("PONG_TIMEOUT", (data) => {
  console.log(`Peer ${data.targetIp} is inactive`);
});

wsClient.on("SYNC_NETWORK_DATA", (msg) => {
  console.log("Received network data:", msg.connections);
});
```

**Available Events:**

- `CONNECTION_REQUEST`
- `CONNECTION_RESPONSE`
- `PING`
- `PONG`
- `PONG_TIMEOUT`
- `SYNC_NETWORK_DATA`
- `MESSAGE`

---

#### `off(eventType: string, listener: NetworkEventListener): void`

Remove event listener.

```typescript
const handler = (msg) => {
  /* ... */
};
wsClient.on("PING", handler);

// Later...
wsClient.off("PING", handler);
```

---

## Zustand Stores API

### AuthStore

Located in: `src/store/authStore.ts`

Manages user authentication and profile.

```typescript
import { useAuthStore } from "../store/authStore";
```

#### State Properties

```typescript
user: User | null; // Auth user object
currentUser: User | null; // Network user object
isRegistered: boolean; // Registration status
permissions: Permissions; // User permissions
isLoading: boolean; // Loading state
```

#### Methods

##### `register(payload: { name: string; ip: string; email: string }): Promise<void>`

Register new user.

```typescript
const { register } = useAuthStore();

await register({
  name: "Alice",
  ip: "192.168.1.100",
  email: "alice@example.com",
});
```

---

##### `logout(): Promise<void>`

Clear user data.

```typescript
const { logout } = useAuthStore();
await logout();
```

---

##### `loadUserFromElectronStore(): Promise<void>`

Load user from persistent storage (called on app start).

```typescript
const { loadUserFromElectronStore } = useAuthStore();
await loadUserFromElectronStore();
```

---

##### `setRole(role: Role): void`

Update user role (owner, admin, member, viewer).

```typescript
const { setRole } = useAuthStore();
setRole("admin");
```

---

### NetworkStore

Located in: `src/store/networkStore.ts`

Manages network connections and peer communication.

```typescript
import { useNetworkStore } from "../store/networkStore";
```

#### State Properties

```typescript
connections: NetworkConnection[]           // Connected peers
wsClient: WebSocketClient | null          // WebSocket instance
isConnecting: boolean                      // Connecting state
pingTargetIp: string                      // Current ping target IP
overlayOpen: boolean                       // UI overlay state
peers: NetworkPeer[]                       // Grid view peers (legacy)
```

#### Methods

##### `initWebSocket(wsUrl: string): Promise<void>`

Initialize and connect to WebSocket server.

```typescript
const { initWebSocket } = useNetworkStore();

await initWebSocket("ws://localhost:8080");
```

---

##### `disconnectWebSocket(): void`

Close WebSocket connection.

```typescript
const { disconnectWebSocket } = useNetworkStore();
disconnectWebSocket();
```

---

##### `requestConnectionToPeer(targetIp: string): void`

Send connection request to another peer.

```typescript
const { requestConnectionToPeer } = useNetworkStore();
requestConnectionToPeer("192.168.1.101");
```

---

##### `setPingTargetIp(ip: string): void`

Set target IP for ping input.

```typescript
const { setPingTargetIp } = useNetworkStore();
setPingTargetIp("192.168.1.101");
```

---

##### `loadConnectionsFromStorage(): Promise<void>`

Load connections from persistent storage.

```typescript
const { loadConnectionsFromStorage } = useNetworkStore();
await loadConnectionsFromStorage();
```

---

##### `updateConnectionStatus(connectionId: string, isActive: boolean): void`

Update connection active/inactive status.

```typescript
const { updateConnectionStatus } = useNetworkStore();
updateConnectionStatus("conn_123", true); // Mark active
```

---

## Component References

### RegisterPage

**Path:** `src/pages/RegisterPage.tsx`

Shows registration form on first app load.

**Props:** None

**Features:**

- Form validation (name, email, IP format)
- Error messages
- Loading state
- Keyboard support (Enter to submit)

**Styling:** Dark theme (VS Code-like)

---

### NetworkPanel

**Path:** `src/components/network/NetworkPanel.tsx`

Displays network connections and ping controls.

**Props:**

```typescript
None - Uses Zustand stores directly
```

**Features:**

- Ping input with validation
- Connections list with status indicators
- Shows last ping time
- Active/Inactive count
- Current user info display

**Icons used:**

- Network (Lucide Icons)
- Send
- RefreshCw

---

## Complete Usage Examples

### Example 1: Initialize App & Connect to Network

```typescript
// App.tsx initialization
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { useNetworkStore } from './store/networkStore';

export default function App() {
  const { currentUser, loadUserFromElectronStore } = useAuthStore();
  const { initWebSocket } = useNetworkStore();

  useEffect(() => {
    const init = async () => {
      // Load user from storage
      await loadUserFromElectronStore();

      // Connect to WebSocket
      try {
        await initWebSocket("ws://localhost:8080");
        console.log('Network initialized');
      } catch (error) {
        console.error('Network init failed:', error);
      }
    };

    init();
  }, []);

  return <YourAppContent />;
}
```

---

### Example 2: Handle New Connection

```typescript
// In a component with access to stores
import { useAuthStore } from '../store/authStore';
import { useNetworkStore } from '../store/networkStore';

function MyNetworkComponent() {
  const { currentUser } = useAuthStore();
  const {
    connections,
    requestConnectionToPeer,
    wsClient
  } = useNetworkStore();

  const handlePing = (targetIp: string) => {
    if (!wsClient?.isConnected()) {
      alert('WebSocket not connected');
      return;
    }

    requestConnectionToPeer(targetIp);
  };

  return (
    <div>
      <h3>Your Connections ({connections.length})</h3>
      {connections.map(conn => (
        <div key={conn.id}>
          <span>{conn.name} ({conn.email})</span>
          <span className={conn.isActive ? 'active' : 'inactive'}>
            {conn.isActive ? '●' : '○'}
          </span>
        </div>
      ))}

      <input
        type="text"
        id="targetIp"
        placeholder="192.168.1.x"
      />
      <button onClick={() => {
        const ip = document.getElementById('targetIp').value;
        handlePing(ip);
      }}>
        Ping
      </button>
    </div>
  );
}
```

---

### Example 3: Listen to Network Events

```typescript
// In a component
import { useEffect } from "react";
import { useNetworkStore } from "../store/networkStore";

function NetworkMonitor() {
  const { wsClient } = useNetworkStore();

  useEffect(() => {
    if (!wsClient) return;

    // Listen for incoming connection requests
    wsClient.on("CONNECTION_REQUEST", (msg) => {
      console.log(`New connection request from ${msg.from.name}`);
      // Handle accepting the request
    });

    // Listen for peer going offline
    wsClient.on("PONG_TIMEOUT", (data) => {
      console.log(`Peer ${data.targetIp} is offline`);
      // Update UI to show inactive status
    });

    // Listen for network sync
    wsClient.on("SYNC_NETWORK_DATA", (msg) => {
      console.log(`Received network update:`, msg.connections);
      // Merge new connections into local store
    });

    return () => {
      // Cleanup listeners
      wsClient.off("CONNECTION_REQUEST", null);
      wsClient.off("PONG_TIMEOUT", null);
      wsClient.off("SYNC_NETWORK_DATA", null);
    };
  }, [wsClient]);

  return null; // Monitoring only
}
```

---

### Example 4: Manual Data Access

```typescript
// Direct access to Electron store
import { electronStoreAPI } from "../utils/electronStore";

async function debugNetwork() {
  // Get current user
  const user = await electronStoreAPI.getUser();
  console.log("Current user:", user);

  // Get all connections
  const connections = await electronStoreAPI.getConnections();
  console.log("Connections:", connections);

  // Add new connection manually
  await electronStoreAPI.addConnection({
    id: "test_" + Date.now(),
    name: "Test Peer",
    ipAddress: "192.168.1.200",
    email: "test@test.com",
    isActive: false,
    lastPingTime: Date.now(),
    createdAt: Date.now(),
  });

  // Update status
  const updated = {
    ...connections[0],
    isActive: true,
    lastPingTime: Date.now(),
  };
  await electronStoreAPI.updateConnection(updated);
}
```

---

### Example 5: Custom WebSocket Client Usage

```typescript
// Advanced usage - direct WebSocket client
import { WebSocketClient } from "../utils/websocketClient";
import { electronStoreAPI } from "../utils/electronStore";

async function advancedNetworking() {
  const user = await electronStoreAPI.getUser();
  if (!user) return;

  // Create client with custom heartbeat config
  const client = new WebSocketClient("ws://localhost:8080", user, {
    intervalMs: 10000, // Ping every 10sec
    timeoutMs: 5000, // Wait 5sec for PONG
    maxRetries: 5,
  });

  // Connect
  await client.connect();

  // Custom message handling
  client.on("PING", (msg) => {
    console.log(`Got pinged by ${msg.from.name}`);
    // Auto-responds, but can do extra work here
  });

  // Manually start heartbeat
  client.startHeartbeat("custom_conn_id", "192.168.1.100");

  // Later: stop heartbeat
  client.stopHeartbeat("custom_conn_id");

  // Disconnect
  client.disconnect();
}
```

---

### Example 6: UI Integration - Network Status Display

```typescript
// Component showing network status
import React from 'react';
import { useNetworkStore } from '../store/networkStore';
import { Loader, Wifi, WifiOff } from 'lucide-react';

export function NetworkStatus() {
  const { wsClient, connections } = useNetworkStore();

  const activeCount = connections.filter(c => c.isActive).length;
  const totalCount = connections.length;

  if (!wsClient?.isConnected()) {
    return (
      <div className="status error">
        <WifiOff size={16} />
        <span>Offline</span>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="status idle">
        <Wifi size={16} />
        <span>Connected (no peers)</span>
      </div>
    );
  }

  return (
    <div className="status online">
      <Wifi size={16} />
      <span>{activeCount}/{totalCount} peers active</span>
    </div>
  );
}
```

---

## Message Protocol Reference

### CONNECTION_REQUEST

```json
{
  "type": "CONNECTION_REQUEST",
  "from": {
    "name": "Alice",
    "ipAddress": "192.168.1.100",
    "email": "alice@example.com",
    "id": "user_123"
  },
  "connections": [
    {
      "id": "conn_xyz",
      "name": "Bob",
      "ipAddress": "192.168.1.101",
      "email": "bob@example.com",
      "isActive": true,
      "lastPingTime": 1708402900000,
      "createdAt": 1708402850000
    }
  ],
  "targetIp": "192.168.1.101",
  "timestamp": 1708402900000
}
```

---

### PING/PONG

```json
{
  "type": "PING",
  "from": {
    "name": "Alice",
    "ipAddress": "192.168.1.100",
    "email": "alice@example.com",
    "id": "user_123"
  },
  "targetIp": "192.168.1.101",
  "timestamp": 1708402900000
}
```

---

This documentation covers all public APIs and common usage patterns. For more details, refer to inline code comments in respective files.
