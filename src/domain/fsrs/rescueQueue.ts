import {
  getBottleneckFlashcards,
  getFlashcardsByArticle,
} from "../../data/articleRepository";
import { ALL_ARTICLES, Article } from "../../data/curriculumData";
import { Flashcard } from "../../data/flashcardGenerator";
import { CORE_GOLDEN_VERSES, GoldenVerse } from "../../data/goldenVersesData";
import { GAOKAO_SCENARIO_QUESTIONS, GaoKaoScenarioQuestion } from "../../data/scenarioData";
import { CramRatingValue, ScenarioWrongItem } from "../../storage/studyStore";
import { CardFsrsState } from "./fsrsTypes";

export type RescueSource = "bottleneck" | "cram_stuck" | "scenario_wrong";

export interface RescueQueueEntry {
  card: Flashcard;
  sources: RescueSource[];
  sourceCount: number;
  latestMarkedAt: number;
}

export interface RescueQueueInput {
  bottlenecks: ReadonlyMap<string, readonly number[]>;
  cramRatings: Record<string, CramRatingValue>;
  scenarioWrongItems: readonly ScenarioWrongItem[];
  cardStatesMap?: ReadonlyMap<string, CardFsrsState>;
  /** Optional lookup overrides for pure unit testing */
  getBottleneckCards?: (bottlenecks: ReadonlyMap<string, readonly number[]>) => Flashcard[];
  getGoldenVerseById?: (verseId: string) => GoldenVerse | undefined;
  getScenarioQuestionById?: (questionId: string) => GaoKaoScenarioQuestion | undefined;
  getCardsForArticle?: (articleId: string) => Flashcard[];
}

let goldenVerseByIdCache: Map<string, GoldenVerse> | null = null;
function defaultGetGoldenVerseById(verseId: string): GoldenVerse | undefined {
  if (!goldenVerseByIdCache) {
    goldenVerseByIdCache = new Map(CORE_GOLDEN_VERSES.map((v) => [v.id, v]));
  }
  return goldenVerseByIdCache.get(verseId);
}

let scenarioQuestionByIdCache: Map<string, GaoKaoScenarioQuestion> | null = null;
function defaultGetScenarioQuestionById(questionId: string): GaoKaoScenarioQuestion | undefined {
  if (!scenarioQuestionByIdCache) {
    scenarioQuestionByIdCache = new Map(GAOKAO_SCENARIO_QUESTIONS.map((q) => [q.id, q]));
  }
  return scenarioQuestionByIdCache.get(questionId);
}

let articlesByTitleCache: Map<string, Article[]> | null = null;
function resolveArticleIdByTitleAuthor(verse: GoldenVerse): string | null {
  if (!articlesByTitleCache) {
    articlesByTitleCache = new Map();
    for (const article of ALL_ARTICLES) {
      const bucket = articlesByTitleCache.get(article.title);
      if (bucket) {
        bucket.push(article);
      } else {
        articlesByTitleCache.set(article.title, [article]);
      }
    }
  }
  const candidates = articlesByTitleCache.get(verse.articleTitle);
  if (!candidates || candidates.length === 0) {
    return null;
  }
  const exactAuthor = candidates.find((a) => a.author === verse.author);
  return (exactAuthor ?? candidates[0]).id;
}

/**
 * Strip classical Chinese punctuation and cloze markers for robust substring matching.
 */
