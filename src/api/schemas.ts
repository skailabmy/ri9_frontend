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

/** GET /api/v1/subjects list item — categories[] drives the
    "KSSR · N MCQs" question count. */
export const rawSubjectSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  icon_url: z.string().nullable().optional(),
  priority: z.number().optional(),
  categories: z.array(z.unknown()).optional(),
});

/** GET /api/v1/subjects?… → { success, data: […] } */
export const subjectsResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(rawSubjectSchema),
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
