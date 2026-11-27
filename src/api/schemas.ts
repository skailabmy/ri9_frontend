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

/** Username input schema (letters, numbers, _ and . only, 3-20 chars). */
export const usernameInputSchema = z
  .string()
  .trim()
  .min(1, 'Choose a username.')
  .min(3, 'At least 3 characters.')
  .max(20, 'At most 20 characters.')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Letters, numbers, _ and . only.');

/** Email input schema. */
export const emailInputSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email.')
  .email('Enter a valid email address.');

/** Phone number helper (digit length verification per country). */
export function createPhoneInputSchema(minDigits = 8, maxDigits = 12, countryName = 'your country') {
  return z
    .string()
    .trim()
    .min(1, 'Enter your mobile number.')
    .refine((v) => {
      const d = v.replace(/\D/g, '').replace(/^0+/, '');
      return d.length >= minDigits && d.length <= maxDigits + 1;
    }, `Enter a valid ${countryName} mobile number.`);
}

/** Password creation schema (8+ chars, uppercase, lowercase, number). */
export const passwordCreationSchema = z
  .string()
  .min(1, 'Create a password.')
  .min(8, 'At least 8 characters.')
  .regex(/[a-z]/, 'Must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Must contain an uppercase letter.')
  .regex(/\d/, 'Must contain at least one number.');

