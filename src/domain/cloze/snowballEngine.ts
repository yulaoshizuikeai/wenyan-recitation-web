import { Article } from "../../data/curriculumData";
import { Flashcard, generateFlashcardsForArticle } from "../../data/flashcardGenerator";
import { FSRSEngine } from "../fsrs/fsrsEngine";
import { CardFsrsState, CardState, Rating, ReviewLog } from "../fsrs/fsrsTypes";

export interface SnowballUnit {
  index: number;
  text: string;
  cardIds: string[];
  segmentId?: string;
  primaryCardId?: string | null;
}

export interface SnowballStage {
  stageIndex: number;
  totalStages: number;
  newlyAddedUnit: SnowballUnit;
  chainUnits: SnowballUnit[];
  progressRatio: number;
}

export const DEFAULT_MAX_SNOWBALL_IMMEDIATE_LEARNING = 5;

/**
 * Select the single primary flashcard for a segment/unit so snowball completion
 * writes at most one card per `segmentId` instead of all sibling cloze variants.
 */
export function selectPrimaryCardForSegment(cards: readonly Flashcard[]): Flashcard | null {
  if (cards.length === 0) return null;
  const primaryPool = cards.filter(card => card.isPrimary);
  const pool = primaryPool.length > 0 ? primaryPool : cards;
  return pool.find(card => card.cardType === "UPPER_PROMPT_LOWER") ?? pool[0];
}

/**
 * Deduplicate flashcards by `segmentId`, returning at most one primary card per segment
 * while preserving natural segment order.
 */
export function selectSnowballPrimaryCards(flashcards: readonly Flashcard[]): Flashcard[] {
  const grouped = new Map<string, Flashcard[]>();

  for (const card of flashcards) {
    const segKey = card.segmentId || card.id;
    const bucket = grouped.get(segKey);
    if (bucket) {
      bucket.push(card);
    } else {
      grouped.set(segKey, [card]);
    }
  }

  const result: Flashcard[] = [];
  for (const group of grouped.values()) {
    const primary = selectPrimaryCardForSegment(group);
    if (primary) {
      result.push(primary);
    }
  }
  return result;
}

export interface SnowballCompletionInput {
  article: Article;
  stages: readonly SnowballStage[];
  bottleneckIndices: ReadonlySet<number> | readonly number[];
  existingCardStates: ReadonlyMap<string, CardFsrsState>;
  fsrs: FSRSEngine;
  now?: number;
  maxImmediateLearningCards?: number;
}

export interface SnowballCompletionPlan {
  primaryCardIds: string[];
  updatedCards: CardFsrsState[];
  reviewLogs: ReviewLog[];
  avgNextInterval: number;
  smoothCount: number;
  bottleneckCount: number;
  graduatedCount: number;
  immediateLearningCount: number;
}

function buildStagePrimaryCardResolver(
  stages: readonly SnowballStage[],
  article?: Article
): (stage: SnowballStage) => string | null {
  let cardById: Map<string, Flashcard> | null = null;

  return (stage: SnowballStage): string | null => {
    const unit = stage.newlyAddedUnit;
    if (unit.primaryCardId !== undefined) {
      return unit.primaryCardId;
    }
    if (unit.cardIds.length === 0) {
      return null;
    }
    if (article && cardById === null) {
      cardById = new Map<string, Flashcard>();
      for (const card of generateFlashcardsForArticle(article)) {
        cardById.set(card.id, card);
      }
    }
    if (cardById) {
      const unitCards = unit.cardIds
        .map(id => cardById!.get(id))
        .filter((card): card is Flashcard => card !== undefined);
      const primary = selectPrimaryCardForSegment(unitCards);
      if (primary) {
        return primary.id;
      }
    }
    return unit.cardIds[0] ?? null;
  };
}

/**
 * Collect the deduplicated primary card IDs (at most 1 per segment) across snowball stages.
 */
