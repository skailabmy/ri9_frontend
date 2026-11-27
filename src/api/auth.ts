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
  type RawCountry,
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

export interface RegisterParams {
  username: string;
  password: string;
  email?: string;
  mobileNumber?: string;
  countryCode?: string;
  countryId?: number;
  referer?: string;
  avatarUrl?: string;
  ageRangeId?: number;
}

export interface VerifyRegistrationParams {
  username: string;
  otp: string;
  email?: string;
  mobileNumber?: string;
  countryCode?: string;
  countryId?: number;
  referer?: string;
}

/** POST /api/v1/auth/register — registers user and triggers OTP */
export async function registerUser(params: RegisterParams): Promise<{ success: boolean; message?: string }> {
  const body: Record<string, unknown> = {
    username: params.username,
    password: params.password,
  };
  if (params.email) body.email = params.email;
  if (params.mobileNumber) body.mobile_number = params.mobileNumber;
  if (params.countryCode) body.country_code = params.countryCode;
  if (params.countryId != null) body.country_id = params.countryId;
  if (params.referer) body.referer = params.referer;
  if (params.avatarUrl) body.avatar_url = params.avatarUrl;
  if (params.ageRangeId != null) body.age_range_id = params.ageRangeId;

  const res = (await api<unknown>('/api/v1/auth/register', {
    method: 'POST',
    body,
  })) as { success?: boolean; message?: string };

  return {
    success: res.success ?? true,
    message: res.message,
  };
}

/** POST /api/v1/auth/verify-registration — verifies OTP and logs in */
export async function verifyRegistration(params: VerifyRegistrationParams): Promise<LoginData> {
  const body: Record<string, unknown> = {
    username: params.username,
    otp: params.otp,
  };
  if (params.email) body.email = params.email;
  if (params.mobileNumber) body.mobile_number = params.mobileNumber;
  if (params.countryCode) body.country_code = params.countryCode;
  if (params.countryId != null) body.country_id = params.countryId;
  if (params.referer) body.referer = params.referer;

  const res = loginResponseSchema.parse(
    await api<unknown>('/api/v1/auth/verify-registration', {
      method: 'POST',
      body,
    }),
  );

  return { user: mapRawUser(res.data.user), token: res.data.token };
}

/** POST /api/v1/auth/resend-registration-otp — resends verification OTP */
export async function resendRegistrationOtp(params: {
  username: string;
  email?: string;
  mobileNumber?: string;
  countryCode?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {
    username: params.username,
  };
  if (params.email) body.email = params.email;
  if (params.mobileNumber) body.mobile_number = params.mobileNumber;
  if (params.countryCode) body.country_code = params.countryCode;

  await api<unknown>('/api/v1/auth/resend-registration-otp', {
    method: 'POST',
    body,
  });
}

/** POST /api/v1/auth/forgot-password — sends password reset link to email */
export async function forgotPasswordEmail(email: string): Promise<{ success: boolean; message?: string }> {
  const res = (await api<unknown>('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: { email },
  })) as { success?: boolean; message?: string };
  return {
    success: res.success ?? true,
    message: res.message,
  };
}

/** POST /api/v1/auth/forgot-password-sms — sends SMS OTP for password reset */
export async function forgotPasswordSms(params: {
  username: string;
  mobileNumber: string;
  countryCode?: string;
}): Promise<{
  success: boolean;
  message?: string;
  otpSentTo?: string | null;
  maskedDestination?: string | null;
  resendAfter?: number | null;
}> {
  const body: Record<string, unknown> = {
    username: params.username,
    mobile_number: params.mobileNumber,
  };
  if (params.countryCode) {
    body.country_code = params.countryCode.replace('+', '');
  }

  const res = (await api<unknown>('/api/v1/auth/forgot-password-sms', {
    method: 'POST',
    body,
  })) as {
    success?: boolean;
    message?: string;
    data?: {
      otp_sent_to?: string;
      masked_destination?: string;
      resend_after?: number;
    };
  };

  return {
    success: res.success ?? true,
    message: res.message,
    otpSentTo: res.data?.otp_sent_to ?? null,
    maskedDestination: res.data?.masked_destination ?? null,
    resendAfter: res.data?.resend_after ?? 60,
  };
}

/** POST /api/v1/auth/verify-reset-password-sms — verifies SMS OTP and gets reset_token */
export async function verifyResetPasswordSms(params: {
  username: string;
  mobileNumber: string;
  otp: string;
}): Promise<string> {
  const res = (await api<unknown>('/api/v1/auth/verify-reset-password-sms', {
    method: 'POST',
    body: {
      username: params.username,
      mobile_number: params.mobileNumber,
      otp: params.otp,
    },
  })) as {
    data?: {
      reset_token?: string;
    };
  };

  const resetToken = res.data?.reset_token;
  if (!resetToken) {
    throw new Error('Verification failed: reset token missing');
  }
  return resetToken;
}

/** POST /api/v1/auth/resend-reset-password-sms — resends SMS OTP */
export async function resendResetPasswordSms(params: {
  username: string;
  mobileNumber: string;
}): Promise<void> {
  await api<unknown>('/api/v1/auth/resend-reset-password-sms', {
    method: 'POST',
    body: {
      username: params.username,
      mobile_number: params.mobileNumber,
    },
  });
}

