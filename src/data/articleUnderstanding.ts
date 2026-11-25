import { ArticleUnderstanding } from "./learningContentTypes";
import { understanding1 } from "./learningContent/part1";
import { understanding2 } from "./learningContent/part2";
import { understanding3 } from "./learningContent/part3";
import { understanding4 } from "./learningContent/part4";
import { understanding5 } from "./learningContent/part5";

/** 全 100 篇理解串讲表，key 为 articleId */
export const ARTICLE_UNDERSTANDING: Record<string, ArticleUnderstanding> = {
  ...understanding1,
  ...understanding2,
  ...understanding3,
  ...understanding4,
  ...understanding5
};

/** 获取指定篇目的理解内容 */
export function getUnderstanding(articleId: string): ArticleUnderstanding | undefined {
  return ARTICLE_UNDERSTANDING[articleId];
}