export function collectSnowballPrimaryCardIds(
  stages: readonly SnowballStage[],
  article?: Article
): string[] {
  const resolvePrimaryCardId = buildStagePrimaryCardResolver(stages, article);
  const seenSegments = new Set<string>();
  const seenCardIds = new Set<string>();
  const primaryCardIds: string[] = [];

  for (const stg of stages) {
    const primaryId = resolvePrimaryCardId(stg);
    if (!primaryId) continue;

    const segKey = stg.newlyAddedUnit.segmentId || primaryId;
    if (seenSegments.has(segKey) || seenCardIds.has(primaryId)) continue;

    seenSegments.add(segKey);
    seenCardIds.add(primaryId);
    primaryCardIds.push(primaryId);
  }

  return primaryCardIds;
}

/**
 * Build an isolated FSRS persistence plan on snowball completion:
 * - Writes at most one primary card per `segmentId`.
 * - Graduates smooth units directly out of short-term LEARNING steps into REVIEW (>= 1 day)
 *   so completing long articles (e.g. 赤壁赋, 琵琶行) does not flood today's Flashcard queue.
 * - Caps immediate LEARNING bottleneck cards and marks all logs `quotaIsolated: true`
 *   with `source: "snowball"` so today's Flashcard new-card quota stays intact.
 */
export function buildSnowballCompletionPlan(
  input: SnowballCompletionInput
): SnowballCompletionPlan {
  const {
    article,
    stages,
    bottleneckIndices,
    existingCardStates,
    fsrs,
    now = Date.now(),
    maxImmediateLearningCards = DEFAULT_MAX_SNOWBALL_IMMEDIATE_LEARNING
  } = input;

  if (stages.length === 0) {
    return {
      primaryCardIds: [],
      updatedCards: [],
      reviewLogs: [],
      avgNextInterval: 0,
      smoothCount: 0,
      bottleneckCount: 0,
      graduatedCount: 0,
      immediateLearningCount: 0
    };
  }

  const bottleneckSet =
    bottleneckIndices instanceof Set ? bottleneckIndices : new Set<number>(bottleneckIndices);
  const resolvePrimaryCardId = buildStagePrimaryCardResolver(stages, article);

  const seenSegments = new Set<string>();
  const seenCardIds = new Set<string>();
  const primaryCardIds: string[] = [];
  const updatedCards: CardFsrsState[] = [];
  const reviewLogs: ReviewLog[] = [];

  let bottleneckCount = 0;
  let totalNextDays = 0;
  let graduatedCount = 0;
  let immediateLearningCount = 0;

  for (const stg of stages) {
    const isBottleneck = bottleneckSet.has(stg.stageIndex);
    if (isBottleneck) {
      bottleneckCount += 1;
    }

    const primaryId = resolvePrimaryCardId(stg);
    if (!primaryId) continue;

    const segKey = stg.newlyAddedUnit.segmentId || primaryId;
    if (seenSegments.has(segKey) || seenCardIds.has(primaryId)) continue;

    seenSegments.add(segKey);
    seenCardIds.add(primaryId);
    primaryCardIds.push(primaryId);

    const existingCard = existingCardStates.get(primaryId) || fsrs.createInitialCard(primaryId);
    const rating = isBottleneck ? Rating.HARD : Rating.GOOD;
    const evalRes = fsrs.evaluateReview(existingCard, rating, now);

    let updatedCard: CardFsrsState = {
      ...evalRes.updatedCard,
      lastSource: "snowball"
    };
    let reviewLog: ReviewLog = {
      ...evalRes.reviewLog,
      source: "snowball",
      quotaIsolated: true
    };
    let nextIntervalDays = evalRes.nextIntervalDays;

    const isLearningState =
      updatedCard.state === CardState.LEARNING || updatedCard.state === CardState.RELEARNING;

    if (!isBottleneck && isLearningState) {
      // Smooth snowball units were already chained end-to-end; graduate to REVIEW so they
      // do not pile up in today's Flashcard learning queue.
      const rawDays = Math.max(1, fsrs.nextInterval(updatedCard.stability));
      const scheduledDays =
        rawDays >= 3 ? fsrs.applyFuzz(rawDays, primaryId, updatedCard.reps) : rawDays;
      updatedCard = {
        ...updatedCard,
        state: CardState.REVIEW,
        step: null,
        scheduledDays,
        dueTime: now + scheduledDays * 86_400_000
      };
      reviewLog = {
        ...reviewLog,
        currentState: CardState.REVIEW,
        scheduledDays
      };
      nextIntervalDays = scheduledDays;
      graduatedCount += 1;
    } else if (isBottleneck && isLearningState) {
      if (immediateLearningCount < maxImmediateLearningCards) {
        immediateLearningCount += 1;
      } else {
        // Excess bottleneck lines wait until tomorrow rather than blowing out today's queue.
        updatedCard = {
          ...updatedCard,
          state: CardState.REVIEW,
          step: null,
          scheduledDays: 1,
          dueTime: now + 86_400_000
        };
        reviewLog = {
          ...reviewLog,
          currentState: CardState.REVIEW,
          scheduledDays: 1
        };
        nextIntervalDays = 1;
        graduatedCount += 1;
      }
    } else if (updatedCard.state === CardState.REVIEW) {
      graduatedCount += 1;
    }

    updatedCards.push(updatedCard);
    reviewLogs.push(reviewLog);
    totalNextDays += nextIntervalDays;
  }

  const smoothCount = Math.max(0, stages.length - bottleneckCount);
  const avgNextInterval = updatedCards.length > 0 ? totalNextDays / updatedCards.length : 0;

  return {
    primaryCardIds,
    updatedCards,
    reviewLogs,
    avgNextInterval,
    smoothCount,
    bottleneckCount,
    graduatedCount,
    immediateLearningCount
  };
}

