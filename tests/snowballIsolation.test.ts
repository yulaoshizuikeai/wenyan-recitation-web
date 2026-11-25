import { describe, it, expect } from "vitest";
import {
  SnowballChainingEngine,
  selectPrimaryCardForSegment,
  collectSnowballPrimaryCardIds,
  buildSnowballCompletionPlan,
  DEFAULT_MAX_SNOWBALL_IMMEDIATE_LEARNING
} from "../src/domain/cloze/snowballEngine";
import { ALL_ARTICLES } from "../src/data/curriculumData";
import { FSRSEngine } from "../src/domain/fsrs/fsrsEngine";
import { CardFsrsState, CardState, Rating } from "../src/domain/fsrs/fsrsTypes";

describe("Snowball FSRS Write Isolation (Track L1.3)", () => {
  const fsrs = new FSRSEngine();
  const fixedNow = 1770000000000;

  const chiBiFu = ALL_ARTICLES.find(a => a.title.includes("赤壁赋"))!;
  const piPaXing = ALL_ARTICLES.find(a => a.title.includes("琵琶行"))!;

  it("finds the benchmark articles in curriculum data", () => {
    expect(chiBiFu).toBeDefined();
    expect(piPaXing).toBeDefined();
  });

  describe("selectPrimaryCardForSegment & collectSnowballPrimaryCardIds", () => {
    it("deduplicates multiple cloze variant cards to exactly one primary card per segment", () => {
      const stages = SnowballChainingEngine.buildStages(chiBiFu);
      expect(stages.length).toBeGreaterThan(0);

      const primaryCardIds = collectSnowballPrimaryCardIds(stages, chiBiFu);
      expect(primaryCardIds.length).toBe(stages.length);

      // Verify all collected primary card IDs are unique
      const uniqueIds = new Set(primaryCardIds);
      expect(uniqueIds.size).toBe(primaryCardIds.length);
    });

    it("prefers UPPER_PROMPT_LOWER when selecting primary card for segment", () => {
      const mockCards = [
        {
          id: "c_lower",
          segmentId: "seg_1",
          articleId: "art_1",
          cardType: "LOWER_PROMPT_UPPER",
          frontTitle: "",
          frontPrompt: "",
          frontHint: null,
          backAnswer: "",
          backTranslation: null,
          backNotes: null,
          isPrimary: true,
          clozeIndex: 2,
          totalClozes: 2,
          fullVerseContext: null,
          maskedSegment: null,
          unitIndex: 0,
          totalUnits: 1,
          precedingClauseHint: null
        },
        {
          id: "c_upper",
          segmentId: "seg_1",
          articleId: "art_1",
          cardType: "UPPER_PROMPT_LOWER",
          frontTitle: "",
          frontPrompt: "",
          frontHint: null,
          backAnswer: "",
          backTranslation: null,
          backNotes: null,
          isPrimary: true,
          clozeIndex: 1,
          totalClozes: 2,
          fullVerseContext: null,
          maskedSegment: null,
          unitIndex: 0,
          totalUnits: 1,
          precedingClauseHint: null
        }
      ];

      const primary = selectPrimaryCardForSegment(mockCards);
      expect(primary?.id).toBe("c_upper");
    });
  });

  describe("buildSnowballCompletionPlan for smooth recitation", () => {
    it("graduates smooth units directly into REVIEW (>= 1 day) for 赤壁赋", () => {
      const stages = SnowballChainingEngine.buildStages(chiBiFu);
      const existingStates = new Map<string, CardFsrsState>();

      // Complete 赤壁赋 with 0 bottlenecks
      const plan = buildSnowballCompletionPlan({
        article: chiBiFu,
        stages,
        bottleneckIndices: [],
        existingCardStates: existingStates,
        fsrs,
        now: fixedNow
      });

      expect(plan.primaryCardIds.length).toBe(stages.length);
      expect(plan.updatedCards.length).toBe(stages.length);
      expect(plan.reviewLogs.length).toBe(stages.length);
      expect(plan.bottleneckCount).toBe(0);
      expect(plan.immediateLearningCount).toBe(0);
      expect(plan.graduatedCount).toBe(stages.length);

      // All smooth units should graduate directly to REVIEW with scheduledDays >= 1
      for (const card of plan.updatedCards) {
        expect(card.state).toBe(CardState.REVIEW);
        expect(card.step).toBeNull();
        expect(card.scheduledDays).toBeGreaterThanOrEqual(1);
        expect(card.lastSource).toBe("snowball");
      }

      // All logs must be tagged with source: "snowball" and quotaIsolated: true
      for (const log of plan.reviewLogs) {
        expect(log.source).toBe("snowball");
        expect(log.quotaIsolated).toBe(true);
      }
    });
  });

  describe("buildSnowballCompletionPlan bottleneck capping", () => {
    it("caps immediate LEARNING cards to DEFAULT_MAX_SNOWBALL_IMMEDIATE_LEARNING (5) for 琵琶行并序", () => {
      const stages = SnowballChainingEngine.buildStages(piPaXing);
      const totalUnits = stages.length;
      expect(totalUnits).toBeGreaterThan(10);

      // Stress test: mark all stages as bottlenecks
      const allBottleneckIndices = stages.map(s => s.stageIndex);
      const existingStates = new Map<string, CardFsrsState>();

      const plan = buildSnowballCompletionPlan({
        article: piPaXing,
        stages,
        bottleneckIndices: allBottleneckIndices,
        existingCardStates: existingStates,
        fsrs,
        now: fixedNow,
        maxImmediateLearningCards: DEFAULT_MAX_SNOWBALL_IMMEDIATE_LEARNING
      });

      expect(plan.bottleneckCount).toBe(totalUnits);
      // Immediate learning cards must be capped at 5!
      expect(plan.immediateLearningCount).toBe(DEFAULT_MAX_SNOWBALL_IMMEDIATE_LEARNING);

      const immediateLearningCards = plan.updatedCards.filter(
        c => c.state === CardState.LEARNING || c.state === CardState.RELEARNING
      );
      expect(immediateLearningCards.length).toBe(DEFAULT_MAX_SNOWBALL_IMMEDIATE_LEARNING);

      // Remaining cards beyond cap are deferred into REVIEW for tomorrow (scheduledDays >= 1)
      const deferredReviewCards = plan.updatedCards.filter(c => c.state === CardState.REVIEW);
      expect(deferredReviewCards.length).toBe(totalUnits - DEFAULT_MAX_SNOWBALL_IMMEDIATE_LEARNING);

      for (const card of deferredReviewCards) {
        expect(card.scheduledDays).toBeGreaterThanOrEqual(1);
        expect(card.dueTime).toBeGreaterThanOrEqual(fixedNow + 86_400_000);
      }

      // All logs are quotaIsolated
      for (const log of plan.reviewLogs) {
        expect(log.quotaIsolated).toBe(true);
        expect(log.source).toBe("snowball");
      }
    });

    it("handles empty stages input gracefully", () => {
      const plan = buildSnowballCompletionPlan({
        article: chiBiFu,
        stages: [],
        bottleneckIndices: [],
        existingCardStates: new Map(),
        fsrs
      });

      expect(plan.primaryCardIds).toEqual([]);
      expect(plan.updatedCards).toEqual([]);
      expect(plan.reviewLogs).toEqual([]);
      expect(plan.smoothCount).toBe(0);
      expect(plan.bottleneckCount).toBe(0);
    });
  });
});
