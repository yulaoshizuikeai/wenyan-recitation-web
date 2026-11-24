import { Article, ALL_ARTICLES } from "../../data/curriculumData";
import { Flashcard } from "../../data/flashcardGenerator";
import { flashcardCache } from "../../data/flashcardCache";
import { CardFsrsState, CardState, Rating } from "./fsrsTypes";
import { FSRSEngine } from "./fsrsEngine";
import { getSetting, setSetting } from "../../storage/db";

export interface SchedulerSettings {
  dailyNewLimit: number;       // 每日新卡上限 (默认 20, 0 为无限制)
  dailyReviewLimit: number;    // 每日复习上限 (默认 100, 0 为无限制)
  cardOrder: "sequential" | "random"; // 出卡顺序 (默认 sequential 循序渐进)
  enableSessionLoop: boolean;  // 会话内重学循环 (默认 true)
}

export const DEFAULT_SCHEDULER_SETTINGS: SchedulerSettings = {
  dailyNewLimit: 20,
  dailyReviewLimit: 100,
  cardOrder: "sequential",
  enableSessionLoop: true
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
    return getSetting<SchedulerSettings>("anki_scheduler_settings", DEFAULT_SCHEDULER_SETTINGS);
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

    const dueList: Flashcard[] = [];
    const learningList: Flashcard[] = [];
    const newList: Flashcard[] = [];

    for (const card of allCards) {
      const state = cardStatesMap.get(card.id);
      if (!state || state.state === CardState.NEW) {
        newList.push(card);
      } else if (state.state === CardState.LEARNING || state.state === CardState.RELEARNING) {
        learningList.push(card);
      } else if (state.state === CardState.REVIEW && state.dueTime <= now) {
        dueList.push(card);
      }
    }

    // Sort due cards by urgency (earliest due time first)
    dueList.sort((a, b) => {
      const stateA = cardStatesMap.get(a.id);
      const stateB = cardStatesMap.get(b.id);
      return (stateA?.dueTime || 0) - (stateB?.dueTime || 0);
    });

    // Apply daily review limit if configured (> 0)
    const effectiveDue = settings.dailyReviewLimit > 0
      ? dueList.slice(0, Math.max(0, settings.dailyReviewLimit - todayReviewed))
      : dueList;

    // Determine how many new cards to introduce today
    const remainingNewQuota = settings.dailyNewLimit > 0
      ? Math.max(0, settings.dailyNewLimit - todayNewLearned)
      : newList.length;

    let selectedNewCards = newList;
    if (settings.cardOrder === "random") {
      selectedNewCards = [...newList].sort(() => 0.5 - Math.random());
    }
    // Sequential: keep natural textbook sequence
    const effectiveNew = selectedNewCards.slice(0, remainingNewQuota);

    const totalTargetCards = learningList.length + effectiveDue.length + effectiveNew.length;
    // Estimated time: ~15s per review, ~25s per new card
    const estimatedMinutes = Math.max(1, Math.round((learningList.length * 15 + effectiveDue.length * 15 + effectiveNew.length * 25) / 60));

    let statusMessage = "今日背诵排程已由 FSRS-5 算法科学排定";
    let hasFinishedToday = false;

    if (totalTargetCards === 0) {
      hasFinishedToday = true;
      if (todayReviewed > 0 || todayNewLearned > 0) {
        statusMessage = `今日任务已圆满完成！已复习 ${todayReviewed} 句，新学 ${todayNewLearned} 句。名句记忆留存率达标。`;
      } else {
        statusMessage = "当前选册卡片记忆稳固，暂无到期待复习卡片。可随时增加新卡启程！";
      }
    } else if (learningList.length > 0 || effectiveDue.length > 0) {
      statusMessage = `检测到 ${effectiveDue.length + learningList.length} 句名句到达最佳抗遗忘巩固时机，排程建议优先巩固！`;
    } else {
      statusMessage = `今日待复习已清空，计划按教材循序渐进新学 ${effectiveNew.length} 句经典。`;
    }

    return {
      totalTargetCards,
      dueCards: effectiveDue,
      learningCards: learningList,
      newCards: effectiveNew,
      estimatedMinutes,
      statusMessage,
      hasFinishedToday,
      todayNewLearnedCount: todayNewLearned,
      todayReviewedCount: todayReviewed
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
