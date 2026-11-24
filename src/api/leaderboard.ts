/* ============================================================
   RI9 · Leaderboard API — challenge lobby's live board.
   Endpoint mirrors the backend's LeaderboardController:
     - summary: GET /api/v1/leaderboard/summary?period=today|week
       (top-3 podium + the signed-in player's standing, for the
       ongoing weekly board window)

   The response is validated at runtime with Zod schemas
   (src/api/schemas.ts) — no blind `as` casts.
   ============================================================ */
import { api } from './client';
import {
  leaderboardSummaryResponseSchema,
  type RawLeaderboardSummary,
  type RawPodiumPlayer,
  type RawUserStanding,
} from './schemas';

/** The summary endpoint's two board windows ('today' = current
    day inside the ongoing board, 'week' = the whole board). */
export type SummaryPeriod = 'today' | 'week';

/* ---------- mapped (camelCase) shapes ---------- */

/** One podium seat (positions 1–3). username/avatarUrl are null
    for unclaimed seats — the lobby renders an "Open seat". */
export interface PodiumPlayer {
  position: number;
  userId: number | null;
  username: string | null;
  avatarUrl: string | null;
  points: number;
  challengesCompletedCount: number;
  totalCoins: number;
  accuracy: number;
  speed: number;
}

/** The signed-in player's position on the live board. */
export interface UserStanding {
  isTopThree: boolean;
  isTopTen: boolean;
  /** null when the player hasn't ranked on this board yet */
  currentRank: number | null;
  currentPoints: number;
  /** points held by the current 10th place (prize cutoff) */
  top10ThresholdPoints: number;
  /** points still needed to enter the top 10 (0 when inside) */
  pointsToReachTop10: number;
}

export interface LeaderboardSummary {
  period: SummaryPeriod;
  sortRule: string;
  startDate: string | null;
  endDate: string | null;
  topThree: PodiumPlayer[];
  userStanding: UserStanding | null;
}

/* ---------- mappers (snake_case wire → camelCase) ---------- */

function mapPodiumPlayer(raw: RawPodiumPlayer): PodiumPlayer {
  return {
    position: raw.position,
    userId: raw.user_id ?? null,
    username: raw.username ?? null,
    avatarUrl: raw.avatar_url ?? null,
    points: raw.points ?? 0,
    challengesCompletedCount: raw.challenges_completed_count ?? 0,
    totalCoins: raw.total_coins ?? 0,
    accuracy: raw.accuracy ?? 0,
    speed: raw.speed ?? 0,
  };
}

function mapUserStanding(raw: RawUserStanding): UserStanding {
  return {
    isTopThree: raw.is_top_three ?? false,
    isTopTen: raw.is_top_ten ?? false,
    currentRank: raw.current_rank ?? null,
    currentPoints: raw.current_points ?? 0,
    top10ThresholdPoints: raw.top_10_threshold_points ?? 0,
    pointsToReachTop10: raw.points_to_reach_top_10 ?? 0,
  };
}

function mapLeaderboardSummary(data: RawLeaderboardSummary['data']): LeaderboardSummary {
  return {
    period: data.period === 'week' ? 'week' : 'today',
    sortRule: data.sort_rule ?? '',
    startDate: data.start_date ?? null,
    endDate: data.end_date ?? null,
    topThree: data.top_three.map(mapPodiumPlayer),
    userStanding: data.user_standing ? mapUserStanding(data.user_standing) : null,
  };
}

/** GET /api/v1/leaderboard/summary?period=today|week — top-3 podium
    plus the authenticated user's standing (null when unauthenticated
    or when no ongoing board exists). */
export async function fetchLeaderboardSummary(
  period: SummaryPeriod = 'today',
): Promise<LeaderboardSummary> {
  const res = leaderboardSummaryResponseSchema.parse(
    await api<unknown>(`/api/v1/leaderboard/summary?period=${period}`),
  );
  return mapLeaderboardSummary(res.data);
}
