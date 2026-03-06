import { create } from "zustand";

interface GitState {
  overlayOpen: boolean;
  toggleOverlay: () => void;
  openOverlay: () => void;
  closeOverlay: () => void;
}

export const useGitStore = create<GitState>((set, get) => ({
  overlayOpen: false,
  toggleOverlay: () => set({ overlayOpen: !get().overlayOpen }),
  openOverlay: () => set({ overlayOpen: true }),
  closeOverlay: () => set({ overlayOpen: false }),
}));
