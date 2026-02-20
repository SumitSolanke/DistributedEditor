import { useMemo, useState } from "react"
import type { Role } from "../../types/auth.types"
import { useNetworkStore } from "../../store/networkStore"
import { useMembersStore } from "../../store/membersStore"

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (peerId: string, role: Role) => void
}

export default function AddMemberModal({ open, onClose, onSubmit }: Props) {
  const peers = useNetworkStore((s) => s.peers)
  const members = useMembersStore((s) => s.members)

  const [peerId, setPeerId] = useState("")
  const [role, setRole] = useState<Role>("viewer")

  const availablePeers = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id))
    return peers
      .filter((p) => p.status === "connected") // ✅ strict rule
      .filter((p) => p.peerId !== "me") // don't show self
      .filter((p) => !memberIds.has(p.peerId)) // don't show already-added
  }, [peers, members])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-lg bg-[#252526] border border-gray-700 text-white">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div className="font-semibold text-sm">Add Member (from Network)</div>
          <button onClick={onClose} className="text-gray-300 hover:text-white">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs text-gray-400">
            Only peers that are <span className="text-gray-200">Connected</span> in Network can be added.
          </div>

          <div>
            <div className="text-xs text-gray-400 mb-1">Select Peer</div>
            <select
              value={peerId}
              onChange={(e) => setPeerId(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
            >
              <option value="" disabled>
                -- Select a connected peer --
              </option>
              {availablePeers.map((p) => (
                <option key={p.peerId} value={p.peerId}>
                  {p.name} ({p.ip})
                </option>
              ))}
            </select>

            {availablePeers.length === 0 && (
              <div className="text-xs text-yellow-300 mt-2">
                No connected peers available. Open Network and ping an IP first.
              </div>
            )}
          </div>

          <div>
            <div className="text-xs text-gray-400 mb-1">Role</div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded border border-gray-700 hover:bg-[#2a2d2e]"
            >
              Cancel
            </button>

            <button
              disabled={!peerId}
              onClick={() => onSubmit(peerId, role)}
              className={`px-3 py-2 rounded ${
                peerId ? "bg-[#007acc] hover:opacity-90" : "bg-gray-700 cursor-not-allowed"
              }`}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}