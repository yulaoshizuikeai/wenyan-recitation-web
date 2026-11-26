import type { ArticleUnderstanding, PhoneticsEntry } from "./learningContentTypes";

export type LearningContentPartId = 1 | 2 | 3 | 4 | 5;

const PART_ARTICLE_IDS: Record<LearningContentPartId, readonly string[]> = {
  1: [
    "art_bx1_01", "art_bx1_02", "art_bx1_03", "art_bx1_04", "art_bx1_05",
    "art_bx1_06", "art_bx1_07", "art_bx1_08", "art_bx1_09", "art_bx1_10",
    "art_bx1_11", "art_bx1_12", "art_bx1_13", "art_bx1_14", "art_bx1_15",
    "art_bx1_recite_01", "art_bx1_recite_02", "art_bx1_recite_03", "art_bx1_recite_04",
    "art_bx2_01"
  ],
  2: [
    "art_bx2_02", "art_bx2_03", "art_bx2_04", "art_bx2_05", "art_bx2_06",
    "art_bx2_07", "art_bx2_08", "art_bx2_09", "art_bx2_10", "art_bx2_11",
    "art_bx2_12", "art_bx2_13",
    "art_bx2_recite_01", "art_bx2_recite_02", "art_bx2_recite_03", "art_bx2_recite_04",
    "art_xb1_01", "art_xb1_02", "art_xb1_03", "art_xb1_04"
  ],
  3: [
    "art_xb1_05", "art_xb1_06",
    "art_xb1_recite_01", "art_xb1_recite_02", "art_xb1_recite_03", "art_xb1_recite_04",
    "art_xb2_01", "art_xb2_02", "art_xb2_03", "art_xb2_04",
    "art_xb2_recite_01", "art_xb2_recite_02", "art_xb2_recite_03", "art_xb2_recite_04",
    "art_xb3_01", "art_xb3_02", "art_xb3_03", "art_xb3_04", "art_xb3_05", "art_xb3_06"
  ],
  4: [
    "art_xb3_07", "art_xb3_08", "art_xb3_09", "art_xb3_10", "art_xb3_11",
    "art_xb3_12", "art_xb3_13",
    "art_xb3_recite_01", "art_xb3_recite_02", "art_xb3_recite_03", "art_xb3_recite_04",
    "art_xx_01", "art_xx_02", "art_xx_03", "art_xx_04", "art_xx_05",
    "art_xx_06", "art_xx_07", "art_xx_08", "art_xx_09"
  ],
  5: [
    "art_xx_10", "art_xx_11", "art_xx_12", "art_xx_13", "art_xx_14",
    "art_xx_15", "art_xx_16", "art_xx_17", "art_xx_18", "art_xx_19",
    "art_xx_20", "art_xx_21", "art_xx_22", "art_xx_23", "art_xx_24",
    "art_xx_25", "art_xx_26", "art_xx_27", "art_xx_28", "art_xx_29"
  ]
};

/** 轻量级静态路由表：articleId -> part1~5 分片编号，零正文体积开销 */
export const ARTICLE_TO_LEARNING_PART: Readonly<Record<string, LearningContentPartId>> = (() => {
  const map: Record<string, LearningContentPartId> = {};
  for (const partKey of [1, 2, 3, 4, 5] as const) {
    for (const articleId of PART_ARTICLE_IDS[partKey]) {
      map[articleId] = partKey;
    }
  }
  return map;
})();

const phoneticsCache = new Map<string, PhoneticsEntry[]>();
const understandingCache = new Map<string, ArticleUnderstanding>();
const loadedParts = new Set<LearningContentPartId>();
const inFlightParts = new Map<LearningContentPartId, Promise<void>>();

export type LearningContentLoadedListener = (
  partId: LearningContentPartId,
  articleIds: readonly string[]
) => void;
const partLoadedListeners = new Set<LearningContentLoadedListener>();

