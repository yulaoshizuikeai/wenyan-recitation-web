import { describe, it, expect } from "vitest";
import { ALL_ARTICLES, ARTICLE_MAP, MODULES, type Article } from "../src/data/curriculumData";
import { CORE_GOLDEN_VERSES } from "../src/data/goldenVersesData";
import { GAOKAO_SCENARIO_QUESTIONS } from "../src/data/scenarioData";
import { generateFlashcardsForArticle } from "../src/data/flashcardGenerator";
import {
  getCachedArticlePhonetics,
  loadAllArticlePhonetics,
  loadArticlePhonetics
} from "../src/data/articlePhonetics";
import {
  getCachedArticleUnderstanding,
  loadAllArticleUnderstanding,
  loadArticleUnderstanding
} from "../src/data/articleUnderstanding";

describe("Data Integrity & Coverage Verification", () => {
  it("verifies ALL_ARTICLES contains exactly 100 articles", () => {
    expect(ALL_ARTICLES).toHaveLength(100);
  });

  it("verifies all 100 article IDs are unique", () => {
    const idSet = new Set(ALL_ARTICLES.map(a => a.id));
    expect(idSet.size).toBe(100);
  });

  it("verifies ARTICLE_PHONETICS covers all 100 article IDs", async () => {
    const allPhonetics = await loadAllArticlePhonetics();
    const missingPhonetics: string[] = [];
    for (const article of ALL_ARTICLES) {
      if (!Object.prototype.hasOwnProperty.call(allPhonetics, article.id)) {
        missingPhonetics.push(article.id);
      }
    }
    expect(missingPhonetics).toEqual([]);
    expect(Object.keys(allPhonetics).length).toBeGreaterThanOrEqual(100);
  });

  it("verifies loadArticlePhonetics and cache return array with valid structure for each article", async () => {
    const entriesPerArticle = await Promise.all(
      ALL_ARTICLES.map(article => loadArticlePhonetics(article.id))
    );
    for (let i = 0; i < ALL_ARTICLES.length; i++) {
      const article = ALL_ARTICLES[i];
      const phonetics = entriesPerArticle[i];
      expect(Array.isArray(phonetics)).toBe(true);
      expect(getCachedArticlePhonetics(article.id)).toEqual(phonetics);
      for (const entry of phonetics) {
        expect(entry.word).toBeDefined();
        expect(typeof entry.word).toBe("string");
        expect(entry.word.length).toBeGreaterThan(0);

        expect(entry.pinyin).toBeDefined();
        expect(typeof entry.pinyin).toBe("string");
        expect(entry.pinyin.length).toBeGreaterThan(0);

        expect(entry.meaning).toBeDefined();
        expect(typeof entry.meaning).toBe("string");
        expect(entry.meaning.length).toBeGreaterThan(0);
      }
    }
  });

  it("verifies ARTICLE_UNDERSTANDING covers all 100 article IDs", async () => {
    const allUnderstanding = await loadAllArticleUnderstanding();
    const missingUnderstanding: string[] = [];
    for (const article of ALL_ARTICLES) {
      if (!Object.prototype.hasOwnProperty.call(allUnderstanding, article.id)) {
        missingUnderstanding.push(article.id);
      }
    }
    expect(missingUnderstanding).toEqual([]);
    expect(Object.keys(allUnderstanding).length).toBeGreaterThanOrEqual(100);
  });

  it("verifies paragraphGists.length matches article.paragraphs.length for all 100 articles", async () => {
    const mismatches: { id: string; title: string; paragraphs: number; gists: number }[] = [];
    const understandings = await Promise.all(
      ALL_ARTICLES.map(article => loadArticleUnderstanding(article.id))
    );

    for (let i = 0; i < ALL_ARTICLES.length; i++) {
      const article = ALL_ARTICLES[i];
      const understanding = understandings[i];
      expect(understanding).toBeDefined();
      expect(getCachedArticleUnderstanding(article.id)).toEqual(understanding);

      if (!understanding) continue;

      expect(typeof understanding.gist).toBe("string");
      expect(understanding.gist.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(understanding.paragraphGists)).toBe(true);

      if (understanding.paragraphGists.length !== article.paragraphs.length) {
        mismatches.push({
          id: article.id,
          title: article.title,
          paragraphs: article.paragraphs.length,
          gists: understanding.paragraphGists.length
        });
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("verifies all articles have valid content and paragraph structures", () => {
    for (const article of ALL_ARTICLES) {
      expect(article.id).toMatch(/^art_/);
      expect(article.title.trim().length).toBeGreaterThan(0);
      expect(article.author.trim().length).toBeGreaterThan(0);
      expect(article.dynasty.trim().length).toBeGreaterThan(0);
      expect(article.paragraphs.length).toBeGreaterThan(0);
      for (const p of article.paragraphs) {
        expect(typeof p).toBe("string");
        expect(p.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("verifies ARTICLE_MAP matches ALL_ARTICLES", () => {
    expect(Object.keys(ARTICLE_MAP).length).toBe(100);
    for (const article of ALL_ARTICLES) {
      expect(ARTICLE_MAP[article.id]).toBe(article);
    }
  });

  it("verifies MODULES has 11 modules and each module matches curriculum specification", () => {
    expect(MODULES).toHaveLength(11);
    const totalArticlesInModules = MODULES.reduce((sum, m) => sum + m.totalArticles, 0);
    expect(totalArticlesInModules).toBe(100);
  });

  it("verifies every GoldenVerse articleId exists in ARTICLE_MAP with matching moduleId", () => {
    for (const gv of CORE_GOLDEN_VERSES) {
      const article = ARTICLE_MAP[gv.articleId];
      expect(article, `Missing article for GoldenVerse ${gv.id} (${gv.articleId})`).toBeDefined();
      expect(gv.moduleId).toBe(article.moduleId);
    }
  });

  it("verifies scenarioData integrity including gk_lanting_02 exact text", () => {
    for (const q of GAOKAO_SCENARIO_QUESTIONS) {
      expect(ARTICLE_MAP[q.articleId], `Missing article for scenario ${q.id}`).toBeDefined();
    }
    const lanting02 = GAOKAO_SCENARIO_QUESTIONS.find(q => q.id === "gk_lanting_02");
    expect(lanting02).toBeDefined();
    expect(lanting02!.answer).toBe("虽无丝竹管弦之盛，一觞一咏，亦足以畅叙幽情。");
    expect(lanting02!.keyPoints).toContain("丝竹管弦之盛");
  });

  it("preserves 1-char clauses, colons, enumeration commas, short exclamations, and non-final chunk punctuation in flashcards", () => {
    const quanxue = ARTICLE_MAP["art_bx1_12"];
    const qxCards = generateFlashcardsForArticle(quanxue);
    expect(qxCards.some(c => c.maskedSegment === "青，取之于蓝")).toBe(true);
    expect(qxCards.some(c => c.maskedSegment === "冰，水为之")).toBe(true);
    const junziYue = qxCards.find(c => c.maskedSegment === "君子曰");
    expect(junziYue).toBeDefined();
    expect(junziYue!.frontPrompt).toContain("：学不可以已。");

    const shishuo = ARTICLE_MAP["art_bx1_13"];
    const ssCards = generateFlashcardsForArticle(shishuo);
    expect(ssCards.some(c => c.maskedSegment === "孔子师郯子、苌弘、师襄、老聃")).toBe(true);
    expect(ssCards.some(c => c.maskedSegment?.includes("嗟乎！"))).toBe(true);
    expect(ssCards.some(c => c.maskedSegment?.includes("呜呼！"))).toBe(true);

    const liuguolun = ARTICLE_MAP["art_bx2_13"];
    const lglCards = generateFlashcardsForArticle(liuguolun);
    expect(lglCards.some(c => c.maskedSegment?.includes("悲夫！"))).toBe(true);

    // Multi-chunk sentence ending in ？ must NOT repeat ？ on non-final chunks
    const synthetic: Article = {
      ...quanxue,
      id: "art_synthetic_punct",
      paragraphs: ["甲乙丙丁，戊己庚辛，壬癸子丑，寅卯辰巳？"]
    };
    const synCards = generateFlashcardsForArticle(synthetic);
    const unit0Cards = synCards.filter(c => c.unitIndex === 0);
    const unit1Cards = synCards.filter(c => c.unitIndex === 1);
    expect(unit0Cards.every(c => c.frontPrompt.endsWith("，"))).toBe(true);
    expect(unit1Cards.every(c => c.frontPrompt.endsWith("？"))).toBe(true);
  });
});
