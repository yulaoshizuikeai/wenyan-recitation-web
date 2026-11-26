import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SnowballChainingEngine,
  SnowballStage,
  buildSnowballCompletionPlan,
} from "../src/domain/cloze/snowballEngine";
import { FSRSEngine } from "../src/domain/fsrs/fsrsEngine";
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

  it("strips 【填空正解】 and 【对句】 markers before stripping 【 and 】 brackets", () => {
    const mockArticle: Article = {
      id: "art_clean_test",
      moduleId: "MODULE_TEST",
      title: "清理测试",
      subtitle: null,
      author: "测试",
      dynasty: "唐代",
      genre: "诗",
      isGaoKao72: false,
      recitationScope: "自选",
      fullContent: "大江东去，浪淘尽。",
      paragraphs: ["大江东去，浪淘尽。"],
      translation: null,
      annotations: [],
      sortOrder: 1,
      totalSegments: 1,
      totalCards: 1,
    };

    vi.spyOn(flashcardGen, "generateFlashcardsForArticle").mockReturnValue([
      {
        id: "fc_clean_1",
        articleId: "art_clean_test",
        segmentId: "seg_clean_0",
        cardType: "FULL_SENTENCE_RECALL",
        frontTitle: "清理测试",
        frontPrompt: "【填空默写】",
        frontHint: null,
        backAnswer: "【填空正解】大江东去",
        backTranslation: null,
        backNotes: null,
        isPrimary: true,
        clozeIndex: 1,
        totalClozes: 1,
        fullVerseContext: "【填空正解】【大江东去】，【对句】浪淘尽⟦ ________ ⟧",
        maskedSegment: "大江东去",
        unitIndex: 0,
        totalUnits: 1,
        precedingClauseHint: null,
      },
    ]);

    const stages = SnowballChainingEngine.buildStages(mockArticle);
    expect(stages).toHaveLength(1);
    expect(stages[0].newlyAddedUnit.text).toBe("大江东去，浪淘尽");
  });

  it("excludes skipped or duplicate stages from bottleneckCount and computes smoothCount from updatedCards", () => {
    const article = ALL_ARTICLES[0];
    const unit0 = { index: 0, text: "首句", cardIds: ["c1"], segmentId: "seg_0", primaryCardId: "c1" };
    const unit1Dup = { index: 1, text: "重复段", cardIds: ["c1"], segmentId: "seg_0", primaryCardId: "c1" };
    const unit2Empty = { index: 2, text: "无卡段", cardIds: [], segmentId: "seg_empty", primaryCardId: null };
    const unit3 = { index: 3, text: "末句", cardIds: ["c2"], segmentId: "seg_1", primaryCardId: "c2" };

    const stages: SnowballStage[] = [
      { stageIndex: 0, totalStages: 4, newlyAddedUnit: unit0, chainUnits: [unit0], progressRatio: 0.25 },
      { stageIndex: 1, totalStages: 4, newlyAddedUnit: unit1Dup, chainUnits: [unit0, unit1Dup], progressRatio: 0.5 },
      { stageIndex: 2, totalStages: 4, newlyAddedUnit: unit2Empty, chainUnits: [unit0, unit1Dup, unit2Empty], progressRatio: 0.75 },
      { stageIndex: 3, totalStages: 4, newlyAddedUnit: unit3, chainUnits: [unit0, unit1Dup, unit2Empty, unit3], progressRatio: 1 },
    ];

    const plan = buildSnowballCompletionPlan({
      article,
      stages,
      // unit1Dup and unit2Empty are marked as bottlenecks, but both are skipped!
      // Only unit3 is a non-skipped bottleneck; unit0 is smooth.
      bottleneckIndices: new Set([1, 2, 3]),
      existingCardStates: new Map(),
      fsrs: new FSRSEngine(),
      now: 1770000000000,
    });

    expect(plan.updatedCards).toHaveLength(2);
    expect(plan.bottleneckCount).toBe(1);
    expect(plan.smoothCount).toBe(1);
    expect(plan.smoothCount + plan.bottleneckCount).toBe(plan.updatedCards.length);
  });
});
