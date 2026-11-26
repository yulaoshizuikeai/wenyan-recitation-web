import { describe, it, expect } from "vitest";
import { ALL_ARTICLES } from "../src/data/curriculumData";
import { ARTICLE_INDEX } from "../src/data/curriculumIndex";
import { flashcardCache } from "../src/data/flashcardCache";
import { loadArticlePhonetics } from "../src/data/articlePhonetics";
import { loadArticleUnderstanding } from "../src/data/articleUnderstanding";
import { CORE_GOLDEN_VERSES, type GoldenVerse } from "../src/data/goldenVersesData";
import { GAOKAO_SCENARIO_QUESTIONS } from "../src/data/scenarioData";
import { SnowballChainingEngine } from "../src/domain/cloze/snowballEngine";
import {
  getAllFlashcards,
  getArticleById,
  getArticleBundle,
  getFlashcardsByArticle,
  getFlashcardsByParagraph,
  getFlashcardsBySegment,
  getGoldenVersesByArticle,
  getScenarioQuestionsByArticle,
  getBottleneckFlashcards,
  resolveArticleIdForGoldenVerse
} from "../src/data/articleRepository";

describe("Article Repository (Phase 3.2 Standardized Entity Index)", () => {
  it("indexes all 100 curriculum articles by ID", () => {
    for (const article of ALL_ARTICLES) {
      expect(getArticleById(article.id)).toBe(article);
    }
    expect(getArticleById("non_existent_article")).toBeUndefined();
  });

  it("returns consistent ArticleEntityBundle for art_bx1_12 (劝学) and first curriculum article", () => {
    const firstArticle = ALL_ARTICLES[0];
    const targetIds = ["art_bx1_12", firstArticle.id];

    for (const id of targetIds) {
      const article = getArticleById(id);
      expect(article).toBeDefined();

      const bottlenecks = new Map<string, number[]>([[id, [0, 2]]]);
      const bundle = getArticleBundle(id, bottlenecks);
      expect(bundle).toBeDefined();
      expect(bundle!.article).toBe(article);
      expect(bundle!.flashcards).toEqual(getFlashcardsByArticle(id));
      expect(bundle!.flashcards.length).toBeGreaterThan(0);
      expect(bundle!.goldenVerses).toEqual(getGoldenVersesByArticle(id));
      expect(bundle!.scenarioQuestions).toEqual(getScenarioQuestionsByArticle(id));
      expect(bundle!.bottleneckIndices).toEqual([0, 2]);
    }

    expect(getArticleBundle("missing_id")).toBeUndefined();
  });

  it("indexes flashcards by articleId, paragraphIndex, and segmentId", () => {
    const allCards = getAllFlashcards();
    expect(allCards.length).toBeGreaterThan(0);

    const quanxueCards = getFlashcardsByArticle("art_bx1_12");
    expect(quanxueCards.length).toBeGreaterThan(0);
    expect(quanxueCards.every(c => c.articleId === "art_bx1_12")).toBe(true);

    const para0Cards = getFlashcardsByParagraph("art_bx1_12", 0);
    expect(para0Cards.length).toBeGreaterThan(0);
    expect(para0Cards.every(c => c.paragraphIndex === 0)).toBe(true);

    const firstCard = quanxueCards[0];
    const segCards = getFlashcardsBySegment(firstCard.segmentId);
    expect(segCards.length).toBeGreaterThan(0);
    expect(segCards.some(c => c.id === firstCard.id)).toBe(true);
  });

  it("resolves golden verses including entries whose legacy articleId fell back to title matching", () => {
    // art_xb1_recite_03 (将进酒), art_xb1_recite_02 (春江花月夜), art_xb2_recite_03 (锦瑟)
    const jiangjinjiuVerses = getGoldenVersesByArticle("art_xb1_recite_03");
    expect(jiangjinjiuVerses.length).toBe(2);
    expect(jiangjinjiuVerses.every(v => v.articleTitle === "将进酒")).toBe(true);

    const chunjiangVerses = getGoldenVersesByArticle("art_xb1_recite_02");
    expect(chunjiangVerses.length).toBe(1);
    expect(chunjiangVerses[0].articleTitle).toBe("春江花月夜");

    const jinseVerses = getGoldenVersesByArticle("art_xb2_recite_03");
    expect(jinseVerses.length).toBe(2);
    expect(jinseVerses.every(v => v.articleTitle === "锦瑟")).toBe(true);

    // Ensure every curated golden verse is indexed under an existing article
    const totalIndexed = ALL_ARTICLES.reduce(
      (sum, art) => sum + getGoldenVersesByArticle(art.id).length,
      0
    );
    expect(totalIndexed).toBe(CORE_GOLDEN_VERSES.length);
  });

  it("getScenarioQuestionsByArticle returns matching GaoKao scenario questions", () => {
    const quanxueQuestions = getScenarioQuestionsByArticle("art_bx1_12");
    const expectedCount = GAOKAO_SCENARIO_QUESTIONS.filter(
      q => q.articleId === "art_bx1_12"
    ).length;

    expect(expectedCount).toBeGreaterThan(0);
    expect(quanxueQuestions).toHaveLength(expectedCount);
    expect(quanxueQuestions.every(q => q.articleId === "art_bx1_12")).toBe(true);

    const totalIndexed = ALL_ARTICLES.reduce(
      (sum, art) => sum + getScenarioQuestionsByArticle(art.id).length,
      0
    );
    expect(totalIndexed).toBe(GAOKAO_SCENARIO_QUESTIONS.length);
  });

  it("getBottleneckFlashcards resolves pinned snowball bottleneck indices to matching deduplicated flashcards", () => {
    const quanxue = getArticleById("art_bx1_12")!;
    const shishuo = getArticleById("art_bx1_13")!;
    const quanxueStages = SnowballChainingEngine.buildStages(quanxue);
    const shishuoStages = SnowballChainingEngine.buildStages(shishuo);

    const bottlenecksMap = new Map<string, number[]>([
      ["art_bx1_12", [0, 3, 3]], // duplicate index 3 should be deduplicated
      ["art_bx1_13", [1]],
      ["non_existent_id", [0]]
    ]);

    const rescueCards = getBottleneckFlashcards(bottlenecksMap);
    const expectedIds = new Set<string>([
      ...quanxueStages[0].newlyAddedUnit.cardIds,
      ...quanxueStages[3].newlyAddedUnit.cardIds,
      ...shishuoStages[1].newlyAddedUnit.cardIds
    ]);

    expect(rescueCards.length).toBe(expectedIds.size);
    expect(new Set(rescueCards.map(c => c.id))).toEqual(expectedIds);
  });

  it("returns defensive array copies so callers cannot mutate repository indexes", () => {
    const bundle = getArticleBundle("art_bx1_12")!;
    const originalCardCount = bundle.flashcards.length;
    bundle.flashcards.pop();
    bundle.goldenVerses.pop();
    bundle.scenarioQuestions.pop();

    const freshBundle = getArticleBundle("art_bx1_12")!;
    expect(freshBundle.flashcards.length).toBe(originalCardCount);
    expect(freshBundle.goldenVerses.length).toBeGreaterThan(0);
    expect(freshBundle.scenarioQuestions.length).toBeGreaterThan(0);
  });

  it("exports resolveArticleIdForGoldenVerse for direct and title/author fallback resolution", () => {
    const legacyVerse: GoldenVerse = {
      ...CORE_GOLDEN_VERSES[0],
      articleId: "legacy_unknown_id",
      articleTitle: "将进酒",
      author: "李白"
    };
    expect(resolveArticleIdForGoldenVerse(legacyVerse)).toBe("art_xb1_recite_03");
    expect(resolveArticleIdForGoldenVerse(CORE_GOLDEN_VERSES[0])).toBe(CORE_GOLDEN_VERSES[0].articleId);
  });

  it("invalidates flashcardCache and articleRepository index when learning content chunk loads", async () => {
    // Prime cache before part 5 is loaded
    const beforeCards = getFlashcardsByArticle("art_xx_10");
    expect(beforeCards.length).toBeGreaterThan(0);

    await Promise.all([
      loadArticleUnderstanding("art_xx_10"),
      loadArticlePhonetics("art_xx_10")
    ]);

    const afterCards = getFlashcardsByArticle("art_xx_10");
    expect(afterCards.length).toBe(beforeCards.length);
    expect(afterCards[0].paragraphGist).toBeTruthy();
    expect(afterCards.some(c => (c.backPhonetics?.length ?? 0) > 0)).toBe(true);
  });

  it("does not return stale allCardsCache when a non-curriculum array happens to have ARTICLE_INDEX.length", () => {
    flashcardCache.clear();
    const realAll = flashcardCache.getCardsForArticles(ALL_ARTICLES);
    expect(realAll.length).toBeGreaterThan(0);

    const syntheticBatch = Array.from({ length: ARTICLE_INDEX.length }, (_, idx) => ({
      ...ALL_ARTICLES[0],
      id: `synthetic_art_${idx}`,
      paragraphs: [`合成测试句甲第${idx}条，合成测试句乙第${idx}条。`]
    }));
    const syntheticCards = flashcardCache.getCardsForArticles(syntheticBatch);
    expect(syntheticCards[0].articleId).toBe("synthetic_art_0");
    expect(flashcardCache.getCardsForArticles(ALL_ARTICLES)[0].articleId).toBe(ALL_ARTICLES[0].id);
  });
});
