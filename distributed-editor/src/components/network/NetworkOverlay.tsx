import { useEffect, useMemo, useState, useRef } from "react";
import { X, PlugZap, Network } from "lucide-react";
import { useNetworkStore } from "../../store/networkStore";

export default function NetworkOverlay() {
  const { overlayOpen, closeOverlay, peers, pingByIp, initSelf } =
    useNetworkStore();

  const [ip, setIp] = useState("");
  const [q, setQ] = useState("");
  const [connectionsList, setConnectionsList] = useState<any[]>([]);
  const ipRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (overlayOpen) initSelf();
    // fetch connections from backend via IPC when overlay opens
    if (overlayOpen && window.api?.getConnections) {
      (async () => {
        try {
          const res = await window.api.getConnections();
          if (res && res.success && Array.isArray(res.connections)) {
            setConnectionsList(res.connections);
          } else {
            setConnectionsList([]);
          }
        } catch (e) {
          setConnectionsList([]);
        }
      })();
    }
    // focus input when overlay opens
    if (overlayOpen) {
      setTimeout(() => ipRef.current?.focus(), 50);
    }
  }, [overlayOpen, initSelf]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return peers;
    return peers.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.ip.toLowerCase().includes(s) ||
        p.email.toLowerCase().includes(s),
    );
  }, [q, peers]);

  if (!overlayOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* dim area */}
      <div
        className="absolute inset-0 bg-black/40 z-0"
        onClick={closeOverlay}
      />

      {/* panel */}
      <div
        className="absolute top-0 left-0 h-full w-[520px] bg-[#252526] border-r border-gray-700 shadow-xl z-10 pointer-events-auto"
        onClick={(e) => e.stopPropagation()} // ✅ stop bubble
      >
        <div className="h-12 px-3 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Network size={18} /> Network
          </div>
          <button
            onClick={closeOverlay}
            className="p-2 hover:bg-[#2a2d2e] rounded"
          >
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
              ref={ipRef}
              value={ip}
              onChange={(e) => {
                setIp(e.target.value);
                // debug logging to help diagnose uneditable input
                // eslint-disable-next-line no-console
                console.debug("NetworkOverlay ip change:", e.target.value);
              }}
              placeholder="Enter IP to ping..."
              className="flex-1 bg-[#1e1e1e] border border-gray-700 rounded px-3 py-2 text-sm outline-none pointer-events-auto"
            />
            <button
              onClick={async () => {
                const target = ip.trim();
                if (!target) return;
                // call backend via preload API to connect to device
                if (window.api?.connectDevice) {
                  try {
                    await window.api.connectDevice(target);
                  } catch (e) {
                    console.error("connectDevice failed:", e);
                  }
                } else {
                  // fallback to old behavior
                  pingByIp(target);
                }
                setIp("");

                // refresh connections list after attempting connect
                if (window.api?.getConnections) {
                  try {
                    const res = await window.api.getConnections();
                    if (res && res.success && Array.isArray(res.connections)) {
                      setConnectionsList(res.connections);
                    }
                  } catch (e) {
                    /* ignore */
                  }
                }
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

          <div className="text-xs text-gray-400">
            Connected peers ({connectionsList.length})
          </div>

          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-auto pr-1">
            {connectionsList.length === 0 ? (
              <div className="text-xs text-gray-500 p-2">No connections</div>
            ) : (
              connectionsList.map((c: any) => (
                <div
                  key={c.email || c.ip || c.id}
                  className="bg-[#2a2d2e] border border-[#3a3f41] rounded px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {c.name || c.email || c.ip}
                    </div>
                    <div className="text-xs text-gray-400">{c.ip}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
