# Distributed Editor - Network Setup & Implementation Guide

## Overview

This implementation provides a complete distributed network system for the Distributed Editor. It includes:

- **User Registration**: Store user identity (name, IP, email) in Electron store
- **WebSocket Networking**: Peer-to-peer communication via WebSocket server
- **Connection Management**: Dynamic peer discovery and connection tracking
- **Heartbeat/Ping System**: Monitor active/inactive status of connected peers
- **Network Synchronization**: Share connection list across all active peers
- **Duplicate Prevention**: Prevents duplicate entries based on IP + email combination

---

## Architecture

### Frontend (Electron + React + TypeScript)

- **Store**: User profile and connections stored in Electron store (persistent)
- **WebSocket Client**: Handles all network communication
- **Zustand Stores**: `authStore` (user data) and `networkStore` (connections)
- **UI Components**:
  - `RegisterPage`: Initial registration form
  - `NetworkPanel`: View and manage network connections
  - Enhanced `RightSidebar`: Added Network tab

### Backend (Node.js + WebSocket)

- **WebSocket Server**: Routes messages between peers
- **Peer Management**: Tracks connected peers
- **Message Routing**: Handles CONNECTION_REQUEST, PING/PONG, SYNC_NETWORK_DATA
- **Electron Main Process**: Manages store IPC and server lifecycle

---

## Installation & Setup

### 1. Install Dependencies

```bash
# Root level (for Electron, server, and tools)
npm install

# Frontend dependencies
cd distributed-editor
npm install
```

### 2. Key Dependencies Added

**Root `package.json`:**

- `ws` (^8.16.0) - WebSocket library
- `electron` (^28.0.0) - Electron framework
- `electron-store` (^8.1.0) - Persistent data storage
- `concurrently` - Run dev and server together
- `nodemon` - Auto-reload server

**Frontend `distributed-editor/package.json`:**

- `electron-store` (^8.1.0)
- `ws` (^8.16.0)

---

## Running the Application

### Option 1: Development Mode (Full Stack)

From the **root directory**:

```bash
npm run dev
```

This runs:

- **React dev server** on `http://localhost:5173`
- **WebSocket server** on `ws://localhost:8080`
- **Electron** app in dev mode

### Option 2: Individual Components

```bash
# Just the frontend dev server
cd distributed-editor && npm run dev

# Just the WebSocket server
npm run backend:dev

# Build frontend
npm run build

# Start Electron app
npm start
```

---

## Application Flow

### 1. Registration

- User opens app → sees `RegisterPage`
- Fills: **Name**, **IP Address**, **Email**
- Click **Create Profile** → data saved to Electron store
- Navigates to `/dashboard` (editor UI)

### 2. Network Panel Access

- In right sidebar, click the **Network** tab
- Shows current connections list (initially empty)
- User info displayed at bottom

### 3. Establishing Connections

- Enter a peer's IP address in the input field
- Click **Ping** button
- System sends CONNECTION_REQUEST via WebSocket to that IP
- Peer receives request and responds with their connection list
- Both peers add each other to their connection list
- Heartbeat starts automatically for that connection

### 4. Peer Status Monitoring

- Every 5 seconds, ping is sent to each active connection
- If peer responds (PONG) within 3 seconds → marked as **Active** (green dot)
- If no response → marked as **Inactive** (gray dot)
- Can see:
  - Peer name, email, IP
  - Status (green/gray indicator)
  - Last ping time

### 5. Network Synchronization

- When new peers connect, their connection list is shared
- All active peers receive the new connection info
- New peers are added to everyone's connection list (no duplicates)
- Connection synchronization happens automatically

---

## Type System

### User Interface (user.types.ts)

```typescript
interface User {
  name: string;
  ipAddress: string;
  email: string;
  id?: string;
}

interface NetworkConnection {
  id: string;
  name: string;
  ipAddress: string;
  email: string;
  isActive: boolean;
  lastPingTime: number;
  createdAt: number;
}
```

### Network Messages

```typescript
type NetworkMessageType =
  | "CONNECTION_REQUEST" // Request connection
  | "CONNECTION_RESPONSE" // Accept connection
  | "PING" // Send heartbeat
  | "PONG" // Respond to ping
  | "SYNC_NETWORK_DATA" // Share connection list
  | "ERROR";
```

---

## File Structure

```
distributed-editor/src/
├── pages/
│   └── RegisterPage.tsx          # Registration form
├── components/
│   ├── network/
│   │   └── NetworkPanel.tsx      # Network connections UI
│   └── layout/
│       └── RightSidebar.tsx      # Added Network tab
├── store/
│   ├── authStore.ts             # User registration & auth
│   └── networkStore.ts          # Connection management
├── types/
│   └── user.types.ts            # Network types
└── utils/
    ├── electronStore.ts         # Electron store wrapper
    └── websocketClient.ts       # WebSocket client class

backend/
├── main.js                       # Electron main process
├── preload.js                    # Electron preload (IPC)
└── server.js                     # WebSocket server
```

