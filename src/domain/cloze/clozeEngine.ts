export interface ClozeToken {
  id: number;
  originalText: string;
  isMasked: boolean;
}

export interface ClozeKeywordSpec {
  word: string;
  /** 可选语境限定：仅当 word 出现在指定 context 短语内时才挖空 */
  context?: string | string[];
}

export type ClozeKeywordInput = string | ClozeKeywordSpec;

export const PUNCTUATION_SET = new Set([
  '，', '。', '；', '！', '？', '：', '、',
  '“', '”', '‘', '’', '《', '》', '（', '）', '【', '】', '—', '…',
  '\n', '\r', ' ', '\t'
]);

const SENTENCE_END_PUNCT_SET = new Set(['。', '！', '？', '；', '\n', '\r']);
const CLAUSE_SPLIT_PUNCT_SET = new Set(['，', '：']);

interface NormalizedKeywordSpec {
  word: string;
  contexts: string[];
}

function normalizeKeywordSpecs(
  keywords: readonly ClozeKeywordInput[],
  text: string
): NormalizedKeywordSpec[] {
  const byWord = new Map<string, Set<string> | null>();

  for (const item of keywords) {
    const rawWord = typeof item === "string" ? item : item.word;
    const word = rawWord.trim();
    if (!word || !text.includes(word)) continue;

    const rawCtx = typeof item === "string" ? undefined : item.context;
    const ctxList = (Array.isArray(rawCtx) ? rawCtx : rawCtx ? [rawCtx] : [])
      .map(c => c.trim())
      .filter(c => c.length > 0 && c.includes(word) && text.includes(c));

    if (!byWord.has(word)) {
      byWord.set(word, ctxList.length > 0 ? new Set(ctxList) : null);
    } else {
      const existing = byWord.get(word);
      if (existing !== null && existing !== undefined) {
        if (ctxList.length === 0) {
          // Unscoped spec overrides scoped restriction if explicitly provided
          byWord.set(word, null);
        } else {
          for (const c of ctxList) existing.add(c);
        }
      }
    }
  }

  return Array.from(byWord.entries())
    .map(([word, ctxSet]) => ({
      word,
      contexts: ctxSet ? Array.from(ctxSet) : []
    }))
    .sort((a, b) => b.word.length - a.word.length);
}

/**
 * Compute all valid [start, end) mask ranges for a keyword spec.
 * If `contexts` is non-empty, only mask occurrences of `word` that fall inside
 * one of the specified context phrases (avoiding global false-positive masking
 * of 1-char polyphonic/loan characters).
 */
function findKeywordRanges(
  text: string,
  spec: NormalizedKeywordSpec
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const { word, contexts } = spec;

  if (contexts.length === 0) {
    let idx = text.indexOf(word);
    while (idx !== -1) {
      ranges.push({ start: idx, end: idx + word.length });
      idx = text.indexOf(word, idx + word.length);
    }
    return ranges;
  }

  for (const ctx of contexts) {
    let ctxIdx = text.indexOf(ctx);
    while (ctxIdx !== -1) {
      let innerIdx = ctx.indexOf(word);
      while (innerIdx !== -1) {
        ranges.push({
          start: ctxIdx + innerIdx,
          end: ctxIdx + innerIdx + word.length
        });
        innerIdx = ctx.indexOf(word, innerIdx + word.length);
      }
      ctxIdx = text.indexOf(ctx, ctxIdx + 1);
    }
  }

  return ranges;
}

