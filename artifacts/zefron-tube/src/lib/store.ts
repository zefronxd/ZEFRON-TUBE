import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Video } from "./api";

export interface HistoryItem {
  id: string;
  title: string;
  channelName: string;
  thumbnail: string;
  youtubeUrl: string;
  durationSeconds: number;
  watchedAt: number;
  watchedSeconds: number;
}

export type PlayerMode = "hidden" | "full" | "mini";

export interface PlayerState {
  video: Video | null;
  mode: PlayerMode;
  position: number;
  refetchKey: number;
}

export interface DetectedLocationLite {
  countryCode: string;
  countryName: string;
  region: string;
  city: string;
  language: string;
  languageName: string;
}

interface ZefronState {
  theme: "light" | "dark";
  history: HistoryItem[];
  liked: HistoryItem[];
  player: PlayerState;
  languagePref: string;
  detectedLocation: DetectedLocationLite | null;
  detectedAt: number;
  setTheme: (t: "light" | "dark") => void;
  toggleTheme: () => void;
  setLanguagePref: (lang: string) => void;
  setDetectedLocation: (loc: DetectedLocationLite | null) => void;
  pushHistory: (item: Omit<HistoryItem, "watchedAt">) => void;
  clearHistory: () => void;
  toggleLike: (item: Omit<HistoryItem, "watchedAt" | "watchedSeconds">) => void;
  isLiked: (id: string) => boolean;
  playVideo: (v: Video) => void;
  setPlayer: (m: Partial<PlayerState>) => void;
  closePlayer: () => void;
  refetchStream: () => void;
}

export const useZefron = create<ZefronState>()(
  persist(
    (set, get) => ({
      theme: "light",
      history: [],
      liked: [],
      player: { video: null, mode: "hidden", position: 0, refetchKey: 0 },
      languagePref: "auto",
      detectedLocation: null,
      detectedAt: 0,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setLanguagePref: (languagePref) => set({ languagePref }),
      setDetectedLocation: (detectedLocation) =>
        set({ detectedLocation, detectedAt: detectedLocation ? Date.now() : 0 }),
      pushHistory: (item) => {
        const watchedAt = Date.now();
        const filtered = get().history.filter((h) => h.id !== item.id);
        set({ history: [{ ...item, watchedAt }, ...filtered].slice(0, 100) });
      },
      clearHistory: () => set({ history: [] }),
      toggleLike: (item) => {
        const exists = get().liked.find((l) => l.id === item.id);
        if (exists) {
          set({ liked: get().liked.filter((l) => l.id !== item.id) });
        } else {
          set({ liked: [{ ...item, watchedAt: Date.now(), watchedSeconds: 0 }, ...get().liked] });
        }
      },
      isLiked: (id) => get().liked.some((l) => l.id === id),
      playVideo: (v) => {
        const cur = get().player;
        if (cur.video?.id === v.id) {
          set({ player: { ...cur, mode: "full" } });
          return;
        }
        set({ player: { video: v, mode: "full", position: 0, refetchKey: 0 } });
      },
      setPlayer: (m) => set({ player: { ...get().player, ...m } }),
      closePlayer: () => set({ player: { video: null, mode: "hidden", position: 0, refetchKey: 0 } }),
      refetchStream: () => set({ player: { ...get().player, refetchKey: get().player.refetchKey + 1 } }),
    }),
    {
      name: "zefron-tube-v1",
      partialize: (s) => ({
        theme: s.theme,
        history: s.history,
        liked: s.liked,
        languagePref: s.languagePref,
        detectedLocation: s.detectedLocation,
        detectedAt: s.detectedAt,
      }),
    },
  ),
);

export function useApplyTheme() {
  const theme = useZefron((s) => s.theme);
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}
