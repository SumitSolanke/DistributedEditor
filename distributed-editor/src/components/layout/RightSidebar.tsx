import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Hash, Lock, Link2, Search, Network } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useEditorStore } from "../../store/editorStore";
import { useAuthStore } from "../../store/authStore";
import type { ChatMessage } from "../../types/chat.types";
import Toast from "../ui/Toast";
import NetworkPanel from "../network/NetworkPanel";
import { useNetworkStore } from "../../store/networkStore";

const formatTime = (ms: number) => {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

function highlightMentions(text: string, me: string) {
  const token = `@${me}`;
  const idx = text.toLowerCase().indexOf(token.toLowerCase());
  if (idx === -1) return <span>{text}</span>;

  const before = text.slice(0, idx);
  const hit = text.slice(idx, idx + token.length);
  const after = text.slice(idx + token.length);

  return (
    <span>
      {before}
      <span className="px-1 rounded bg-yellow-500/20 border border-yellow-600/40 text-yellow-200">
        {hit}
      </span>
      {after}
    </span>
  );
}

export default function RightSidebar({ isOpen }: { isOpen: boolean }) {
  const {
    tab,
    setTab,
    publicMessages,
    sendPublic,

    selectedDmUserId,
    selectDmUser,
    dmThreads,
    sendDm,

    typingUser,
    unreadPublic,
    unreadDm,
    markPublicRead,
    markDmRead,

    toastOpen,
    toastMessage,
    hideToast,

    getDmUsers,
  } = useChatStore();

  const overlayOpen = useNetworkStore((s) => s.overlayOpen);

  const dmUsers = getDmUsers();

  const { user } = useAuthStore();
  const { activeFileId, cursor, revealInEditor } = useEditorStore();

  const [text, setText] = useState("");
  const [attachLine, setAttachLine] = useState(false);
  const [q, setQ] = useState("");
  const [localTab, setLocalTab] = useState<"public" | "private" | "network">(
    tab as "public" | "private" | "network",
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const currentDmThread = useMemo(() => {
    if (!selectedDmUserId) return null;
    const other = dmUsers.find((u) => u.userId === selectedDmUserId);
    return (
      dmThreads[selectedDmUserId] || {
        userId: selectedDmUserId,
        userName: other?.userName || "User",
        messages: [],
      }
    );
  }, [selectedDmUserId, dmThreads, dmUsers]);

  const baseMessages =
    tab === "public" ? publicMessages : currentDmThread?.messages || [];

  const messages = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return baseMessages;
    return baseMessages.filter(
      (m) =>
        m.text.toLowerCase().includes(s) || m.from.toLowerCase().includes(s),
    );
  }, [baseMessages, q]);

  // mark read when open
  useEffect(() => {
    if (!isOpen) return;
    if (tab === "public") {
      if (unreadPublic > 0) markPublicRead();
    } else {
      if (selectedDmUserId && (unreadDm[selectedDmUserId] || 0) > 0) {
        markDmRead(selectedDmUserId);
      }
    }
  }, [
    isOpen,
    tab,
    selectedDmUserId,
    unreadPublic,
    unreadDm,
    markPublicRead,
    markDmRead,
  ]);

  // auto scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, typingUser, tab, selectedDmUserId]);

  // inject animation CSS once
  useEffect(() => {
    const styleId = "chat-animation-style";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
      .chat-fade { animation: fadeInUp 0.25s ease-out; }
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  if (!isOpen) return null;

  const meName = user?.name ?? "Guest";

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const lineRef =
      attachLine && activeFileId
        ? { fileId: activeFileId, line: cursor.line }
        : undefined;

    if (tab === "public") {
      sendPublic(trimmed, lineRef);
    } else {
      if (!selectedDmUserId) return;
      sendDm(selectedDmUserId, trimmed, lineRef);
    }

    setText("");
    setAttachLine(false);
  };

  return (
    <>
      <Toast open={toastOpen} message={toastMessage} onClose={hideToast} />

      <div
        className={`w-full h-full flex flex-col bg-[#1f1f1f] text-white overflow-hidden ${
          overlayOpen && localTab === "network" ? "z-[10000]" : ""
        }`}
      >
        {/* HEADER */}
        <div className="border-b border-gray-700 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setTab("public");
                setLocalTab("public");
              }}
              className={`text-xs px-2 py-1 rounded flex items-center gap-2 border ${
                localTab === "public"
                  ? "bg-[#2a2d2e] border-gray-600"
                  : "border-transparent hover:bg-[#2a2d2e]"
              }`}
            >
              <Hash size={14} /> Public
              {unreadPublic > 0 && (
                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-red-600">
                  {unreadPublic}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setTab("private");
                setLocalTab("private");
              }}
              className={`text-xs px-2 py-1 rounded flex items-center gap-2 border ${
                localTab === "private"
                  ? "bg-[#2a2d2e] border-gray-600"
                  : "border-transparent hover:bg-[#2a2d2e]"
              }`}
            >
              <Lock size={14} /> Private
            </button>

            <button
              onClick={() => {
                setTab("network");
                setLocalTab("network");
              }}
              className={`text-xs px-2 py-1 rounded flex items-center gap-2 border ${
                localTab === "network"
                  ? "bg-[#2a2d2e] border-gray-600"
                  : "border-transparent hover:bg-[#2a2d2e]"
              }`}
            >
              <Network size={14} /> Network
            </button>
          </div>

          <div className="text-xs text-gray-400">
            {localTab === "public"
              ? "Project Channel"
              : localTab === "private"
                ? selectedDmUserId
                  ? `DM: ${currentDmThread?.userName}`
                  : "Direct Messages"
                : "Network Peers"}
          </div>
        </div>

        {/* SEARCH */}
        {localTab !== "network" && (
          <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
            <Search size={16} className="text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full bg-[#2a2d2e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
              placeholder="Search messages..."
            />
          </div>
        )}

        {/* BODY */}
        {localTab === "network" ? (
          <NetworkPanel />
        ) : (
          <div className="flex-1 min-h-0 flex">
            {/* DM LIST */}
            {tab === "private" && (
              <div className="w-44 border-r border-gray-700 bg-[#181818] overflow-auto">
                <div className="px-3 py-2 text-[11px] uppercase text-gray-400">
                  Project Members
                </div>

                {dmUsers.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    No project members yet.
                  </div>
                )}

                {dmUsers.map((u) => {
                  const n = unreadDm[u.userId] || 0;
                  return (
                    <button
                      key={u.userId}
                      onClick={() => {
                        selectDmUser(u.userId);
                        if (n > 0) markDmRead(u.userId);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-[#2a2d2e] ${
                        selectedDmUserId === u.userId ? "bg-[#2a2d2e]" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              u.online ? "bg-green-500" : "bg-gray-500"
                            }`}
                          />
                          <span>{u.userName}</span>
                        </div>

                        {n > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600">
                            {n}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* MESSAGES */}
            <div
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-auto p-3 space-y-3"
            >
              {tab === "private" && !selectedDmUserId ? (
                <div className="h-full flex items-center justify-center text-gray-400">
                  Select a project member to start private chat
                </div>
              ) : (
                <>
                  {messages.map((m: ChatMessage) => {
                    const lineRef = m.lineRef;
                    const isMe = m.from === meName;

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col chat-fade ${
                          isMe ? "items-end" : "items-start"
                        }`}
                      >
                        <div className="text-[11px] text-gray-400 px-1">
                          {m.from} • {formatTime(m.createdAt)}
                        </div>

                        <div
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm border ${
                            isMe
                              ? "bg-[#2a4b6b] border-[#2d5c86]"
                              : "bg-[#2a2d2e] border-[#3a3f41]"
                          }`}
                        >
                          {lineRef && (
                            <button
                              onClick={() =>
                                revealInEditor(lineRef.fileId, lineRef.line)
                              }
                              className="mb-2 inline-flex items-center gap-2 text-xs px-2 py-1 rounded bg-[#1f1f1f] border border-gray-700 hover:bg-[#262626]"
                              title="Jump to code"
                            >
                              <Link2 size={14} />
                              Line {lineRef.line}
                            </button>
                          )}

                          <div className="whitespace-pre-wrap">
                            {highlightMentions(m.text, meName)}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {typingUser && tab === "private" && selectedDmUserId && (
                    <div className="text-xs text-gray-400 italic px-1">
                      {typingUser} is typing...
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* COMPOSER */}
        {localTab !== "network" && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setAttachLine((s) => !s)}
                className={`text-xs px-2 py-1 rounded border ${
                  attachLine
                    ? "bg-[#2a2d2e] border-gray-600"
                    : "border-gray-700 hover:bg-[#2a2d2e]"
                }`}
                disabled={!activeFileId}
              >
                {activeFileId
                  ? `Attach line (Ln ${cursor.line})`
                  : "Open file to attach line"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                className="flex-1 bg-[#2a2d2e] border border-gray-700 rounded px-3 py-2 text-sm outline-none"
                placeholder={
                  tab === "public" ? "Message #public..." : "Message (DM)..."
                }
              />

              <button
                onClick={handleSend}
                className="p-2 rounded bg-[#007acc] hover:opacity-90"
                title="Send"
              >
                <Send size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