export class ClozeEngine {
  /**
   * L2 半句/对句遮挡（出句提示、对句遮挡）。
   * - 句内含多个逗号/冒号分句时：偶数位分句（出句）明文提示，奇数位分句（对句）整句遮挡，
   *   不再从字数正中间把完整词组腰斩。
   * - 单分句独立成句时（如“何以解忧？唯有杜康。”）：按独立句交替遮挡；若整段仅有一句单分句，
   *   才温和保留首字/前半句作为兜底。
   * - 单字分句（length < 2）保持不遮挡。
   */
  private static tokenizeHalfClause(text: string): ClozeToken[] {
    const tokens: ClozeToken[] = [];
    let nextId = 1;

    // Step 1: split text into sentence segments + trailing sentence-end punctuation runs
    const sentences: Array<{ body: string; endPunct: string }> = [];
    let segStart = 0;
    let i = 0;
    while (i < text.length) {
      if (SENTENCE_END_PUNCT_SET.has(text[i])) {
        const body = text.slice(segStart, i);
        let punctEnd = i + 1;
        // Include closing quotes/brackets immediately following sentence end punct
        while (
          punctEnd < text.length &&
          (SENTENCE_END_PUNCT_SET.has(text[punctEnd]) ||
            text[punctEnd] === '”' ||
            text[punctEnd] === '’' ||
            text[punctEnd] === '）' ||
            text[punctEnd] === '】')
        ) {
          punctEnd++;
        }
        sentences.push({ body, endPunct: text.slice(i, punctEnd) });
        segStart = punctEnd;
        i = punctEnd;
      } else {
        i++;
      }
    }
    if (segStart < text.length) {
      sentences.push({ body: text.slice(segStart), endPunct: "" });
    }

    let standaloneSentenceIdx = 0;

    for (const sent of sentences) {
      if (sent.body.length > 0) {
        // Split sentence body into clauses by ， / ： while preserving exact delimiters
        const parts: Array<{ text: string; isDelimiter: boolean }> = [];
        let cStart = 0;
        for (let k = 0; k < sent.body.length; k++) {
          if (CLAUSE_SPLIT_PUNCT_SET.has(sent.body[k])) {
            if (k > cStart) {
              parts.push({ text: sent.body.slice(cStart, k), isDelimiter: false });
            }
            parts.push({ text: sent.body[k], isDelimiter: true });
            cStart = k + 1;
          }
        }
        if (cStart < sent.body.length) {
          parts.push({ text: sent.body.slice(cStart), isDelimiter: false });
        }

        const contentParts = parts.filter(p => !p.isDelimiter);
        const nonTrivialClauses = contentParts.filter(
          p => p.text.replace(/[“”‘’《》（）【】\s]/g, "").length >= 2
        );

        if (contentParts.length >= 2 && nonTrivialClauses.length >= 2) {
          // Standard multi-clause sentence: show clause 0 (出句), mask clause 1 (对句), alternate
          let clauseIdx = 0;
          for (const part of parts) {
            if (part.isDelimiter) {
              tokens.push({ id: nextId++, originalText: part.text, isMasked: false });
            } else {
              const coreLen = part.text.replace(/[“”‘’《》（）【】\s]/g, "").length;
              const shouldMask = coreLen >= 2 && clauseIdx % 2 === 1;
              if (shouldMask) {
                ClozeEngine.pushClausePreservingEdgePunct(tokens, part.text, true, () => nextId++);
              } else {
                tokens.push({ id: nextId++, originalText: part.text, isMasked: false });
              }
              if (coreLen >= 2) {
                clauseIdx++;
              }
            }
          }
        } else {
          // Single-clause sentence or all 1-char clauses
          for (const part of parts) {
            if (part.isDelimiter) {
              tokens.push({ id: nextId++, originalText: part.text, isMasked: false });
              continue;
            }
            const coreLen = part.text.replace(/[“”‘’《》（）【】\s]/g, "").length;
            if (coreLen < 2) {
              tokens.push({ id: nextId++, originalText: part.text, isMasked: false });
            } else if (sentences.length >= 2) {
              // Alternate across consecutive standalone sentences
              const shouldMask = standaloneSentenceIdx % 2 === 1;
              if (shouldMask) {
                ClozeEngine.pushClausePreservingEdgePunct(tokens, part.text, true, () => nextId++);
              } else {
                tokens.push({ id: nextId++, originalText: part.text, isMasked: false });
              }
              standaloneSentenceIdx++;
            } else {
              // Single standalone clause with no peers: keep first half unmasked as fallback
              const half = Math.floor(part.text.length / 2);
              tokens.push({ id: nextId++, originalText: part.text.slice(0, half), isMasked: false });
              tokens.push({ id: nextId++, originalText: part.text.slice(half), isMasked: true });
            }
          }
        }
      }

      if (sent.endPunct.length > 0) {
        tokens.push({ id: nextId++, originalText: sent.endPunct, isMasked: false });
      }
    }

    return tokens;
  }

