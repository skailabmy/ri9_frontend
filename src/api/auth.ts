/* ============================================================
   RI9 · Auth API — ported from dumo_drill's AuthRepository +
   User model (Flutter). Endpoints mirror
   dumo_drill/lib/core/constants.dart:
     - login:          POST /api/v1/auth/login
     - current user:   GET  /api/v1/auth/me

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
  subjectsResponseSchema,
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

/** POST /api/v1/auth/login — { success, data: { user, token } }
    Credentials are validated client-side first (UX layer — the
    backend re-validates as the source of truth). */
export async function login(
  username: string,
  password: string,
): Promise<LoginData> {
  const creds = validateCredentials(username, password);
  const res = loginResponseSchema.parse(
    await api<unknown>('/api/v1/auth/login', {
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
  /** derived from categories[] length — drives the "KSSR · N MCQs" line */
  questionCount: number;
}

/** GET /api/v1/subjects?active=true&home_screen=true
    Port of subjectsProvider(3): sort by priority (highest first),
    take `limit`. Used by homeScreenSubjectsProvider on the Flutter
    home screen. */
export async function fetchSubjects(limit = 3): Promise<Subject[]> {
  const res = subjectsResponseSchema.parse(
    await api<unknown>('/api/v1/subjects?active=true&home_screen=true'),
  );
  const mapped: Subject[] = res.data.map((s) => ({
    id: s.id,
    name: s.name,
    iconUrl: s.icon_url ?? null,
    priority: s.priority ?? 0,
    questionCount: Array.isArray(s.categories) ? s.categories.length : 0,
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
 */
export async function ensureSession(
  username: string,
  password: string,
  /** Skip the cached-token fast path and always re-login. */
  force = false,
): Promise<User | null> {
  if (!force && getToken()) {
    try {
      return await fetchCurrentUser();
    } catch {
      clearToken(); // stale token — fall through to fresh login
    }
  }
  try {
    const { token } = await login(username, password);
    setToken(token);
    return await fetchCurrentUser();
  } catch {
    return null;
  }
}
