import { describe, it, expect, vi, afterEach } from "vitest";
import { SnowballChainingEngine } from "../src/domain/cloze/snowballEngine";
import { ALL_ARTICLES, Article } from "../src/data/curriculumData";
import * as flashcardGen from "../src/data/flashcardGenerator";

describe("SnowballChainingEngine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds valid chained stages for actual curriculum articles with flashcards", () => {
    const article = ALL_ARTICLES[0]; // 沁园春·长沙
    const stages = SnowballChainingEngine.buildStages(article);

    expect(stages.length).toBeGreaterThan(0);
    const total = stages.length;

    stages.forEach((stage, index) => {
      expect(stage.stageIndex).toBe(index);
      expect(stage.totalStages).toBe(total);
      expect(stage.chainUnits.length).toBe(index + 1);
      expect(stage.newlyAddedUnit).toBeDefined();
      expect(stage.newlyAddedUnit.index).toBe(index);
      expect(stage.progressRatio).toBeCloseTo((index + 1) / total, 5);

      // Verify chain units are cumulative from 0 to index
      stage.chainUnits.forEach((unit, unitIdx) => {
        expect(unit.index).toBe(unitIdx);
        expect(unit.text.length).toBeGreaterThan(0);
        // Verify card IDs are attached
        expect(Array.isArray(unit.cardIds)).toBe(true);
      });

      // Newly added unit must match the last element of chainUnits
      expect(stage.newlyAddedUnit).toEqual(stage.chainUnits[index]);
    });

    // Final stage checks
    const finalStage = stages[stages.length - 1];
    expect(finalStage.progressRatio).toBe(1.0);
    expect(finalStage.chainUnits.length).toBe(total);
  });

  it("cleans bracket tags and prompt blanks from flashcard text", () => {
    const article = ALL_ARTICLES.find(a => a.paragraphs.length > 1) || ALL_ARTICLES[0];
    const stages = SnowballChainingEngine.buildStages(article);

    for (const stage of stages) {
      const text = stage.newlyAddedUnit.text;
      expect(text).not.toContain("⟦ ________ ⟧");
      expect(text).not.toContain("【填空正解】");
      expect(text).not.toContain("【对句】");
    }
  });

  it("falls back to article.paragraphs when generateFlashcardsForArticle returns no cards", () => {
    vi.spyOn(flashcardGen, "generateFlashcardsForArticle").mockReturnValue([]);

    const mockArticle: Article = {
      id: "art_test_custom",
      moduleId: "MODULE_TEST",
      title: "测试篇目",
      subtitle: null,
      author: "测试作者",
      dynasty: "当代",
      genre: "诗歌",
      isGaoKao72: false,
      recitationScope: "自选",
      fullContent: "第一段内容。第二段内容。第三段内容。",
      paragraphs: ["第一段内容。", "第二段内容。", "第三段内容。"],
      translation: null,
      annotations: [],
      sortOrder: 1,
      totalSegments: 0,
      totalCards: 0
    };

    const stages = SnowballChainingEngine.buildStages(mockArticle);
    expect(stages).toHaveLength(3);

    expect(stages[0].stageIndex).toBe(0);
    expect(stages[0].newlyAddedUnit.text).toBe("第一段内容。");
    expect(stages[0].newlyAddedUnit.cardIds).toEqual([]);
    expect(stages[0].chainUnits).toHaveLength(1);

    expect(stages[1].stageIndex).toBe(1);
    expect(stages[1].newlyAddedUnit.text).toBe("第二段内容。");
    expect(stages[1].chainUnits).toHaveLength(2);

    expect(stages[2].stageIndex).toBe(2);
    expect(stages[2].newlyAddedUnit.text).toBe("第三段内容。");
    expect(stages[2].chainUnits).toHaveLength(3);
    expect(stages[2].progressRatio).toBe(1.0);
  });

  it("returns an empty array when article has no units / paragraphs", () => {
    vi.spyOn(flashcardGen, "generateFlashcardsForArticle").mockReturnValue([]);

    const emptyArticle: Article = {
      id: "art_empty",
      moduleId: "MODULE_EMPTY",
      title: "空篇目",
      subtitle: null,
      author: "无",
      dynasty: "无",
      genre: "诗歌",
      isGaoKao72: false,
      recitationScope: "自选",
      fullContent: "",
      paragraphs: [],
      translation: null,
      annotations: [],
      sortOrder: 1,
      totalSegments: 0,
      totalCards: 0
    };

    const stages = SnowballChainingEngine.buildStages(emptyArticle);
    expect(stages).toEqual([]);
  });

  it("maintains strict progress bounds (0 < progressRatio <= 1.0) across all stages", () => {
    for (const article of ALL_ARTICLES.slice(0, 5)) {
      const stages = SnowballChainingEngine.buildStages(article);
      for (const stage of stages) {
        expect(stage.progressRatio).toBeGreaterThan(0);
        expect(stage.progressRatio).toBeLessThanOrEqual(1.0);
      }
    }
  });
});
