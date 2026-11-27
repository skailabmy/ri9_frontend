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
  weeklyBoardHistoryResponseSchema,
  quizSessionHistoryResponseSchema,
  ongoingWeeklyBoardResponseSchema,
  ongoingQuizSessionResponseSchema,
  quizSessionAttemptsResponseSchema,
  quizSessionSubjectsResponseSchema,
  quizSessionStartResponseSchema,
  quizAnswerResponseSchema,
  type RawLeaderboardSummary,
  type RawPodiumPlayer,
  type RawUserStanding,
  type RawWeeklyBoardHistoryItem,
  type RawQuizSessionHistoryItem,
  type RawBoardWinner,
  type RawWeeklyBoardPrize,
  type RawOngoingWeeklyBoard,
  type RawSelectablePrize,
  type RawUserPrizeSelection,
  type RawQuizSessionAttempt,
  type RawQuizSubject,
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

/* ---------- weekly boards history ---------- */

export type WeeklyBoardHistoryFilter = 'all' | 'won' | 'played';

export interface BoardPrize {
  id: number | null;
  position: number;
  name: string;
  image: string | null;
}

export interface BoardWinner {
  userId: number | null;
  username: string | null;
  name: string;
  avatarUrl: string | null;
  position: number;
  prizeId: number | null;
  prizeName: string;
  prizeImage: string | null;
  score: number;
}

export interface WeeklyBoardHistoryItem {
  id: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  sortRule: string;
  winners: BoardWinner[];
  prizes: BoardPrize[];
  userWon: boolean;
  userPlayed: boolean;
  userWinningDetails: BoardWinner | null;
}

export interface WeeklyBoardHistoryStats {
  totalBoards: number;
  boardsWon: number;
  boardsPlayed: number;
}

export interface WeeklyBoardHistoryResult {
  stats: WeeklyBoardHistoryStats;
  filter: WeeklyBoardHistoryFilter;
  boards: WeeklyBoardHistoryItem[];
}

/* ---------- quiz sessions history ---------- */

export type QuizSessionHistoryFilter = 'all' | 'won' | 'played';

export interface QuizSessionHistoryItem {
  id: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  winners: BoardWinner[];
  prizes: BoardPrize[];
  userWon: boolean;
  userPlayed: boolean;
  userWinningDetails: BoardWinner | null;
}

export interface QuizSessionHistoryStats {
  totalSessions: number;
  sessionsWon: number;
  sessionsPlayed: number;
}

export interface QuizSessionHistoryResult {
  stats: QuizSessionHistoryStats;
  filter: QuizSessionHistoryFilter;
  sessions: QuizSessionHistoryItem[];
}

function parseImageString(img: string | null | undefined): string | null {
  if (!img) return null;
  const trimmed = img.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, string>;
      return (
        parsed.original ||
        parsed['400X310'] ||
        parsed['400X300'] ||
        parsed['400X200'] ||
        parsed['200X200'] ||
        parsed['150X150'] ||
        Object.values(parsed)[0] ||
        null
      );
    } catch (_) {
      return img;
    }
  }
  return img;
}

/** Safely resolve the first usable image URL from a prize's
    product_images field, which the API returns as either an
    object ({ original, thumb, ... }) or an array of strings. */
function pickProductImage(
  rawImages: { original?: string | null; thumb?: string | null } | string[] | null | undefined,
): string | null {
  if (!rawImages) return null;
  if (Array.isArray(rawImages)) return rawImages[0] ?? null;
  return (
    rawImages.original ||
    rawImages.thumb ||
    Object.values(rawImages).find((v): v is string => typeof v === 'string') ||
    null
  );
}

