import type { PhoneticsEntry } from "./learningContentTypes";
import {
  ensureArticleLearningContentLoaded,
  getAllCachedPhoneticsMap,
  getCachedPhoneticsEntry,
  isArticleLearningContentLoaded,
  loadAllLearningParts
} from "./learningContentLoader";

/** 按需动态加载指定篇目的难词注音数据，并缓存到内存 */
export async function loadArticlePhonetics(articleId: string): Promise<PhoneticsEntry[]> {
  await ensureArticleLearningContentLoaded(articleId);
  return getCachedPhoneticsEntry(articleId) ?? [];
}

/** 同步读取已缓存的难词注音；若所属分片尚未加载则返回 undefined */
export function getCachedArticlePhonetics(articleId: string): PhoneticsEntry[] | undefined {
  return getCachedPhoneticsEntry(articleId);
}

/** 判断指定篇目的注音分片是否已加载完成 */
export function isArticlePhoneticsLoaded(articleId: string): boolean {
  return isArticleLearningContentLoaded(articleId);
}

/** 加载全量 100 篇注音数据（仅供校验脚本或全量检查使用） */
export async function loadAllArticlePhonetics(): Promise<Record<string, PhoneticsEntry[]>> {
  await loadAllLearningParts();
  return getAllCachedPhoneticsMap();
}
