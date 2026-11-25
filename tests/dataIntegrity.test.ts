import { describe, it, expect } from "vitest";
import { ALL_ARTICLES, ARTICLE_MAP, MODULES } from "../src/data/curriculumData";
import { ARTICLE_PHONETICS, getPhonetics } from "../src/data/articlePhonetics";
import { ARTICLE_UNDERSTANDING, getUnderstanding } from "../src/data/articleUnderstanding";

describe("Data Integrity & Coverage Verification", () => {
  it("verifies ALL_ARTICLES contains exactly 100 articles", () => {
    expect(ALL_ARTICLES).toHaveLength(100);
  });

  it("verifies all 100 article IDs are unique", () => {
    const idSet = new Set(ALL_ARTICLES.map(a => a.id));
    expect(idSet.size).toBe(100);
  });

  it("verifies ARTICLE_PHONETICS covers all 100 article IDs", () => {
    const missingPhonetics: string[] = [];
    for (const article of ALL_ARTICLES) {
      if (!Object.prototype.hasOwnProperty.call(ARTICLE_PHONETICS, article.id)) {
        missingPhonetics.push(article.id);
      }
    }
    expect(missingPhonetics).toEqual([]);
    expect(Object.keys(ARTICLE_PHONETICS).length).toBeGreaterThanOrEqual(100);
  });

  it("verifies getPhonetics returns array with valid structure for each article", () => {
    for (const article of ALL_ARTICLES) {
      const phonetics = getPhonetics(article.id);
      expect(Array.isArray(phonetics)).toBe(true);
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

  it("verifies ARTICLE_UNDERSTANDING covers all 100 article IDs", () => {
    const missingUnderstanding: string[] = [];
    for (const article of ALL_ARTICLES) {
      if (!Object.prototype.hasOwnProperty.call(ARTICLE_UNDERSTANDING, article.id)) {
        missingUnderstanding.push(article.id);
      }
    }
    expect(missingUnderstanding).toEqual([]);
    expect(Object.keys(ARTICLE_UNDERSTANDING).length).toBeGreaterThanOrEqual(100);
  });

  it("verifies paragraphGists.length matches article.paragraphs.length for all 100 articles", () => {
    const mismatches: { id: string; title: string; paragraphs: number; gists: number }[] = [];

    for (const article of ALL_ARTICLES) {
      const understanding = getUnderstanding(article.id);
      expect(understanding).toBeDefined();

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
});