function mapBoardPrize(raw: RawWeeklyBoardPrize, defaultPos = 1): BoardPrize {
  const name =
    raw.formatted_prize?.title ||
    raw.formatted_prize?.name ||
    raw.prize?.product_name ||
    raw.prize?.name ||
    raw.prize?.title ||
    raw.name ||
    raw.title ||
    'Prize';

  const rawImages = raw.formatted_prize?.product_images || raw.product_images;
  const imageFromObject = pickProductImage(rawImages);

  const rawImgStr =
    raw.formatted_prize?.product_image ||
    raw.prize?.product_image ||
    raw.product_image ||
    raw.formatted_prize?.image_url ||
    raw.prize?.image_url ||
    raw.image_url;

  const image = imageFromObject || parseImageString(rawImgStr) || null;

  return {
    id: raw.id ?? raw.formatted_prize?.id ?? raw.prize?.id ?? null,
    position: raw.position ?? defaultPos,
    name,
    image,
  };
}

function mapQuizSessionItem(raw: RawQuizSessionHistoryItem): QuizSessionHistoryItem {
  const rawWinners = raw.winners ?? [];
  const rawPrizes = raw.prizes ?? [];
  return {
    id: typeof raw.id === 'number' ? raw.id : Number(raw.id) || 0,
    title: raw.title || 'Prize Quiz',
    startDate: raw.start_date ?? null,
    endDate: raw.end_date ?? null,
    winners: rawWinners.map((w, idx) => mapBoardWinner(w, idx + 1)),
    prizes: rawPrizes.map((p, idx) => mapBoardPrize(p, idx + 1)),
    userWon: raw.user_won ?? false,
    userPlayed: raw.user_played ?? false,
    userWinningDetails: raw.user_winning_details ? mapBoardWinner(raw.user_winning_details) : null,
  };
}

/** GET /api/v1/quiz-sessions/history?filter=all|won|played */
export async function fetchQuizSessionsHistory(
  filter: QuizSessionHistoryFilter = 'all',
): Promise<QuizSessionHistoryResult> {
  const res = quizSessionHistoryResponseSchema.parse(
    await api<unknown>(`/api/v1/quiz-sessions/history?filter=${filter}`),
  );

  return {
    stats: {
      totalSessions: res.stats?.total_sessions ?? 0,
      sessionsWon: res.stats?.sessions_won ?? 0,
      sessionsPlayed: res.stats?.sessions_played ?? 0,
    },
    filter: (res.filter as QuizSessionHistoryFilter) || filter,
    sessions: (res.data ?? []).map(mapQuizSessionItem),
  };
}

function mapBoardWinner(raw: RawBoardWinner, defaultPosition = 1): BoardWinner {
  const username =
    raw.username ||
    raw.user_name ||
    raw.user?.username ||
    raw.user?.user_name ||
    raw.metadata?.username ||
    raw.metadata?.user_name ||
    null;

  const displayName =
    raw.name ||
    raw.fullname ||
    raw.user?.fullname ||
    raw.user?.name ||
    username ||
    'Player';

  const prizeImage =
    raw.formatted_prize?.product_image ||
    pickProductImage(raw.formatted_prize?.product_images) ||
    parseImageString(raw.prize?.product_image) ||
    raw.prize?.image_url ||
    raw.formatted_prize?.image_url ||
    null;

  return {
    userId: raw.user_id ?? raw.user?.id ?? null,
    username,
    name: displayName,
    avatarUrl: raw.avatar_url ?? raw.user?.avatar_url ?? null,
    position: raw.position ?? defaultPosition,
    prizeId: raw.prize_id ?? raw.formatted_prize?.id ?? raw.prize?.id ?? null,
    prizeName:
      raw.prize_name ||
      raw.prize_title ||
      raw.formatted_prize?.title ||
      raw.formatted_prize?.name ||
      raw.prize?.product_name ||
      raw.prize?.name ||
      raw.prize?.title ||
      'Weekly Prize',
    prizeImage,
    score:
      raw.score ??
      raw.points ??
      raw.metadata?.challenges_completed ??
      raw.metadata?.total_coins ??
      0,
  };
}

