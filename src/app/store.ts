import { create } from "zustand";
import type { AppView, LocalSettings, SessionState } from "../types";
import { defaultSettings } from "../lib/storage/settings";

interface AppStoreState {
  view: AppView;
  detailId: string | null;
  typePickerOpen: boolean;
  mapSheetOpen: boolean;
  session: SessionState | null;
  settings: LocalSettings;
  setView: (view: AppView) => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  setTypePickerOpen: (open: boolean) => void;
  setMapSheetOpen: (open: boolean) => void;
  setSession: (session: SessionState | null) => void;
  setSettings: (settings: LocalSettings) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  view: "home",
  detailId: null,
  typePickerOpen: false,
  mapSheetOpen: false,
  session: null,
  settings: defaultSettings,
  setView: (view) => set({ view }),
  openDetail: (detailId) => set({ detailId }),
  closeDetail: () => set({ detailId: null }),
  setTypePickerOpen: (typePickerOpen) => set({ typePickerOpen }),
  setMapSheetOpen: (mapSheetOpen) => set({ mapSheetOpen }),
  setSession: (session) => set({ session }),
  setSettings: (settings) => set({ settings }),
}));
