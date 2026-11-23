/* ============================================================
   RI9 · Auth API — ported from dumo_drill's AuthRepository +
   User model (Flutter). Endpoints mirror
   dumo_drill/lib/core/constants.dart:
     - login:          POST /api/v2/auth/login (AuthV2Controller —
                       wraps the v1 login and additionally ensures
                       the user's Dumo account in the background;
                       response shape is unchanged)
     - current user:   GET  /api/v1/auth/me
     - subject stats:  GET  /api/v2/user/subject-stats
                       (UserSubjectStatsV2Controller — per-subject
                       avg speed + weekly trend for the carousel)

   All request inputs and API responses are validated at runtime
   with Zod schemas (src/api/schemas.ts) — no blind `as` casts.
   ============================================================ */
import { api } from './client';
import { getToken, setToken, clearToken } from './storage';
import {
  validateCredentials,
  loginResponseSchema,
  parseCurrentUserResponse,
  streakResponseSchema,
  subjectStatsResponseSchema,
  type RawSubjectStat,
  type RawUser,
} from './schemas';

/** Subset of the backend User model (dumo_drill/lib/models/user.dart).
    JSON keys: streak_activity · coins_balance · dumo_bonus_coins */
export interface User {
  id?: number;
  username?: string;
  email?: string;
  avatarUrl?: string | null;
  /** coins_balance */
  coinsBalance?: number | null;
  /** dumo_bonus_coins */
  dumoBonusCoins?: number | null;
  /** streak_activity — what the dashboard streak pill shows */
  streakActivity?: number | null;
  status?: string | null;
}

export interface LoginData {
  user: User;
  token: string;
}

/** Map the validated snake_case wire format onto the camelCase
    User interface (same as User.fromJson in the Dart model). */
function mapRawUser(raw: RawUser): User {
  return {
    id: raw.id,
    username: raw.username,
    email: raw.email,
    avatarUrl: raw.avatar_url ?? null,
    coinsBalance: raw.coins_balance ?? null,
    dumoBonusCoins: raw.dumo_bonus_coins ?? null,
    streakActivity: raw.streak_activity ?? null,
    status: raw.status ?? null,
  };
}

/** POST /api/v2/auth/login — { success, data: { user, token } }
    (AuthV2Controller::login — same envelope as v1, plus background
    Dumo account provisioning. Credentials are validated client-side
    first (UX layer — the backend re-validates as the source of
    truth). */
export async function login(
  username: string,
  password: string,
): Promise<LoginData> {
  const creds = validateCredentials(username, password);
  const res = loginResponseSchema.parse(
    await api<unknown>('/api/v2/auth/login', {
      method: 'POST',
      body: { username: creds.username, password: creds.password },
    }),
  );
  return { user: mapRawUser(res.data.user), token: res.data.token };
}

/** GET /api/v1/auth/me — handles both flat and { data: … } envelopes
    (normalized in parseCurrentUserResponse) and maps the backend's
    snake_case JSON fields onto the camelCase User interface. */
export async function fetchCurrentUser(): Promise<User> {
  const res = await api<unknown>('/api/v1/auth/me');
  return mapRawUser(parseCurrentUserResponse(res));
}

/** Port of User.effectiveCoinBalance from the Dart model:
    dumo_bonus_coins wins unless it is 0, then coins_balance, then 0. */
export function effectiveCoinBalance(user: User): number {
  const coins = user.coinsBalance ?? 0;
  const bonus = user.dumoBonusCoins;
  if (bonus != null && bonus === 0) return coins > 0 ? coins : 0;
  if (bonus != null) return bonus;
  return coins > 0 ? coins : 0;
}

/** Carousel subject (mirrors dumo_drill's Subject model, trimmed to
    what the web carousel renders). */
