import { PhoneticsEntry } from "./learningContentTypes";
import { phonetics1 } from "./learningContent/part1";
import { phonetics2 } from "./learningContent/part2";
import { phonetics3 } from "./learningContent/part3";
import { phonetics4 } from "./learningContent/part4";
import { phonetics5 } from "./learningContent/part5";

/** 全 100 篇难词注音表，key 为 articleId */
export const ARTICLE_PHONETICS: Record<string, PhoneticsEntry[]> = {
  ...phonetics1,
  ...phonetics2,
  ...phonetics3,
  ...phonetics4,
  ...phonetics5
};

/** 获取指定篇目的难词注音 */
export function getPhonetics(articleId: string): PhoneticsEntry[] {
  return ARTICLE_PHONETICS[articleId] || [];
}
