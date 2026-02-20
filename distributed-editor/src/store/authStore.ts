import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Permissions, Role, User } from "../types/auth.types"

interface AuthState {
  user: User | null
  isRegistered: boolean
  permissions: Permissions

  register: (payload: { name: string; ip: string; email: string }) => void
  logout: () => void
  reset: () => void
  setRole: (role: Role) => void
}

const getPermissions = (role: Role): Permissions => {
  if (role === "owner") return { canAddMember: true, canRemoveMember: true, canChangeRole: true }
  if (role === "admin") return { canAddMember: true, canRemoveMember: true, canChangeRole: true }
  if (role === "member") return { canAddMember: false, canRemoveMember: false, canChangeRole: false }
  return { canAddMember: false, canRemoveMember: false, canChangeRole: false }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isRegistered: false,
      permissions: getPermissions("viewer"),

      register: ({ name, ip, email }) => {
        const newUser: User = {
          id: "me",
          name: name.trim(),
          role: "owner",
          ip: ip.trim(),
          email: email.trim(),
        }

        set({
          user: newUser,
          isRegistered: true,
          permissions: getPermissions(newUser.role),
        })
      },

      logout: () =>
        set({
          user: null,
          isRegistered: false,
          permissions: getPermissions("viewer"),
        }),

      // ✅ IMPORTANT: clears persisted old data
      reset: () => {
        localStorage.removeItem("dce-auth")
        set({
          user: null,
          isRegistered: false,
          permissions: getPermissions("viewer"),
        })
      },

      setRole: (role) => {
        const u = get().user
        if (!u) return
        const updated: User = { ...u, role }
        set({ user: updated, permissions: getPermissions(role) })
      },
    }),
    {
      name: "dce-auth",

      // ✅ IMPORTANT: when old storage loads, recompute permissions from role
      onRehydrateStorage: () => (state) => {
        if (!state?.user) return
        state.permissions = getPermissions(state.user.role)
      },
    }
  )
)