export function normalizeClassicalText(text: string): string {
  return text
    .replace(/[【】⟦⟧[\]（）()《》“”‘’"'，。！？；：、·\s]/g, "")
    .trim();
}

/**
 * Find flashcards in an article matching a verse or scenario answer; falls back to
 * up to `fallbackLimit` primary cards of that article when no exact clause overlaps.
 */
export function findMatchingFlashcardsForText(
  articleId: string,
  text: string,
  getCardsForArticle: (articleId: string) => Flashcard[] = getFlashcardsByArticle,
  fallbackLimit = 2
): Flashcard[] {
  const cards = getCardsForArticle(articleId);
  if (cards.length === 0) return [];

  const cleanTarget = normalizeClassicalText(text);
  if (cleanTarget.length >= 2) {
    const matched = cards.filter((card) => {
      const cleanSegment = normalizeClassicalText(card.maskedSegment ?? "");
      const cleanContext = normalizeClassicalText(card.fullVerseContext ?? "");
      if (
        cleanSegment.length >= 2 &&
        (cleanTarget.includes(cleanSegment) || cleanSegment.includes(cleanTarget))
      ) {
        return true;
      }
      if (
        cleanContext.length >= 2 &&
        (cleanTarget.includes(cleanContext) || cleanContext.includes(cleanTarget))
      ) {
        return true;
      }
      return false;
    });

    if (matched.length > 0) {
      return matched;
    }
  }

  const primary = cards.filter((c) => c.isPrimary);
  const pool = primary.length > 0 ? primary : cards;
  return pool.slice(0, fallbackLimit);
}

/**
 * Aggregate failure signals from Snowball bottlenecks, CramMode `stuck` ratings,
 * and ScenarioView wrong items into deduplicated, priority-sorted rescue entries.
 */
export function buildRescueQueueEntries(input: RescueQueueInput): RescueQueueEntry[] {
  const getBottleneckCards = input.getBottleneckCards ?? getBottleneckFlashcards;
  const getGoldenVerseById = input.getGoldenVerseById ?? defaultGetGoldenVerseById;
  const getScenarioQuestionById = input.getScenarioQuestionById ?? defaultGetScenarioQuestionById;
  const getCardsForArticle = input.getCardsForArticle ?? getFlashcardsByArticle;

  interface MutableEntry {
    card: Flashcard;
    sources: Set<RescueSource>;
    latestMarkedAt: number;
    order: number;
  }

  const entryMap = new Map<string, MutableEntry>();
  let orderCounter = 0;

  const addCard = (card: Flashcard, source: RescueSource, markedAt = 0) => {
    const existing = entryMap.get(card.id);
    if (existing) {
      existing.sources.add(source);
      if (markedAt > existing.latestMarkedAt) {
        existing.latestMarkedAt = markedAt;
      }
    } else {
      entryMap.set(card.id, {
        card,
        sources: new Set([source]),
        latestMarkedAt: markedAt,
        order: orderCounter++,
      });
    }
  };

  // (a) Snowball bottlenecks
  for (const card of getBottleneckCards(input.bottlenecks)) {
    addCard(card, "bottleneck", 0);
  }

  // (b) CramMode stuck ratings
  for (const [verseId, rating] of Object.entries(input.cramRatings)) {
    if (rating !== "stuck") continue;
    const verse = getGoldenVerseById(verseId);
    if (!verse) continue;
    let matched = findMatchingFlashcardsForText(
      verse.articleId,
      verse.verse,
      getCardsForArticle
    );
    if (matched.length === 0) {
      const resolvedId = resolveArticleIdByTitleAuthor(verse);
      if (resolvedId && resolvedId !== verse.articleId) {
        matched = findMatchingFlashcardsForText(
          resolvedId,
          verse.verse,
          getCardsForArticle
        );
      }
    }
    for (const card of matched) {
      addCard(card, "cram_stuck", 0);
    }
  }

  // (c) ScenarioView wrong items
  for (const item of input.scenarioWrongItems) {
    const question = item.answer ? undefined : getScenarioQuestionById(item.questionId);
    const answerText = item.answer ?? question?.answer ?? "";
    const matched = findMatchingFlashcardsForText(
      item.articleId,
      answerText,
      getCardsForArticle
    );
    for (const card of matched) {
      addCard(card, "scenario_wrong", item.markedAt ?? 0);
    }
  }

  const sorted = Array.from(entryMap.values()).sort((a, b) => {
    // 1. Multi-signal failure priority
    if (b.sources.size !== a.sources.size) {
      return b.sources.size - a.sources.size;
    }
    // 2. Most recently marked first
    if (b.latestMarkedAt !== a.latestMarkedAt) {
      return b.latestMarkedAt - a.latestMarkedAt;
    }
    // 3. Higher FSRS lapses first (when state map is available)
    if (input.cardStatesMap) {
      const lapsesA = input.cardStatesMap.get(a.card.id)?.lapses ?? 0;
      const lapsesB = input.cardStatesMap.get(b.card.id)?.lapses ?? 0;
      if (lapsesB !== lapsesA) {
        return lapsesB - lapsesA;
      }
    }
    // 4. Primary cards before secondary variants
    const primaryDiff = (b.card.isPrimary ? 1 : 0) - (a.card.isPrimary ? 1 : 0);
    if (primaryDiff !== 0) {
      return primaryDiff;
    }
    // 5. Deterministic discovery order
    return a.order - b.order;
  });

  return sorted.map((entry) => ({
    card: entry.card,
    sources: Array.from(entry.sources),
    sourceCount: entry.sources.size,
    latestMarkedAt: entry.latestMarkedAt,
  }));
}

/**
 * Pure aggregation function returning deduplicated, priority-ordered flashcards
 * for cross-mode "高频卡壳急救" practice.
 */
export function buildRescueFlashcardQueue(input: RescueQueueInput): Flashcard[] {
  return buildRescueQueueEntries(input).map((entry) => entry.card);
}