/** Password reset schema with confirmation check. */
export const passwordResetFormSchema = z
  .object({
    password: passwordCreationSchema,
    confirmPassword: z.string().min(1, 'Re-enter your password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ['confirmPassword'],
  });

/** Register form schema. */
export const registerFormSchema = z
  .object({
    username: usernameInputSchema,
    contactMode: z.enum(['email', 'mobile']),
    email: z.string().optional(),
    phone: z.string().optional(),
    password: passwordCreationSchema,
    confirmPassword: z.string().min(1, 'Re-enter your password.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ['confirmPassword'],
  });

/** OTP 6-digit schema. */
export const otpInputSchema = z
  .string()
  .trim()
  .length(6, 'Enter the full 6-digit code.')
  .regex(/^\d{6}$/, 'Code must only contain numbers.')
  .refine((v) => v !== '000000', 'That code is incorrect. Check the SMS and try again.');

/* ---------- API responses (snake_case wire format) ---------- */

/** Backend User row — looseObject keeps unknown fields so future
    backend additions don't break the parse (same spirit as the
    old `...(raw as unknown as User)` spread). */
export const rawUserSchema = z.looseObject({
  id: z.number().optional(),
  username: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
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

/** GET /api/v1/user/streak → full streak details */
export const streakResponseSchema = z.object({
  data: z.looseObject({
    current_streak: z.number().optional().default(0),
    streak_started_at: z.string().nullable().optional(),
    is_active_today: z.boolean().nullable().optional(),
    streak_increased_today: z.boolean().nullable().optional(),
    streak_reset_today: z.boolean().nullable().optional(),
    week_activity: z.record(z.string(), z.boolean().nullable()).optional(),
  }),
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
  id: z.number().or(z.string().transform((v) => Number(v) || 0)).optional(),
  country_id: z.number().or(z.string().transform((v) => Number(v) || 0)).optional(),
  country_name: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  dial_code: z.string().nullable().optional(),
  phone_code: z.string().nullable().optional(),
  iso_code: z.string().nullable().optional(),
  iso2: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  country_emoji: z.string().nullable().optional(),
  flag_url: z.string().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
});

export type RawCountry = z.infer<typeof rawCountrySchema>;

export const countriesResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(rawCountrySchema),
  detected_country: rawCountrySchema.nullable().optional(),
});

export const registerResponseSchema = z.looseObject({
  success: z.boolean().optional(),
  message: z.string().optional(),
  data: z.any().optional(),
});

export const verifyRegistrationResponseSchema = z.looseObject({
  success: z.boolean().optional(),
  message: z.string().optional(),
  data: z.looseObject({
    user: rawUserSchema,
    token: z.string(),
  }).optional(),
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

/* ---------- weekly boards history (WeeklyBoardController::history) ----------
   GET /api/v1/weekly-boards/history?filter=all|won|played
   Returns historical weekly boards enriched with user participation and stats. */

export const rawBoardWinnerSchema = z.looseObject({
  user_id: z.number().nullable().optional(),
  username: z.string().nullable().optional(),
  user_name: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  fullname: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  position: z.number().nullable().optional(),
  prize_id: z.number().nullable().optional(),
  prize_name: z.string().nullable().optional(),
  prize_title: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  points: z.number().nullable().optional(),
  prize: z
    .looseObject({
      id: z.number().nullable().optional(),
      product_name: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      product_image: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  formatted_prize: z
    .looseObject({
      id: z.number().nullable().optional(),
      title: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      product_images: z
        .looseObject({
          original: z.string().nullable().optional(),
          thumb: z.string().nullable().optional(),
        })
        .or(z.array(z.string()))
        .nullable()
        .optional(),
      product_image: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  user: z
    .looseObject({
      id: z.number().nullable().optional(),
      username: z.string().nullable().optional(),
      user_name: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      fullname: z.string().nullable().optional(),
      avatar_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  metadata: z
    .looseObject({
      username: z.string().nullable().optional(),
      user_name: z.string().nullable().optional(),
      challenges_completed: z.number().nullable().optional(),
      total_coins: z.number().nullable().optional(),
      accuracy: z.number().nullable().optional(),
      speed: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export type RawBoardWinner = z.infer<typeof rawBoardWinnerSchema>;

export const rawWeeklyBoardPrizeSchema = z.looseObject({
  id: z.number().optional(),
  name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  position: z.number().nullable().optional(),
  prize_id: z.number().nullable().optional(),
  image_url: z.string().nullable().optional(),
  product_image: z.string().nullable().optional(),
  prize: z
    .looseObject({
      id: z.number().nullable().optional(),
      product_name: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      product_image: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  product_images: z
    .looseObject({
      original: z.string().nullable().optional(),
      thumb: z.string().nullable().optional(),
    })
    .or(z.array(z.string()))
    .nullable()
    .optional(),
  formatted_prize: z
    .looseObject({
      id: z.number().nullable().optional(),
      title: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      product_images: z
        .looseObject({
          original: z.string().nullable().optional(),
          thumb: z.string().nullable().optional(),
        })
        .or(z.array(z.string()))
        .nullable()
        .optional(),
      product_image: z.string().nullable().optional(),
      image_url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  description: z.string().nullable().optional(),
});

export type RawWeeklyBoardPrize = z.infer<typeof rawWeeklyBoardPrizeSchema>;

export const rawWeeklyBoardHistoryItemSchema = z.looseObject({
  id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  title: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  sort_rule: z.string().nullable().optional(),
  winners: z.array(rawBoardWinnerSchema).optional(),
  prizes: z.array(rawWeeklyBoardPrizeSchema).optional(),
  user_won: z.boolean().nullable().optional(),
  user_played: z.boolean().nullable().optional(),
  user_winning_details: rawBoardWinnerSchema.nullable().optional(),
});

export type RawWeeklyBoardHistoryItem = z.infer<typeof rawWeeklyBoardHistoryItemSchema>;

export const weeklyBoardHistoryStatsSchema = z.looseObject({
  total_boards: z.number().nullable().optional(),
  boards_won: z.number().nullable().optional(),
  boards_played: z.number().nullable().optional(),
});

export type WeeklyBoardHistoryStats = z.infer<typeof weeklyBoardHistoryStatsSchema>;

export const weeklyBoardHistoryResponseSchema = z.looseObject({
  status: z.string().optional(),
  stats: weeklyBoardHistoryStatsSchema.optional(),
  filter: z.string().optional(),
  data: z.array(rawWeeklyBoardHistoryItemSchema).optional(),
  message: z.string().nullable().optional(),
});

export type RawWeeklyBoardHistoryResponse = z.infer<typeof weeklyBoardHistoryResponseSchema>;

/* ---------- quiz sessions history (QuizSessionController::history) ----------
   GET /api/v1/quiz-sessions/history?filter=all|won|played
   Returns historical quiz sessions enriched with user participation and stats. */

export const rawQuizSessionHistoryItemSchema = z.looseObject({
  id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  title: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  winners: z.array(rawBoardWinnerSchema).optional(),
  prizes: z.array(rawWeeklyBoardPrizeSchema).optional(),
  user_won: z.boolean().nullable().optional(),
  user_played: z.boolean().nullable().optional(),
  user_winning_details: rawBoardWinnerSchema.nullable().optional(),
});

export type RawQuizSessionHistoryItem = z.infer<typeof rawQuizSessionHistoryItemSchema>;

export const quizSessionHistoryStatsSchema = z.looseObject({
  total_sessions: z.number().nullable().optional(),
  sessions_won: z.number().nullable().optional(),
  sessions_played: z.number().nullable().optional(),
});

export type QuizSessionHistoryStats = z.infer<typeof quizSessionHistoryStatsSchema>;

export const quizSessionHistoryResponseSchema = z.looseObject({
  status: z.string().optional(),
  stats: quizSessionHistoryStatsSchema.optional(),
  filter: z.string().optional(),
  data: z.array(rawQuizSessionHistoryItemSchema).optional(),
  message: z.string().nullable().optional(),
});

export type RawQuizSessionHistoryResponse = z.infer<typeof quizSessionHistoryResponseSchema>;

/* ---------- ongoing weekly boards (WeeklyBoardController::ongoing) ----------
   GET /api/v1/weekly-boards/ongoing
   Returns current ongoing weekly boards with selectable prizes and user prize selections. */

export const rawSelectablePrizeSchema = z.looseObject({
  prize_id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  prize_name: z.string().nullable().optional(),
  product_name: z.string().nullable().optional(),
  product_description: z.string().nullable().optional(),
  product_image: z.string().nullable().optional(),
  is_default: z.boolean().nullable().optional(),
});

export type RawSelectablePrize = z.infer<typeof rawSelectablePrizeSchema>;

export const rawUserPrizeSelectionSchema = z.looseObject({
  prize_id: z.number().or(z.string().transform((v) => Number(v) || 0)).nullable().optional(),
  prize_name: z.string().nullable().optional(),
  product_name: z.string().nullable().optional(),
  selected_at: z.string().nullable().optional(),
});

export type RawUserPrizeSelection = z.infer<typeof rawUserPrizeSelectionSchema>;

export const rawOngoingWeeklyBoardSchema = z.looseObject({
  id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  title: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  sort_rule: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  my_prize_selections: z
    .record(z.string(), rawUserPrizeSelectionSchema)
    .or(z.array(rawUserPrizeSelectionSchema))
    .nullable()
    .optional(),
  selectable_prizes: z
    .record(z.string(), z.array(rawSelectablePrizeSchema))
    .nullable()
    .optional(),
  prizes: z.array(rawWeeklyBoardPrizeSchema).optional(),
});

export type RawOngoingWeeklyBoard = z.infer<typeof rawOngoingWeeklyBoardSchema>;

export const ongoingWeeklyBoardResponseSchema = z.looseObject({
  status: z.string().optional(),
  message: z.string().nullable().optional(),
  data: z.array(rawOngoingWeeklyBoardSchema).optional(),
});

export type RawOngoingWeeklyBoardResponse = z.infer<typeof ongoingWeeklyBoardResponseSchema>;

/* ---------- ongoing quiz sessions (QuizSessionController::ongoing) ----------
   GET /api/v1/quiz-sessions/ongoing
   Returns current ongoing quiz sessions with selectable prizes and user prize selections. */

export const rawOngoingQuizSessionSchema = z.looseObject({
  id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  title: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  my_prize_selections: z
    .record(z.string(), rawUserPrizeSelectionSchema)
    .or(z.array(rawUserPrizeSelectionSchema))
    .nullable()
    .optional(),
  selectable_prizes: z
    .record(z.string(), z.array(rawSelectablePrizeSchema))
    .nullable()
    .optional(),
});

export type RawOngoingQuizSession = z.infer<typeof rawOngoingQuizSessionSchema>;

export const ongoingQuizSessionResponseSchema = z.looseObject({
  status: z.string().optional(),
  message: z.string().nullable().optional(),
  data: z.array(rawOngoingQuizSessionSchema).optional(),
});

export type RawOngoingQuizSessionResponse = z.infer<typeof ongoingQuizSessionResponseSchema>;

/* ---------- quiz session attempts (GET /api/v1/quiz-sessions/{id}/attempts) ---------- */

export const rawQuizSessionAttemptSchema = z.looseObject({
  id: z.number().or(z.string().transform((v) => Number(v) || 0)).optional(),
  attempt_number: z.number().or(z.string().transform((v) => Number(v) || 0)),
  status: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  speed_seconds: z.number().nullable().optional(),
  is_best: z.boolean().nullable().optional(),
  subject_id: z.number().nullable().optional(),
  subject_name: z.string().nullable().optional(),
  category_id: z.number().nullable().optional(),
  category_name: z.string().nullable().optional(),
});

export type RawQuizSessionAttempt = z.infer<typeof rawQuizSessionAttemptSchema>;

export const quizSessionAttemptsResponseSchema = z.looseObject({
  success: z.boolean().optional(),
  status: z.string().optional(),
  data: z.array(rawQuizSessionAttemptSchema).optional(),
  message: z.string().nullable().optional(),
});

export type RawQuizSessionAttemptsResponse = z.infer<typeof quizSessionAttemptsResponseSchema>;

/* ---------- quiz session subjects (GET /api/v1/quiz-sessions/{id}/subjects) ---------- */

export const rawQuizCategorySchema = z.looseObject({
  id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  name: z.string(),
  description: z.string().nullable().optional(),
  is_eligible: z.boolean().optional(),
  is_completed: z.boolean().optional(),
  completion_percentage: z.number().optional(),
  total_questions_completed: z.number().optional(),
  total_questions: z.number().optional(),
});

export type RawQuizCategory = z.infer<typeof rawQuizCategorySchema>;

export const rawQuizSubjectSchema = z.looseObject({
  id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  name: z.string(),
  description: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  icon_url: z.string().nullable().optional(),
  priority: z.number().optional(),
  is_active: z.boolean().optional(),
  is_locked: z.boolean().optional(),
  age_range_ids: z.array(z.number()).optional(),
  completion_percentage: z.number().optional(),
  categories: z.array(rawQuizCategorySchema).optional(),
  age_ranges: z.array(rawAgeRangeSchema).optional(),
});

export type RawQuizSubject = z.infer<typeof rawQuizSubjectSchema>;

export const quizSessionSubjectsResponseSchema = z.looseObject({
  success: z.boolean().optional(),
  status: z.string().optional(),
  data: z.array(rawQuizSubjectSchema).optional(),
  message: z.string().nullable().optional(),
});

export type RawQuizSessionSubjectsResponse = z.infer<typeof quizSessionSubjectsResponseSchema>;

/* ---------- quiz session gameplay (start attempt & submit answer) ---------- */
export const quizOptionSchema = z.looseObject({
  id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  option_text: z.string().nullable().optional(),
});

export const quizQuestionSchema = z.looseObject({
  id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  question_text: z.string().nullable().optional(),
  question_image_url: z.string().nullable().optional(),
  question_audio_url: z.string().nullable().optional(),
  difficulty: z.number().nullable().optional(),
  is_grouped: z.boolean().optional(),
  stimulus: z.any().nullable().optional(),
  grouped_questions: z.array(z.any()).nullable().optional(),
  options: z.array(quizOptionSchema).optional(),
});

export const quizSessionStartDataSchema = z.looseObject({
  attempt_id: z.number().or(z.string().transform((v) => Number(v) || 0)),
  attempt_number: z.number().optional(),
  extra_life: z.number().optional(),
  first_question: quizQuestionSchema.nullable().optional(),
  total_questions: z.number().optional(),
  elapsed_seconds: z.number().optional(),
});

export const quizSessionStartResponseSchema = z.looseObject({
  success: z.boolean().optional(),
  message: z.string().nullable().optional(),
  data: quizSessionStartDataSchema.optional(),
});

export const quizAnswerResponseSchema = z.looseObject({
  success: z.boolean().optional(),
  round_ended: z.boolean().optional(),
  is_correct: z.boolean().optional(),
  next_question: quizQuestionSchema.nullable().optional(),
  extra_life: z.number().optional(),
  score: z.number().optional(),
  category_transition: z.any().nullable().optional(),
});



