/* ============================================================
   RI9 · CHALLENGE LOBBY entry.
   The markup lives in the root challenge.html; challenge.css is
   loaded via <link> in its <head> (before first paint); this
   module adds behavior only (challenge.behavior.js).

   The lobby paints with null/zero placeholders, then the LIVE
   leaderboard (GET /api/v1/leaderboard/summary) and the kid's
   display name land in the background and are written into the
   Zustand app store (src/store/app.ts) — challenge.behavior.js
   subscribes to those slices and repaints. The TODAY / THIS
   WEEK segment toggle in the page writes lbPeriod; the
   subscription below re-fetches.
   ============================================================ */
import { boot } from '../../router';
import { mount } from './challenge.behavior';
import { useAppStore } from '../../store/app';
import { fetchCurrentUser, getToken } from '../../api/auth';
import { fetchProfile } from '../../api/profile';
import { fetchLeaderboardSummary, type SummaryPeriod } from '../../api/leaderboard';
import { ApiError } from '../../api/client';

// Guard is a no-op for now; when auth lands, lock it down:
// boot({ page: 'challenge', roles: ['kid'] })
boot({ page: 'challenge' });

/** Same message extraction as profile.behavior.js's pickErrMsg:
    prefer the server's message, fall back to a friendly default. */
function pickErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError && e.message ? e.message : fallback;
}

/** Fetch the live summary for `period` into the store. The
    endpoint sits behind the api.token middleware and login is
    owned by the home screen — only call with a cached token.
    On failure the summary resets to null and the lobby shows
    null/zero placeholders (a toast says so). */
async function loadSummary(period: SummaryPeriod): Promise<void> {
  const { setLbSummary } = useAppStore.getState();
  try {
    if (!getToken()) return;
    setLbSummary(await fetchLeaderboardSummary(period));
  } catch (e) {
    setLbSummary(null);
    useAppStore.getState().showToast(pickErrMsg(e, 'Could not load the live board'));
  }
}

/** Resolve the signed-in kid's display name (profile fullname,
    falling back to the /me username) into the store. Replaces
    the prototype's qdProfile localStorage relic. */
async function loadMe(): Promise<void> {
  if (!getToken()) return;
  const { setMeName } = useAppStore.getState();
  try {
    const profile = await fetchProfile().catch(() => null);
    const name = profile?.fullname || profile?.username || '';
    if (name) { setMeName(name); return }
    const user = await fetchCurrentUser().catch(() => null);
    if (user?.username) setMeName(user.username);
  } catch { /* lobby keeps its fallback name */ }
}

mount();

/* Period toggle: the lobby writes lbPeriod; re-fetch on change. */
let lastPeriod = useAppStore.getState().lbPeriod;
useAppStore.subscribe((s) => {
  if (s.lbPeriod !== lastPeriod) {
    lastPeriod = s.lbPeriod;
    void loadSummary(s.lbPeriod);
  }
});

void loadSummary(lastPeriod);
void loadMe();
