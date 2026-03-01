import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, PlugZap, Network } from "lucide-react";
import { useNetworkStore } from "../../store/networkStore";

interface ConnectionItem {
  id?: string;
  name?: string;
  ip?: string;
  email?: string;
}

export default function NetworkOverlay() {
  const { overlayOpen, closeOverlay, pingByIp } = useNetworkStore();

  const [ip, setIp] = useState("");
  const [q, setQ] = useState("");
  const [connectionsList, setConnectionsList] = useState<ConnectionItem[]>([]);
  const ipRef = useRef<HTMLInputElement | null>(null);

  const refreshConnections = useCallback(async () => {
    const getConnections = window.api?.getConnections;
    if (!getConnections) {
      setConnectionsList([]);
      return;
    }

    try {
      const res = await getConnections();
      if (res && res.success && Array.isArray(res.connections)) {
        setConnectionsList(res.connections as ConnectionItem[]);
      } else {
        setConnectionsList([]);
      }
    } catch {
      setConnectionsList([]);
    }
  }, []);

  const connectToIp = useCallback(async () => {
    const target = ip.trim();
    if (!target) return;

    if (window.api?.connectDevice) {
      try {
        await window.api.connectDevice(target);
      } catch (err) {
        console.error("connectDevice failed:", err);
      }
    } else {
      pingByIp(target);
    }

    setIp("");
    await refreshConnections();
  }, [ip, pingByIp, refreshConnections]);

  useEffect(() => {
    if (!overlayOpen) return;

    // initialize peer state once when overlay opens
    useNetworkStore.getState().initSelf();

    void refreshConnections();

    // focus input when overlay opens
    const timer = window.setTimeout(() => ipRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [overlayOpen, refreshConnections]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return connectionsList;
    return connectionsList.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(s) ||
        (p.ip ?? "").toLowerCase().includes(s) ||
        (p.email ?? "").toLowerCase().includes(s),
    );
  }, [q, connectionsList]);

  if (!overlayOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999]" onMouseDown={closeOverlay}>
      <div className="absolute inset-0 bg-black/40 z-0 pointer-events-none" />

      <div
        className="absolute top-0 left-0 h-full w-[520px] bg-[#252526] border-r border-gray-700 shadow-xl z-20 pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={(e) => e.stopPropagation()}
        onKeyUpCapture={(e) => e.stopPropagation()}
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
            Ping by IP. Try: <span className="text-gray-200">10.0.0.55</span>
          </div>

          <div className="flex items-center gap-2 relative z-30">
            <input
              ref={ipRef}
              type="text"
              autoFocus
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
              onKeyDown={async (e) => {
                e.stopPropagation();
                if (e.key !== "Enter") return;
                e.preventDefault();
                await connectToIp();
              }}
              placeholder="Enter IP to ping..."
              className="flex-1 min-w-0 bg-[#1a1a1a] text-white placeholder:text-gray-400 border border-gray-500 rounded px-3 py-2 text-sm outline-none pointer-events-auto focus:border-[#007acc] focus:ring-1 focus:ring-[#007acc]"
            />
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={async (e) => {
                e.stopPropagation();
                await connectToIp();
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
            Connected peers ({filtered.length})
          </div>

          <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-auto pr-1">
            {filtered.length === 0 ? (
              <div className="text-xs text-gray-500 p-2">No connections</div>
            ) : (
              filtered.map((c) => (
                <div
                  key={c.email || c.ip || c.id}
                  className="bg-[#2a2d2e] border border-[#3a3f41] rounded px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{c.name || c.email || c.ip}</div>
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
