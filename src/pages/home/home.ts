/* ============================================================
   RI9 · HOME SCREEN entry (kid dashboard).
   Order: guard → session gate (splash) → page logic → store bridge.
   The markup lives in the root index.html; home.css is loaded via
   <link> in its <head> (before first paint — avoids any unstyled
   flash); this module adds behavior only.

   Session gate (ported from the Flutter HomeScreen): a white
   splash covers the screen while login + /me + subjects resolve,
   the fetched values are written into the Zustand app store
   (src/store/app.ts), then the splash is lifted and mount()
   builds the UI from them.
   ============================================================ */
import { boot } from '../../router';
import { mount } from './home.behavior';
import { useAppStore } from '../../store/app';
import { mountPullToRefresh } from '../../utils/pullToRefresh';
import { getToken } from '../../api/storage';
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

/* ---------- stage fit (390×820 scaled to viewport) ----------
   Run fit early so --ox and --s are applied immediately upon load,
   preventing the layout from defaulting to left: 0px. */
(function fitEarly(): void {
  const root = document.documentElement;
  const fit = (): void => {
    const vp = document.getElementById('vp');
    if (!vp) return;
    const vw = vp.clientWidth, vh = vp.clientHeight;
    if (!vw || !vh) return;
    const s = Math.min(vw / 390, vh / 812, 1.5);
    const W = Math.min(vw / s, 520), H = vh / s;
    root.style.setProperty('--s', s.toFixed(4));
    root.style.setProperty('--W', W.toFixed(1));
    root.style.setProperty('--H', H.toFixed(1));
    root.style.setProperty('--ox', ((vw - W * s) / 2).toFixed(1) + 'px');
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fit);
  } else {
    fit();
  }
  addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
})();

/* ---------- session gate: session check → live data ---------- */

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
  // the real value goes into the store and is only shown when the
  // user taps the eye (home.behavior.js reads store.coinBalance).
  useAppStore.getState().setCoinBalance(effectiveCoinBalance(user));

  // Pull-to-refresh path: the wallet may already be REVEALED (class
  // 'on' is toggled by home.behavior.js's showBal/hideBal). Repaint
  // the live number in place; when masked, the eye toggle simply
  // reads the fresh store.coinBalance next time.
  const bal = document.getElementById('bal');
  if (booted && user && bal?.classList.contains('on')) {
    bal.textContent = effectiveCoinBalance(user).toLocaleString();
  }
}

function applySubjects(subjects: Subject[]): void {
  const mapped = subjects.map((s): CarouselSubject => ({
    name: s.name,
    q: s.questionCount,
    // live values from /api/v2/user/subject-stats: gauge avg speed
    // and the weekly "Xs faster" trend (null → resting gauge /
    // "No trend data" copy in home.behavior.js)
    avg: s.avgSpeedSeconds ?? null,
    tr: s.trendSeconds ?? null,
    ico: null, // API gives icon_url images, not inline SVGs
    icon: s.iconUrl ?? null,
  }));
  useAppStore.getState().setSubjects(mapped);

  const setHomeSubjects = (window as unknown as { _ri9SetHomeSubjects?: (data: CarouselSubject[]) => void })._ri9SetHomeSubjects;
  if (typeof setHomeSubjects === 'function') {
    setHomeSubjects(mapped);
  }
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
   - store.subjects / store.coinBalance always carry fresh values
   The subject carousel itself is NOT rebuilt (its cards, gauges and
   drag physics are baked by mount()) — subject changes show up on the
   next page load; everything else is live. */
let booted = false;

function initUIEarly(): void {
  if (booted) return;
  booted = true;
  mount();
  bridgeSfx();
  mountPullToRefresh({
    refresh: () => loadDashboard(),
    disabled: () =>
      document.querySelector('#gbd.open, #gsh.open') !== null,
  });
}

async function loadDashboard(): Promise<void> {
  const splash = document.getElementById('boot');
  splash?.remove();

  // Mount early so the 3 carousel cards display their shimmer animation immediately
  // without being blocked while waiting for network requests
  initUIEarly();

  let loginError: unknown = null;
  let dataError: unknown = null;
  try {
    // Validates cached token via /me (or resolves user) without hardcoded credentials.
    // ensureSession never throws (returns null on failure) — the raw
    // error arrives via the onError callback instead.
    const user = await ensureSession(
      undefined,
      undefined,
      false,
      (e) => { loginError = e; },
    );

    // If unauthenticated, redirect to auth page
    if (!user && !getToken()) {
      location.replace('auth.html');
      return;
    }

    // These must run AFTER ensureSession or they 401 (no token yet).
    const [streak, subjects] = user
      ? await Promise.all([
          // /user/streak — Flutter: user_streak_repository
          fetchUserStreak().catch((e) => { dataError ??= e; return null; }),
          // /v2/user/subject-stats — Flutter: homeScreenSubjectsProvider
          fetchSubjects(3).catch((e) => { dataError ??= e; return null; }),
        ])
      : [null, null];
    if (user) applyUser(user, streak);
    if (subjects) applySubjects(subjects);
  } finally {
    if (loginError) {
      useAppStore.getState().showToast(pickErrMsg(loginError, 'Login failed — could not reach the server'));
    } else if (dataError) {
      useAppStore.getState().showToast(pickErrMsg(dataError, 'Could not load dashboard data'));
    }
  }
}

if (onboardingSeen) void loadDashboard();
