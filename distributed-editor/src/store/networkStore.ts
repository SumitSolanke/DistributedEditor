import { create } from "zustand"
import type { NetworkPeer, PeerIdentity } from "../types/network.types"
import { useAuthStore } from "./authStore"

const now = () => Date.now()
const genId = () => Math.random().toString(36).slice(2, 10)

interface NetworkState {
  overlayOpen: boolean
  toggleOverlay: () => void
  openOverlay: () => void
  closeOverlay: () => void

  peers: NetworkPeer[]
  seenMessageIds: Record<string, true>

  initSelf: () => void
  pingByIp: (targetIp: string) => void

  mergePeers: (incoming: PeerIdentity[], status?: NetworkPeer["status"]) => void
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  overlayOpen: false,
  toggleOverlay: () => set({ overlayOpen: !get().overlayOpen }),
  openOverlay: () => set({ overlayOpen: true }),
  closeOverlay: () => set({ overlayOpen: false }),

  peers: [],
  seenMessageIds: {},

  initSelf: () => {
    const u = useAuthStore.getState().user
    if (!u) return

    const me: PeerIdentity = {
      peerId: u.id,
      name: u.name,
      ip: u.ip,
      email: u.email,
    }

    get().mergePeers([me], "connected")
  },

  mergePeers: (incoming, status = "discovered") => {
    const current = get().peers
    const map = new Map(current.map((p) => [p.peerId, p]))

    for (const peer of incoming) {
      const existing = map.get(peer.peerId)

      if (!existing) {
        map.set(peer.peerId, {
          ...peer,
          status,
          lastSeen: now(),
        })
      } else {
        map.set(peer.peerId, {
          ...existing,
          ...peer,
          status: existing.status === "connected" ? "connected" : status,
          lastSeen: now(),
        })
      }
    }

    set({ peers: Array.from(map.values()) })
  },

  pingByIp: (targetIp) => {
    const u = useAuthStore.getState().user
    if (!u) return

    const me: PeerIdentity = {
      peerId: u.id,
      name: u.name,
      ip: u.ip,
      email: u.email,
    }

    const msgId = genId()
    if (get().seenMessageIds[msgId]) return
    set({ seenMessageIds: { ...get().seenMessageIds, [msgId]: true } })

    const mockDirectory: Record<
      string,
      { target: PeerIdentity; knownPeers: PeerIdentity[] }
    > = {
      "10.0.0.55": {
        target: { peerId: "dam", name: "Dam", ip: "10.0.0.55", email: "dam@mail.com" },
        knownPeers: [
          { peerId: "a1", name: "A1", ip: "10.0.0.11", email: "a1@mail.com" },
          { peerId: "a2", name: "A2", ip: "10.0.0.12", email: "a2@mail.com" },
        ],
      },
      "10.0.0.22": {
        target: { peerId: "sham", name: "Sham", ip: "10.0.0.22", email: "sham@mail.com" },
        knownPeers: [],
      },
      "10.0.0.33": {
        target: { peerId: "ram", name: "Ram", ip: "10.0.0.33", email: "ram@mail.com" },
        knownPeers: [],
      },
    }

    const entry = mockDirectory[targetIp]
    if (!entry) {
      alert("No peer found in mock directory. Try 10.0.0.55")
      return
    }

    const target = entry.target
    const targetKnown = entry.knownPeers

    // merge: target + target-known + me
    get().mergePeers([me], "connected")
    get().mergePeers([target, ...targetKnown], "connected")
  },
}))