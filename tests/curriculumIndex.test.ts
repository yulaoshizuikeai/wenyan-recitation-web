import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ALL_ARTICLES, MODULES as FULL_MODULES } from "../src/data/curriculumData";
import { ARTICLE_INDEX, ARTICLE_INDEX_MAP, MODULES, MODULE_MAP } from "../src/data/curriculumIndex";
import { loadArticleById, loadArticlesForScope } from "../src/data/curriculumLoader";
import { generateFlashcardsForArticle } from "../src/data/flashcardGenerator";
import { computeDeckStats, getArticlesForDeck } from "../src/data/ankiDecks";
import { filterArticlesMulti } from "../src/data/articleTaxonomy";
import { CardFsrsState, CardState } from "../src/domain/fsrs/fsrsTypes";

describe("Phase 4.1: curriculumIndex & lazy curriculumLoader", () => {
  it("keeps curriculumIndex.ts under 25 KB", () => {
    const indexPath = path.resolve(process.cwd(), "src/data/curriculumIndex.ts");
    const sizeBytes = fs.statSync(indexPath).size;
    expect(sizeBytes).toBeLessThan(25 * 1024);
  });

  it("matches all 100 articles and 11 modules from curriculumData.ts", () => {
    expect(MODULES).toHaveLength(FULL_MODULES.length);
    expect(ARTICLE_INDEX).toHaveLength(ALL_ARTICLES.length);

    for (const full of ALL_ARTICLES) {
      const meta = ARTICLE_INDEX_MAP[full.id];
      expect(meta).toBeDefined();
      expect(meta.title).toBe(full.title);
      expect(meta.author).toBe(full.author);
      expect(meta.dynasty).toBe(full.dynasty);
      expect(meta.moduleId).toBe(full.moduleId);
      expect(meta.book).toBe(MODULE_MAP[full.moduleId].name);
      expect(meta.genre).toBe(full.genre);
      expect(meta.isGaoKao72).toBe(full.isGaoKao72);
      expect(meta.recitationScope).toBe(full.recitationScope);
      expect(meta.charCount).toBe(full.fullContent.length);
      expect(meta.paragraphCount).toBe(full.paragraphs.length);
      expect(meta.generatedCardCount).toBe(generateFlashcardsForArticle(full).length);
    }
  });

  it("lazily loads single articles and scopes matching full curriculumData", async () => {
    const qx = await loadArticleById("art_bx1_12");
    expect(qx).toBeDefined();
    expect(qx).toEqual(ALL_ARTICLES.find((a) => a.id === "art_bx1_12"));

    const xb1Arts = await loadArticlesForScope("VOL_XB1");
    const expectedXb1 = ALL_ARTICLES.filter(
      (a) => a.moduleId === "MODULE_XB_1" || a.moduleId === "MODULE_XB_1_RECITE"
    );
    expect(xb1Arts).toHaveLength(expectedXb1.length);
    expect(xb1Arts.map((a) => a.id)).toEqual(expectedXb1.map((a) => a.id));
  });

  it("computes identical deck stats from ArticleMeta[] without loading full bodies", () => {
    const volBx1Metas = getArticlesForDeck("VOL_BX1");
    const volBx1Full = ALL_ARTICLES.filter((a) =>
      ["MODULE_BX_1", "MODULE_BX_1_RECITE"].includes(a.moduleId)
    );

    const now = Date.now();
    const cardStatesMap = new Map<string, CardFsrsState>();
    const sampleCards = generateFlashcardsForArticle(volBx1Full[0]);

    // Mark 1st card as LEARNING, 2nd as due REVIEW + mature
    cardStatesMap.set(sampleCards[0].id, {
      cardId: sampleCards[0].id,
      state: CardState.LEARNING,
      step: 1,
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 1,
      lapses: 0,
      lastReviewTime: now - 1000,
      dueTime: now + 60000,
      isLeech: false,
    });
    cardStatesMap.set(sampleCards[1].id, {
      cardId: sampleCards[1].id,
      state: CardState.REVIEW,
      step: null,
      stability: 25,
      difficulty: 4,
      elapsedDays: 10,
      scheduledDays: 25,
      reps: 4,
      lapses: 0,
      lastReviewTime: now - 86400000,
      dueTime: now - 1000,
      isLeech: false,
    });

    const stats = computeDeckStats("VOL_BX1", "必修上册", volBx1Metas, cardStatesMap, now);
    const expectedTotal = volBx1Full.reduce(
      (sum, art) => sum + generateFlashcardsForArticle(art).length,
      0
    );

    expect(stats.articleCount).toBe(volBx1Full.length);
    expect(stats.totalCards).toBe(expectedTotal);
    expect(stats.learningCount).toBe(1);
    expect(stats.dueCount).toBe(1);
    expect(stats.matureCount).toBe(1);
    expect(stats.newCount).toBe(expectedTotal - 2);
  });

  it("filters ARTICLE_INDEX by masteryStatus/matureCardIds and matches golden verse quotes when fullContent is absent", () => {
    const qxMeta = ARTICLE_INDEX_MAP["art_bx1_12"];
    const qxCards = generateFlashcardsForArticle(ALL_ARTICLES.find(a => a.id === "art_bx1_12")!);
    const matureCardIds = new Set(qxCards.map(c => c.id));

    const ssCards = generateFlashcardsForArticle(ALL_ARTICLES.find(a => a.id === "art_bx1_13")!);
    const learnedCardIds = new Set([...qxCards.map(c => c.id), ssCards[0].id]);

    const mastered = filterArticlesMulti(ARTICLE_INDEX, {
      masteryStatus: "MASTERED",
      matureCardIds,
      learnedCardIds
    });
    expect(mastered.map(a => a.id)).toEqual(["art_bx1_12"]);

    const learning = filterArticlesMulti(ARTICLE_INDEX, {
      masteryStatus: "LEARNING",
      matureCardIds,
      learnedCardIds
    });
    expect(learning.map(a => a.id)).toEqual(["art_bx1_13"]);

    const unlearned = filterArticlesMulti(ARTICLE_INDEX, {
      masteryStatus: "UNLEARNED",
      matureCardIds,
      learnedCardIds
    });
    expect(unlearned).toHaveLength(ARTICLE_INDEX.length - 2);
    expect(unlearned.some(a => a.id === qxMeta.id)).toBe(false);

    // Quote search works on ArticleMeta[] (without fullContent)
    const quoteHits = filterArticlesMulti(ARTICLE_INDEX, { searchQuery: "天生我材必有用" });
    expect(quoteHits.some(a => a.id === "art_xb1_recite_03")).toBe(true);
  });
});
