/* ============================================================
   RI9 · Challenge & Subject API endpoints.
   ============================================================ */
import { api } from './client';

export interface SubjectItem {
  id: number;
  name: string;
  code?: string | null;
  priority?: number;
  iconUrl?: string | null;
  imageUrl?: string | null;
  isLocked?: boolean;
  totalChapters?: number | null;
  totalCategories?: number | null;
}

export interface ChallengeType {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  timeLimitSeconds?: number | null;
  requiredCorrectAnswers?: number | null;
  rewardCoins?: number;
  ruleType?: string;
  minAccuracyPercentage?: string | null;
  maxTimeSeconds?: number | null;
  requiresPerfectScore?: boolean;
  tracksGlobalRecord?: boolean;
  imageUrl?: string | null;
  questionsCount?: number;
  questionMode?: string;
}

export interface ChallengeItem {
  id: number;
  subjectId: number;
  challengeTypeId?: number;
  categoryId?: number;
  title: string;
  difficultyLevel?: string; // "easy" | "medium" | "hard"
  dumoPoints: number;
  isLocked: boolean;
  hasQuestions: boolean;
  challengeType?: ChallengeType | null;
}

export interface ChallengeCategoryItem {
  id: number;
  name: string;
  priorityIndex: number;
  isCompleted: boolean;
  isSelectable: boolean;
  totalQuestions?: number;
  totalQuestionsCompleted?: number;
  completionPercentage?: number;
}

export interface ChallengeCategoriesResponse {
  subjectId?: number;
  allCategoriesUnlocked: boolean;
  categories: ChallengeCategoryItem[];
}

export interface QuestionOption {
  id: number;
  optionText: string;
}

export interface QuestionStimulus {
  id: number;
  stimulusType: string;
  stimulusName?: string | null;
  stimulusText?: string | null;
  stimulusUrl?: string | null;
  stimulusImageUrl?: string | null;
  durationSeconds?: number | null;
}

export interface ApiQuestion {
  id: number;
  parentQuestionId?: number;
  groupedQuestionId?: number | null;
  questionText: string;
  questionImageUrl?: string | null;
  questionAudioUrl?: string | null;
  difficulty?: number | null;
  options: QuestionOption[];
  isGrouped?: boolean;
  stimulus?: QuestionStimulus | null;
}

export interface ChallengeAttempt {
  id: number;
  challengeId: number;
  userId: number;
  status: string;
  questions: ApiQuestion[];
}

export interface AnswerResponse {
  isCorrect: boolean;
  correctOptionId?: number;
}

export interface ChallengeCompleteResponse {
  attemptId: number;
  status: string;
  isPassed: boolean;
  message?: string;
  coinsEarned?: number;
}

/**
 * Start a challenge attempt: POST /api/v2/challenges/{id}/start?category_id={categoryId}
 */
