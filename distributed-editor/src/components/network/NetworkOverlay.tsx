import { useEffect, useMemo, useState } from "react"
import { X, PlugZap, Network } from "lucide-react"
import { useNetworkStore } from "../../store/networkStore"

export default function NetworkOverlay() {
  const { overlayOpen, closeOverlay, peers, pingByIp, initSelf } =
    useNetworkStore()

  const [ip, setIp] = useState("")
  const [q, setQ] = useState("")

  useEffect(() => {
    if (overlayOpen) initSelf()
  }, [overlayOpen, initSelf])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return peers
    return peers.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.ip.toLowerCase().includes(s) ||
        p.email.toLowerCase().includes(s)
    )
  }, [q, peers])

  if (!overlayOpen) return null

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* dim area */}
      <div className="absolute inset-0 bg-black/40" onClick={closeOverlay} />

      {/* panel */}
      <div
        className="absolute top-0 left-0 h-full w-[520px] bg-[#252526] border-r border-gray-700 shadow-xl"
        onClick={(e) => e.stopPropagation()} // ✅ stop bubble
      >
        <div className="h-12 px-3 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Network size={18} /> Network
          </div>
          <button onClick={closeOverlay} className="p-2 hover:bg-[#2a2d2e] rounded">
            <X size={16} />
          </button>
        </div>

        <div className="p-3 space-y-3">
          <div className="text-xs text-gray-400">
            Ping by IP (mock). Try:{" "}
            <span className="text-gray-200">10.0.0.55</span>
          </div>

          <div className="flex gap-2">
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="Enter IP to ping..."
              className="flex-1 bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={() => {
                pingByIp(ip.trim())
                setIp("")
              }}
              className="px-3 py-2 text-sm rounded bg-[#007acc] hover:opacity-90 inline-flex items-center gap-2"
            >
              <PlugZap size={16} /> Ping
            </button>
          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search peers..."
            className="w-full bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
          />

          <div className="text-xs text-gray-400">Known peers ({filtered.length})</div>

          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-auto pr-1">
            {filtered.map((p) => (
              <div
                key={p.peerId}
                className="bg-[#2a2d2e] border border-[#3a3f41] rounded px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-400">{p.status}</div>
                </div>
                <div className="text-xs text-gray-300 mt-1">
                  {p.ip} • {p.email}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}