---

## Electron Store Structure

The user data is persisted in Electron store:

```json
{
  "user": {
    "name": "John",
    "ipAddress": "192.168.1.100",
    "email": "john@example.com",
    "id": "user_1708402800000_abc123def"
  },
  "connections": [
    {
      "id": "conn_1708402850000_xyz789",
      "name": "Jane",
      "ipAddress": "192.168.1.101",
      "email": "jane@example.com",
      "isActive": true,
      "lastPingTime": 1708402900000,
      "createdAt": 1708402850000
    }
  ]
}
```

---

## WebSocket Server Routes

The server at `ws://localhost:8080` handles:

### CONNECTION_REQUEST

- **From**: New peer requesting connection
- **Includes**: Sender info + their known connections
- **Action**: Routes to target IP, broadcasts new peer

### CONNECTION_RESPONSE

- **From**: Peer accepting connection
- **Includes**: Responder + their connection list
- **Action**: Routes back to requester

### PING

- **From**: Any connected peer
- **To**: Specific target IP
- **Action**: Routes PING message

### PONG

- **From**: Responding to PING
- **To**: Original sender
- **Action**: Routes PONG response

### SYNC_NETWORK_DATA

- **From**: Any peer with updates
- **Includes**: Updated connection list
- **Action**: Broadcasts to all peers except sender

---

## Duplicate Prevention

Connections are checked against:

- **IP Address** + **Email** combination
- Before adding to store or displaying
- When receiving from remote peers

```typescript
const exists = connections.some(
  (c) => c.ipAddress === conn.ipAddress && c.email === conn.email,
);
```

---

## Heartbeat Configuration

Default settings (configurable):

```typescript
{
  intervalMs: 5000,    // Ping every 5 seconds
  timeoutMs: 3000,     // Wait 3 seconds for PONG
  maxRetries: 3        // Number of retry attempts
}
```

Modify in `WebSocketClient` constructor.

---

## Common Issues & Solutions

### Issue: "WebSocket not connected" alert

**Solution**: Ensure backend server is running

```bash
npm run backend:dev
```

### Issue: Peers not receiving connection requests

**Solution**: Verify IP addresses are correct and match the format used

### Issue: Duplicate entries in connection list

**Solution**: Already prevented by IP+Email check. Clear store if needed:

```javascript
// In DevTools console
window.electron.store.clear();
```

### Issue: Electron store not persisting

**Solution**: Ensure preload.js is properly set up in main.js
Check that IPC handlers are registered in main.js

---

## Testing

### Manual Testing Steps:

1. Start app with `npm run dev`
2. On first machine: Register (e.g., "Alice", "192.168.1.100")
3. On second machine: Register (e.g., "Bob", "192.168.1.101")
4. Both open Network panel
5. Alice enters "192.168.1.101" and clicks Ping
6. Both should see each other as Active (green dot)
7. Every 5 seconds, new pings are sent automatically
8. If network disconnects, status changes to Inactive (gray)

---

## Next Steps

1. Integrate file synchronization using the network layer
2. Add user presence awareness (who is editing what)
3. Implement conflict resolution for collaborative editing
4. Add encryption for secure peer communication
5. Create peer discovery mechanism (broadcast-based)
6. Add support for group projects/channels

---

## API Reference

### electronStoreAPI

```typescript
getUser(): Promise<User | null>
setUser(user: User): Promise<void>
getConnections(): Promise<NetworkConnection[]>
addConnection(conn: NetworkConnection): Promise<void>
updateConnection(conn: NetworkConnection): Promise<void>
removeConnection(connectionId: string): Promise<void>
clearAllData(): Promise<void>
```

### WebSocketClient

```typescript
connect(): Promise<void>
disconnect(): void
requestConnection(targetIp: string, connections: NetworkConnection[]): void
respondConnection(targetUser: User, connections: NetworkConnection[]): void
ping(connectionId: string, targetIp: string): void
pong(targetIp: string): void
syncNetworkData(connections: NetworkConnection[], targetIp?: string): void
startHeartbeat(connectionId: string, connectionIp: string): void
stopHeartbeat(connectionId: string): void
on(eventType: string, listener: NetworkEventListener): void
off(eventType: string, listener: NetworkEventListener): void
isConnected(): boolean
```

### Zustand Stores

```typescript
// authStore
register(payload: {name, ip, email}): Promise<void>
logout(): Promise<void>
loadUserFromElectronStore(): Promise<void>

// networkStore
initWebSocket(wsUrl: string): Promise<void>
requestConnectionToPeer(targetIp: string): void
loadConnectionsFromStorage(): Promise<void>
```

---

## License

MIT - Distributed Editor Project
