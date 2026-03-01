import Store from "electron-store";
import { randomUUID } from "crypto";

export const user = new Store({ name: "user-data" });
export const devices = new Store({ name: "devices-data" });

if (!devices.has("list")) {
  devices.set("list", []);
}
if (!devices.has("version")) {
  devices.set("version", 0);
}

export function registerSelf(data) {
  const selfDevice = {
    id: randomUUID(),
    name: data.name,
    email: data.email,
    ip: data.ip,
  };

  user.set("self", selfDevice);
  return selfDevice;
}

export function hasSelf() {
  return user.has("self");
}

export function deleteSelf() {
  user.delete("self");
  console.log("Backend: self info deleted");
  return { success: true };
}

export function getSelf() {
  return user.get("self");
}

export function getDeviceList() {
  return devices.get("list") || [];
}

export function getFullListIncludingSelf() {
  const self = getSelf();
  const list = getDeviceList();
  return self ? [self, ...list] : [...list];
}

export function mergeDevices(receivedDevices) {
  const existing = getDeviceList();
  const self = getSelf();
  const selfId = self?.id;

  let changed = false;

  (receivedDevices || []).forEach((incoming) => {
    if (!incoming?.id) return;
    if (selfId && incoming.id === selfId) return;

    const exists = existing.some((d) => d.id === incoming.id);

    if (!exists) {
      existing.push(incoming);
      changed = true;
    }
  });

  if (changed) {
    devices.set("list", existing);
    devices.set("version", devices.get("version") + 1);
  }

  return changed;
}
