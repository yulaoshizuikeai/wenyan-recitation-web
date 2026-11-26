import { ClozeEngine, ClozeToken, PUNCTUATION_SET as CLOZE_PUNCTUATION_SET } from "./clozeEngine";
import { getCachedArticlePhonetics } from "../../data/articlePhonetics";

/**
 * 经典文言文常见纯虚词表。
 * L1 关键词挖空时需要过滤纯虚词，聚焦实词、通假字、意动/使动活用与核心考点词眼。
 */
export const DEFAULT_FUNCTION_WORDS: ReadonlySet<string> = new Set([
  "之", "乎", "者", "也", "矣", "焉", "哉",
  "以", "于", "而", "则", "虽", "故", "岂",
  "夫", "盖", "若", "其", "何", "乃", "因",
  "是", "有", "无"
]);

/** 兼容旧称引用 */
export const FUNCTION_WORDS = DEFAULT_FUNCTION_WORDS;

/**
 * 古汉语标点符号与空白字符集合。
 */
export const PUNCTUATION_SET: ReadonlySet<string> = CLOZE_PUNCTUATION_SET;

/**
 * 判断单个字符是否为标点或空白符号。
 */
export function isPunctuation(char: string): boolean {
  return PUNCTUATION_SET.has(char);
}

/**
 * 判断文本中是否包含标点或空白符号。
 */
export function containsPunctuation(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (PUNCTUATION_SET.has(text[i])) {
      return true;
    }
  }
  return false;
}

/**
 * 判断给定词语是否为文言虚词。
 */
export function isFunctionWord(
  word: string,
  functionWords: ReadonlySet<string> = DEFAULT_FUNCTION_WORDS
): boolean {
  return functionWords.has(word);
}

/**
 * 从篇目注释列表中提取词条候选词（取冒号、括号等释义分隔符前的部分）。
 * 过滤单字以保证词义完整度（仅保留长度 >= 2 的词条）。
 */