function mapWeeklyBoardItem(raw: RawWeeklyBoardHistoryItem): WeeklyBoardHistoryItem {
  const rawWinners = raw.winners ?? [];
  const rawPrizes = raw.prizes ?? [];
  return {
    id: typeof raw.id === 'number' ? raw.id : Number(raw.id) || 0,
    title: raw.title || 'Weekly Leaderboard',
    startDate: raw.start_date ?? null,
    endDate: raw.end_date ?? null,
    sortRule: raw.sort_rule || '',
    winners: rawWinners.map((w, idx) => mapBoardWinner(w, idx + 1)),
    prizes: rawPrizes.map((p, idx) => mapBoardPrize(p, idx + 1)),
    userWon: raw.user_won ?? false,
    userPlayed: raw.user_played ?? false,
    userWinningDetails: raw.user_winning_details ? mapBoardWinner(raw.user_winning_details) : null,
  };
}

/** GET /api/v1/weekly-boards/history?filter=all|won|played */
export async function fetchWeeklyBoardsHistory(
  filter: WeeklyBoardHistoryFilter = 'all',
): Promise<WeeklyBoardHistoryResult> {
  const res = weeklyBoardHistoryResponseSchema.parse(
    await api<unknown>(`/api/v1/weekly-boards/history?filter=${filter}`),
  );

  return {
    stats: {
      totalBoards: res.stats?.total_boards ?? 0,
      boardsWon: res.stats?.boards_won ?? 0,
      boardsPlayed: res.stats?.boards_played ?? 0,
    },
    filter: (res.filter as WeeklyBoardHistoryFilter) || filter,
    boards: (res.data ?? []).map(mapWeeklyBoardItem),
  };
}

export interface OngoingSelectablePrize {
  prizeId: number;
  prizeName: string;
  productDescription: string;
  productImage: string | null;
  isDefault: boolean;
}

export interface OngoingWeeklyBoard {
  id: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  sortRule: string;
  myPrizeSelections: Record<string, { prizeId: number; prizeName: string }>;
  selectablePrizes: Record<string, OngoingSelectablePrize[]>;
}

/** GET /api/v1/weekly-boards/ongoing */
export async function fetchOngoingWeeklyBoard(): Promise<OngoingWeeklyBoard | null> {
  const res = ongoingWeeklyBoardResponseSchema.parse(
    await api<unknown>('/api/v1/weekly-boards/ongoing'),
  );

  const rawBoard = res.data?.[0];
  if (!rawBoard) return null;

  const mySelections: Record<string, { prizeId: number; prizeName: string }> = {};
  if (rawBoard.my_prize_selections && typeof rawBoard.my_prize_selections === 'object') {
    if (Array.isArray(rawBoard.my_prize_selections)) {
      rawBoard.my_prize_selections.forEach((sel, i) => {
        if (sel?.prize_id != null) {
          mySelections[String(i + 1)] = {
            prizeId: sel.prize_id,
            prizeName: sel.prize_name || sel.product_name || 'Selected Prize',
          };
        }
      });
    } else {
      for (const [pos, sel] of Object.entries(rawBoard.my_prize_selections)) {
        if (sel && sel.prize_id != null) {
          mySelections[pos] = {
            prizeId: sel.prize_id,
            prizeName: sel.prize_name || sel.product_name || 'Selected Prize',
          };
        }
      }
    }
  }

  const selectable: Record<string, OngoingSelectablePrize[]> = {};
  if (rawBoard.selectable_prizes && typeof rawBoard.selectable_prizes === 'object') {
    for (const [pos, list] of Object.entries(rawBoard.selectable_prizes)) {
      if (Array.isArray(list)) {
        selectable[pos] = list.map((p) => ({
          prizeId: p.prize_id,
          prizeName: p.prize_name || p.product_name || 'Prize',
          productDescription: p.product_description || '',
          productImage: p.product_image || null,
          isDefault: p.is_default ?? false,
        }));
      }
    }
  }

  return {
    id: typeof rawBoard.id === 'number' ? rawBoard.id : Number(rawBoard.id) || 0,
    title: rawBoard.title || 'Ongoing Weekly Board',
    startDate: rawBoard.start_date ?? null,
    endDate: rawBoard.end_date ?? null,
    sortRule: rawBoard.sort_rule || '',
    myPrizeSelections: mySelections,
    selectablePrizes: selectable,
  };
}

