export const peerSockets = new Map();

export function storeSocket(email, socket) {
  if (!email || !socket) return;
  peerSockets.set(email, socket);
}

export function getSocket(email) {
  return peerSockets.get(email);
}

export function isSocketActive(socket) {
  return Boolean(socket) && socket.readyState === 1;
}

export function getAllSockets() {
  return peerSockets;
}

export function removeSocket(email) {
  peerSockets.delete(email);
}
