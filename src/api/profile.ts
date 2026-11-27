/* ============================================================
   RI9 · Profile API — ported from dumo_drill's
   UserProfileRepository + BundleRepository (Flutter). Endpoints
   mirror dumo_drill/lib/core/constants.dart:
     - fetch profile:   GET  /api/v1/user/profile
     - update (v2):     PUT  /api/v2/user/profile
     - verify OTP:      POST /api/v2/user/profile/verify
     - resend OTP:      POST /api/v2/user/profile/resend-otp
     - countries:       GET  /api/v1/countries
     - age ranges:      GET  /api/v1/age-ranges
     - validate bundle: POST /api/v1/bundles/redeem/validate
     - redeem bundle:   POST /api/v1/bundles/redeem

   All responses are validated at runtime with Zod schemas
   (src/api/schemas.ts) — no blind `as` casts.
   ============================================================ */
import { api } from './client';
import {
  profileResponseSchema,
  profileUpdateV2ResponseSchema,
  countriesResponseSchema,
  ageRangesResponseSchema,
  validateBundleResponseSchema,
  redeemBundleResponseSchema,
  type RawUserProfile,
  type OtpRequiredData,
  type ChannelRequiredData,
  type AvailableChannel,
  type RawCountry,
  type RawAgeRange,
  type ValidateBundleResponse,
  type RedeemBundleResponse,
} from './schemas';

/* ---------- mapped (camelCase) shapes ---------- */

/** Mapped view of the backend profile row (same fields as the Dart
    UserProfile model — snake_case → camelCase, nulls preserved). */
export interface Profile {
  id?: number | null;
  username?: string | null;
  fullname?: string | null;
  mobileNumber?: string | null;
  countryCode?: string | null;
  email?: string | null;
  schoolName?: string | null;
  address?: string | null;
  parentName?: string | null;
  parentMobileNumber?: string | null;
  parentCountryCode?: string | null;
  parentEmail?: string | null;
  ageRangeId?: number | null;
  countryId?: number | null;
  countryName?: string | null;
}

/** Map the validated snake_case wire format onto the camelCase
    Profile interface (same as UserProfile.fromJson in Dart). */
function mapRawProfile(raw: RawUserProfile): Profile {
  return {
    id: raw.id ?? null,
    username: raw.username ?? null,
    fullname: raw.fullname ?? null,
    mobileNumber: raw.mobile_number ?? null,
    countryCode: raw.country_code ?? null,
    email: raw.email ?? null,
    schoolName: raw.school_name ?? null,
    address: raw.address ?? null,
    parentName: raw.parent_name ?? null,
    parentMobileNumber: raw.parent_mobile_number ?? null,
    parentCountryCode: raw.parent_country_code ?? null,
    parentEmail: raw.parent_email ?? null,
    ageRangeId: raw.age_range_id ?? null,
    countryId: raw.country_id ?? null,
    countryName: raw.country_name ?? null,
  };
}

/** The fields the profile form can submit — camelCase keys mirroring
    ProfileUpdateInput; the mapper below converts to snake_case. */
export interface ProfileUpdateInput {
  username?: string;
  fullname?: string;
  mobileNumber?: string;
  countryCode?: string;
  email?: string;
  parentName?: string;
  parentMobileNumber?: string;
  parentCountryCode?: string;
  parentEmail?: string;
  schoolName?: string;
  address?: string;
  ageRangeId?: number;
  countryId?: number;
}

const SNAKE_FIELD: Record<keyof ProfileUpdateInput, string> = {
  username: 'username',
  fullname: 'fullname',
  mobileNumber: 'mobile_number',
  countryCode: 'country_code',
  email: 'email',
  parentName: 'parent_name',
  parentMobileNumber: 'parent_mobile_number',
  parentCountryCode: 'parent_country_code',
  parentEmail: 'parent_email',
  schoolName: 'school_name',
  address: 'address',
  ageRangeId: 'age_range_id',
  countryId: 'country_id',
};

/** Build the snake_case PUT body. Mirrors the Dart repository:
    empty strings are dropped entirely (Flutter sends null → the
    field is omitted from the body). */
function toUpdateBody(input: ProfileUpdateInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  (Object.keys(input) as (keyof ProfileUpdateInput)[]).forEach((key) => {
    const value = input[key];
    if (value === undefined || value === '') return;
    body[SNAKE_FIELD[key]] = value;
  });
  return body;
}

/* ---------- profile CRUD ---------- */

/** GET /api/v1/user/profile — returns null when the user has no
    profile record yet (backend answers `data: []` in that case). */
export async function fetchProfile(userId?: number): Promise<Profile | null> {
  const query = userId != null ? `?userId=${encodeURIComponent(String(userId))}` : '';
  const res = profileResponseSchema.parse(
    await api<unknown>(`/api/v1/user/profile${query}`),
  );
  return Array.isArray(res.data) ? null : mapRawProfile(res.data);
}

/** The three possible outcomes of PUT /api/v2/user/profile
    (mirrors ProfileUpdateV2Response's isDirectSuccess /
    isChannelRequired / isOtpRequired getters in Dart). */
