// WebSocket server for Distributed Editor
// Handles peer-to-peer network communication

import { WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.PORT || 3002;
const peers = new Map();

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[WS] New connection");

  let peerId = null;

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message, (id) => {
        peerId = id;
      });
    } catch (error) {
      console.error("[WS] Failed to parse message:", error);
    }
  });

  ws.on("close", () => {
    if (peerId) {
      peers.delete(peerId);
      console.log("[WS] Peer disconnected:", peerId);
      broadcastPeerUpdate();
    }
  });

  ws.on("error", (error) => {
    console.error("[WS] Connection error:", error);
  });
});

function handleMessage(ws, message, setPeerId) {
  const { type, from, targetIp, connections, timestamp } = message;

  switch (type) {
    case "CONNECTION_REQUEST": {
      const peerId = `peer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      peers.set(peerId, {
        id: peerId,
        ws,
        ipAddress: from.ipAddress,
        name: from.name,
        email: from.email,
        lastSeen: Date.now(),
      });
      setPeerId(peerId);

      console.log(`[WS] Peer ${from.name} connected from ${from.ipAddress}`);

      // Broadcast to all peers about new peer
      if (targetIp) {
        // Find peer by target IP and forward request
        const targetPeer = Array.from(peers.values()).find(
          (p) => p.ipAddress === targetIp,
        );
        if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
          targetPeer.ws.send(
            JSON.stringify({
              type: "CONNECTION_REQUEST",
              from,
              connections,
              timestamp,
            }),
          );
        }
      }
      break;
    }

    case "CONNECTION_RESPONSE": {
      if (targetIp) {
        // Find peer by IP and send response
        const targetPeer = Array.from(peers.values()).find(
          (p) => p.ipAddress === targetIp,
        );
        if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
          targetPeer.ws.send(
            JSON.stringify({
              type: "CONNECTION_RESPONSE",
              from,
              connections,
              timestamp,
            }),
          );
        }
      }
      break;
    }

    case "PING": {
      if (targetIp) {
        // Route PING to target peer
        const targetPeer = Array.from(peers.values()).find(
          (p) => p.ipAddress === targetIp,
        );
        if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
          targetPeer.ws.send(
            JSON.stringify({
              type: "PING",
              from,
              timestamp,
            }),
          );
        }
      }
      break;
    }

    case "PONG": {
      if (targetIp) {
        // Send PONG back to sender
        const senderPeer = Array.from(peers.values()).find(
          (p) => p.ipAddress === targetIp,
        );
        if (senderPeer && senderPeer.ws.readyState === WebSocket.OPEN) {
          senderPeer.ws.send(
            JSON.stringify({
              type: "PONG",
              from,
              timestamp,
            }),
          );
        }
      }
      break;
    }

    case "SYNC_NETWORK_DATA": {
      // Broadcast network data to all connected peers
      const broadcastMessage = {
        type: "SYNC_NETWORK_DATA",
        from,
        connections,
        timestamp,
      };

      peers.forEach((peer) => {
        if (
          peer.ws.readyState === WebSocket.OPEN &&
          peer.ipAddress !== from.ipAddress
        ) {
          peer.ws.send(JSON.stringify(broadcastMessage));
        }
      });
      break;
    }

    default:
      console.log("[WS] Unknown message type:", type);
  }
}

function broadcastPeerUpdate() {
  const peerList = Array.from(peers.values()).map((p) => ({
    id: p.id,
    name: p.name,
    ipAddress: p.ipAddress,
    email: p.email,
  }));

  const message = {
    type: "PEER_UPDATE",
    peers: peerList,
    timestamp: Date.now(),
  };

  peers.forEach((peer) => {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(message));
    }
  });
}

// Attempt to listen, and if the port is already in use, try the next few ports
function tryListen(startPort, attempts = 10) {
  let port = Number(startPort);

  const attempt = () => {
    server.listen(port, () => {
      console.log(`[WS] Server running on ws://localhost:${port}`);
    });
  };

  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.warn(`[WS] Port ${port} in use, trying port ${port + 1}`);
      server.removeAllListeners("error");
      port += 1;
      if (port - Number(startPort) <= attempts) {
        // Wait briefly before retrying to avoid tight loop
        setTimeout(() => attempt(), 200);
      } else {
        console.error("[WS] No available ports found, exiting");
        process.exit(1);
      }
    } else {
      console.error("[WS] Server error:", err);
      process.exit(1);
    }
  });

  attempt();
}

// Listen on the fixed port and show a clear message if it's unavailable
server.listen(PORT, () => {
  console.log(`[WS] Server running on ws://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `[WS] Port ${PORT} is already in use. Please free the port or set the PORT environment variable to a different port.`,
    );
    process.exit(1);
  } else {
    console.error("[WS] Server error:", err);
    process.exit(1);
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[WS] Shutting down server...");
  server.close(() => {
    console.log("[WS] Server closed");
    process.exit(0);
  });
});