export function extractAnnotationKeywords(
  annotations: readonly string[] | string[]
): string[] {
  const result: string[] = [];
  for (const a of annotations) {
    const kw = a.split(/[：（(]/)[0].trim();
    if (kw.length >= 2) {
      result.push(kw);
    }
  }
  return result;
}

/**
 * 关键词过滤与密度控制配置项。
 */
export interface KeywordFilterOptions {
  /** 最小长度，默认 1（注音单字通假字可入选） */
  minLength?: number;
  /** 最大长度，默认 6（避免长短语整句挖空） */
  maxLength?: number;
  /** 最大关键词上限，默认 20（密度控制，长词优先） */
  maxKeywords?: number;
  /** 自定义虚词黑名单，未传入则使用 DEFAULT_FUNCTION_WORDS */
  functionWords?: ReadonlySet<string>;
}

/**
 * 纯函数：对候选关键词列表进行清洗、虚词过滤、正文存在性校验与密度控制。
 * 
 * 规则：
 * 1. 词长在 [minLength, maxLength] 之间；
 * 2. 排除文言纯虚词；
 * 3. 严格要求在正文 `fullContent` 中实际出现；
 * 4. 去重并按词长降序排列（长词优先匹配），最后截取前 `maxKeywords` 个。
 */
export function filterCandidateKeywords(
  candidates: readonly string[] | string[],
  fullContent: string,
  options?: KeywordFilterOptions
): string[] {
  const minLength = options?.minLength ?? 1;
  const maxLength = options?.maxLength ?? 6;
  const maxKeywords = options?.maxKeywords ?? 20;
  const functionWords = options?.functionWords ?? DEFAULT_FUNCTION_WORDS;

  const seen = new Set<string>();
  const filtered: string[] = [];

  for (const kw of candidates) {
    if (kw.length < minLength || kw.length > maxLength) continue;
    if (functionWords.has(kw)) continue;
    if (seen.has(kw)) continue;
    if (!fullContent.includes(kw)) continue;

    seen.add(kw);
    filtered.push(kw);
  }

  // 密度控制：长词优先，最多 maxKeywords 个
  return filtered.sort((a, b) => b.length - a.length).slice(0, maxKeywords);
}

/**
 * 提取指定篇目的 L1 遮挡关键词（纯函数 / 确定性输出）。
 * 
 * 提取优先级：
 * 1. 难词注音表 (`Phonetics`) 中的考点词眼（含单字生僻字、通假字）；
 * 2. 注释表 (`annotations`) 中的词条；
 * 3. 经过 `filterCandidateKeywords` 过滤虚词、校验正文存在性并按长词优先截取前 20 个。
 */
const defaultPhoneticsFetcher = (articleId: string): Array<{ word: string }> =>
  getCachedArticlePhonetics(articleId) ?? [];

export function extractClozeKeywords(
  article: { id: string; annotations: readonly string[] | string[]; fullContent: string },
  phoneticsFetcher: (articleId: string) => Array<{ word: string }> = defaultPhoneticsFetcher,
  options?: KeywordFilterOptions
): string[] {
  const candidates: string[] = [];

  // 注音表里的难词本身就是高频考点词眼
  const phoneticsList = phoneticsFetcher(article.id) || [];
  for (const entry of phoneticsList) {
    if (entry.word && entry.word.length >= 1) {
      candidates.push(entry.word);
    }
  }

  // 注释词：取释义前的词条部分
  const annotationKws = extractAnnotationKeywords(article.annotations);
  candidates.push(...annotationKws);

  return filterCandidateKeywords(candidates, article.fullContent, options);
}

/**
 * 将线性 ClozeToken 序列拆分为按自然段分段的二维数组，并为换行切片分配稳定子 ID。
 * 
 * @param tokens 经由 ClozeEngine 生成的标记列表
 * @param startSubTokenId 跨行分片起始 ID，避免与原生 token.id 冲突
 */
export function splitTokensIntoParagraphs(
  tokens: readonly ClozeToken[] | ClozeToken[],
  startSubTokenId: number = 100000
): ClozeToken[][] {
  const list: ClozeToken[][] = [];
  let currentPara: ClozeToken[] = [];
  let subTokenId = startSubTokenId;

  for (const token of tokens) {
    if (token.originalText.includes("\n")) {
      const parts = token.originalText.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].length > 0) {
          const assignedId = i === 0 ? token.id : subTokenId++;
          currentPara.push({
            id: assignedId,
            originalText: parts[i],
            isMasked: token.isMasked
          });
        }
        if (i < parts.length - 1) {
          if (currentPara.length > 0) list.push(currentPara);
          currentPara = [];
        }
      }
    } else {
      currentPara.push(token);
    }
  }
  if (currentPara.length > 0) {
    list.push(currentPara);
  }
  return list;
}

/**
 * 组合管线：对文章全文进行分级遮挡标记并按段落切分。
 */
export function tokenizeArticleParagraphs(
  fullContent: string,
  level: number,
  keywords: string[]
): ClozeToken[][] {
  const tokens = ClozeEngine.tokenize(fullContent, level, keywords);
  return splitTokensIntoParagraphs(tokens);
}

/**
 * 标记在视图呈现时的三种状态。
 */
export type ClozeTokenDisplayState = "plain" | "masked" | "revealed";

/**
 * 判定一个标记当前的展示形态。
 */
export function classifyClozeToken(
  token: { id: number; isMasked: boolean },
  revealedTokenIds: ReadonlySet<number> | Set<number>,
  revealAll: boolean
): ClozeTokenDisplayState {
  if (!token.isMasked) return "plain";
  if (!revealAll && !revealedTokenIds.has(token.id)) return "masked";
  return "revealed";
}

/**
 * 判断标记当前是否处于真正被遮挡（需要刮开）的状态。
 */
export function isTokenEffectiveMasked(
  token: { id: number; isMasked: boolean },
  revealedTokenIds: ReadonlySet<number> | Set<number>,
  revealAll: boolean
): boolean {
  return token.isMasked && !revealAll && !revealedTokenIds.has(token.id);
}
