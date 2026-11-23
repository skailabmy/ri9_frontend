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
import { mountPullToRefresh } from '../../utils/pullToRefresh';
import {
  ensureSession,
  effectiveCoinBalance,
  fetchUserStreak,
  fetchSubjects,
  type Subject,
  type User,
} from '../../api/auth';
import { ApiError } from '../../api/client';

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
    /** Page toast (same pattern as profile.behavior.js) — set by
        mount() in home.behavior.js, used to surface API failures */
    toast?(msg: string): void;
  }
}

/** Same message extraction as profile.behavior.js's pickErrMsg:
    prefer the server's message, fall back to a friendly default. */
function pickErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message ? e.message : fallback;
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

  // Pull-to-refresh path: the wallet may already be REVEALED (class
  // 'on' is toggled by home.behavior.js's showBal/hideBal). Repaint
  // the live number in place; when masked, the eye toggle simply
  // reads the fresh window.RI9_BALANCE next time.
  const bal = document.getElementById('bal');
  if (booted && user && bal?.classList.contains('on')) {
    bal.textContent = effectiveCoinBalance(user).toLocaleString();
  }
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

/* ---------- load (or reload) the dashboard's API data ----------
   Runs once during boot behind the splash, and again on every
   pull-to-refresh. On refresh the splash is gone, so results are
   painted straight onto the live DOM:
   - streak pill (#streakN) and the revealed wallet number update in place
   - window.RI9_SUBJECTS / window.RI9_BALANCE always carry fresh values
   The subject carousel itself is NOT rebuilt (its cards, gauges and
   drag physics are baked by mount()) — subject changes show up on the
   next page load; everything else is live. */
let booted = false;

async function loadDashboard(): Promise<void> {
  const splash = document.getElementById('boot');
  let loginError: unknown = null;
  let dataError: unknown = null;
  try {
    // force=true: a stale cached token could belong to a different
    // account — always re-login with the demo credentials.
    // ensureSession never throws (returns null on failure) — the raw
    // error arrives via the onError callback instead.
    const user = await ensureSession(
      DEMO_USERNAME,
      DEMO_PASSWORD,
      true,
      (e) => { loginError = e; },
    );
    // These must run AFTER ensureSession or they 401 (no token yet).
    const [streak, subjects] = user
      ? await Promise.all([
          // /user/streak — Flutter: user_streak_repository
          fetchUserStreak().catch((e) => { dataError ??= e; return null; }),
          // /subjects — Flutter: homeScreenSubjectsProvider
          fetchSubjects(3).catch((e) => { dataError ??= e; return null; }),
        ])
      : [null, null];
    if (user) applyUser(user, streak);
    if (subjects) applySubjects(subjects);
  } finally {
    if (!booted) {
      booted = true;
      // Run the prototype logic (SFX engine, carousel, goal rings, dock
      // nav) AFTER the data lands, while the splash still covers it.
      mount();
      bridgeSfx();
      // Pull-to-refresh — armed once the page is interactive. The goal
      // sheet/backdrop and any open overlay opt out via `disabled`.
      // Home never scrolls, so the default document scroller check
      // (scrollTop 0) is always true.
      mountPullToRefresh({
        refresh: () => loadDashboard(),
        disabled: () =>
          document.querySelector('#gbd.open, #gsh.open') !== null,
      });
      // Lift the white splash even if the API is unreachable — the
      // dashboard then shows ZERO values (streak 0 · balance 0 ·
      // zeroed carousel) instead of the old mock numbers.
      splash?.remove();
      // Surface the failure as a toast, mirroring the profile page's
      // pickErrMsg + toast pattern (window.toast is set by mount()).
      if (loginError) {
        window.toast?.(pickErrMsg(loginError, 'Login failed — could not reach the server'));
      } else if (dataError) {
        window.toast?.(pickErrMsg(dataError, 'Could not load dashboard data'));
      }
    } else {
      // pull-to-refresh completed — report the outcome
      if (loginError) {
        window.toast?.(pickErrMsg(loginError, 'Refresh failed — could not reach the server'));
      } else if (dataError) {
        window.toast?.(pickErrMsg(dataError, 'Could not refresh dashboard data'));
      } else {
        window.toast?.('Dashboard updated');
      }
    }
  }
}

if (onboardingSeen) void loadDashboard();
