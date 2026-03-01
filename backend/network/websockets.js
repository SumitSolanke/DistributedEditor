import WebSocket, { WebSocketServer } from "ws";
import {
  getSelf,
  getFullListIncludingSelf,
  mergeDevices,
  getDeviceList,
} from "../storage/store.js";

const PORT = 3000;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());

    if (message.type === "SYNC_DEVICES") {
      const changed = mergeDevices(message.payload);

      socket.send(
        JSON.stringify({
          type: "SYNC_RESPONSE",
          payload: getFullListIncludingSelf(),
        }),
      );

      if (changed) {
        broadcastToAll(message.originId);
      }
    }
  });
});

export function syncWithDevice(ip) {
  const self = getSelf();
  if (!self) {
    console.warn("syncWithDevice skipped: no registered self user");
    return;
  }

  const socket = new WebSocket(`ws://${ip}:${PORT}`);

  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        type: "SYNC_DEVICES",
        originId: self.id,
        payload: getFullListIncludingSelf(),
      }),
    );
  });

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "SYNC_RESPONSE") {
        mergeDevices(message.payload);
      }
    } catch {
      console.log("Invalid message received");
    } finally {
      socket.close();
    }
  });

  socket.on("error", () => {
    socket.close();
  });
}

export function broadcastToAll(excludeId = "__NONE__") {
  const self = getSelf();
  if (!self) return;

  const list = getDeviceList();

  list.forEach((device) => {
    if (device.id === excludeId) return;

    const socket = new WebSocket(`ws://${device.ip}:${PORT}`);

    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          type: "SYNC_DEVICES",
          originId: self.id,
          payload: getFullListIncludingSelf(),
        }),
      );
      socket.close();
    });

    socket.on("error", () => {
      socket.close();
    });
  });
}
