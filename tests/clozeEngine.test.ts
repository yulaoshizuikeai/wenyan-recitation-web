import { describe, it, expect } from "vitest";
import { ClozeEngine, PUNCTUATION_SET, ClozeToken } from "../src/domain/cloze/clozeEngine";

describe("ClozeEngine", () => {
  const samplePoem = "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。";

  function reconstructText(tokens: ClozeToken[]): string {
    return tokens.map(t => t.originalText).join("");
  }

  describe("Level 0: No Masking (原文通读)", () => {
    it("returns a single token with the complete text and isMasked = false", () => {
      const tokens = ClozeEngine.tokenize(samplePoem, 0, []);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].originalText).toBe(samplePoem);
      expect(tokens[0].isMasked).toBe(false);
      expect(tokens[0].id).toBe(1);
    });
  });

  describe("Level 1: Keyword Masking (考点实词挖空)", () => {
    it("masks specified keywords while leaving non-keywords visible", () => {
      const keywords = ["白日", "黄河", "千里目", "一层楼"];
      const tokens = ClozeEngine.tokenize(samplePoem, 1, keywords);

      expect(reconstructText(tokens)).toBe(samplePoem);

      const maskedTexts = tokens.filter(t => t.isMasked).map(t => t.originalText);
      expect(maskedTexts).toEqual(["白日", "黄河", "千里目", "一层楼"]);

      // Check token IDs are sequential
      tokens.forEach((t, i) => {
        expect(t.id).toBe(i + 1);
      });
    });

    it("prefers longer keywords when keywords overlap", () => {
      const text = "青青子衿，悠悠我心。";
      const keywords = ["青青", "青青子衿"];
      const tokens = ClozeEngine.tokenize(text, 1, keywords);

      expect(reconstructText(tokens)).toBe(text);
      const maskedTexts = tokens.filter(t => t.isMasked).map(t => t.originalText);
      expect(maskedTexts).toContain("青青子衿");
      expect(maskedTexts).not.toContain("青青");
    });

    it("gracefully falls back to Level 2 half-clause masking when keywords list is empty", () => {
      const tokensWithEmptyKws = ClozeEngine.tokenize(samplePoem, 1, []);
      const tokensLevel2 = ClozeEngine.tokenize(samplePoem, 2, []);

      expect(reconstructText(tokensWithEmptyKws)).toBe(samplePoem);
      expect(tokensWithEmptyKws.map(t => t.isMasked)).toEqual(tokensLevel2.map(t => t.isMasked));
      expect(tokensWithEmptyKws.map(t => t.originalText)).toEqual(tokensLevel2.map(t => t.originalText));
    });

    it("gracefully falls back to Level 2 half-clause masking when no keywords match the text", () => {
      const irrelevantKws = ["赤壁", "苏轼", "樯橹", "灰飞烟灭"];
      const tokensWithMisses = ClozeEngine.tokenize(samplePoem, 1, irrelevantKws);
      const tokensLevel2 = ClozeEngine.tokenize(samplePoem, 2, []);

      expect(reconstructText(tokensWithMisses)).toBe(samplePoem);
      expect(tokensWithMisses.map(t => t.originalText)).toEqual(tokensLevel2.map(t => t.originalText));
      expect(tokensWithMisses.map(t => t.isMasked)).toEqual(tokensLevel2.map(t => t.isMasked));
    });

    it("trims whitespace and deduplicates keywords before matching", () => {
      const keywords = [" 白日 ", "白日", "  千里目\t", "   "];
      const tokens = ClozeEngine.tokenize(samplePoem, 1, keywords);

      expect(reconstructText(tokens)).toBe(samplePoem);
      const maskedTexts = tokens.filter(t => t.isMasked).map(t => t.originalText);
      expect(maskedTexts).toEqual(["白日", "千里目"]);
    });
  });

  describe("Level 2: Half-Clause Masking (半句遮挡)", () => {
    it("shows the upper clause (出句) and masks the lower clause (对句) without chopping words in half", () => {
      const text = "白日依山尽，黄河入海流。";
      const tokens = ClozeEngine.tokenize(text, 2, []);

      expect(reconstructText(tokens)).toBe(text);
      expect(tokens).toEqual([
        { id: 1, originalText: "白日依山尽", isMasked: false },
        { id: 2, originalText: "，", isMasked: false },
        { id: 3, originalText: "黄河入海流", isMasked: true },
        { id: 4, originalText: "。", isMasked: false }
      ]);
    });

    it("alternates masking across consecutive standalone sentences without commas", () => {
      const text = "何以解忧？唯有杜康。";
      const tokens = ClozeEngine.tokenize(text, 2, []);

      expect(reconstructText(tokens)).toBe(text);
      expect(tokens.filter(t => t.isMasked).map(t => t.originalText)).toEqual(["唯有杜康"]);
    });

    it("supports context-scoped L1 keywords so 1-char loanwords do not over-mask unrelated occurrences", () => {
      const text = "静女其姝，俟我于城隅。彤管有炜，说怿女美。匪女之为美，美人之贻。";
      const tokens = ClozeEngine.tokenize(text, 1, [
        { word: "女", context: ["说怿女美", "匪女之为美"] }
      ]);

      expect(reconstructText(tokens)).toBe(text);
      const masked = tokens.filter(t => t.isMasked).map(t => t.originalText);
      expect(masked).toEqual(["女", "女"]);
      // "静女其姝" must remain unmasked
      expect(tokens[0].originalText).toContain("静女其姝");
      expect(tokens[0].isMasked).toBe(false);
    });

    it("leaves 1-character clauses unmasked", () => {
      const text = "行，路，难！";
      const tokens = ClozeEngine.tokenize(text, 2, []);

      expect(reconstructText(tokens)).toBe(text);
      // All 1-char clauses should be unmasked
      const masked = tokens.filter(t => t.isMasked);
      expect(masked).toHaveLength(0);
    });
  });

  describe("Level 3: Prompt First Character (首字提示)", () => {
    it("keeps the first character of each clause visible and masks the remainder", () => {
      const text = "学而时习之，不亦说乎？";
      const tokens = ClozeEngine.tokenize(text, 3, []);

      expect(reconstructText(tokens)).toBe(text);

      // "学而时习之" -> "学" (unmasked), "而时习之" (masked)
      expect(tokens[0]).toEqual({ id: 1, originalText: "学", isMasked: false });
      expect(tokens[1]).toEqual({ id: 2, originalText: "而时习之", isMasked: true });
      expect(tokens[2]).toEqual({ id: 3, originalText: "，", isMasked: false });

      // "不亦说乎" -> "不" (unmasked), "亦说乎" (masked)
      expect(tokens[3]).toEqual({ id: 4, originalText: "不", isMasked: false });
      expect(tokens[4]).toEqual({ id: 5, originalText: "亦说乎", isMasked: true });
      expect(tokens[5]).toEqual({ id: 6, originalText: "？", isMasked: false });
    });

    it("handles 1-character clauses without producing empty masked tokens", () => {
      const text = "嗟！夫！";
      const tokens = ClozeEngine.tokenize(text, 3, []);

      expect(reconstructText(tokens)).toBe(text);
      expect(tokens[0]).toEqual({ id: 1, originalText: "嗟", isMasked: false });
      expect(tokens[1]).toEqual({ id: 2, originalText: "！", isMasked: false });
      expect(tokens[2]).toEqual({ id: 3, originalText: "夫", isMasked: false });
      expect(tokens[3]).toEqual({ id: 4, originalText: "！", isMasked: false });
    });
  });

  describe("Level 4: Full Masking (全文遮挡)", () => {
    it("masks every clause completely while preserving punctuation marks", () => {
      const text = "千里之行，始于足下。";
      const tokens = ClozeEngine.tokenize(text, 4, []);

      expect(reconstructText(tokens)).toBe(text);

      expect(tokens[0]).toEqual({ id: 1, originalText: "千里之行", isMasked: true });
      expect(tokens[1]).toEqual({ id: 2, originalText: "，", isMasked: false });
      expect(tokens[2]).toEqual({ id: 3, originalText: "始于足下", isMasked: true });
      expect(tokens[3]).toEqual({ id: 4, originalText: "。", isMasked: false });
    });

    it("handles trailing text without terminal punctuation", () => {
      const text = "前不见古人后不见来者";
      const tokens = ClozeEngine.tokenize(text, 4, []);

      expect(reconstructText(tokens)).toBe(text);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].originalText).toBe(text);
      expect(tokens[0].isMasked).toBe(true);
    });
  });

  describe("Fallback / Default Level", () => {
    it("returns unmasked text token for unhandled level numbers", () => {
      const tokens = ClozeEngine.tokenize(samplePoem, 99, []);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].originalText).toBe(samplePoem);
      expect(tokens[0].isMasked).toBe(false);
    });
  });

  describe("Punctuation coverage", () => {
    it("contains standard Chinese and whitespace punctuation marks", () => {
      expect(PUNCTUATION_SET.has("，")).toBe(true);
      expect(PUNCTUATION_SET.has("。")).toBe(true);
      expect(PUNCTUATION_SET.has("！")).toBe(true);
      expect(PUNCTUATION_SET.has("？")).toBe(true);
      expect(PUNCTUATION_SET.has("；")).toBe(true);
      expect(PUNCTUATION_SET.has("：")).toBe(true);
      expect(PUNCTUATION_SET.has("\n")).toBe(true);
    });
  });
});
