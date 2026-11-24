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
import type { LeaderboardSummary, SummaryPeriod } from '../api/leaderboard';

/** Subject carousel card consumed by home.behavior.js — the mapped
    shape of GET /api/v2/user/subject-stats (gauge avg speed, weekly
    "Xs faster" trend; ico is the inline SVG fallback, icon an img URL). */
export interface HomeSubject {
  name: string;
  q: number;
  avg: number | null;
  tr: number | null;
  ico: string | null;
  icon: string | null;
}

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
  /** Signed-in kid's display name (profile API; persisted so the
      lobby's your-rank bar paints correctly before the API answers) */
  meName: string | null;
  /** Challenge lobby's live board period ('today' | 'week') — the
      lobby's segment toggle writes it; challenge.ts subscribes and
      re-fetches the summary when it changes (never persisted) */
  lbPeriod: SummaryPeriod;
  /** Live leaderboard summary (top-3 podium + user standing) —
      ephemeral, always re-fetched per page load */
  lbSummary: LeaderboardSummary | null;
  /** Subject carousel data for the home screen (mapped from
      /api/v2/user/subject-stats — ephemeral, re-fetched per load) */
  subjects: HomeSubject[] | null;
  /** Real coin balance for the home wallet (masked '****' until the
      eye toggle reveals it — ephemeral, re-fetched per load) */
  coinBalance: number | null;
  /** Monotonic counter incremented on every toast request — lets the
      same message fire twice (the page's toast popup subscribes to
      this, since a plain message compare would dedupe repeats) */
  toastSeq: number;
  /** Last toast message shown (paired with toastSeq) */
  toastMsg: string | null;
  setSfxOn: (on: boolean) => void;
  setRole: (role: Role | null) => void;
  setGoal: (goal: DailyGoal) => void;
  setMeName: (name: string | null) => void;
  setLbPeriod: (period: SummaryPeriod) => void;
  setLbSummary: (summary: LeaderboardSummary | null) => void;
  setSubjects: (subjects: HomeSubject[] | null) => void;
  setCoinBalance: (balance: number | null) => void;
  showToast: (msg: string) => void;
}

export const appStore = createStore<AppState>()(
  persist(
    (set) => ({
      sfxOn: true,
      role: null,
      goal: null,
      meName: null,
      lbPeriod: 'today',
      lbSummary: null,
      subjects: null,
      coinBalance: null,
      toastSeq: 0,
      toastMsg: null,
      setSfxOn: (sfxOn) => set({ sfxOn }),
      setRole: (role) => set({ role }),
      setGoal: (goal) => set({ goal }),
      setMeName: (meName) => set({ meName }),
      setLbPeriod: (lbPeriod) => set({ lbPeriod }),
      setLbSummary: (lbSummary) => set({ lbSummary }),
      setSubjects: (subjects) => set({ subjects }),
      setCoinBalance: (coinBalance) => set({ coinBalance }),
      showToast: (toastMsg) => set((s) => ({ toastMsg, toastSeq: s.toastSeq + 1 })),
    }),
    {
      name: 'ri9-app', // localStorage key
      /** Only durable slices persist — the live leaderboard data
          must be re-fetched on every page load. */
      partialize: (s) => ({ sfxOn: s.sfxOn, role: s.role, goal: s.goal, meName: s.meName }),
    },
  ),
);

/** Convenience alias — vanilla store exposes the same
    getState()/setState()/subscribe() API surface. */
export const useAppStore = appStore;
