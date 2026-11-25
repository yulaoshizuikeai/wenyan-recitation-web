import { Article } from "../../data/curriculumData";
import { PUNCTUATION_SET } from "../cloze/clozeEngine";

export type RecitationMode = "snowball" | "cloze";

export interface ModeRecommendation {
  mode: RecitationMode;
  reason: string;
  /** 正文净字数（去标点空白） */
  netLength: number;
}

/** 计算正文净字数，去掉标点与空白 */
export function countNetLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (!PUNCTUATION_SET.has(ch)) n++;
  }
  return n;
}

/**
 * 推荐背诵方式：
 * - 正文净长 >= 250 字的长文重文脉，适合滚雪球逐联串联
 * - 篇幅较短的诗词曲韵文押韵对仗，适合刻漏字（挖空）默写
 */
export function getRecommendedMode(article: Article): ModeRecommendation {
  const netLength = countNetLength(article.fullContent);

  if (netLength >= 250) {
    return {
      mode: "snowball",
      reason: "全文较长、以文脉章法取胜，逐联串联比零碎挖空更稳",
      netLength
    };
  }

  return {
    mode: "cloze",
    reason: "篇幅短、韵脚与对仗规整，挖空默写的记忆效率更高",
    netLength
  };
}
