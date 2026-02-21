import {WebSocket,  WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.PORT || 3002;
const peers = new Map();

const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[WS] New connection");

  let peerId = null;

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
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
    case "HELLO": {
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

  console.log(`[WS] HELLO from ${from.name} (${from.ipAddress})`);

  // ✅ send peer list to this client instantly
  ws.send(
    JSON.stringify({
      type: "PEER_UPDATE",
      peers: Array.from(peers.values()).map((p) => ({
        id: p.id,
        name: p.name,
        ipAddress: p.ipAddress,
        email: p.email,
      })),
      timestamp: Date.now(),
    })
  );

  // ✅ broadcast peer list to everyone
  broadcastPeerUpdate();
  break;
}
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

      if (targetIp) {
        const targetPeer = Array.from(peers.values()).find((p) => p.ipAddress === targetIp);
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
        const targetPeer = Array.from(peers.values()).find((p) => p.ipAddress === targetIp);
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
        const targetPeer = Array.from(peers.values()).find((p) => p.ipAddress === targetIp);
        if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
          targetPeer.ws.send(JSON.stringify({ type: "PING", from, timestamp }));
        }
      }
      break;
    }

    case "PONG": {
      if (targetIp) {
        const senderPeer = Array.from(peers.values()).find((p) => p.ipAddress === targetIp);
        if (senderPeer && senderPeer.ws.readyState === WebSocket.OPEN) {
          senderPeer.ws.send(JSON.stringify({ type: "PONG", from, timestamp }));
        }
      }
      break;
    }

    case "SYNC_NETWORK_DATA": {
      const broadcastMessage = { type: "SYNC_NETWORK_DATA", from, connections, timestamp };

      peers.forEach((peer) => {
        if (peer.ws.readyState === WebSocket.OPEN && peer.ipAddress !== from.ipAddress) {
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

  const message = { type: "PEER_UPDATE", peers: peerList, timestamp: Date.now() };

  peers.forEach((peer) => {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(message));
    }
  });
}

server.listen(PORT, () => {
  console.log(`[WS] Server running on ws://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`[WS] Port ${PORT} already in use. Change PORT.`);
    process.exit(1);
  }
  console.error("[WS] Server error:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("[WS] Shutting down server...");
  server.close(() => {
    console.log("[WS] Server closed");
    process.exit(0);
  });
});