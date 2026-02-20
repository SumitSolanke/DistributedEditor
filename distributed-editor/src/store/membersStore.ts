import { create } from "zustand"
import type { ProjectMember } from "../types/members.types"
import type { Role } from "../types/auth.types"
import { useAuthStore } from "./authStore"
import { useNetworkStore } from "./networkStore"

interface JoinRequest {
  requestId: string
  peerId: string
  name: string
  ip: string
  email: string
  createdAt: number
}

interface MembersState {
  projectId: string
  roomId: string
  status: "connected" | "disconnected"

  members: ProjectMember[] // authorized members

  discoveredPeers: { peerId: string; name: string; ip: string; email: string; status: string }[]
  joinRequests: JoinRequest[]

  syncMeFromAuth: () => void
  syncFromNetwork: () => void

  // ✅ peer asks to join (frontend mock)
  requestToJoin: (peerId: string) => { ok: true } | { ok: false; reason: string }

  // ✅ owner/admin approval flow
  approveRequest: (requestId: string, role: Role) => { ok: true } | { ok: false; reason: string }
  rejectRequest: (requestId: string) => { ok: true } | { ok: false; reason: string }

  removeMember: (id: string) => { ok: true } | { ok: false; reason: string }
  setMemberRole: (id: string, role: Role) => { ok: true } | { ok: false; reason: string }
}

const id = () => Math.random().toString(36).slice(2, 10)

export const useMembersStore = create<MembersState>((set, get) => ({
  projectId: "project-1",
  roomId: "12345",
  status: "connected",

  members: [
    { id: "me", name: "Nikhil", role: "owner", online: true },
    { id: "u2", name: "John", role: "member", online: true },
  ],

  discoveredPeers: [],
  joinRequests: [],

  syncMeFromAuth: () => {
    const u = useAuthStore.getState().user
    if (!u) return

    set({
      members: get().members.map((m) =>
        m.id === "me" ? { ...m, name: u.name, role: u.role, online: true } : m
      ),
    })
  },

  syncFromNetwork: () => {
    const peers = useNetworkStore.getState().peers

    const memberIds = new Set(get().members.map((m) => m.id))
    const requestedIds = new Set(get().joinRequests.map((r) => r.peerId))

    const discovered = peers
      .filter((p) => p.peerId !== "me")
      .filter((p) => !memberIds.has(p.peerId))
      .filter((p) => !requestedIds.has(p.peerId)) // hide if already requested
      .map((p) => ({
        peerId: p.peerId,
        name: p.name,
        ip: p.ip,
        email: p.email,
        status: p.status,
      }))

    set({ discoveredPeers: discovered })
  },

  requestToJoin: (peerId) => {
    const peer = useNetworkStore.getState().peers.find((p) => p.peerId === peerId)
    if (!peer) return { ok: false, reason: "Peer not found in network." }
    if (peer.status !== "connected") return { ok: false, reason: "Peer must be connected first." }

    const existsMember = get().members.some((m) => m.id === peerId)
    if (existsMember) return { ok: false, reason: "Already a project member." }

    const existsReq = get().joinRequests.some((r) => r.peerId === peerId)
    if (existsReq) return { ok: false, reason: "Request already sent." }

    const req: JoinRequest = {
      requestId: id(),
      peerId: peer.peerId,
      name: peer.name,
      ip: peer.ip,
      email: peer.email,
      createdAt: Date.now(),
    }

    set({ joinRequests: [...get().joinRequests, req] })
    get().syncFromNetwork()
    return { ok: true }
  },

  approveRequest: (requestId, role) => {
    const { permissions } = useAuthStore.getState()
    if (!permissions.canAddMember) {
      return { ok: false, reason: "No permission to approve requests." }
    }

    const req = get().joinRequests.find((r) => r.requestId === requestId)
    if (!req) return { ok: false, reason: "Request not found." }

    // add as member
    const already = get().members.some((m) => m.id === req.peerId)
    if (already) return { ok: false, reason: "Already member." }

    set({
      members: [
        ...get().members,
        { id: req.peerId, name: req.name, role, online: true },
      ],
      joinRequests: get().joinRequests.filter((r) => r.requestId !== requestId),
    })

    get().syncFromNetwork()
    return { ok: true }
  },

  rejectRequest: (requestId) => {
    const { permissions } = useAuthStore.getState()
    if (!permissions.canAddMember) {
      return { ok: false, reason: "No permission to reject requests." }
    }

    set({ joinRequests: get().joinRequests.filter((r) => r.requestId !== requestId) })
    get().syncFromNetwork()
    return { ok: true }
  },

  removeMember: (id) => {
    const { permissions } = useAuthStore.getState()
    if (!permissions.canRemoveMember) {
      return { ok: false, reason: "No permission to remove members." }
    }
    if (id === "me") return { ok: false, reason: "You cannot remove yourself." }

    set({ members: get().members.filter((m) => m.id !== id) })
    get().syncFromNetwork()
    return { ok: true }
  },

  setMemberRole: (id, role) => {
    const { permissions } = useAuthStore.getState()
    if (!permissions.canChangeRole) {
      return { ok: false, reason: "No permission to change roles." }
    }

    const target = get().members.find((m) => m.id === id)
    if (!target) return { ok: false, reason: "Member not found." }
    if (target.role === "owner") return { ok: false, reason: "Owner role cannot be changed." }
    if (id === "me") return { ok: false, reason: "You cannot change your own role." }

    set({
      members: get().members.map((m) => (m.id === id ? { ...m, role } : m)),
    })
    return { ok: true }
  },
}))