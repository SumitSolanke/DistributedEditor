import { useState, useEffect } from "react";
import { Network, Send, RefreshCw } from "lucide-react";
import { useNetworkStore } from "../../store/networkStore";
import { useAuthStore } from "../../store/authStore";

export default function NetworkPanel() {
  const {
    connections,
    pingTargetIp,
    setPingTargetIp,
    requestConnectionToPeer,
    wsClient,
    isConnecting,
  } = useNetworkStore();

  const currentUser = useAuthStore((s) => s.currentUser);
  const [inputIp, setInputIp] = useState("");

  useEffect(() => {
    setPingTargetIp("");
  }, []);

  const handlePing = () => {
    if (!inputIp.trim()) {
      alert("Please enter an IP address");
      return;
    }

    if (!wsClient?.isConnected()) {
      alert("WebSocket not connected. Please connect first.");
      return;
    }

    requestConnectionToPeer(inputIp.trim());
    setInputIp("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePing();
    }
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive ? "bg-green-500" : "bg-gray-500";
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-[#252526]">
        <div className="flex items-center gap-2 mb-4">
          <Network size={16} className="text-blue-400" />
          <span className="text-sm font-semibold">Network</span>
        </div>

        {/* Ping Input */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400">Connect to Peer IP</label>
          <div className="flex gap-2">
            <input
              value={inputIp}
              onChange={(e) => setInputIp(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="192.168.1.x"
              className="flex-1 bg-[#1e1e1e] border border-gray-700 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
            />
            <button
              onClick={handlePing}
              disabled={isConnecting || !wsClient?.isConnected()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded px-3 py-1 text-xs font-medium flex items-center gap-1"
            >
              <Send size={12} />
              Ping
            </button>
          </div>

          {!wsClient?.isConnected() && (
            <div className="text-xs text-yellow-400 bg-yellow-500/10 p-2 rounded">
              ⚠ WebSocket not connected
            </div>
          )}
        </div>
      </div>

      {/* Connections List */}
      <div className="flex-1 overflow-y-auto">
        {connections.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-gray-500">No connections yet</p>
            <p className="text-xs text-gray-600 mt-1">
              Ping another peer to establish connection
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="bg-[#252526] border border-gray-700 rounded p-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <div className="font-semibold text-white">{conn.name}</div>
                    <div className="text-gray-400">{conn.email}</div>
                    <div className="text-gray-500 text-xs mt-1">
                      {conn.ipAddress}
                    </div>
                  </div>
                  <div
                    className={`w-3 h-3 rounded-full ${getStatusColor(conn.isActive)}`}
                    title={conn.isActive ? "Active" : "Inactive"}
                  />
                </div>

                <div className="text-gray-500 text-xs">
                  Last seen: {formatTime(conn.lastPingTime)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Footer */}
      <div className="p-3 border-t border-gray-700 bg-[#252526] text-xs text-gray-500">
        <div className="flex justify-between">
          <span>Connected: {connections.filter((c) => c.isActive).length}</span>
          <span>Total: {connections.length}</span>
        </div>
        {currentUser && (
          <div className="mt-2 text-gray-600">
            You: {currentUser.name} ({currentUser.ipAddress})
          </div>
        )}
      </div>
    </div>
  );
}
