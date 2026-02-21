# Quick Start Guide - Network Infrastructure

## What Was Implemented

A complete peer-to-peer network infrastructure for the Distributed Editor with:

✅ **User Registration** - Name, IP, Email stored in Electron store  
✅ **WebSocket Communication** - Real-time peer-to-peer networking  
✅ **Connection Management** - View all connected peers  
✅ **Heartbeat Monitoring** - Auto ping every 5s, shows Active/Inactive status  
✅ **Network Synchronization** - Connection list propagates across all peers  
✅ **Duplicate Prevention** - No duplicate peers (checked by IP + Email)  
✅ **Electron Integration** - Persistent storage with IPC communication

---

## 30-Second Setup

### 1. Install Dependencies

```bash
npm install
cd distributed-editor && npm install && cd ..
```

### 2. Start Everything

```bash
npm run dev
```

This starts:

- Frontend on `http://localhost:5173`
- WebSocket server on `ws://localhost:8080`
- Electron app (dev mode)

---

## User Flow

### First Time

1. App opens → **Registration Page**
2. Fill Form:
   - **Name**: Your name (e.g., "Alice")
   - **IP Address**: Local IP (e.g., "192.168.1.100")
   - **Email**: Your email
3. Click **Create Profile**
4. Navigates to Editor UI → Right sidebar shows "Network" tab
5. Connection data saved automatically to Electron store

### Connecting to Other Peers

1. Click **Network** tab (right sidebar)
2. See your info at bottom: `You: Alice (192.168.1.100)`
3. In the input field, enter another peer's IP (e.g., `192.168.1.101`)
4. Click **Ping**
5. System sends connection request
6. If peer responds, they appear in your connections list with **green dot** (Active)

### Automatic Monitoring

- Every 5 seconds, system pings all connections
- Green dot = **Active** (peer responded within 3 sec)
- Gray dot = **Inactive** (no response from peer)
- Last ping time shown for each peer

### Network Sync

- When peers connect, their connection lists merge
- New peers automatically appear on all clients
- Same peer won't appear twice (IP + Email checked)

---

## File Structure Created/Modified

### New Files

```
distributed-editor/src/
├── types/user.types.ts          ← Network types
├── utils/
│   ├── electronStore.ts         ← Electron store API
│   └── websocketClient.ts       ← WebSocket client
├── components/network/
│   └── NetworkPanel.tsx         ← Network UI panel

backend/
├── server.js                    ← WebSocket server
└── preload.js                   ← IPC bridge

NETWORK_SETUP.md                 ← Full documentation
```

### Modified Files

```
distributed-editor/src/
├── App.tsx                      ← Added init logic
├── pages/RegisterPage.tsx       ← Enhanced UI & validation
├── store/
│   ├── authStore.ts            ← Extended with Electron
│   └── networkStore.ts         ← New network logic
└── components/layout/
    └── RightSidebar.tsx        ← Added Network tab

backend/
├── main.js                      ← Electron config
package.json                     ← Dependencies added
```

---

## Key Components

### Registration → Persistent Storage

```typescript
// User registers
Register(name, ip, email)
  ↓
// Saved to Electron Store
{ user: { name, ipAddress, email, id } }
  ↓
// Loaded on app start
LoadUserFromElectronStore()
```

### Network Connection Flow

```
User A enters User B's IP
       ↓
Sends CONNECTION_REQUEST (with User A's connection list)
       ↓
Server receives & routes to User B
       ↓
User B accepts & sends CONNECTION_RESPONSE (with their list)
       ↓
Both add each other to connections
       ↓
Heartbeat started for User B
       ↓
Every 5s: User A sends PING → User B sends PONG
       ↓
Status updates (Active/Inactive)
```

### Duplicate Prevention

```typescript
// When adding connection:
const exists = connections.some(
  (c) => c.ipAddress === conn.ipAddress && c.email === conn.email,
);
if (!exists) {
  // Add to store and list
}
```

---

## Network Messages