export class SnowballChainingEngine {
  static buildStages(article: Article): SnowballStage[] {
    const flashcards = generateFlashcardsForArticle(article);
    let units: SnowballUnit[] = [];

    if (flashcards.length > 0) {
      const unitMap = new Map<number, typeof flashcards>();
      for (const card of flashcards) {
        if (!unitMap.has(card.unitIndex)) {
          unitMap.set(card.unitIndex, []);
        }
        unitMap.get(card.unitIndex)!.push(card);
      }

      const sortedEntries = Array.from(unitMap.entries()).sort((a, b) => a[0] - b[0]);
      units = sortedEntries.map(([idx, cardsForUnit]) => {
        const firstCard = cardsForUnit[0];
        const primaryCard = selectPrimaryCardForSegment(cardsForUnit);
        const rawText = firstCard.fullVerseContext || firstCard.backAnswer;
        const cleanText = rawText
          .replace(/【/g, "")
          .replace(/】/g, "")
          .replace(/⟦ ________ ⟧/g, "")
          .replace(/【填空正解】/g, "")
          .replace(/【对句】/g, "")
          .trim();
        return {
          index: idx,
          text: cleanText,
          cardIds: cardsForUnit.map(c => c.id),
          segmentId: firstCard.segmentId,
          primaryCardId: primaryCard?.id ?? null
        };
      });
    } else {
      units = article.paragraphs.map((p, idx) => ({
        index: idx,
        text: p,
        cardIds: []
      }));
    }

    if (units.length === 0) return [];

    const stages: SnowballStage[] = [];
    const total = units.length;

    for (let i = 0; i < total; i++) {
      const chain = units.slice(0, i + 1);
      stages.push({
        stageIndex: i,
        totalStages: total,
        newlyAddedUnit: units[i],
        chainUnits: chain,
        progressRatio: (i + 1) / total
      });
    }

    return stages;
  }
}