/** 订阅分片学习内容加载完成事件（用于失效衍生缓存） */
export function subscribeLearningContentLoaded(
  listener: LearningContentLoadedListener
): () => void {
  partLoadedListeners.add(listener);
  return () => {
    partLoadedListeners.delete(listener);
  };
}

function populateCaches(
  understanding: Record<string, ArticleUnderstanding>,
  phonetics: Record<string, PhoneticsEntry[]>
): void {
  for (const [id, entry] of Object.entries(understanding)) {
    understandingCache.set(id, entry);
  }
  for (const [id, entries] of Object.entries(phonetics)) {
    phoneticsCache.set(id, entries);
  }
}

async function importPartModule(partId: LearningContentPartId): Promise<void> {
  switch (partId) {
    case 1: {
      const mod = await import("./learningContent/part1");
      populateCaches(mod.understanding1, mod.phonetics1);
      return;
    }
    case 2: {
      const mod = await import("./learningContent/part2");
      populateCaches(mod.understanding2, mod.phonetics2);
      return;
    }
    case 3: {
      const mod = await import("./learningContent/part3");
      populateCaches(mod.understanding3, mod.phonetics3);
      return;
    }
    case 4: {
      const mod = await import("./learningContent/part4");
      populateCaches(mod.understanding4, mod.phonetics4);
      return;
    }
    case 5: {
      const mod = await import("./learningContent/part5");
      populateCaches(mod.understanding5, mod.phonetics5);
      return;
    }
  }
}

/** 按分片编号动态加载并缓存对应注音与理解内容（并发去重） */
export function loadLearningPart(partId: LearningContentPartId): Promise<void> {
  if (loadedParts.has(partId)) {
    return Promise.resolve();
  }
  const existing = inFlightParts.get(partId);
  if (existing) {
    return existing;
  }
  const promise = importPartModule(partId)
    .then(() => {
      loadedParts.add(partId);
      const articleIds = PART_ARTICLE_IDS[partId];
      for (const listener of partLoadedListeners) {
        listener(partId, articleIds);
      }
    })
    .finally(() => {
      inFlightParts.delete(partId);
    });
  inFlightParts.set(partId, promise);
  return promise;
}

/** 查询篇目所属分片编号 */
export function getPartIdForArticle(articleId: string): LearningContentPartId | undefined {
  return ARTICLE_TO_LEARNING_PART[articleId];
}

/** 判断篇目所属分片是否已在内存中加载 */
export function isArticleLearningContentLoaded(articleId: string): boolean {
  const partId = getPartIdForArticle(articleId);
  if (!partId) return true;
  return loadedParts.has(partId);
}

/** 按篇目按需加载其所属分片 */
export async function ensureArticleLearningContentLoaded(articleId: string): Promise<void> {
  const partId = getPartIdForArticle(articleId);
  if (!partId) return;
  await loadLearningPart(partId);
}

/** 加载全部 5 个学习内容分片（主要用于全量数据校验） */
export async function loadAllLearningParts(): Promise<void> {
  await Promise.all(([1, 2, 3, 4, 5] as const).map(loadLearningPart));
}

/** 同步读取已缓存的难词注音条目；未加载时返回 undefined */
export function getCachedPhoneticsEntry(articleId: string): PhoneticsEntry[] | undefined {
  return phoneticsCache.get(articleId);
}

/** 同步读取已缓存的理解串讲条目；未加载时返回 undefined */
export function getCachedUnderstandingEntry(articleId: string): ArticleUnderstanding | undefined {
  return understandingCache.get(articleId);
}

/** 导出当前已加载的所有难词注音映射 */
export function getAllCachedPhoneticsMap(): Record<string, PhoneticsEntry[]> {
  return Object.fromEntries(phoneticsCache.entries());
}

/** 导出当前已加载的所有理解串讲映射 */
export function getAllCachedUnderstandingMap(): Record<string, ArticleUnderstanding> {
  return Object.fromEntries(understandingCache.entries());
}
