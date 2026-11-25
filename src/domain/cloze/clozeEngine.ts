export interface ClozeToken {
  id: number;
  originalText: string;
  isMasked: boolean;
}

export const PUNCTUATION_SET = new Set([
  '，', '。', '；', '！', '？', '：', '、',
  '“', '”', '‘', '’', '《', '》', '（', '）', '【', '】', '—', '…',
  '\n', '\r', ' ', '\t'
]);

export class ClozeEngine {
  /** L2 半句遮挡：出句提示、对句遮挡。L1 无有效关键词时也退化到此级 */
  private static tokenizeHalfClause(text: string): ClozeToken[] {
    const tokens: ClozeToken[] = [];
    let nextId = 1;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (PUNCTUATION_SET.has(text[i])) {
        const clause = text.substring(start, i);
        if (clause.length >= 2) {
          const half = Math.floor(clause.length / 2);
          tokens.push({ id: nextId++, originalText: clause.substring(0, half), isMasked: false });
          tokens.push({ id: nextId++, originalText: clause.substring(half), isMasked: true });
        } else if (clause.length > 0) {
          tokens.push({ id: nextId++, originalText: clause, isMasked: false });
        }
        tokens.push({ id: nextId++, originalText: text[i], isMasked: false });
        start = i + 1;
      }
    }
    if (start < text.length) {
      const remaining = text.substring(start);
      if (remaining.length >= 2) {
        const half = Math.floor(remaining.length / 2);
        tokens.push({ id: nextId++, originalText: remaining.substring(0, half), isMasked: false });
        tokens.push({ id: nextId++, originalText: remaining.substring(half), isMasked: true });
      } else if (remaining.length > 0) {
        tokens.push({ id: nextId++, originalText: remaining, isMasked: false });
      }
    }
    return tokens;
  }

  static tokenize(text: string, level: number, keywords: string[]): ClozeToken[] {
    let nextId = 1;
    switch (level) {
      case 0:
        return [{ id: nextId, originalText: text, isMasked: false }];

      case 1: {
        // Collect valid keywords that appear in this text
        const matchedKws = keywords.filter(k => k.trim().length > 0 && text.includes(k.trim()));

        // 无有效关键词时退化为半句遮挡，不再挖虚词或句尾字
        if (matchedKws.length === 0) {
          return ClozeEngine.tokenizeHalfClause(text);
        }

        const tokens: ClozeToken[] = [];
        let cursor = 0;
        const sortedKws = [...matchedKws].sort((a, b) => b.length - a.length);

        while (cursor < text.length) {
          let matchKw: string | null = null;
          for (const kw of sortedKws) {
            if (text.startsWith(kw, cursor)) {
              matchKw = kw;
              break;
            }
          }

          if (matchKw != null) {
            tokens.push({ id: nextId++, originalText: matchKw, isMasked: true });
            cursor += matchKw.length;
          } else {
            let nextMatchIndex = text.length;
            for (const kw of sortedKws) {
              const idx = text.indexOf(kw, cursor);
              if (idx !== -1 && idx < nextMatchIndex) {
                nextMatchIndex = idx;
              }
            }

            const plain = text.substring(cursor, nextMatchIndex);
            if (plain.length > 0) {
              tokens.push({ id: nextId++, originalText: plain, isMasked: false });
            }
            cursor = nextMatchIndex;
          }
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
