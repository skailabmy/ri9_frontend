import 'katex/dist/katex.min.css';
import { boot } from '../../router';
import { mount } from './quiz.behavior';
import { useAppStore } from '../../store/app';
import { fetchOngoingQuizSession, fetchQuizSessionAttempts } from '../../api/leaderboard';
import { getToken } from '../../api/auth';

boot({ page: 'quiz' });

/** Fetch ongoing quiz session with selectable prizes, then fetch its attempts into store */
export async function loadOngoingQuizSession(): Promise<void> {
  const { setOngoingQuizSession, setQuizSessionAttempts } = useAppStore.getState();
  if (!getToken()) return;
  try {
    const ongoing = await fetchOngoingQuizSession();
    setOngoingQuizSession(ongoing);
    if (ongoing?.id) {
      try {
        const attempts = await fetchQuizSessionAttempts(ongoing.id);
        setQuizSessionAttempts(attempts);
      } catch (err) {
        console.error('[QuizAttempts] Failed to fetch attempts:', err);
        setQuizSessionAttempts([]);
      }
    } else {
      setQuizSessionAttempts([]);
    }
  } catch (e) {
    console.error('[OngoingQuizSession] Failed to fetch ongoing quiz session:', e);
    setOngoingQuizSession(null);
    setQuizSessionAttempts(null);
  }
}

mount();
void loadOngoingQuizSession();

