/* ============================================================
   RI9 · Zod runtime validation schemas.

   Two jobs:
   1. INPUT validation — credentials (and later, any form data)
      are checked client-side before hitting the API. This is a
      UX layer only; the backend must re-validate everything.
   2. RESPONSE validation — every API payload is parsed instead
      of blind-casted (`as`), so a backend field rename fails
      loudly instead of silently producing `undefined`.

   JSON keys mirror the backend's snake_case (dumo_drill API);
   mapping to camelCase happens in auth.ts via mapRawUser().
   ============================================================ */
import { z } from 'zod';

/* ---------- inputs ---------- */

/** Login credentials. `trim()` strips accidental whitespace
    (mobile keyboards love trailing spaces) before the length check. */
export const credentialsSchema = z.object({
  username: z.string().trim().min(3, 'Username must be 3–64 characters').max(64, 'Username must be 3–64 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128, 'Password must be at most 128 characters'),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/** Validate + normalize credentials, or throw an Error with a
    user-friendly message (never a raw ZodError). */
export function validateCredentials(username: string, password: string): Credentials {
  const result = credentialsSchema.safeParse({ username, password });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Invalid username or password');
  }
  return result.data;
}

/* ---------- API responses (snake_case wire format) ---------- */

/** Backend User row — looseObject keeps unknown fields so future
    backend additions don't break the parse (same spirit as the
    old `...(raw as unknown as User)` spread). */
export const rawUserSchema = z.looseObject({
  id: z.number().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  avatar_url: z.string().nullable().optional(),
  /** coins_balance */
  coins_balance: z.number().nullable().optional(),
  /** dumo_bonus_coins */
  dumo_bonus_coins: z.number().nullable().optional(),
  /** streak_activity */
  streak_activity: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
});

export type RawUser = z.infer<typeof rawUserSchema>;

/** POST /api/v1/auth/login → { success, data: { user, token } } */
export const loginResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.object({ user: rawUserSchema, token: z.string().min(1) }),
});

/** GET /api/v1/user/streak → { data: { current_streak } } */
export const streakResponseSchema = z.object({
  data: z.object({ current_streak: z.number() }),
});

/** GET /api/v2/user/subject-stats speed_trend object. */
export const subjectSpeedTrendSchema = z.looseObject({
  /** 'faster' | 'slower' | 'same' | 'no_data' */
  trend: z.string().nullable().optional(),
  difference_seconds: z.number().nullable().optional(),
  percentage_change: z.number().nullable().optional(),
  this_week_average_seconds: z.number().nullable().optional(),
  last_week_average_seconds: z.number().nullable().optional(),
});

export type RawSubjectSpeedTrend = z.infer<typeof subjectSpeedTrendSchema>;

/** GET /api/v2/user/subject-stats list item (UserSubjectStatsV2Controller). */
export const rawSubjectStatSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  icon_url: z.string().nullable().optional(),
  priority: z.number().nullable().optional(),
  /** MCQ questions matching the user's age range (or general ones) —
      drives the "KSSR · N MCQs" line */
  mcq_questions_count: z.number().nullable().optional(),
  /** current avg answer speed (this week if played, else overall) */
  average_speed_seconds: z.number().nullable().optional(),
  speed_trend: subjectSpeedTrendSchema.nullable().optional(),
});

export type RawSubjectStat = z.infer<typeof rawSubjectStatSchema>;

/** GET /api/v2/user/subject-stats → { success, data: […] } */
export const subjectStatsResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(rawSubjectStatSchema),
});

/** GET /api/v1/auth/me — the endpoint sometimes answers flat
    (bare user row) and sometimes wrapped in { data: … }; both
    shapes are accepted and normalized to a RawUser. */
export function parseCurrentUserResponse(res: unknown): RawUser {
  const envelope = res as { data?: unknown };
  const raw = (envelope && typeof envelope === 'object' && envelope.data != null ? envelope.data : res) ?? {};
  const result = rawUserSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Invalid /auth/me response format');
  }
  return result.data;
}

/* ---------- user profile (ported from dumo_drill's UserProfile model) ----------
   Endpoints (dumo_drill/lib/repositories/user_profile_repository.dart):
     - fetch:   GET  /api/v1/user/profile           → { success, data: {…} }
                (data is an empty array when no profile row exists yet)
     - update:  PUT  /api/v2/user/profile           → 3-branch response, see below
     - verify:  POST /api/v2/user/profile/verify     → { success, data: {…profile} }
     - resend:  POST /api/v2/user/profile/resend-otp → otp_required payload again */

export const rawUserProfileSchema = z.looseObject({
  id: z.number().nullable().optional(),
  user_id: z.number().nullable().optional(),
  username: z.string().nullable().optional(),
  fullname: z.string().nullable().optional(),
  mobile_number: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  parent_email: z.string().nullable().optional(),
  parent_name: z.string().nullable().optional(),
  parent_mobile_number: z.string().nullable().optional(),
  parent_country_code: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  school_name: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  age_range_id: z.number().nullable().optional(),
  country_id: z.number().nullable().optional(),
  country_name: z.string().nullable().optional(),
});

export type RawUserProfile = z.infer<typeof rawUserProfileSchema>;

/** GET /api/v1/user/profile — data is a profile object, or an empty
    array when the user has no profile record yet. */
export const profileResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.union([rawUserProfileSchema, z.array(z.never()).length(0)]),
});

