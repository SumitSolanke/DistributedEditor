import { create } from "zustand"
import type { ChatMessage, ChatTab, DMThread, LineRef } from "../types/chat.types"
import { useAuthStore } from "./authStore"
import { useMembersStore } from "./membersStore"

const id = () => Math.random().toString(36).slice(2, 10)

function containsMention(text: string, name: string) {
  const n = name.trim()
  if (!n) return false
  return text.toLowerCase().includes(`@${n.toLowerCase()}`)
}

interface ChatState {
  tab: ChatTab
  setTab: (tab: ChatTab) => void

  // public
  publicMessages: ChatMessage[]
  sendPublic: (text: string, lineRef?: LineRef) => void

  // ✅ DM is now derived from project members
  selectedDmUserId: string | null
  selectDmUser: (userId: string) => void
  dmThreads: Record<string, DMThread>
  sendDm: (toUserId: string, text: string, lineRef?: LineRef) => void

  // typing
  typingUser: string | null

  // notifications/unread
  unreadPublic: number
  unreadDm: Record<string, number>
  markPublicRead: () => void
  markDmRead: (userId: string) => void

  // toast
  toastOpen: boolean
  toastMessage: string
  showToast: (msg: string) => void
  hideToast: () => void

  // ✅ helper for UI to get DM users list
  getDmUsers: () => { userId: string; userName: string; online: boolean }[]
}

export const useChatStore = create<ChatState>((set, get) => ({
  tab: "public",
  setTab: (tab) => set({ tab }),

  publicMessages: [],

  selectedDmUserId: null,
  selectDmUser: (userId) => set({ selectedDmUserId: userId }),

  dmThreads: {},
  typingUser: null,

  unreadPublic: 0,
  unreadDm: {},

  markPublicRead: () => set({ unreadPublic: 0 }),
  markDmRead: (userId) =>
    set({
      unreadDm: { ...get().unreadDm, [userId]: 0 },
    }),

  toastOpen: false,
  toastMessage: "",
  showToast: (msg) => set({ toastOpen: true, toastMessage: msg }),
  hideToast: () => set({ toastOpen: false, toastMessage: "" }),

  // ✅ DM USERS derived from membersStore
  getDmUsers: () => {
    const me = useAuthStore.getState().user
    const members = useMembersStore.getState().members

    // must be registered
    if (!me) return []

    return members
      .filter((m) => m.id !== "me") // exclude self
      .map((m) => ({
        userId: m.id,
        userName: m.name,
        online: m.online,
      }))
  },

  sendPublic: (text, lineRef) => {
    const me = useAuthStore.getState().user
    if (!me) return

    const msg: ChatMessage = {
      id: id(),
      from: me.name,
      text,
      createdAt: Date.now(),
      lineRef,
    }

    set({ publicMessages: [...get().publicMessages, msg] })
  },

  sendDm: (toUserId, text, lineRef) => {
    const me = useAuthStore.getState().user
    if (!me) return

    // ✅ only allow DM to project members
    const allowed = useMembersStore.getState().members.some((m) => m.id === toUserId)
    if (!allowed) {
      get().showToast("This user is not a project member.")
      return
    }

    const dmUsers = get().getDmUsers()
    const otherName = dmUsers.find((u) => u.userId === toUserId)?.userName || "User"

    const thread =
      get().dmThreads[toUserId] || {
        userId: toUserId,
        userName: otherName,
        messages: [],
      }

    const msg: ChatMessage = {
      id: id(),
      from: me.name,
      text,
      createdAt: Date.now(),
      lineRef,
    }

    set({
      dmThreads: {
        ...get().dmThreads,
        [toUserId]: { ...thread, messages: [...thread.messages, msg] },
      },
    })

    // ✅ fake incoming reply (unread + toast)
    setTimeout(() => {
      const replyText =
        Math.random() > 0.5
          ? `@${me.name} I checked. Looks okay ✅`
          : "Got it 👍 I'll check."

      const reply: ChatMessage = {
        id: id(),
        from: otherName,
        text: replyText,
        createdAt: Date.now(),
      }

      const state = get()
      const isDmOpen = state.tab === "private" && state.selectedDmUserId === toUserId

      const prevUnread = state.unreadDm[toUserId] || 0
      const nextUnread = isDmOpen ? 0 : prevUnread + 1

      set({
        dmThreads: {
          ...state.dmThreads,
          [toUserId]: {
            ...thread,
            messages: [...thread.messages, msg, reply],
          },
        },
        unreadDm: { ...state.unreadDm, [toUserId]: nextUnread },
        typingUser: null,
      })

      if (!isDmOpen) {
        const mention = containsMention(reply.text, me.name)
        state.showToast(
          mention ? `${otherName} mentioned you in DM` : `New message from ${otherName}`
        )
      }
    }, 1200)
  },
}))