| Type                    | From            | To        | Contains                      |
| ----------------------- | --------------- | --------- | ----------------------------- |
| **CONNECTION_REQUEST**  | New peer        | Target IP | User info + known connections |
| **CONNECTION_RESPONSE** | Responding peer | Requester | User info + known connections |
| **PING**                | Any peer        | Target IP | Sender info + timestamp       |
| **PONG**                | Responding peer | Sender    | Acknowledgment + timestamp    |
| **SYNC_NETWORK_DATA**   | Any peer        | All peers | Updated connection list       |

---

## Testing Two Peers Locally

**Terminal 1 - Start everything:**

```bash
npm run dev
```

**In another browser/window:**

1. App 1: Register as "Alice" with IP `192.168.1.100`
2. App 2: Register as "Bob" with IP `192.168.1.101`
3. App 1: Open Network tab, enter `192.168.1.101`, click Ping
4. Both should now show each other
5. Green dots appear (Active status)
6. Open dev console, watch heartbeat messages

---

## Debugging

### Check stored data:

```javascript
// In browser DevTools console
console.log(await window.electron.store.get("user"));
console.log(await window.electron.store.get("connections"));
```

### Clear all data:

```javascript
await window.electron.store.clear();
```

### Check WebSocket connection:

```javascript
// In NetworkPanel or any component
const { wsClient } = useNetworkStore();
console.log("Connected:", wsClient?.isConnected());
```

### Watch network messages:

Add this to websocketClient.ts send() method temporarily:

```typescript
console.log("[WS Send]", message.type, message);
```

---

## Environment Variables

Optional (currently hardcoded):

```
WEBSOCKET_URL=ws://localhost:8080
PING_INTERVAL=5000
PONG_TIMEOUT=3000
```

To implement: Add to `.env` and update `App.tsx` initialization.

---

## Next Features to Implement

1. **File Propagation**
   - When network file received, send to all active connections

2. **Group Management**
   - Create projects/groups of peers
   - Shared workspace view

3. **User Presence**
   - See who's editing what file
   - Real-time cursor positions

4. **Connection History**
   - Persist connection attempts
   - Last known IP for each peer

5. **Encryption**
   - Secure peer communication
   - End-to-end encryption option

6. **Peer Discovery**
   - Broadcast-based discovery
   - Network scanning

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│               Electron App (Main Process)               │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Electron Store (Persistent)                         │ │
│  │ - user: { name, ip, email, id }                    │ │
│  │ - connections: [{ id, name, ip, email, isActive }] │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│        React Frontend (Renderer Process)                │
│  ┌──────────────┐  ┌──────────────────────────────┐    │
│  │ RegisterPage │  │ Editor UI + RightSidebar     │    │
│  └──────────────┘  │ - Public Chat                │    │
│                    │ - Private Chat               │    │
│                    │ - Network Panel (NEW)        │    │
│                    └──────────────────────────────┘    │
│                              ↓                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Zustand Stores                                  │  │
│  │ - authStore (user data)                         │  │
│  │ - networkStore (connections + WebSocket mgmt)  │  │
│  └─────────────────────────────────────────────────┘  │
│                              ↓                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ WebSocket Client                                │  │
│  │ - Heartbeat (PING/PONG every 5s)               │  │
│  │ - Connection request/response                  │  │
│  │ - Network sync                                 │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓ (ws://)
┌─────────────────────────────────────────────────────────┐
│      WebSocket Server (Node.js - localhost:8080)       │
│  - Routes messages between peers                        │
│  - Tracks connected peers                               │
│  - Handles heartbeat broadcast                          │
└─────────────────────────────────────────────────────────┘
```

---

## Support & Troubleshooting

**Q: "WebSocket not connected" error?**  
A: Backend server must be running. Check `npm run dev` is active.

**Q: Peers can't see each other?**  
A: Verify IPs are correct format. Use `ipconfig` (Windows) or `ifconfig` (Mac/Linux).

**Q: Duplicate entries appearing?**  
A: Clear store with `window.electron.store.clear()` and restart.

**Q: Port 8080 already in use?**  
A: Change in backend/server.js: `const PORT = 8081;` and App.tsx: `ws://localhost:8081`

---

Enjoy your distributed editor! 🚀
