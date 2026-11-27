import 'katex/dist/katex.min.css';
import { boot } from '../../router';
import { mount } from './past.behavior';
import { useAppStore } from '../../store/app';
import { getToken, fetchCurrentUser } from '../../api/auth';
import { fetchProfile } from '../../api/profile';
import {
  fetchWeeklyBoardsHistory,
  fetchQuizSessionsHistory,
  WeeklyBoardHistoryFilter,
  QuizSessionHistoryFilter,
} from '../../api/leaderboard';

boot({ page: 'past' });

async function loadMe(): Promise<void> {
  if (!getToken()) return;
  const { setMeName } = useAppStore.getState();
  try {
    const profile = await fetchProfile().catch(() => null);
    const name = profile?.fullname || profile?.username || '';
    if (name) { setMeName(name); return; }
    const user = await fetchCurrentUser().catch(() => null);
    if (user?.username) setMeName(user.username);
  } catch { /* keep fallback */ }
}

async function loadQuizHistory(filter: QuizSessionHistoryFilter = 'all'): Promise<void> {
  const token = getToken();
  if (!token) return;
  const { setQuizSessionsHistory } = useAppStore.getState();
  try {
    const res = await fetchQuizSessionsHistory(filter);
    setQuizSessionsHistory(res.sessions, res.stats);
  } catch (e) {
    console.warn('[Past] Failed to fetch quiz sessions:', e);
  }
}

async function loadBoardsHistory(filter: WeeklyBoardHistoryFilter = 'all'): Promise<void> {
  const token = getToken();
  if (!token) return;
  const { setWeeklyBoardsHistory } = useAppStore.getState();
  try {
    const res = await fetchWeeklyBoardsHistory(filter);
    setWeeklyBoardsHistory(res.boards, res.stats);
  } catch (e) {
    console.warn('[Past] Failed to fetch weekly boards:', e);
  }
}

mount();

void loadMe();

// Determine initial tab from query param or hash (matches past.behavior.js)
const initialTab =
  (new URLSearchParams(location.search).get('tab') || location.hash.replace(/^#/, '') || 'quiz') === 'lb'
    ? 'lb'
    : 'quiz';

// Load only the initial active tab on page load
if (initialTab === 'lb') {
  void loadBoardsHistory('all');
} else {
  void loadQuizHistory('all');
}

// Watch tab / filter changes in store and fetch on demand per tab
let lastTab = initialTab;
let lastFilter = 'all';

useAppStore.subscribe((s) => {
  const currentTab = s.pwTab || initialTab;
  const currentFilter = s.pwFilter || 'all';

  if (currentTab !== lastTab || currentFilter !== lastFilter) {
    lastTab = currentTab;
    lastFilter = currentFilter;

    if (currentTab === 'lb') {
      void loadBoardsHistory(currentFilter as WeeklyBoardHistoryFilter);
    } else {
      void loadQuizHistory(currentFilter as QuizSessionHistoryFilter);
    }
  }
});
