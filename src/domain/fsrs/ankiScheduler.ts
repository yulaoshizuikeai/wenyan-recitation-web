import { Article } from "../../data/curriculumData";
import { Flashcard } from "../../data/flashcardGenerator";
import { flashcardCache } from "../../data/flashcardCache";
import { CardFsrsState, CardState } from "./fsrsTypes";
import { FSRSEngine } from "./fsrsEngine";
import { getSetting, setSetting } from "../../storage/db";
import { getLocalDateString } from "../../utils/date";

export interface SchedulerSettings {
  dailyNewLimit: number;       // 每日新卡上限 (默认 20, 0 为无限制)
  dailyReviewLimit: number;    // 每日复习上限 (默认 100, 0 为无限制)
  cardOrder: "sequential" | "random"; // 出卡顺序 (默认 sequential 循序渐进)
  enableSessionLoop: boolean;  // 会话内重学循环 (默认 true)
  burySiblings?: boolean;      // 同分句兄弟卡同日避让 (默认 true)
}

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  dailyNewLimit: 20,
  dailyReviewLimit: 100,
  cardOrder: "sequential",
  enableSessionLoop: true,
  burySiblings: true
};

export interface DailySchedulePlan {
  totalTargetCards: number;
  dueCards: Flashcard[];
  learningCards: Flashcard[];
  newCards: Flashcard[];
  estimatedMinutes: number;
  statusMessage: string;
  hasFinishedToday: boolean;
  todayNewLearnedCount: number;
  todayReviewedCount: number;
  buriedSiblingsCount?: number;
}

export interface SiblingBuryResult {
  selected: Flashcard[];
  buried: Flashcard[];
}

/**
 * Filter sibling flashcards sharing the same `segmentId` so at most one card
 * per segment is scheduled on the same day.
 *
 * Selection priority within each unblocked segment:
 * 1. Cards in `priorityCardIds` (e.g. a learning card already active today)
 * 2. Cards with `isPrimary === true`
 * 3. First/highest-priority candidate in `candidates`
 */
export function burySiblingCards(
  candidates: Flashcard[],
  blockedSegments: ReadonlySet<string> = new Set(),
  priorityCardIds?: ReadonlySet<string>
): SiblingBuryResult {
  const winnerIndexBySegment = new Map<string, number>();

  for (let i = 0; i < candidates.length; i++) {
    const card = candidates[i];
    const segKey = card.segmentId || card.id;
    if (blockedSegments.has(segKey)) {
      continue;
    }

    const existingIdx = winnerIndexBySegment.get(segKey);
    if (existingIdx === undefined) {
      winnerIndexBySegment.set(segKey, i);
      continue;
    }

    const existingCard = candidates[existingIdx];
    const existingPriority = priorityCardIds?.has(existingCard.id) ?? false;
    const candidatePriority = priorityCardIds?.has(card.id) ?? false;

    if (candidatePriority !== existingPriority) {
      if (candidatePriority) {
        winnerIndexBySegment.set(segKey, i);
      }
      continue;
    }

    if (!existingCard.isPrimary && card.isPrimary) {
      winnerIndexBySegment.set(segKey, i);
    }
  }

  const selected: Flashcard[] = [];
  const buried: Flashcard[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const card = candidates[i];
    const segKey = card.segmentId || card.id;
    if (winnerIndexBySegment.get(segKey) === i) {
      selected.push(card);
    } else {
      buried.push(card);
    }
  }

  return { selected, buried };
}

/**
 * Unbiased Fisher-Yates shuffle returning a new array.
 */
