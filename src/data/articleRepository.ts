import { ALL_ARTICLES, Article } from "./curriculumData";
import { flashcardCache } from "./flashcardCache";
import { Flashcard } from "./flashcardGenerator";
import { CORE_GOLDEN_VERSES, GoldenVerse } from "./goldenVersesData";
import { GAOKAO_SCENARIO_QUESTIONS, GaoKaoScenarioQuestion } from "./scenarioData";

export type ScenarioQuestion = GaoKaoScenarioQuestion;

export interface ArticleEntityBundle {
  readonly article: Article;
  readonly flashcards: Flashcard[];
  readonly goldenVerses: GoldenVerse[];
  readonly scenarioQuestions: ScenarioQuestion[];
  readonly bottleneckIndices: number[];
}

interface FlashcardIndex {
  all: Flashcard[];
  byArticleId: Map<string, Flashcard[]>;
  bySegmentId: Map<string, Flashcard[]>;
  byArticleParagraph: Map<string, Map<number, Flashcard[]>>;
  byArticleUnit: Map<string, Map<number, Flashcard[]>>;
}

function pushToBucket<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.push(value);
  } else {
    map.set(key, [value]);
  }
}

function pushToNestedBucket<K1, K2, V>(
  outer: Map<K1, Map<K2, V[]>>,
  key1: K1,
  key2: K2,
  value: V
): void {
  let inner = outer.get(key1);
  if (!inner) {
    inner = new Map<K2, V[]>();
    outer.set(key1, inner);
  }
  pushToBucket(inner, key2, value);
}

// 1. Curriculum articles indexed by id (and by title for fallback resolution)
const articleByIdMap = new Map<string, Article>();
const articlesByTitleMap = new Map<string, Article[]>();

for (const article of ALL_ARTICLES) {
  articleByIdMap.set(article.id, article);
  pushToBucket(articlesByTitleMap, article.title, article);
}

// 2. Golden verses indexed by resolved articleId (fallback to title/author match when legacy ID differs)
export function resolveArticleIdForGoldenVerse(verse: GoldenVerse): string | null {
  if (articleByIdMap.has(verse.articleId)) {
    return verse.articleId;
  }
  const candidates = articlesByTitleMap.get(verse.articleTitle);
  if (!candidates || candidates.length === 0) {
    return null;
  }
  const exactAuthor = candidates.find(a => a.author === verse.author);
  return (exactAuthor ?? candidates[0]).id;
}

const goldenVersesByArticleMap = new Map<string, GoldenVerse[]>();
for (const verse of CORE_GOLDEN_VERSES) {
  const resolvedId = resolveArticleIdForGoldenVerse(verse);
  if (resolvedId) {
    pushToBucket(goldenVersesByArticleMap, resolvedId, verse);
  }
}

// 3. GaoKao scenario questions indexed by articleId
const scenarioQuestionsByArticleMap = new Map<string, ScenarioQuestion[]>();
for (const question of GAOKAO_SCENARIO_QUESTIONS) {
  if (articleByIdMap.has(question.articleId)) {
    pushToBucket(scenarioQuestionsByArticleMap, question.articleId, question);
  }
}

// 4. Lazily built flashcard index (memoized singleton over flashcardCache)
let flashcardIndexCache: FlashcardIndex | null = null;

flashcardCache.subscribeInvalidate(() => {
  flashcardIndexCache = null;
});

function ensureFlashcardIndex(): FlashcardIndex {
  if (flashcardIndexCache) {
    return flashcardIndexCache;
  }

  const all = flashcardCache.getCardsForArticles(ALL_ARTICLES);
  const byArticleId = new Map<string, Flashcard[]>();
  const bySegmentId = new Map<string, Flashcard[]>();
  const byArticleParagraph = new Map<string, Map<number, Flashcard[]>>();
  const byArticleUnit = new Map<string, Map<number, Flashcard[]>>();

  for (const card of all) {
    pushToBucket(byArticleId, card.articleId, card);
    if (card.segmentId) {
      pushToBucket(bySegmentId, card.segmentId, card);
    }
    if (typeof card.paragraphIndex === "number") {
      pushToNestedBucket(byArticleParagraph, card.articleId, card.paragraphIndex, card);
    }
    pushToNestedBucket(byArticleUnit, card.articleId, card.unitIndex, card);
  }

  flashcardIndexCache = {
    all,
    byArticleId,
    bySegmentId,
    byArticleParagraph,
    byArticleUnit
  };
  return flashcardIndexCache;
}

