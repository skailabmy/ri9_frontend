/* ============================================================
   RI9 · HOME SCREEN entry (kid dashboard).
   Order: guard → session gate (splash) → page logic → store bridge.
   The markup lives in the root index.html; home.css is loaded via
   <link> in its <head> (before first paint — avoids any unstyled
   flash); this module adds behavior only.

   Session gate (ported from the Flutter HomeScreen): a white
   splash covers the screen while login + /me + subjects resolve,
   the fetched values are injected as window.RI9_* globals, then
   the splash is lifted and mount() builds the UI from them.
   ============================================================ */
import { boot } from '../../router';
import { mount } from './home.behavior';
import { useAppStore } from '../../store/app';
import {
  ensureSession,
  effectiveCoinBalance,
  fetchUserStreak,
  fetchSubjects,
  type Subject,
  type User,
} from '../../api/auth';

// Guard is a no-op for now; when auth lands, lock it down:
// boot({ page: 'home', roles: ['kid'] })

/* ---------- first-run onboarding gate ----------
   First-time visitors are sent to the 4-step walkthrough
   (onboarding.html) before anything mounts. The flag lives in
   localStorage (`ri9_walkthrough` = 'done', written by
   onboarding.ts on finish/skip) — plain localStorage persists
   per-app in the Capacitor WebView on both iOS (WKWebView) and
   Android (WebView), surviving restarts. */
const onboardingSeen = ((): boolean => {
  try { return localStorage.getItem('ri9_walkthrough') === 'done' } catch { return false }
})();

if (onboardingSeen) {
  boot({ page: 'home' });
} else {
  location.replace('onboarding.html');
}

// OTA (native only — no-op in browser/dev)
import { initOta } from '../../ota';
initOta();

/* ---------- session gate: white splash → login → live data ----------
   Demo credentials for now — replaced by the real login screen later. */
const DEMO_USERNAME = 'test';
const DEMO_PASSWORD = '123456';

/** Card shape consumed by home.behavior.js's carousel builder.
    avg/tr stay null until the daily-averages endpoint is wired —
    the gauge then renders an em-dash with a resting needle. */
interface CarouselSubject {
  name: string;
  q: number;
  avg: number | null;
  tr: number | null;
  ico: string | null;
  icon: string | null;
}

declare global {
  interface Window {
    /** Real coin balance, revealed only via the eye toggle
        (read by home.behavior.js when the wallet is un-masked) */
    RI9_BALANCE?: number;
    /** Subjects for the carousel (window.RI9_SUBJECTS), from
        /api/v1/subjects — Flutter: homeScreenSubjectsProvider */
    RI9_SUBJECTS?: CarouselSubject[];
  }
}

function setStreak(value: number): void {
  const streakEl = document.getElementById('streakN');
  if (streakEl) streakEl.textContent = String(value);
}

function applyUser(user: User, streak: number | null): void {
  // Streak pill (Flutter: StreakWidget(days: '${user.streak ?? 0} Days'))
  setStreak(streak ?? user.streakActivity ?? 0);

  // Coin balance stays MASKED ('****') like the reference prototype —
  // the real value is cached here and only shown when the user taps
  // the eye (home.behavior.js reads window.RI9_BALANCE on toggle).
  window.RI9_BALANCE = effectiveCoinBalance(user);
}

function applySubjects(subjects: Subject[]): void {
  window.RI9_SUBJECTS = subjects.map((s) => ({
    name: s.name,
    q: s.questionCount,
    avg: null, // daily-subject-averages endpoint — not wired yet
    tr: null, // trend comes with the averages endpoint too
    ico: null, // API gives icon_url images, not inline SVGs
    icon: s.iconUrl ?? null,
  }));
}

/* ---------- bridge: page SFX toggle ↔ persisted Zustand store ----------
   The prototype exposes its SFX engine as window.SFX. Keep the global
   store (riverpod-style single source of truth) in sync in both
   directions without touching the page's UI code. */
type SfxEngine = { on: boolean; set(v: boolean): void };

function bridgeSfx(): void {
  const SFX = (window as unknown as { SFX?: SfxEngine }).SFX;
  if (!SFX) return;
  const { sfxOn, setSfxOn } = useAppStore.getState();

  // hydrate engine from store (e.g. changed on another page)
  if (SFX.on !== sfxOn) SFX.set(sfxOn);

  // wrap the engine's setter so page toggles update the store
  const origSet = SFX.set.bind(SFX);
  SFX.set = (v: boolean) => {
    origSet(v);
    useAppStore.getState().setSfxOn(v);
  };
}

if (onboardingSeen) void (async () => {
  const splash = document.getElementById('boot');
  try {
    // force=true: a stale cached token could belong to a different
    // account — always re-login with the demo credentials.
    const user = await ensureSession(DEMO_USERNAME, DEMO_PASSWORD, true);
    // These must run AFTER ensureSession or they 401 (no token yet).
    const [streak, subjects] = await Promise.all([
      user
        ? fetchUserStreak().catch(() => null) // /user/streak — Flutter: user_streak_repository
        : Promise.resolve(null),
      user
        ? fetchSubjects(3).catch(() => null) // /subjects — Flutter: homeScreenSubjectsProvider
        : Promise.resolve(null),
    ]);
    if (user) applyUser(user, streak);
    if (subjects) applySubjects(subjects);
  } finally {
    // Run the prototype logic (SFX engine, carousel, goal rings, dock nav)
    // AFTER the data lands, while the splash still covers the screen.
    mount();
    bridgeSfx();
    // Lift the white splash even if the API is unreachable —
    // the dashboard falls back to the prototype's mock values.
    splash?.remove();
  }
})();