/** One selectable verification destination (email / sms). */
export const availableChannelSchema = z.looseObject({
  channel: z.string().nullable().optional(),
  masked_destination: z.string().nullable().optional(),
});

export type AvailableChannel = z.infer<typeof availableChannelSchema>;

/** PUT /api/v2/user/profile — the backend answers in one of three shapes:
    1. otp_required      → code was sent; verify next
    2. channel_required  → caller must pick a channel and re-submit
    3. bare profile      → updated directly, no verification needed */
export const otpRequiredDataSchema = z.looseObject({
  status: z.literal('otp_required'),
  message: z.string().nullable().optional(),
  otp_sent_to: z.string().nullable().optional(),
  masked_destination: z.string().nullable().optional(),
  expires_in: z.number().nullable().optional(),
  resend_after: z.number().nullable().optional(),
});

export type OtpRequiredData = z.infer<typeof otpRequiredDataSchema>;

export const channelRequiredDataSchema = z.looseObject({
  status: z.literal('channel_required'),
  message: z.string().nullable().optional(),
  available_channels: z.array(availableChannelSchema).nullable().optional(),
});

export type ChannelRequiredData = z.infer<typeof channelRequiredDataSchema>;

export const profileUpdateV2ResponseSchema = z.object({
  success: z.boolean().optional(),
  message: z.string().optional(),
  data: z.union([otpRequiredDataSchema, channelRequiredDataSchema, rawUserProfileSchema]),
});

export type ProfileUpdateV2Response = z.infer<typeof profileUpdateV2ResponseSchema>;

/* ---------- dropdown sources ---------- */

/** GET /api/v1/countries list item. */
export const rawCountrySchema = z.looseObject({
  id: z.number(),
  country_name: z.string().nullable().optional(),
});

export type RawCountry = z.infer<typeof rawCountrySchema>;

export const countriesResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(rawCountrySchema),
});

/** GET /api/v1/age-ranges list item. */
export const rawAgeRangeSchema = z.looseObject({
  id: z.number(),
  label: z.string().nullable().optional(),
  min_age: z.number().nullable().optional(),
  max_age: z.number().nullable().optional(),
});

export type RawAgeRange = z.infer<typeof rawAgeRangeSchema>;

export const ageRangesResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(rawAgeRangeSchema),
});

/* ---------- bundles (ported from dumo_drill's bundle_repository.dart) ----------
   - validate: POST /api/v1/bundles/redeem/validate → { success, data: {…} }
   - redeem:   POST /api/v1/bundles/redeem          → { success, data: {…} } */

export const bundleSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  formatted_price: z.string().nullable().optional(),
  packages_count: z.number().nullable().optional(),
});

/** POST /api/v1/bundles/redeem/validate → data */
export const validateBundleResponseSchema = z.looseObject({
  code: z.string(),
  bundle: bundleSchema,
  is_expired: z.boolean().nullable().optional(),
  can_be_redeemed: z.boolean(),
  expires_in_human: z.string().nullable().optional(),
});

export type ValidateBundleResponse = z.infer<typeof validateBundleResponseSchema>;

const redeemedPackageSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
});

/** POST /api/v1/bundles/redeem → data */
export const redeemBundleResponseSchema = z.looseObject({
  user_bundle: z.looseObject({
    id: z.number(),
    bundle_id: z.number(),
    bundle_name: z.string(),
    is_active: z.boolean().nullable().optional(),
  }),
  packages: z.union([z.array(redeemedPackageSchema), z.undefined()]),
  already_owned: z.boolean().nullable().optional(),
});

export type RedeemBundleResponse = z.infer<typeof redeemBundleResponseSchema>;

/* ---------- leaderboard summary (LeaderboardController::summary) ----------
   GET /api/v1/leaderboard/summary?period=today|week
   Returns the top-3 podium for the current board window plus the
   authenticated user's standing. user_id/username/avatar_url are null
   for unclaimed podium positions (empty board → all-null rows with 0s). */

/** GET /api/v1/leaderboard/summary top_three item. */
export const rawPodiumPlayerSchema = z.looseObject({
  position: z.number(),
  user_id: z.number().nullable().optional(),
  username: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  points: z.number().nullable().optional(),
  challenges_completed_count: z.number().nullable().optional(),
  total_coins: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
});

export type RawPodiumPlayer = z.infer<typeof rawPodiumPlayerSchema>;

/** GET /api/v1/leaderboard/summary user_standing object (null when
    unauthenticated). current_rank is null when the user hasn't ranked. */
export const rawUserStandingSchema = z.looseObject({
  is_top_three: z.boolean().nullable().optional(),
  is_top_ten: z.boolean().nullable().optional(),
  current_rank: z.number().nullable().optional(),
  current_points: z.number().nullable().optional(),
  top_10_threshold_points: z.number().nullable().optional(),
  points_to_reach_top_10: z.number().nullable().optional(),
});

export type RawUserStanding = z.infer<typeof rawUserStandingSchema>;

/** GET /api/v1/leaderboard/summary → { success, data: {…} } */
export const leaderboardSummaryResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.looseObject({
    /** 'today' | 'week' */
    period: z.string().optional(),
    sort_rule: z.string().nullable().optional(),
    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),
    top_three: z.array(rawPodiumPlayerSchema),
    user_standing: rawUserStandingSchema.nullable().optional(),
  }),
});

export type RawLeaderboardSummary = z.infer<typeof leaderboardSummaryResponseSchema>;