export async function startChallengeAttempt(
  challengeId: number,
  categoryId?: number | null
): Promise<{ attempt: ChallengeAttempt; questions: ApiQuestion[] }> {
  let url = `/api/v2/challenges/${challengeId}/start`;
  if (categoryId) {
    url += `?category_id=${categoryId}`;
  }
  const res = await api<any>(url, { method: 'POST' });
  const data = res?.data ?? res ?? {};
  const attemptData = data.attempt ?? data;
  const rawQuestions = data.questions ?? attemptData.questions ?? [];
  const rawList = Array.isArray(rawQuestions) ? rawQuestions : Object.values(rawQuestions);

  const questions: ApiQuestion[] = [];

  for (const q of rawList) {
    const stimulus: QuestionStimulus | null = q.stimulus ? {
      id: q.stimulus.id,
      stimulusType: q.stimulus.stimulus_type ?? 'text',
      stimulusName: q.stimulus.stimulus_name ?? 'Passage',
      stimulusText: q.stimulus.stimulus_text ?? null,
      stimulusUrl: q.stimulus.stimulus_url ?? null,
      stimulusImageUrl: q.stimulus.stimulus_image_url ?? null,
      durationSeconds: q.stimulus.duration_seconds ?? null,
    } : null;

    if (q.is_grouped && Array.isArray(q.grouped_questions) && q.grouped_questions.length > 0) {
      // Grouped question: each child item becomes an answerable question
      for (const gq of q.grouped_questions) {
        questions.push({
          id: q.id,
          parentQuestionId: q.id,
          groupedQuestionId: gq.id,
          questionText: gq.question_text ?? '',
          questionImageUrl: q.question_image_url ?? null,
          questionAudioUrl: q.question_audio_url ?? null,
          difficulty: q.difficulty ?? null,
          isGrouped: true,
          stimulus,
          options: (gq.options ?? []).map((o: any) => ({
            id: o.id,
            optionText: o.option_text ?? '',
          })),
        });
      }
    } else {
      // Standard single question
      questions.push({
        id: q.id,
        parentQuestionId: q.id,
        groupedQuestionId: null,
        questionText: q.question_text ?? '',
        questionImageUrl: q.question_image_url ?? null,
        questionAudioUrl: q.question_audio_url ?? null,
        difficulty: q.difficulty ?? null,
        isGrouped: false,
        stimulus,
        options: (q.options ?? []).map((o: any) => ({
          id: o.id,
          optionText: o.option_text ?? '',
        })),
      });
    }
  }

  const attempt: ChallengeAttempt = {
    id: attemptData.id ?? attemptData.attempt_id ?? 0,
    challengeId: attemptData.challenge_id ?? challengeId,
    userId: attemptData.user_id ?? 0,
    status: attemptData.status ?? 'in_progress',
    questions,
  };

  return { attempt, questions };
}

/**
 * Submit an answer: POST /api/v1/challenges/attempts/{id}/answer
 */
export async function submitChallengeAnswer(
  attemptId: number,
  params: {
    questionId: number;
    selectedOptionId: number;
    timeTakenSeconds: number;
    groupedQuestionId?: number | null;
  }
): Promise<AnswerResponse> {
  const body: any = {
    question_id: params.questionId,
    selected_option_id: params.selectedOptionId,
    time_taken_seconds: params.timeTakenSeconds,
  };
  if (params.groupedQuestionId != null) {
    body.grouped_question_id = params.groupedQuestionId;
  }

  const res = await api<any>(`/api/v1/challenges/attempts/${attemptId}/answer`, {
    method: 'POST',
    body,
  });
  const data = res?.data ?? res ?? {};
  return {
    isCorrect: Boolean(data.is_correct),
    correctOptionId: data.answer?.correct_option_id ?? data.correct_option_id,
  };
}

/**
 * Complete a challenge attempt: POST /api/v1/challenges/attempts/{id}/complete
 */
export async function completeChallengeAttempt(
  attemptId: number
): Promise<ChallengeCompleteResponse> {
  const res = await api<any>(`/api/v1/challenges/attempts/${attemptId}/complete`, {
    method: 'POST',
  });
  const data = res?.data ?? res ?? {};
  const passed = Boolean(data.passed ?? data.is_passed ?? data.attempt?.passed);
  return {
    attemptId: data.attempt?.id ?? data.attempt_id ?? attemptId,
    status: data.attempt?.status ?? data.status ?? '',
    isPassed: passed,
    message: data.message,
    coinsEarned: data.coins_earned,
  };
}

/**
 * Fetch categories/chapters for a subject directly (GET /api/v1/subjects/{subjectId}/categories)
 */
export async function fetchSubjectCategories(subjectId: number): Promise<ChallengeCategoriesResponse> {
  const res = await api<any>(`/api/v1/subjects/${subjectId}/categories`);
  const data = res?.data?.categories ? res.data : (res?.data ?? res ?? {});
  const categoriesRaw = Array.isArray(data.categories)
    ? data.categories
    : (Array.isArray(data) ? data : []);

  return {
    subjectId: data.subject_id ?? subjectId,
    allCategoriesUnlocked: Boolean(data.all_categories_unlocked),
    categories: categoriesRaw.map((c: any) => ({
      id: c.id,
      name: c.name ?? '',
      priorityIndex: c.priority_index ?? 0,
      isCompleted: Boolean(c.is_completed),
      isSelectable: c.is_selectable ?? true,
      totalQuestions: c.total_questions ?? 0,
      totalQuestionsCompleted: c.total_questions_completed ?? 0,
      completionPercentage: c.completion_percentage ?? 0,
    })).sort((a: ChallengeCategoryItem, b: ChallengeCategoryItem) => a.priorityIndex - b.priorityIndex),
  };
}

