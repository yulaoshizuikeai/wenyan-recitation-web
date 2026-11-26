import type { ArticleUnderstanding } from "./learningContentTypes";
import {
  ensureArticleLearningContentLoaded,
  getAllCachedUnderstandingMap,
  getCachedUnderstandingEntry,
  isArticleLearningContentLoaded,
  loadAllLearningParts
} from "./learningContentLoader";

/** 按需动态加载指定篇目的理解串讲内容，并缓存到内存 */
export async function loadArticleUnderstanding(
  articleId: string
): Promise<ArticleUnderstanding | undefined> {
  await ensureArticleLearningContentLoaded(articleId);
  return getCachedUnderstandingEntry(articleId);
}

/** 同步读取已缓存的理解串讲内容；若所属分片尚未加载则返回 undefined */
export function getCachedArticleUnderstanding(
  articleId: string
): ArticleUnderstanding | undefined {
  return getCachedUnderstandingEntry(articleId);
}

/** 判断指定篇目的理解串讲分片是否已加载完成 */
export function isArticleUnderstandingLoaded(articleId: string): boolean {
  return isArticleLearningContentLoaded(articleId);
}

/** 加载全量 100 篇理解串讲数据（仅供校验脚本或全量检查使用） */
export async function loadAllArticleUnderstanding(): Promise<Record<string, ArticleUnderstanding>> {
  await loadAllLearningParts();
  return getAllCachedUnderstandingMap();
}