export interface Subject {
  id: number;
  name: string;
  iconUrl?: string | null;
  priority: number;
  /** current avg answer speed in seconds (v2 subject-stats) —
      drives the carousel gauge; null = render the resting "0.0s" */
  avgSpeedSeconds?: number | null;
  /** seconds FASTER than last week; null = no trend data.
      Negative values (slower) are kept for data fidelity but the
      carousel copy only supports the "faster" wording. */
  trendSeconds?: number | null;
  /** mcq_questions_count — MCQs matching the user's age range
      (or general ones); drives the "KSSR · N MCQs" line */
  questionCount: number;
}

/** Map speed_trend to a signed seconds delta for the carousel's
    "Xs faster this week" line. Only 'faster' yields a positive
    number; slower/same/no_data → null (the UI shows "No trend
    data" rather than a misleading "0.0s faster" / "-2.1s faster"). */
function mapSpeedTrend(trend: RawSubjectStat['speed_trend']): number | null {
  if (trend?.trend !== 'faster' || typeof trend.difference_seconds !== 'number') {
    return null;
  }
  return trend.difference_seconds;
}

/** GET /api/v2/user/subject-stats (UserSubjectStatsV2Controller)
    Port of homeScreenSubjectsProvider: the endpoint already filters
    by age-range + content access and sorts by priority (desc) then
    name (asc) — we only take `limit`. Each row carries the avg
    speed gauge value and the weekly trend the carousel renders. */
export async function fetchSubjects(limit = 3): Promise<Subject[]> {
  const res = subjectStatsResponseSchema.parse(
    await api<unknown>('/api/v2/user/subject-stats'),
  );
  const mapped: Subject[] = res.data.map((s) => ({
    id: s.id,
    name: s.name,
    iconUrl: s.icon_url ?? null,
    priority: s.priority ?? 0,
    // The backend answers 0.0 when the user has no attempts
    // ($thisWeekAvg ?? ($stat ? average : 0.0)) — normalize that
    // placeholder to null, otherwise the carousel's score formula
    // ((20-avg)/16, where lower = better) reads 0s as "instant"
    // and pins the gauge at 100%.
    avgSpeedSeconds:
      typeof s.average_speed_seconds === 'number' && s.average_speed_seconds > 0
        ? s.average_speed_seconds
        : null,
    trendSeconds: mapSpeedTrend(s.speed_trend),
    questionCount: s.mcq_questions_count ?? 0,
  }));
  mapped.sort((a, b) => b.priority - a.priority);
  return limit != null ? mapped.slice(0, limit) : mapped;
}

/** GET /api/v1/user/streak → data.current_streak
    (Flutter: user_streak_repository.dart. The current backend's
    /me no longer returns streak_activity, so the dashboard streak
    pill uses this dedicated endpoint instead.) */
export async function fetchUserStreak(): Promise<number> {
  const res = streakResponseSchema.parse(await api<unknown>('/api/v1/user/streak'));
  return res.data.current_streak;
}

/* ---------- session lifecycle (token cache lives in storage.ts) ---------- */

export { getToken, setToken, clearToken };

/**
 * Establish an API session before the home screen mounts:
 * 1. cached token → validate it with /me
 * 2. no/stale token → login (demo credentials until the auth UI lands),
 *    cache the token, then fetch the user.
 * Returns null when the backend is unreachable — the UI still mounts.
 * Failures are NOT thrown (the null contract stays), but the raw error
 * is surfaced through `onError` so callers can toast it (home.ts).
 */
export async function ensureSession(
  username: string,
  password: string,
  /** Skip the cached-token fast path and always re-login. */
  force = false,
  /** Receives the raw login/`/me` error so the UI can show a toast. */
  onError?: (e: unknown) => void,
): Promise<User | null> {
  if (!force && getToken()) {
    try {
      return await fetchCurrentUser();
    } catch (e) {
      clearToken(); // stale token — fall through to fresh login
      onError?.(e);
    }
  }
  try {
    const { token } = await login(username, password);
    setToken(token);
    return await fetchCurrentUser();
  } catch (e) {
    onError?.(e);
    return null;
  }
}
