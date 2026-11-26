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
  paragraphIndex?: number;
}

export interface SnowballStage {
  stageIndex: number;
  totalStages: number;
  newlyAddedUnit: SnowballUnit;
  chainUnits: SnowballUnit[];
  progressRatio: number;
}

export interface SnowballBridgeCard {
  id: string;
  fromParagraphIndex: number;
  toParagraphIndex: number;
  promptSentence: string;
  targetSentence: string;
  targetUnitIndex: number;
  targetCardIds: string[];
  targetPrimaryCardId: string | null;
  targetSegmentId?: string;
}

export interface BuildStagesOptions {
  paragraphIndex?: number;
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
    const primaryId = resolvePrimaryCardId(stg);
    if (!primaryId) continue;

    const segKey = stg.newlyAddedUnit.segmentId || primaryId;
    if (seenSegments.has(segKey) || seenCardIds.has(primaryId)) continue;

    const isBottleneck = bottleneckSet.has(stg.newlyAddedUnit.index);
    if (isBottleneck) {
      bottleneckCount += 1;
    }

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

  const smoothCount = Math.max(0, updatedCards.length - bottleneckCount);
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

function cleanSnowballUnitText(rawText: string): string {
  return rawText
    .replace(/【填空正解】/g, "")
    .replace(/【对句】/g, "")
    .replace(/⟦ ________ ⟧/g, "")
    .replace(/【/g, "")
    .replace(/】/g, "")
    .trim();
}

function extractSnowballUnits(
  article: Article,
  paragraphIndex?: number
): SnowballUnit[] {
  const flashcards = generateFlashcardsForArticle(article);

  if (flashcards.length > 0) {
    const filteredCards =
      paragraphIndex !== undefined
        ? flashcards.filter(card => (card.paragraphIndex ?? 0) === paragraphIndex)
        : flashcards;

    if (filteredCards.length > 0) {
      const unitMap = new Map<number, Flashcard[]>();
      for (const card of filteredCards) {
        if (!unitMap.has(card.unitIndex)) {
          unitMap.set(card.unitIndex, []);
        }
        unitMap.get(card.unitIndex)!.push(card);
      }

      const sortedEntries = Array.from(unitMap.entries()).sort((a, b) => a[0] - b[0]);
      return sortedEntries.map(([idx, cardsForUnit]) => {
        const firstCard = cardsForUnit[0];
        const primaryCard = selectPrimaryCardForSegment(cardsForUnit);
        const rawText = firstCard.fullVerseContext || firstCard.backAnswer;
        return {
          index: idx,
          text: cleanSnowballUnitText(rawText),
          cardIds: cardsForUnit.map(c => c.id),
          segmentId: firstCard.segmentId,
          primaryCardId: primaryCard?.id ?? null,
          paragraphIndex: firstCard.paragraphIndex ?? paragraphIndex
        };
      });
    }
  }

  if (paragraphIndex !== undefined) {
    if (
      paragraphIndex < 0 ||
      paragraphIndex >= article.paragraphs.length ||
      !article.paragraphs[paragraphIndex]?.trim()
    ) {
      return [];
    }
    return [
      {
        index: paragraphIndex,
        text: article.paragraphs[paragraphIndex],
        cardIds: [],
        paragraphIndex
      }
    ];
  }

  return article.paragraphs.map((p, idx) => ({
    index: idx,
    text: p,
    cardIds: [],
    paragraphIndex: idx
  }));
}

function buildStagesFromUnits(units: SnowballUnit[]): SnowballStage[] {
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

/**
 * Build snowball stages scoped to a single natural paragraph of an article.
 */
export function buildParagraphStages(
  article: Article,
  paragraphIndex: number
): SnowballStage[] {
  if (
    !article.paragraphs ||
    paragraphIndex < 0 ||
    paragraphIndex >= article.paragraphs.length
  ) {
    return [];
  }
  const units = extractSnowballUnits(article, paragraphIndex);
  return buildStagesFromUnits(units);
}

/**
 * Build inter-paragraph transition cards ("上段末句 → 默写下段首句")
 * for articles with at least 2 paragraphs.
 */
export function buildBridgeCards(article: Article): SnowballBridgeCard[] {
  if (!article.paragraphs || article.paragraphs.length < 2) {
    return [];
  }

  const allUnits = extractSnowballUnits(article);
  if (allUnits.length === 0) {
    return [];
  }

  const unitsByPara = new Map<number, SnowballUnit[]>();
  for (const unit of allUnits) {
    const pIdx = unit.paragraphIndex ?? 0;
    const bucket = unitsByPara.get(pIdx);
    if (bucket) {
      bucket.push(unit);
    } else {
      unitsByPara.set(pIdx, [unit]);
    }
  }

  const cards: SnowballBridgeCard[] = [];
  for (let p = 0; p < article.paragraphs.length - 1; p++) {
    const prevUnits = unitsByPara.get(p);
    const nextUnits = unitsByPara.get(p + 1);
    if (!prevUnits || prevUnits.length === 0 || !nextUnits || nextUnits.length === 0) {
      continue;
    }
    const lastOfPrev = prevUnits[prevUnits.length - 1];
    const firstOfNext = nextUnits[0];
    cards.push({
      id: `bridge_${article.id}_p${p}_to_p${p + 1}`,
      fromParagraphIndex: p,
      toParagraphIndex: p + 1,
      promptSentence: lastOfPrev.text,
      targetSentence: firstOfNext.text,
      targetUnitIndex: firstOfNext.index,
      targetCardIds: firstOfNext.cardIds,
      targetPrimaryCardId: firstOfNext.primaryCardId ?? null,
      targetSegmentId: firstOfNext.segmentId
    });
  }

  return cards;
}

export class SnowballChainingEngine {
  static buildStages(
    article: Article,
    options?: BuildStagesOptions
  ): SnowballStage[] {
    if (options?.paragraphIndex !== undefined) {
      return buildParagraphStages(article, options.paragraphIndex);
    }
    const units = extractSnowballUnits(article);
    return buildStagesFromUnits(units);
  }

  static buildParagraphStages(
    article: Article,
    paragraphIndex: number
  ): SnowballStage[] {
    return buildParagraphStages(article, paragraphIndex);
  }

  static buildBridgeCards(article: Article): SnowballBridgeCard[] {
    return buildBridgeCards(article);
  }
}