/** POST /api/v1/weekly-boards/{boardId}/prize-selection */
export async function selectBoardPrize(
  boardId: number,
  position: number,
  prizeId: number,
): Promise<void> {
  await api<unknown>(`/api/v1/weekly-boards/${boardId}/prize-selection`, {
    method: 'POST',
    body: { position, prize_id: prizeId },
  });
}

/* ---------- ongoing quiz sessions & prize selection ---------- */

export interface OngoingQuizSession {
  id: number;
  title: string;
  startDate: string | null;
  endDate: string | null;
  myPrizeSelections: Record<string, { prizeId: number; prizeName: string }>;
  selectablePrizes: Record<string, OngoingSelectablePrize[]>;
}

/** GET /api/v1/quiz-sessions/ongoing */
export async function fetchOngoingQuizSession(): Promise<OngoingQuizSession | null> {
  const res = ongoingQuizSessionResponseSchema.parse(
    await api<unknown>('/api/v1/quiz-sessions/ongoing'),
  );

  const rawSession = res.data?.[0];
  if (!rawSession) return null;

  const mySelections: Record<string, { prizeId: number; prizeName: string }> = {};
  if (rawSession.my_prize_selections && typeof rawSession.my_prize_selections === 'object') {
    if (Array.isArray(rawSession.my_prize_selections)) {
      rawSession.my_prize_selections.forEach((sel, i) => {
        if (sel?.prize_id != null) {
          mySelections[String(i + 1)] = {
            prizeId: sel.prize_id,
            prizeName: sel.prize_name || sel.product_name || 'Selected Prize',
          };
        }
      });
    } else {
      for (const [pos, sel] of Object.entries(rawSession.my_prize_selections)) {
        if (sel && sel.prize_id != null) {
          mySelections[pos] = {
            prizeId: sel.prize_id,
            prizeName: sel.prize_name || sel.product_name || 'Selected Prize',
          };
        }
      }
    }
  }

  const selectable: Record<string, OngoingSelectablePrize[]> = {};
  if (rawSession.selectable_prizes && typeof rawSession.selectable_prizes === 'object') {
    for (const [pos, list] of Object.entries(rawSession.selectable_prizes)) {
      if (Array.isArray(list)) {
        selectable[pos] = list.map((p) => ({
          prizeId: p.prize_id,
          prizeName: p.prize_name || p.product_name || 'Prize',
          productDescription: p.product_description || '',
          productImage: p.product_image || null,
          isDefault: p.is_default ?? false,
        }));
      }
    }
  }

  return {
    id: typeof rawSession.id === 'number' ? rawSession.id : Number(rawSession.id) || 0,
    title: rawSession.title || 'Ongoing Quiz Session',
    startDate: rawSession.start_date ?? null,
    endDate: rawSession.end_date ?? null,
    myPrizeSelections: mySelections,
    selectablePrizes: selectable,
  };
}

/** POST /api/v1/quiz-sessions/{sessionId}/prize-selection */
export async function selectQuizPrize(
  sessionId: number,
  position: number,
  prizeId: number,
): Promise<void> {
  await api<unknown>(`/api/v1/quiz-sessions/${sessionId}/prize-selection`, {
    method: 'POST',
    body: { position, prize_id: prizeId },
  });
}

/** DELETE /api/v1/quiz-sessions/{sessionId}/prize-selection */
export async function deselectQuizPrize(
  sessionId: number,
  position: number,
): Promise<void> {
  await api<unknown>(`/api/v1/quiz-sessions/${sessionId}/prize-selection`, {
    method: 'DELETE',
    body: { position },
  });
}

/* ---------- quiz session attempts ---------- */