/**
 * Fetch subjects list (mirrors Flutter GET /api/v1/subjects?active=true&home_screen=true)
 */
export async function fetchSubjects(): Promise<SubjectItem[]> {
  const res = await api<any>('/api/v1/subjects?active=true&home_screen=true');
  const rawList = Array.isArray(res)
    ? res
    : (Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.data) ? res.data.data : []));

  return rawList.map((s: any) => ({
    id: s.id,
    name: s.name ?? '',
    code: s.code ?? null,
    priority: s.priority ?? 0,
    iconUrl: s.icon_url ?? null,
    imageUrl: s.image_url ?? null,
    isLocked: Boolean(s.is_locked),
    totalChapters: s.total_chapters ?? s.total_categories ?? null,
    totalCategories: s.total_categories ?? null,
  })).sort((a: SubjectItem, b: SubjectItem) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Fetch challenges for a subject (mirrors Flutter GET /api/v1/challenges?subject_id={subjectId})
 */
export async function fetchChallenges(subjectId: number): Promise<ChallengeItem[]> {
  const res = await api<any>(`/api/v1/challenges?subject_id=${subjectId}`);
  // Handle paginated responses like: { success: true, data: { current_page: 1, data: [ ... ] } }
  // as well as { data: [ ... ] } or direct [ ... ]
  const rawList = Array.isArray(res)
    ? res
    : (Array.isArray(res?.data)
      ? res.data
      : (Array.isArray(res?.data?.data)
        ? res.data.data
        : []));

  return rawList.map((c: any) => ({
    id: c.id,
    subjectId: c.subject_id ?? subjectId,
    challengeTypeId: c.challenge_type_id,
    categoryId: c.category_id,
    title: c.title ?? c.name ?? '',
    difficultyLevel: c.difficulty_level ?? 'medium',
    dumoPoints: Number(c.dumo_points ?? c.challenge_type?.reward_coins ?? 0),
    isLocked: Boolean(c.is_locked),
    hasQuestions: Boolean(c.has_questions),
    challengeType: c.challenge_type ? {
      id: c.challenge_type.id,
      name: c.challenge_type.name,
      slug: c.challenge_type.slug,
      description: c.challenge_type.description,
      timeLimitSeconds: c.challenge_type.time_limit_seconds,
      requiredCorrectAnswers: c.challenge_type.required_correct_answers,
      rewardCoins: c.challenge_type.reward_coins,
      ruleType: c.challenge_type.rule_type,
      minAccuracyPercentage: c.challenge_type.min_accuracy_percentage,
      maxTimeSeconds: c.challenge_type.max_time_seconds,
      requiresPerfectScore: Boolean(c.challenge_type.requires_perfect_score),
      tracksGlobalRecord: Boolean(c.challenge_type.tracks_global_record),
      imageUrl: c.challenge_type.image_url,
      questionsCount: c.challenge_type.questions_count ?? 6,
      questionMode: c.challenge_type.question_mode,
    } : null,
  }));
}

/**
 * Fetch categories/chapters for a challenge (mirrors Flutter GET /api/v1/challenges/{id}/categories)
 */
export async function fetchChallengeCategories(challengeId: number): Promise<ChallengeCategoriesResponse> {
  const res = await api<any>(`/api/v1/challenges/${challengeId}/categories`);
  const data = res?.data?.categories ? res.data : (res?.data ?? res ?? {});
  const categoriesRaw = Array.isArray(data.categories)
    ? data.categories
    : (Array.isArray(data) ? data : []);

  return {
    allCategoriesUnlocked: Boolean(data.all_categories_unlocked),
    categories: categoriesRaw.map((c: any) => ({
      id: c.id,
      name: c.name ?? '',
      priorityIndex: c.priority_index ?? 0,
      isCompleted: Boolean(c.is_completed),
      isSelectable: c.is_selectable ?? true,
    })).sort((a: ChallengeCategoryItem, b: ChallengeCategoryItem) => a.priorityIndex - b.priorityIndex),
  };
}

export interface ReviewQuestionItem {
  questionId: number;
  questionText: string;
  questionImageUrl?: string | null;
  questionAudioUrl?: string | null;
  difficulty: number;
  explanationText?: string | null;
  options: {
    id: number;
    optionText: string;
    isCorrect: boolean;
  }[];
  userAnswer?: {
    selectedOptionId: number;
    selectedOptionText: string;
    isCorrect: boolean;
    timeTakenSeconds: number;
  } | null;
  correctAnswer?: {
    optionId: number;
    optionText: string;
  } | null;
}

export interface ChallengeReviewResponse {
  attemptId: number;
  challengeTitle: string;
  summary?: {
    totalQuestions: number;
    totalCorrect: number;
    totalWrong: number;
    accuracyPercentage: number;
    speedSeconds: number;
    coinsEarned: number;
  };
  questions: ReviewQuestionItem[];
}

/**
 * Fetch challenge attempt review (mirrors Flutter GET /api/v1/challenges/attempts/{id}/review)
 */
export async function fetchChallengeReview(attemptId: number): Promise<ChallengeReviewResponse> {
  const res = await api<any>(`/api/v1/challenges/attempts/${attemptId}/review`);
  const data = res?.data ?? res ?? {};

  const rawQuestions = Array.isArray(data.questions) ? data.questions : [];
  return {
    attemptId: data.attempt_id ?? attemptId,
    challengeTitle: data.challenge_title ?? '',
    summary: data.summary ? {
      totalQuestions: data.summary.total_questions ?? 0,
      totalCorrect: data.summary.total_correct ?? 0,
      totalWrong: data.summary.total_wrong ?? 0,
      accuracyPercentage: Number(data.summary.accuracy_percentage ?? 0),
      speedSeconds: data.summary.speed_seconds ?? 0,
      coinsEarned: data.summary.coins_earned ?? 0,
    } : undefined,
    questions: rawQuestions.map((q: any) => ({
      questionId: q.question_id ?? q.id ?? 0,
      questionText: q.question_text ?? '',
      questionImageUrl: q.question_image_url ?? null,
      questionAudioUrl: q.question_audio_url ?? null,
      difficulty: q.difficulty ?? 1,
      explanationText: q.explanation_text ?? null,
      options: (q.options ?? []).map((o: any) => ({
        id: o.id,
        optionText: o.option_text ?? '',
        isCorrect: Boolean(o.is_correct),
      })),
      userAnswer: q.user_answer ? {
        selectedOptionId: q.user_answer.selected_option_id,
        selectedOptionText: q.user_answer.selected_option_text ?? '',
        isCorrect: Boolean(q.user_answer.is_correct),
        timeTakenSeconds: q.user_answer.time_taken_seconds ?? 0,
      } : null,
      correctAnswer: q.correct_answer ? {
        optionId: q.correct_answer.option_id,
        optionText: q.correct_answer.option_text ?? '',
      } : null,
    })),
  };
}

/**
 * Ask AI Bot question (mirrors Flutter POST /api/v1/bot/ask)
 */
export async function askBotQuestion(params: {
  questionText: string;
  relatedQuestionId?: number | null;
  parentQuestionId?: number | null;
}): Promise<{ questionId: number; responseId: number; responseText: string }> {
  const body: any = {
    question_text: params.questionText,
  };
  if (params.relatedQuestionId != null) body.related_question_id = params.relatedQuestionId;
  if (params.parentQuestionId != null) body.parent_question_id = params.parentQuestionId;

  const res = await api<any>('/api/v1/bot/ask', {
    method: 'POST',
    body,
  });
  const data = res?.data ?? res ?? {};
  return {
    questionId: data.question_id ?? 0,
    responseId: data.response_id ?? 0,
    responseText: data.response_text ?? data.response?.response_text ?? '',
  };
}
