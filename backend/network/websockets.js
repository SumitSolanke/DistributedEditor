import WebSocket, { WebSocketServer } from "ws";
import {
  getSelf,
  getFullListIncludingSelf,
  mergeDevices,
  getDeviceList,
} from "../storage/store.js";
import {
  storeSocket,
  getSocket,
  getAllSockets,
  removeSocket,
  isSocketActive,
} from "./socketStore.js";

export const NETWORK_WS_PORT = 3000;

let externalMessageHandler = null;

export function registerExternalMessageHandler(handler) {
  externalMessageHandler = typeof handler === "function" ? handler : null;
}

const wss = new WebSocketServer({ port: NETWORK_WS_PORT });

wss.on("connection", (socket) => {
  attachSocketLifecycle(socket);
});

function cleanupSocketReference(socket) {
  const peerEmail = socket.__peerEmail;
  if (!peerEmail) return;
  const tracked = getSocket(peerEmail);
  if (tracked === socket) {
    removeSocket(peerEmail);
  }
}

function markPeerSocket(socket, email) {
  if (!email) return;
  socket.__peerEmail = email;
  storeSocket(email, socket);
}

function identifyPeerFromDevicePayload(message) {
  if (!message || !message.originId || !Array.isArray(message.payload)) {
    return null;
  }

  return (
    message.payload.find(
      (device) =>
        device &&
        device.id === message.originId &&
        typeof device.email === "string" &&
        device.email.trim(),
    ) || null
  );
}

function tryTrackSocketFromMessage(socket, message) {
  if (message && typeof message.senderEmail === "string") {
    const email = message.senderEmail.trim();
    if (email) {
      markPeerSocket(socket, email);
      return;
    }
  }

  const sender = identifyPeerFromDevicePayload(message);
  if (sender?.email) {
    markPeerSocket(socket, sender.email);
  }
}

function sendDeviceSyncMessage(socket, originId) {
  if (!isSocketActive(socket)) return false;

  const self = getSelf();
  if (!self) return false;

  socket.send(
    JSON.stringify({
      type: "SYNC_DEVICES",
      senderEmail: self.email,
      originId: originId || self.id,
      payload: getFullListIncludingSelf(),
    }),
  );
  return true;
}

async function handleSocketMessage(socket, rawData) {
  let message = null;
  try {
    message = JSON.parse(rawData.toString());
  } catch {
    console.warn("Invalid WebSocket message payload");
    return;
  }

  tryTrackSocketFromMessage(socket, message);

  if (message.type === "SYNC_DEVICES") {
    const changed = mergeDevices(message.payload);
    const self = getSelf();

    if (self && isSocketActive(socket)) {
      socket.send(
        JSON.stringify({
          type: "SYNC_RESPONSE",
          senderEmail: self.email,
          originId: self.id,
          payload: getFullListIncludingSelf(),
        }),
      );
    }

    if (changed) {
      broadcastToAll(message.originId);
    }
    return;
  }

  if (message.type === "SYNC_RESPONSE") {
    mergeDevices(message.payload);
    return;
  }

  if (externalMessageHandler) {
    await externalMessageHandler(socket, message);
  }
}

function attachSocketLifecycle(socket, peer = null) {
  if (peer?.email) {
    markPeerSocket(socket, peer.email);
  }

  socket.__messageQueue = Promise.resolve();
  socket.on("message", (data) => {
    socket.__messageQueue = socket.__messageQueue
      .then(() => handleSocketMessage(socket, data))
      .catch((error) => {
        console.warn("WebSocket message handling failed:", error?.message || error);
      });
  });

  socket.on("close", () => {
    cleanupSocketReference(socket);
  });

  socket.on("error", () => {
    cleanupSocketReference(socket);
    try {
      socket.close();
    } catch {
      // best effort
    }
  });
}

function openSocket(peer, options = {}) {
  const { sendDeviceSyncOnOpen = true } = options;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${peer.ip}:${NETWORK_WS_PORT}`);
    let settled = false;

    attachSocketLifecycle(socket, peer);

    socket.on("open", () => {
      if (peer?.email) {
        markPeerSocket(socket, peer.email);
      }
      if (sendDeviceSyncOnOpen) {
        sendDeviceSyncMessage(socket);
      }
      settled = true;
      resolve(socket);
    });

    socket.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

export async function getOrCreateSocketForPeer(peer, options = {}) {
  if (!peer || typeof peer.ip !== "string" || !peer.ip.trim()) {
    return null;
  }

  const email = typeof peer.email === "string" ? peer.email.trim() : "";
  if (email) {
    const existing = getSocket(email);
    if (isSocketActive(existing)) {
      return existing;
    }
    if (existing) {
      removeSocket(email);
    }
  }

  try {
    return await openSocket(
      {
        email: email || undefined,
        ip: peer.ip.trim(),
      },
      options,
    );
  } catch (error) {
    console.warn(
      `Failed to open WebSocket with ${email || peer.ip}: ${error?.message || error}`,
    );
    return null;
  }
}

export async function syncWithDevice(ip) {
  const self = getSelf();
  if (!self) {
    console.warn("syncWithDevice skipped: no registered self user");
    return;
  }

  const socket = await getOrCreateSocketForPeer(
    {
      ip,
    },
    {
      sendDeviceSyncOnOpen: false,
    },
  );

  if (isSocketActive(socket)) {
    sendDeviceSyncMessage(socket);
  }
}

export function broadcastToAll(excludeId = "__NONE__") {
  const self = getSelf();
  if (!self) return;

  const list = getDeviceList();
  const sockets = getAllSockets();

  list.forEach((device) => {
    if (!device || device.id === excludeId) return;

    const tracked = sockets.get(device.email);
    if (isSocketActive(tracked)) {
      sendDeviceSyncMessage(tracked, self.id);
      return;
    }

    if (tracked) {
      removeSocket(device.email);
    }

    void getOrCreateSocketForPeer(device, {
      sendDeviceSyncOnOpen: false,
    }).then((socket) => {
      if (isSocketActive(socket)) {
        sendDeviceSyncMessage(socket, self.id);
      }
    });
  });
}
