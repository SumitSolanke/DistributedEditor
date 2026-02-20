import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2, Check, X } from "lucide-react"
import type { Role } from "../../types/auth.types"
import { useAuthStore } from "../../store/authStore"
import { useMembersStore } from "../../store/membersStore"
import AddMemberModal from "./AddMemberModal"

const roleLabel = (r: Role) => {
  if (r === "owner") return "Owner"
  if (r === "admin") return "Admin"
  if (r === "member") return "Member"
  return "Viewer"
}

const roleChip = (role: Role) => {
  if (role === "owner") return "bg-purple-600/20 border-purple-500 text-purple-200"
  if (role === "admin") return "bg-blue-600/20 border-blue-500 text-blue-200"
  if (role === "member") return "bg-green-600/20 border-green-500 text-green-200"
  return "bg-gray-600/20 border-gray-500 text-gray-200"
}

export default function MemberList() {
  const user = useAuthStore((s) => s.user)
  const permissions = useAuthStore((s) => s.permissions)

  const {
    status,
    roomId,
    members,
    discoveredPeers,
    joinRequests,
    syncMeFromAuth,
    syncFromNetwork,
    requestToJoin,
    approveRequest,
    rejectRequest,
    removeMember,
    setMemberRole,
  } = useMembersStore()

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")

  useEffect(() => {
    syncMeFromAuth()
    syncFromNetwork()
  }, [syncMeFromAuth, syncFromNetwork])

  const filteredMembers = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return members
    return members.filter((m) => m.name.toLowerCase().includes(s))
  }, [q, members])

  const meId = user?.id ?? "me"
  const canUseActions = !!user

  const onAddFromModal = (peerId: string, role: Role) => {
    // approve instantly as owner/admin flow (modal)
    // create request + approve
    const r = requestToJoin(peerId)
    if (!r.ok) return alert(r.reason)

    const req = useMembersStore.getState().joinRequests.find((x) => x.peerId === peerId)
    if (!req) return

    const a = approveRequest(req.requestId, role)
    if (!a.ok) alert(a.reason)
    else setOpen(false)
  }

  return (
    <div className="p-3 text-sm space-y-3">
      <div className="uppercase text-xs text-zinc-400">Connection</div>

      <div className="flex items-center justify-between">
        <div>
          Status:{" "}
          <span className={status === "connected" ? "text-green-400" : "text-red-400"}>
            {status === "connected" ? "🟢 Connected" : "🔴 Disconnected"}
          </span>
        </div>
        <div className="text-xs text-gray-400">Room: {roomId}</div>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search member..."
          className="flex-1 bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
        />

        {/* optional modal for owner */}
        <button
          onClick={() => setOpen(true)}
          disabled={!canUseActions || !permissions.canAddMember}
          className={`p-2 rounded border border-gray-700 ${
            canUseActions && permissions.canAddMember ? "hover:bg-[#2a2d2e]" : "opacity-40 cursor-not-allowed"
          }`}
          title="Add member (approve from network)"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* ✅ PROJECT MEMBERS */}
      <div className="text-xs text-gray-400">Project Members ({filteredMembers.length})</div>
      <div className="space-y-2">
        {filteredMembers.map((m) => {
          const isMe = m.id === meId

          const canManageTarget =
            canUseActions && permissions.canChangeRole && m.role !== "owner" && !isMe

          const canRemoveTarget =
            canUseActions && permissions.canRemoveMember && !isMe && m.role !== "owner"

          return (
            <div
              key={m.id}
              className="flex items-center justify-between bg-[#2a2d2e] border border-[#3a3f41] rounded px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate">
                  {m.name} {isMe ? "(You)" : ""}
                </div>
                <div className={`inline-flex mt-1 text-[11px] px-2 py-0.5 rounded border ${roleChip(m.role)}`}>
                  {roleLabel(m.role)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  disabled={!canManageTarget}
                  onChange={(e) => setMemberRole(m.id, e.target.value as Role)}
                  className={`bg-[#1e1e1e] border border-gray-700 rounded px-2 py-1 text-xs outline-none ${
                    canManageTarget ? "" : "opacity-50 cursor-not-allowed"
                  }`}
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>

                <button
                  onClick={() => removeMember(m.id)}
                  disabled={!canRemoveTarget}
                  className={`p-2 rounded border border-gray-700 ${
                    canRemoveTarget ? "hover:bg-[#3a1f1f] hover:border-red-500" : "opacity-40 cursor-not-allowed"
                  }`}
                >
                  <Trash2 size={16} className="text-red-300" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ✅ JOIN REQUESTS */}
      <div className="text-xs text-gray-400">Join Requests ({joinRequests.length})</div>
      <div className="space-y-2">
        {joinRequests.map((r) => (
          <div
            key={r.requestId}
            className="flex items-center justify-between bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate">{r.name}</div>
              <div className="text-[11px] text-gray-400">{r.ip} • {r.email}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={!permissions.canAddMember}
                onClick={() => approveRequest(r.requestId, "viewer")}
                className={`p-2 rounded border border-gray-700 ${
                  permissions.canAddMember ? "hover:bg-[#2a2d2e]" : "opacity-40 cursor-not-allowed"
                }`}
                title="Approve"
              >
                <Check size={16} className="text-green-300" />
              </button>

              <button
                disabled={!permissions.canAddMember}
                onClick={() => rejectRequest(r.requestId)}
                className={`p-2 rounded border border-gray-700 ${
                  permissions.canAddMember ? "hover:bg-[#2a2d2e]" : "opacity-40 cursor-not-allowed"
                }`}
                title="Reject"
              >
                <X size={16} className="text-red-300" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ✅ DISCOVERED */}
      <div className="text-xs text-gray-400">Discovered in Network ({discoveredPeers.length})</div>
      <div className="space-y-2">
        {discoveredPeers.map((p) => (
          <div
            key={p.peerId}
            className="flex items-center justify-between bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate">{p.name}</div>
              <div className="text-[11px] text-gray-400">{p.ip} • {p.status}</div>
            </div>

            <button
              disabled={p.status !== "connected"}
              onClick={() => {
                const res = requestToJoin(p.peerId)
                if (!res.ok) alert(res.reason)
              }}
              className={`text-xs px-3 py-1 rounded border border-gray-700 ${
                p.status === "connected" ? "hover:bg-[#2a2d2e]" : "opacity-40 cursor-not-allowed"
              }`}
            >
              Request
            </button>
          </div>
        ))}
      </div>

      <AddMemberModal open={open} onClose={() => setOpen(false)} onSubmit={onAddFromModal} />
    </div>
  )
}