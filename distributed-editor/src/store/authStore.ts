import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Permissions, Role, User as AuthUser } from "../types/auth.types";
import type { User } from "../types/user.types";
import { electronStoreAPI } from "../utils/electronStore";

interface AuthState {
  user: AuthUser | null;
  currentUser: User | null; // New user type with name, ipAddress, email
  isRegistered: boolean;
  permissions: Permissions;
  isLoading: boolean;

  register: (payload: {
    name: string;
    ip: string;
    email: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  reset: () => Promise<void>;
  setRole: (role: Role) => void;
  loadUserFromElectronStore: () => Promise<void>;
}

const getPermissions = (role: Role): Permissions => {
  if (role === "owner")
    return { canAddMember: true, canRemoveMember: true, canChangeRole: true };
  if (role === "admin")
    return { canAddMember: true, canRemoveMember: true, canChangeRole: true };
  if (role === "member")
    return {
      canAddMember: false,
      canRemoveMember: false,
      canChangeRole: false,
    };
  return { canAddMember: false, canRemoveMember: false, canChangeRole: false };
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      currentUser: null,
      isRegistered: false,
      permissions: getPermissions("viewer"),
      isLoading: false,

      register: async ({ name, ip, email }) => {
        set({ isLoading: true });
        try {
          const newUser: AuthUser = {
            id: "me",
            name: name.trim(),
            role: "owner",
            ip: ip.trim(),
            email: email.trim(),
          };

          const electronUser: User = {
            name: name.trim(),
            ipAddress: ip.trim(),
            email: email.trim(),
            id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          };

          // Save to Electron store
          await electronStoreAPI.setUser(electronUser);

          set({
            user: newUser,
            currentUser: electronUser,
            isRegistered: true,
            permissions: getPermissions(newUser.role),
            isLoading: false,
          });
        } catch (error) {
          console.error("Failed to register:", error);
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try {
          await electronStoreAPI.clearAllData();
          set({
            user: null,
            currentUser: null,
            isRegistered: false,
            permissions: getPermissions("viewer"),
          });
        } catch (error) {
          console.error("Failed to logout:", error);
        }
      },

      reset: async () => {
        try {
          localStorage.removeItem("dce-auth");
          await electronStoreAPI.clearAllData();
          set({
            user: null,
            currentUser: null,
            isRegistered: false,
            permissions: getPermissions("viewer"),
          });
        } catch (error) {
          console.error("Failed to reset:", error);
        }
      },

      setRole: (role) => {
        const u = get().user;
        if (!u) return;
        const updated: AuthUser = { ...u, role };
        set({ user: updated, permissions: getPermissions(role) });
      },

      loadUserFromElectronStore: async () => {
        set({ isLoading: true });
        try {
          const electronUser = await electronStoreAPI.getUser();
          if (electronUser) {
            set({
              currentUser: electronUser,
              isRegistered: true,
              isLoading: false,
            });
          } else {
            set({ isLoading: false });
          }
        } catch (error) {
          console.error("Failed to load user from Electron store:", error);
          set({ isLoading: false });
        }
      },
    }),
    {
      name: "dce-auth",

      onRehydrateStorage: () => (state) => {
        if (!state?.user) return;
        state.permissions = getPermissions(state.user.role);
      },
    },
  ),
);
