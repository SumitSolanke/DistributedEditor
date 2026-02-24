import WebSocket, { WebSocketServer } from "ws";

const PORT = 3000;
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket, request) => {
  console.log("Incoming connection from:", request.socket.remoteAddress);

  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());

    if (message.type === "DEVICE_LIST") {
      console.log("Received device list");
      const myList = devices.get("list") || [];
      socket.send(
        JSON.stringify({
          type: "DEVICE_LIST_RESPONSE",
          payload: myList,
        }),
      );
      const newlyAdded = mergeDevices(message.payload);
      if (newlyAdded && newlyAdded.length > 0) {
        sendDeviceListToAll(); // Update all devices with the new list
      }
    }
  });
});

export function sendDeviceListToDevice(ip) {
  const myDeviceList = devices.get("list") || [];
  const socket = new WebSocket(`ws://${ip}:${PORT}`);

  socket.on("open", () => {
    socket.send(
      JSON.stringify({
        type: "DEVICE_LIST",
        payload: myDeviceList,
      }),
    );
  });
  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === "DEVICE_LIST_RESPONSE") {
        console.log("Received response from", device.email);

        mergeDevices(message.payload);

        // ✅ Close ONLY after receiving response
        socket.close();
      }
    } catch (err) {
      console.log("Invalid message from", device.email);
    }
  });
  socket.on("close", () => {
    console.log("Connection closed with", device.email);
  });
}
export function sendDeviceListToAll() {
  const myDeviceList = devices.get("list") || [];

  const knownDevices = devices.get("list") || [];

  knownDevices.forEach((device) => {
    if (!device.ip) return;

    const socket = new WebSocket(`ws://${device.ip}:${PORT}`);

    socket.on("open", () => {
      console.log("Connected to", device.email);

      socket.send(
        JSON.stringify({
          type: "DEVICE_LIST",
          payload: myDeviceList,
        }),
      );
    });

    socket.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "DEVICE_LIST_RESPONSE") {
          console.log("Received response from", device.email);

          mergeDevices(message.payload);

          // ✅ Close ONLY after receiving response
          socket.close();
        }
      } catch (err) {
        console.log("Invalid message from", device.email);
      }
    });

    socket.on("error", (err) => {
      console.log("Could not connect to", device.email);
    });
    socket.on("close", () => {
      console.log("Connection closed with", device.email);
    });
  });
}