  /** Keep leading/trailing quotes or whitespace unmasked when masking a whole clause */
  private static pushClausePreservingEdgePunct(
    tokens: ClozeToken[],
    raw: string,
    isMasked: boolean,
    allocId: () => number
  ): void {
    let start = 0;
    let end = raw.length;
    while (start < end && PUNCTUATION_SET.has(raw[start])) start++;
    while (end > start && PUNCTUATION_SET.has(raw[end - 1])) end--;

    if (start > 0) {
      tokens.push({ id: allocId(), originalText: raw.slice(0, start), isMasked: false });
    }
    if (end > start) {
      tokens.push({ id: allocId(), originalText: raw.slice(start, end), isMasked });
    }
    if (end < raw.length) {
      tokens.push({ id: allocId(), originalText: raw.slice(end), isMasked: false });
    }
  }

  static tokenize(
    text: string,
    level: number,
    keywords: readonly ClozeKeywordInput[]
  ): ClozeToken[] {
    let nextId = 1;
    switch (level) {
      case 0:
        return [{ id: nextId, originalText: text, isMasked: false }];

      case 1: {
        const specs = normalizeKeywordSpecs(keywords, text);

        // Collect all valid mask ranges (longest-keyword-first priority, non-overlapping)
        const occupied = new Uint8Array(text.length);
        const acceptedRanges: Array<{ start: number; end: number }> = [];

        for (const spec of specs) {
          const ranges = findKeywordRanges(text, spec);
          for (const r of ranges) {
            let conflict = false;
            for (let p = r.start; p < r.end; p++) {
              if (occupied[p]) {
                conflict = true;
                break;
              }
            }
            if (!conflict) {
              for (let p = r.start; p < r.end; p++) occupied[p] = 1;
              acceptedRanges.push(r);
            }
          }
        }

        // 无有效关键词时退化为半句遮挡，不再挖虚词或句尾字
        if (acceptedRanges.length === 0) {
          return ClozeEngine.tokenizeHalfClause(text);
        }

        acceptedRanges.sort((a, b) => a.start - b.start);

        const tokens: ClozeToken[] = [];
        let cursor = 0;
        for (const r of acceptedRanges) {
          if (r.start > cursor) {
            tokens.push({
              id: nextId++,
              originalText: text.slice(cursor, r.start),
              isMasked: false
            });
          }
          tokens.push({
            id: nextId++,
            originalText: text.slice(r.start, r.end),
            isMasked: true
          });
          cursor = r.end;
        }
        if (cursor < text.length) {
          tokens.push({
            id: nextId++,
            originalText: text.slice(cursor),
            isMasked: false
          });
        }
        return tokens;
      }

      case 2: {
        return ClozeEngine.tokenizeHalfClause(text);
      }

      case 3: {
        const tokens: ClozeToken[] = [];
        let start = 0;
        for (let i = 0; i < text.length; i++) {
          if (PUNCTUATION_SET.has(text[i])) {
            const clause = text.substring(start, i);
            if (clause.length > 0) {
              tokens.push({ id: nextId++, originalText: clause.slice(0, 1), isMasked: false });
              if (clause.length > 1) {
                tokens.push({ id: nextId++, originalText: clause.substring(1), isMasked: true });
              }
            }
            tokens.push({ id: nextId++, originalText: text[i], isMasked: false });
            start = i + 1;
          }
        }
        if (start < text.length) {
          const remaining = text.substring(start);
          if (remaining.length > 0) {
            const hasMore = remaining.length > 1;
            tokens.push({ id: nextId++, originalText: remaining.slice(0, 1), isMasked: false });
            if (hasMore) {
              tokens.push({ id: nextId++, originalText: remaining.substring(1), isMasked: true });
            }
          }
        }
        return tokens;
      }

      case 4: {
        const tokens: ClozeToken[] = [];
        let start = 0;
        for (let i = 0; i < text.length; i++) {
          if (PUNCTUATION_SET.has(text[i])) {
            const clause = text.substring(start, i);
            if (clause.length > 0) {
              tokens.push({ id: nextId++, originalText: clause, isMasked: true });
            }
            tokens.push({ id: nextId++, originalText: text[i], isMasked: false });
            start = i + 1;
          }
        }
        if (start < text.length) {
          const remaining = text.substring(start);
          if (remaining.length > 0) {
            tokens.push({ id: nextId++, originalText: remaining, isMasked: true });
          }
        }
        return tokens;
      }

      default:
        return [{ id: nextId, originalText: text, isMasked: false }];
    }
  }
}