export interface QuizSessionAttempt {
  id?: number | null;
  attemptNumber: number;
  status: string; // 'available' | 'completed' | 'in_progress' | ...
  score: number | null;
  speedSeconds: number | null;
  isBest: boolean;
  subjectId: number | null;
  subjectName: string | null;
  categoryId: number | null;
  categoryName: string | null;
}

function mapQuizAttempt(raw: RawQuizSessionAttempt): QuizSessionAttempt {
  return {
    id: raw.id != null ? Number(raw.id) : null,
    attemptNumber: typeof raw.attempt_number === 'number' ? raw.attempt_number : Number(raw.attempt_number) || 0,
    status: raw.status || 'available',
    score: raw.score != null ? raw.score : null,
    speedSeconds: raw.speed_seconds != null ? raw.speed_seconds : null,
    isBest: Boolean(raw.is_best),
    subjectId: raw.subject_id ?? null,
    subjectName: raw.subject_name ?? null,
    categoryId: raw.category_id ?? null,
    categoryName: raw.category_name ?? null,
  };
}

/** GET /api/v1/quiz-sessions/{sessionId}/attempts */
export async function fetchQuizSessionAttempts(
  sessionId: number,
): Promise<QuizSessionAttempt[]> {
  const res = quizSessionAttemptsResponseSchema.parse(
    await api<unknown>(`/api/v1/quiz-sessions/${sessionId}/attempts`),
  );
  return (res.data ?? []).map(mapQuizAttempt);
}

/* ---------- quiz session subjects & categories ---------- */

export interface QuizCategoryItem {
  id: number;
  name: string;
  description: string;
  isEligible: boolean;
  isCompleted: boolean;
  completionPercentage: number;
  totalQuestionsCompleted: number;
  totalQuestions: number;
}

export interface QuizSubjectItem {
  id: number;
  name: string;
  description: string;
  imageUrl: string | null;
  iconUrl: string | null;
  priority: number;
  isActive: boolean;
  isLocked: boolean;
  ageRangeIds: number[];
  completionPercentage: number;
  categories: QuizCategoryItem[];
  ageRanges: { id: number; label: string; minAge?: number | null; maxAge?: number | null }[];
}

function mapQuizSubject(raw: RawQuizSubject): QuizSubjectItem {
  return {
    id: typeof raw.id === 'number' ? raw.id : Number(raw.id) || 0,
    name: raw.name || 'Subject',
    description: raw.description || '',
    imageUrl: raw.image_url || null,
    iconUrl: raw.icon_url || null,
    priority: raw.priority ?? 0,
    isActive: raw.is_active ?? true,
    isLocked: raw.is_locked ?? false,
    ageRangeIds: raw.age_range_ids || [],
    completionPercentage: raw.completion_percentage ?? 0,
    categories: (raw.categories || []).map((c) => ({
      id: typeof c.id === 'number' ? c.id : Number(c.id) || 0,
      name: c.name || 'Chapter',
      description: c.description || '',
      isEligible: c.is_eligible ?? true,
      isCompleted: c.is_completed ?? false,
      completionPercentage: c.completion_percentage ?? 0,
      totalQuestionsCompleted: c.total_questions_completed ?? 0,
      totalQuestions: c.total_questions ?? 0,
    })),
    ageRanges: (raw.age_ranges || []).map((ar) => ({
      id: typeof ar.id === 'number' ? ar.id : Number(ar.id) || 0,
      label: ar.label || '',
      minAge: ar.min_age ?? null,
      maxAge: ar.max_age ?? null,
    })),
  };
}

/** GET /api/v1/quiz-sessions/{sessionId}/subjects */
export async function fetchQuizSessionSubjects(
  sessionId: number,
): Promise<QuizSubjectItem[]> {
  const res = quizSessionSubjectsResponseSchema.parse(
    await api<unknown>(`/api/v1/quiz-sessions/${sessionId}/subjects`),
  );
  return (res.data ?? []).map(mapQuizSubject);
}

/* ---------- quiz session start & answer ---------- */
export interface QuizOptionItem {
  id: number;
  optionText: string;
}