export type ProfileUpdateResult =
  | { kind: 'success'; profile: Profile }
  | { kind: 'channelRequired'; channels: AvailableChannel[]; message?: string }
  | {
      kind: 'otpRequired';
      otpSentTo?: string | null;
      maskedDestination?: string | null;
      expiresIn?: number | null;
      resendAfter?: number | null;
      message?: string;
    };

/** PUT /api/v2/user/profile — the backend decides whether the change
    can apply directly, needs a verification channel, or needs an OTP
    code to be verified. */
export async function updateProfileV2(
  input: ProfileUpdateInput,
  verificationChannel?: string,
): Promise<ProfileUpdateResult> {
  const body = toUpdateBody(input);
  if (verificationChannel) body.verification_channel = verificationChannel;
  const res = profileUpdateV2ResponseSchema.parse(
    await api<unknown>('/api/v2/user/profile', { method: 'PUT', body }),
  );
  // The Zod union is already validated — narrow with explicit casts.
  const raw = res.data as { status?: string };
  if (raw.status === 'otp_required') {
    const data = res.data as OtpRequiredData;
    return {
      kind: 'otpRequired',
      otpSentTo: data.otp_sent_to ?? null,
      maskedDestination: data.masked_destination ?? null,
      expiresIn: data.expires_in ?? null,
      resendAfter: data.resend_after ?? null,
      message: data.message ?? undefined,
    };
  }
  if (raw.status === 'channel_required') {
    const data = res.data as ChannelRequiredData;
    return {
      kind: 'channelRequired',
      channels: data.available_channels ?? [],
      message: data.message ?? undefined,
    };
  }
  return { kind: 'success', profile: mapRawProfile(res.data as RawUserProfile) };
}

/** POST /api/v2/user/profile/verify — body { otp } → updated profile. */
export async function verifyProfileV2(otp: string): Promise<Profile> {
  const res = profileUpdateV2ResponseSchema.parse(
    await api<unknown>('/api/v2/user/profile/verify', {
      method: 'POST',
      body: { otp },
    }),
  );
  const data = res.data as { status?: string };
  if (data.status) {
    // Defensive: the verify endpoint should return the profile directly.
    throw new Error(res.message ?? 'Unexpected verification response');
  }
  return mapRawProfile(res.data as RawUserProfile);
}

/** POST /api/v2/user/profile/resend-otp — no body; returns the same
    otp_required payload (fresh masked destination / resend timer). */
export async function resendProfileOtpV2(): Promise<Extract<
  ProfileUpdateResult,
  { kind: 'otpRequired' }
>> {
  const res = profileUpdateV2ResponseSchema.parse(
    await api<unknown>('/api/v2/user/profile/resend-otp', { method: 'POST' }),
  );
  const raw = res.data as { status?: string };
  if (raw.status !== 'otp_required') {
    throw new Error(res.message ?? 'Unexpected resend response');
  }
  const data = res.data as OtpRequiredData;
  return {
    kind: 'otpRequired',
    otpSentTo: data.otp_sent_to ?? null,
    maskedDestination: data.masked_destination ?? null,
    expiresIn: data.expires_in ?? null,
    resendAfter: data.resend_after ?? null,
    message: data.message ?? undefined,
  };
}

/* ---------- dropdown sources ---------- */

/** GET /api/v1/countries → [{ id, country_name }, …] */
export async function fetchCountries(): Promise<RawCountry[]> {
  const res = countriesResponseSchema.parse(await api<unknown>('/api/v1/countries'));
  return res.data;
}

/** GET /api/v1/age-ranges → [{ id, label }, …] */
export async function fetchAgeRanges(): Promise<RawAgeRange[]> {
  const res = ageRangesResponseSchema.parse(await api<unknown>('/api/v1/age-ranges'));
  return res.data;
}

/** PUT /api/v2/user/age-range → update the user's age range */
export async function updateAgeRange(ageRangeId: number): Promise<{ success: boolean; message?: string; data?: unknown }> {
  return await api<{ success: boolean; message?: string; data?: unknown }>('/api/v2/user/age-range', {
    method: 'PUT',
    body: { age_range_id: ageRangeId },
  });
}

/* ---------- bundles (ported from BundleRepository) ---------- */

/** Unwrap the { success, data: … } envelope the bundle endpoints use
    (same unwrapping as the Dart BundleRepository). */
async function postBundleEndpoint(path: string, code: string): Promise<Record<string, unknown>> {
  const res = (await api<unknown>(path, { method: 'POST', body: { code } })) as {
    data?: unknown;
  };
  if (res.data == null || typeof res.data !== 'object') {
    throw new Error('Invalid bundle response format');
  }
  return res.data as Record<string, unknown>;
}

/** POST /api/v1/bundles/redeem/validate — check a code before redeeming. */
export async function validateBundleCode(code: string): Promise<ValidateBundleResponse> {
  return validateBundleResponseSchema.parse(
    await postBundleEndpoint('/api/v1/bundles/redeem/validate', code),
  );
}

/** POST /api/v1/bundles/redeem — consume a validated code. */
export async function redeemBundleCode(code: string): Promise<RedeemBundleResponse> {
  return redeemBundleResponseSchema.parse(
    await postBundleEndpoint('/api/v1/bundles/redeem', code),
  );
}
