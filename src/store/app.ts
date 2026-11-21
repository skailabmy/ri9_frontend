/* ============================================================
   RI9 · Global app state — the riverpod-equivalent layer.
   A single typed store, persisted to localStorage so it
   survives page navigation (multi-page app) and app restarts.
   Pages subscribe to slices of this store instead of keeping
   their own module-level singletons.

   NOTE: uses zustand/vanilla (framework-free createStore) —
   the default 'zustand' entry is the React binding and would
   pull in react, which this Capacitor app doesn't use.
   ============================================================ */
import { createStore } from 'zustand/vanilla';
import { persist } from 'zustand/middleware';

export type Role = 'kid' | 'school' | 'parent';

export interface DailyGoal {
  min: number;
  q: number;
}

interface AppState {
  /** Sound effects enabled (bridged with the page's SFX engine) */
  sfxOn: boolean;
  /** Signed-in role — drives route guards */
  role: Role | null;
  /** Daily goal target (minutes / questions) */
  goal: DailyGoal | null;
  setSfxOn: (on: boolean) => void;
  setRole: (role: Role | null) => void;
  setGoal: (goal: DailyGoal) => void;
}

export const appStore = createStore<AppState>()(
  persist(
    (set) => ({
      sfxOn: true,
      role: null,
      goal: null,
      setSfxOn: (sfxOn) => set({ sfxOn }),
      setRole: (role) => set({ role }),
      setGoal: (goal) => set({ goal }),
    }),
    {
      name: 'ri9-app', // localStorage key
    },
  ),
);

/** Convenience alias — vanilla store exposes the same
    getState()/setState()/subscribe() API surface. */
export const useAppStore = appStore;