/**
 * Return all flashcards across the 100-article curriculum from the memoized cache.
 */
export function getAllFlashcards(): Flashcard[] {
  return [...ensureFlashcardIndex().all];
}

/**
 * Look up a single curriculum article by its canonical ID.
 */
export function getArticleById(articleId: string): Article | undefined {
  return articleByIdMap.get(articleId);
}

/**
 * Return all flashcards belonging to an article, in natural segment order.
 */
export function getFlashcardsByArticle(articleId: string): Flashcard[] {
  const cards = ensureFlashcardIndex().byArticleId.get(articleId);
  return cards ? [...cards] : [];
}

/**
 * Return flashcards belonging to a specific paragraph within an article.
 */
export function getFlashcardsByParagraph(articleId: string, paragraphIndex: number): Flashcard[] {
  const cards = ensureFlashcardIndex().byArticleParagraph.get(articleId)?.get(paragraphIndex);
  return cards ? [...cards] : [];
}

/**
 * Return all cloze variant flashcards sharing a given `segmentId`.
 */
export function getFlashcardsBySegment(segmentId: string): Flashcard[] {
  const cards = ensureFlashcardIndex().bySegmentId.get(segmentId);
  return cards ? [...cards] : [];
}

/**
 * Return curated high-frequency golden verses associated with an article.
 */
export function getGoldenVersesByArticle(articleId: string): GoldenVerse[] {
  const verses = goldenVersesByArticleMap.get(articleId);
  return verses ? [...verses] : [];
}

/**
 * Return GaoKao scenario recitation questions associated with an article.
 */
export function getScenarioQuestionsByArticle(articleId: string): ScenarioQuestion[] {
  const questions = scenarioQuestionsByArticleMap.get(articleId);
  return questions ? [...questions] : [];
}

/**
 * Compose a standardized read-only entity bundle for an article, uniting text,
 * flashcards, golden verses, GaoKao scenario questions, and pinned bottlenecks.
 */
export function getArticleBundle(
  articleId: string,
  bottlenecksMap?: ReadonlyMap<string, readonly number[]>
): ArticleEntityBundle | undefined {
  const article = getArticleById(articleId);
  if (!article) {
    return undefined;
  }

  return {
    article,
    flashcards: getFlashcardsByArticle(articleId),
    goldenVerses: getGoldenVersesByArticle(articleId),
    scenarioQuestions: getScenarioQuestionsByArticle(articleId),
    bottleneckIndices: [...(bottlenecksMap?.get(articleId) ?? [])]
  };
}

/**
 * Resolve pinned snowball unit/sentence (or paragraph fallback) bottleneck indices
 * across articles into deduplicated flashcards for cross-mode rescue practice.
 */
export function getBottleneckFlashcards(
  bottlenecksMap: ReadonlyMap<string, readonly number[]>
): Flashcard[] {
  const index = ensureFlashcardIndex();
  const seenCardIds = new Set<string>();
  const result: Flashcard[] = [];

  for (const [articleId, indices] of bottlenecksMap.entries()) {
    if (!articleByIdMap.has(articleId) || !indices || indices.length === 0) {
      continue;
    }

    const unitMap = index.byArticleUnit.get(articleId);
    const paraMap = index.byArticleParagraph.get(articleId);

    for (const idx of indices) {
      const segmentCards = index.bySegmentId.get(`seg_${articleId}_${idx}`);
      const unitCards = segmentCards && segmentCards.length > 0
        ? segmentCards
        : unitMap?.get(idx);

      const matched = unitCards && unitCards.length > 0
        ? unitCards
        : paraMap?.get(idx);

      if (!matched) continue;

      for (const card of matched) {
        if (!seenCardIds.has(card.id)) {
          seenCardIds.add(card.id);
          result.push(card);
        }
      }
    }
  }

  return result;
}