export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class AnkiScheduler {
  private fsrs: FSRSEngine;

  constructor(fsrsEngine?: FSRSEngine) {
    this.fsrs = fsrsEngine || new FSRSEngine();
  }

  /**
   * Load scheduler settings from storage
   */
  async getSettings(): Promise<SchedulerSettings> {
    const saved = await getSetting<Partial<SchedulerSettings> | null>("anki_scheduler_settings", null);
    return {
      ...DEFAULT_SCHEDULER_SETTINGS,
      ...(saved || {})
    };
  }

  /**
   * Save scheduler settings
   */
  async saveSettings(settings: SchedulerSettings): Promise<void> {
    await setSetting("anki_scheduler_settings", settings);
  }

  /**
   * Build a rational daily study plan for a given list of articles
   */
  buildDailyPlan(
    articles: Article[],
    cardStatesMap: Map<string, CardFsrsState>,
    settings: SchedulerSettings = DEFAULT_SCHEDULER_SETTINGS,
    todayNewLearned = 0,
    todayReviewed = 0,
    now = Date.now()
  ): DailySchedulePlan {
    const allCards = flashcardCache.getCardsForArticles(articles);
    const burySiblings = settings.burySiblings ?? true;
    const todayDateStr = getLocalDateString(new Date(now));

    const dueList: Flashcard[] = [];
    const learningList: Flashcard[] = [];
    const newList: Flashcard[] = [];
    const reviewedTodayFinishedSegments = new Set<string>();
    const reviewedTodayLearningCardIds = new Set<string>();

    for (const card of allCards) {
      const state = cardStatesMap.get(card.id);
      const segKey = card.segmentId || card.id;
      const isReviewedToday =
        state?.lastReviewTime != null &&
        getLocalDateString(new Date(state.lastReviewTime)) === todayDateStr;

      if (!state || state.state === CardState.NEW) {
        newList.push(card);
      } else if (state.state === CardState.LEARNING || state.state === CardState.RELEARNING) {
        learningList.push(card);
        if (isReviewedToday) {
          reviewedTodayLearningCardIds.add(card.id);
        }
      } else if (state.state === CardState.REVIEW) {
        if (state.dueTime <= now) {
          dueList.push(card);
        } else if (isReviewedToday) {
          // A sibling already reviewed and scheduled past today buries remaining siblings today.
          reviewedTodayFinishedSegments.add(segKey);
        }
      }
    }

    // Sort due cards by urgency (earliest due time first)
    dueList.sort((a, b) => {
      const stateA = cardStatesMap.get(a.id);
      const stateB = cardStatesMap.get(b.id);
      return (stateA?.dueTime || 0) - (stateB?.dueTime || 0);
    });

    let orderedNewCards = newList;
    if (settings.cardOrder === "random") {
      orderedNewCards = shuffleArray(newList);
    }

    const remainingReviewQuota = settings.dailyReviewLimit > 0
      ? Math.max(0, settings.dailyReviewLimit - todayReviewed)
      : dueList.length;

    const remainingNewQuota = settings.dailyNewLimit > 0
      ? Math.max(0, settings.dailyNewLimit - todayNewLearned)
      : orderedNewCards.length;

    let effectiveLearning = learningList;
    let effectiveDue: Flashcard[];
    let effectiveNew: Flashcard[];
    let buriedSiblingsCount = 0;

    if (burySiblings) {
      const claimedSegments = new Set<string>(reviewedTodayFinishedSegments);

      const learningRes = burySiblingCards(learningList, claimedSegments, reviewedTodayLearningCardIds);
      effectiveLearning = learningRes.selected;
      buriedSiblingsCount += learningRes.buried.length;
      for (const card of effectiveLearning) {
        claimedSegments.add(card.segmentId || card.id);
      }

      const dueRes = burySiblingCards(dueList, claimedSegments);
      effectiveDue = settings.dailyReviewLimit > 0
        ? dueRes.selected.slice(0, remainingReviewQuota)
        : dueRes.selected;
      buriedSiblingsCount += dueRes.buried.length;
      for (const card of effectiveDue) {
        claimedSegments.add(card.segmentId || card.id);
      }

      const newRes = burySiblingCards(orderedNewCards, claimedSegments);
      effectiveNew = newRes.selected.slice(0, remainingNewQuota);
      buriedSiblingsCount += newRes.buried.length;
    } else {
      effectiveDue = settings.dailyReviewLimit > 0
        ? dueList.slice(0, remainingReviewQuota)
        : dueList;
      effectiveNew = orderedNewCards.slice(0, remainingNewQuota);
    }

    const totalTargetCards = effectiveLearning.length + effectiveDue.length + effectiveNew.length;
    // Estimated time: ~15s per review, ~25s per new card
    const estimatedMinutes = Math.max(
      1,
      Math.round((effectiveLearning.length * 15 + effectiveDue.length * 15 + effectiveNew.length * 25) / 60)
    );

    let statusMessage = "今日背诵排程已由 FSRS-5 算法科学排定";
    let hasFinishedToday = false;

    if (totalTargetCards === 0) {
      hasFinishedToday = true;
      if (todayReviewed > 0 || todayNewLearned > 0) {
        statusMessage = `今日任务已圆满完成！已复习 ${todayReviewed} 句，新学 ${todayNewLearned} 句。名句记忆留存率达标。`;
      } else if (buriedSiblingsCount > 0) {
        statusMessage = `同句双向兄弟卡已自动延至明日（${buriedSiblingsCount} 张），今日无需重复背诵同一名句。`;
      } else {
        statusMessage = "当前选册卡片记忆稳固，暂无到期待复习卡片。可随时增加新卡启程！";
      }
    } else if (effectiveLearning.length > 0 || effectiveDue.length > 0) {
      statusMessage = `检测到 ${effectiveDue.length + effectiveLearning.length} 句名句到达最佳抗遗忘巩固时机，排程建议优先巩固！`;
    } else {
      statusMessage = `今日待复习已清空，计划按教材循序渐进新学 ${effectiveNew.length} 句经典。`;
    }

    return {
      totalTargetCards,
      dueCards: effectiveDue,
      learningCards: effectiveLearning,
      newCards: effectiveNew,
      estimatedMinutes,
      statusMessage,
      hasFinishedToday,
      todayNewLearnedCount: todayNewLearned,
      todayReviewedCount: todayReviewed,
      buriedSiblingsCount
    };
  }

  /**
   * Generate initial session study queue (Learning first -> Due reviews -> New cards)
   */
  createSessionQueue(plan: DailySchedulePlan): Flashcard[] {
    return [...plan.learningCards, ...plan.dueCards, ...plan.newCards];
  }

  /**
   * Handle in-session card repetition on "Again" (重来)
   * Re-inserts the failed card into the queue a few steps later so it gets reinforced in the same session.
   */
  requeueFailedCard(
    currentQueue: Flashcard[],
    currentIndex: number,
    card: Flashcard,
    offset = 4
  ): Flashcard[] {
    const nextQueue = [...currentQueue];
    // Target position: offset steps ahead, or end of queue
    const insertIndex = Math.min(nextQueue.length, currentIndex + offset);
    nextQueue.splice(insertIndex, 0, card);
    return nextQueue;
  }
}

export const ankiScheduler = new AnkiScheduler();