export interface QuizQuestionItem {
  id: number;
  questionText: string;
  questionImageUrl: string | null;
  questionAudioUrl: string | null;
  difficulty: number | null;
  isGrouped: boolean;
  stimulus: any | null;
  groupedQuestions: any[] | null;
  options: QuizOptionItem[];
}

export interface QuizSessionStartResult {
  attemptId: number;
  attemptNumber: number;
  extraLife: number;
  firstQuestion: QuizQuestionItem | null;
  totalQuestions: number;
  elapsedSeconds: number;
}

export interface QuizAnswerResult {
  success: boolean;
  roundEnded: boolean;
  isCorrect: boolean;
  nextQuestion: QuizQuestionItem | null;
  extraLife?: number;
  score?: number;
  categoryTransition?: any;
}

function mapQuizQuestion(q: any): QuizQuestionItem {
  return {
    id: typeof q.id === 'number' ? q.id : Number(q.id) || 0,
    questionText: q.question_text || '',
    questionImageUrl: q.question_image_url || null,
    questionAudioUrl: q.question_audio_url || null,
    difficulty: q.difficulty ?? null,
    isGrouped: !!q.is_grouped,
    stimulus: q.stimulus || null,
    groupedQuestions: Array.isArray(q.grouped_questions) ? q.grouped_questions : null,
    options: (q.options || []).map((o: any) => ({
      id: typeof o.id === 'number' ? o.id : Number(o.id) || 0,
      optionText: o.option_text || '',
    })),
  };
}

/** POST /api/v1/quiz-sessions/{sessionId}/start */
export async function startQuizSessionAttempt(
  sessionId: number,
  subjectId: number,
  categoryId?: number | null,
): Promise<QuizSessionStartResult> {
  const body: Record<string, any> = { subject_id: subjectId };
  if (categoryId != null) {
    body.category_id = categoryId;
  }
  const raw = await api<unknown>(`/api/v1/quiz-sessions/${sessionId}/start`, {
    method: 'POST',
    body,
  });
  const res = quizSessionStartResponseSchema.parse(raw);
  const d = res.data;
  return {
    attemptId: typeof d?.attempt_id === 'number' ? d.attempt_id : Number(d?.attempt_id) || 0,
    attemptNumber: d?.attempt_number ?? 1,
    extraLife: d?.extra_life ?? 1,
    firstQuestion: d?.first_question ? mapQuizQuestion(d.first_question) : null,
    totalQuestions: d?.total_questions ?? 0,
    elapsedSeconds: d?.elapsed_seconds ?? 0,
  };
}

/** POST /api/v1/quiz-attempts/{attemptId}/answer */
export async function submitQuizAttemptAnswer(
  attemptId: number,
  questionId: number,
  selectedOptionId: number,
  timeTakenSeconds: number,
  groupedQuestionId?: number | null,
): Promise<QuizAnswerResult> {
  const body: Record<string, any> = {
    question_id: questionId,
    selected_option_id: selectedOptionId,
    time_taken_seconds: timeTakenSeconds,
  };
  if (groupedQuestionId != null) {
    body.grouped_question_id = groupedQuestionId;
  }
  const raw = await api<unknown>(`/api/v1/quiz-attempts/${attemptId}/answer`, {
    method: 'POST',
    body,
  });
  const res = quizAnswerResponseSchema.parse(raw);
  return {
    success: !!res.success,
    roundEnded: !!res.round_ended,
    isCorrect: !!res.is_correct,
    nextQuestion: res.next_question ? mapQuizQuestion(res.next_question) : null,
    extraLife: res.extra_life,
    score: res.score,
    categoryTransition: res.category_transition,
  };
}

/** POST /api/v1/quiz-attempts/{attemptId}/complete */
export async function completeQuizAttempt(attemptId: number): Promise<void> {
  await api<unknown>(`/api/v1/quiz-attempts/${attemptId}/complete`, {
    method: 'POST',
  });
}




