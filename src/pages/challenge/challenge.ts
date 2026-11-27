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
import 'katex/dist/katex.min.css';
import { boot } from '../../router';
import { mount } from './challenge.behavior';
import { useAppStore } from '../../store/app';
import { fetchCurrentUser, getToken } from '../../api/auth';
import { fetchProfile } from '../../api/profile';
import {
  fetchLeaderboardSummary,
  fetchWeeklyBoardsHistory,
  fetchQuizSessionsHistory,
  fetchOngoingWeeklyBoard,
  type SummaryPeriod,
} from '../../api/leaderboard';
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

/** Resolve the signed-in kid's display name (falling back to /me username
    if profile didn't provide one). initInitialData in challenge.behavior.js
    already loads the profile and calls setMeName(profile.fullname || profile.username). */
async function loadMe(): Promise<void> {
  if (!getToken()) return;
  const { meName, setMeName } = useAppStore.getState();
  if (meName) return;
  try {
    const user = await fetchCurrentUser().catch(() => null);
    if (user?.username) setMeName(user.username);
  } catch { /* lobby keeps its fallback name */ }
}

/** Fetch past quiz sessions history from GET /api/v1/quiz-sessions/history
    into the store. On failure or unauthenticated, stores null. */
export async function loadQuizSessionsHistory(filter: 'all' | 'won' | 'played' = 'all'): Promise<void> {
  const { setQuizSessionsHistory } = useAppStore.getState();
  const token = getToken();
  if (!token) {
    console.warn('[QuizSessions] No auth token available, skipping fetch');
    return;
  }
  try {
    const res = await fetchQuizSessionsHistory(filter);
    setQuizSessionsHistory(res.sessions, res.stats);
  } catch (e) {
    console.error('[QuizSessions] Failed to fetch quiz sessions history:', e);
    setQuizSessionsHistory(null, null);
  }
}

/** Fetch past weekly boards history from GET /api/v1/weekly-boards/history
    into the store. On failure or unauthenticated, stores null. */
export async function loadWeeklyBoardsHistory(filter: 'all' | 'won' | 'played' = 'all'): Promise<void> {
  const { setWeeklyBoardsHistory } = useAppStore.getState();
  const token = getToken();
  if (!token) {
    console.warn('[WeeklyBoards] No auth token available, skipping fetch');
    return;
  }
  try {
    const res = await fetchWeeklyBoardsHistory(filter);
    setWeeklyBoardsHistory(res.boards, res.stats);
  } catch (e) {
    console.error('[WeeklyBoards] Failed to fetch boards history:', e);
    setWeeklyBoardsHistory(null, null);
  }
}

/** Fetch ongoing weekly board with selectable prizes into store. */
export async function loadOngoingBoard(): Promise<void> {
  const { setOngoingBoard } = useAppStore.getState();
  if (!getToken()) return;
  try {
    const ongoing = await fetchOngoingWeeklyBoard();
    setOngoingBoard(ongoing);
  } catch (e) {
    console.error('[OngoingBoard] Failed to fetch ongoing board:', e);
    setOngoingBoard(null);
  }
}

mount();

/* Watch pwTab & pwFilter: trigger history fetch with filter for current tab */
let lastPwTab = useAppStore.getState().pwTab;
let lastPwFilter = useAppStore.getState().pwFilter;
useAppStore.subscribe((s) => {
  const tabChanged = s.pwTab !== lastPwTab;
  const filterChanged = s.pwFilter !== lastPwFilter;

  if (tabChanged || filterChanged) {
    lastPwTab = s.pwTab;
    lastPwFilter = s.pwFilter;

    if (s.pwTab === 'lb') {
      void loadWeeklyBoardsHistory(s.pwFilter);
    } else if (s.pwTab === 'quiz') {
      void loadQuizSessionsHistory(s.pwFilter);
    }
  }
});

/* Period toggle: the lobby writes lbPeriod; re-fetch on change. */
let lastPeriod = useAppStore.getState().lbPeriod;
useAppStore.subscribe((s) => {
  if (s.lbPeriod !== lastPeriod) {
    lastPeriod = s.lbPeriod;
    void loadSummary(s.lbPeriod);
  }
});

void loadSummary(lastPeriod);
void loadOngoingBoard();
void loadMe();
