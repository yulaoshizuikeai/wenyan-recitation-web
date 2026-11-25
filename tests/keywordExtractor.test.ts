import { describe, it, expect } from "vitest";
import {
  isPunctuation,
  containsPunctuation,
  isFunctionWord,
  extractAnnotationKeywords,
  filterCandidateKeywords,
  extractClozeKeywords,
  splitTokensIntoParagraphs,
  tokenizeArticleParagraphs,
  classifyClozeToken,
  isTokenEffectiveMasked,
  DEFAULT_FUNCTION_WORDS
} from "../src/domain/cloze/keywordExtractor";
import { ClozeToken } from "../src/domain/cloze/clozeEngine";

describe("keywordExtractor", () => {
  describe("Punctuation helpers", () => {
    it("isPunctuation returns true for punctuation and whitespace, false for characters", () => {
      expect(isPunctuation("，")).toBe(true);
      expect(isPunctuation("。")).toBe(true);
      expect(isPunctuation("！")).toBe(true);
      expect(isPunctuation(" ")).toBe(true);
      expect(isPunctuation("\n")).toBe(true);
      expect(isPunctuation("中")).toBe(false);
      expect(isPunctuation("a")).toBe(false);
    });

    it("containsPunctuation correctly detects punctuation in string", () => {
      expect(containsPunctuation("白日依山尽，黄河入海流")).toBe(true);
      expect(containsPunctuation("白日依山尽黄河入海流")).toBe(false);
      expect(containsPunctuation("白日 依山尽")).toBe(true);
    });
  });

  describe("Function word detection", () => {
    it("identifies classic Chinese grammatical function words", () => {
      expect(isFunctionWord("之")).toBe(true);
      expect(isFunctionWord("乎")).toBe(true);
      expect(isFunctionWord("者")).toBe(true);
      expect(isFunctionWord("也")).toBe(true);
      expect(isFunctionWord("而")).toBe(true);
      expect(isFunctionWord("其")).toBe(true);

      // Substantive words should not be considered function words
      expect(isFunctionWord("山")).toBe(false);
      expect(isFunctionWord("水")).toBe(false);
      expect(isFunctionWord("明月")).toBe(false);
    });

    it("supports custom function word sets", () => {
      const customSet = new Set(["custom_fw"]);
      expect(isFunctionWord("custom_fw", customSet)).toBe(true);
      expect(isFunctionWord("之", customSet)).toBe(false);
    });
  });

  describe("extractAnnotationKeywords", () => {
    it("extracts vocabulary terms prior to colon or parenthesis separators", () => {
      const annotations = [
        "参省（cān xǐng）：检验检查。",
        "规矩：圆规与曲尺。",
        "金就砺则利：金，指金属制的刀剑等；砺，磨刀石。",
        "单：只有一字" // Length < 2 is filtered
      ];

      const extracted = extractAnnotationKeywords(annotations);
      expect(extracted).toContain("参省");
      expect(extracted).toContain("规矩");
      expect(extracted).toContain("金就砺则利");
      expect(extracted).not.toContain("单");
    });

    it("extracts multi-character terms and filters single characters", () => {
      const annotations = [
        "靛青：一种从蓝草中提取的青蓝色染料。",
        "木直中绳：合乎木匠拉直的墨线。",
        "水：单字"
      ];
      const extracted = extractAnnotationKeywords(annotations);
      expect(extracted).toEqual(["靛青", "木直中绳"]);
      expect(extracted).not.toContain("水");
    });
  });

  describe("filterCandidateKeywords", () => {
    const fullContent = "故木受绳则直，金就砺则利，君子博学而日参省乎己，则知明而行无过矣。";

    it("filters out function words and words not present in fullContent", () => {
      const candidates = [
        "之", // function word -> excluded
        "也", // function word -> excluded
        "木受绳", // in content
        "砺则利", // in content
        "不在正文里的词" // not in content -> excluded
      ];

      const filtered = filterCandidateKeywords(candidates, fullContent);
      expect(filtered).toContain("木受绳");
      expect(filtered).toContain("砺则利");
      expect(filtered).not.toContain("之");
      expect(filtered).not.toContain("也");
      expect(filtered).not.toContain("不在正文里的词");
    });

    it("sorts keywords by length in descending order and caps at maxKeywords", () => {
      const candidates = ["木受绳", "金就砺则利", "博学", "参省"];
      const filtered = filterCandidateKeywords(candidates, fullContent, { maxKeywords: 2 });

      expect(filtered).toHaveLength(2);
      expect(filtered[0]).toBe("金就砺则利"); // Length 5
      expect(filtered[1]).toBe("木受绳"); // Length 3
    });

    it("deduplicates repeated candidate terms", () => {
      const candidates = ["博学", "博学", "参省", "博学"];
      const filtered = filterCandidateKeywords(candidates, fullContent);
      expect(filtered.filter(w => w === "博学")).toHaveLength(1);
    });
  });

  describe("extractClozeKeywords", () => {
    it("extracts phonetics words and annotation keywords combined", () => {
      const mockArticle = {
        id: "art_test",
        annotations: ["参省（cān xǐng）：检验。", "博学：广泛地学习。"],
        fullContent: "君子博学而日参省乎己，知明而行无过矣。"
      };

      const mockPhoneticsFetcher = () => [
        { word: "知" } // Note: "知" is in content, length 1, not in default function words
      ];

      const keywords = extractClozeKeywords(mockArticle, mockPhoneticsFetcher);
      expect(keywords).toContain("参省");
      expect(keywords).toContain("博学");
    });
  });

  describe("splitTokensIntoParagraphs & tokenizeArticleParagraphs", () => {
    it("splits linear tokens by newline into 2D paragraph array", () => {
      const tokens: ClozeToken[] = [
        { id: 1, originalText: "第一段前句，", isMasked: false },
        { id: 2, originalText: "第一段后句。\n第二段前句，", isMasked: false },
        { id: 3, originalText: "第二段后句。", isMasked: false }
      ];

      const paragraphs = splitTokensIntoParagraphs(tokens);
      expect(paragraphs).toHaveLength(2);

      // Paragraph 1 text
      const p1Text = paragraphs[0].map(t => t.originalText).join("");
      expect(p1Text).toBe("第一段前句，第一段后句。");

      // Paragraph 2 text
      const p2Text = paragraphs[1].map(t => t.originalText).join("");
      expect(p2Text).toBe("第二段前句，第二段后句。");
    });

    it("tokenizes article paragraphs end-to-end", () => {
      const content = "白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。";
      const paragraphs = tokenizeArticleParagraphs(content, 1, ["白日", "千里目"]);

      expect(paragraphs).toHaveLength(2);
      const allTokens = paragraphs.flat();
      const masked = allTokens.filter(t => t.isMasked).map(t => t.originalText);
      expect(masked).toContain("白日");
      expect(masked).toContain("千里目");
    });
  });

  describe("classifyClozeToken & isTokenEffectiveMasked", () => {
    const unmaskedToken = { id: 10, isMasked: false };
    const maskedToken = { id: 20, isMasked: true };

    it("classifies unmasked tokens as 'plain'", () => {
      expect(classifyClozeToken(unmaskedToken, new Set(), false)).toBe("plain");
      expect(isTokenEffectiveMasked(unmaskedToken, new Set(), false)).toBe(false);
    });

    it("classifies masked tokens as 'masked' when not revealed", () => {
      expect(classifyClozeToken(maskedToken, new Set(), false)).toBe("masked");
      expect(isTokenEffectiveMasked(maskedToken, new Set(), false)).toBe(true);
    });

    it("classifies masked tokens as 'revealed' when specifically revealed in revealedTokenIds", () => {
      const revealed = new Set([20]);
      expect(classifyClozeToken(maskedToken, revealed, false)).toBe("revealed");
      expect(isTokenEffectiveMasked(maskedToken, revealed, false)).toBe(false);
    });

    it("classifies masked tokens as 'revealed' when revealAll is true", () => {
      expect(classifyClozeToken(maskedToken, new Set(), true)).toBe("revealed");
      expect(isTokenEffectiveMasked(maskedToken, new Set(), true)).toBe(false);
    });
  });
});