/** POST /api/v1/auth/reset-password-sms — sets new password using reset_token */
export async function resetPasswordSms(params: {
  resetToken: string;
  password: string;
  passwordConfirmation: string;
}): Promise<boolean> {
  const res = (await api<unknown>('/api/v1/auth/reset-password-sms', {
    method: 'POST',
    body: {
      reset_token: params.resetToken,
      password: params.password,
      password_confirmation: params.passwordConfirmation,
    },
  })) as { success?: boolean };

  return res.success ?? true;
}

/** Country entry with normalized fields for the UI */
export interface UiCountry {
  id: number;
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  minDigits: number;
  maxDigits: number;
}

/** Helper to convert ISO country code to emoji flag */
export function isoToEmoji(code: string): string {
  if (!code || code.length !== 2) return '🌐';
  const offset = 127397;
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => c.charCodeAt(0) + offset));
}

/** GET /api/v1/countries along with detected country */
export async function fetchCountriesWithDetected(): Promise<{
  countries: UiCountry[];
  detectedCountry?: UiCountry | null;
}> {
  const res = (await api<unknown>('/api/v1/countries')) as {
    data?: RawCountry[];
    detected_country?: RawCountry;
  };

  const mapCountry = (raw: RawCountry): UiCountry => {
    const code = (raw.code || raw.iso_code || raw.iso2 || '').toUpperCase();
    const dial = (raw.dial_code || raw.country_code || raw.phone_code || '+60').toString().trim();
    const normalizedDial = dial.startsWith('+') ? dial : `+${dial}`;
    const name = raw.name || raw.country_name || code || 'Unknown';
    const flag = raw.country_emoji || (code ? isoToEmoji(code) : '🌐');

    return {
      id: Number(raw.id) || 0,
      name,
      code,
      dialCode: normalizedDial,
      flag,
      minDigits: 7,
      maxDigits: 12,
    };
  };

  const rawList = res?.data || [];
  const countries = rawList.map(mapCountry);

  let detectedCountry: UiCountry | null = null;
  if (res?.detected_country) {
    const rawDetected = res.detected_country;
    const detectedName = (rawDetected.name || rawDetected.country_name || '').toLowerCase();
    const detectedCode = (rawDetected.code || rawDetected.iso_code || rawDetected.iso2 || '').toUpperCase();
    const detectedDial = (rawDetected.dial_code || rawDetected.country_code || '').toString().trim();

    detectedCountry =
      countries.find(
        (c) =>
          (c.id && c.id === rawDetected.id) ||
          (c.code && c.code === detectedCode) ||
          (c.dialCode && detectedDial && c.dialCode.replace('+', '') === detectedDial.replace('+', '')) ||
          (detectedName && c.name.toLowerCase() === detectedName),
      ) || mapCountry(rawDetected);
  }

  return { countries, detectedCountry };
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

export interface UserStreakDetails {
  currentStreak: number;
  streakStartedAt?: string | null;
  isActiveToday?: boolean | null;
  streakIncreasedToday?: boolean | null;
  streakResetToday?: boolean | null;
  weekActivity?: Record<string, boolean | null>;
}

/** GET /api/v1/user/streak → full UserStreakDetails */
export async function fetchUserStreakDetails(): Promise<UserStreakDetails> {
  const res = streakResponseSchema.parse(await api<unknown>('/api/v1/user/streak'));
  const d = res.data;
  return {
    currentStreak: d.current_streak,
    streakStartedAt: d.streak_started_at,
    isActiveToday: d.is_active_today,
    streakIncreasedToday: d.streak_increased_today,
    streakResetToday: d.streak_reset_today,
    weekActivity: d.week_activity,
  };
}

/** GET /api/v1/user/streak → data.current_streak
    (Flutter: user_streak_repository.dart. The current backend's
    /me no longer returns streak_activity, so the dashboard streak
    pill uses this dedicated endpoint instead.) */
export async function fetchUserStreak(): Promise<number> {
  const details = await fetchUserStreakDetails();
  return details.currentStreak;
}

/* ---------- session lifecycle (token cache lives in storage.ts) ---------- */

export { getToken, setToken, clearToken };

/**
 * Logout the current user:
 * Calls POST /api/v1/auth/logout on backend (ignoring network/API errors),
 * clears local storage token, and clears persisted user session info.
 */
export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await api<unknown>('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Ignore API errors during logout - local cleanup proceeds
    }
  }
  clearToken();
}

/**
 * Establish or restore an API session before the home screen mounts:
 * 1. cached token exists → validate it with /me
 * 2. username & password provided → authenticate, cache token, and fetch user
 * Returns null when unauthenticated or unreachable.
 */
export async function ensureSession(
  username?: string,
  password?: string,
  /** Skip the cached-token fast path and re-login if credentials provided. */
  force = false,
  /** Receives the raw login/`/me` error so callers can toast it. */
  onError?: (e: unknown) => void,
): Promise<User | null> {
  if (!force && getToken()) {
    try {
      return await fetchCurrentUser();
    } catch (e) {
      clearToken(); // stale token
      onError?.(e);
    }
  }

  if (username && password) {
    try {
      const { token } = await login(username, password);
      setToken(token);
      return await fetchCurrentUser();
    } catch (e) {
      onError?.(e);
      return null;
    }
  }

  return null;
}
