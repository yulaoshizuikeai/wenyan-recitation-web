import { describe, it, expect } from "vitest";
import {
  SnowballChainingEngine,
  buildParagraphStages,
  buildBridgeCards,
  buildSnowballCompletionPlan
} from "../src/domain/cloze/snowballEngine";
import { ALL_ARTICLES } from "../src/data/curriculumData";
import { FSRSEngine } from "../src/domain/fsrs/fsrsEngine";
import { CardFsrsState, CardState } from "../src/domain/fsrs/fsrsTypes";

describe("Paragraph-level Snowball & Inter-paragraph Bridge Cards (Track L3.2)", () => {
  const chiBiFu = ALL_ARTICLES.find(a => a.title.includes("赤壁赋"))!;
  const quanXue = ALL_ARTICLES.find(a => a.title.includes("劝学"))!;
  const singleParaArticle = ALL_ARTICLES.find(a => a.paragraphs.length === 1)!;

  it("finds multi-paragraph and single-paragraph benchmark articles", () => {
    expect(chiBiFu).toBeDefined();
    expect(chiBiFu.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(quanXue).toBeDefined();
    expect(quanXue.paragraphs.length).toBeGreaterThanOrEqual(3);
    expect(singleParaArticle).toBeDefined();
  });

  describe("buildParagraphStages", () => {
    it("partitions a long article into per-paragraph stages whose total equals full-article stages", () => {
      const fullStages = SnowballChainingEngine.buildStages(chiBiFu);
      let summedParagraphStages = 0;

      for (let p = 0; p < chiBiFu.paragraphs.length; p++) {
        const paraStages = buildParagraphStages(chiBiFu, p);
        expect(paraStages.length).toBeGreaterThan(0);

        paraStages.forEach((stg, idx) => {
          expect(stg.stageIndex).toBe(idx);
          expect(stg.totalStages).toBe(paraStages.length);
          expect(stg.chainUnits.length).toBe(idx + 1);
          expect(stg.newlyAddedUnit.paragraphIndex).toBe(p);
          expect(stg.progressRatio).toBeCloseTo((idx + 1) / paraStages.length, 5);
        });

        expect(paraStages[paraStages.length - 1].progressRatio).toBe(1.0);
        summedParagraphStages += paraStages.length;
      }

      expect(summedParagraphStages).toBe(fullStages.length);
    });

    it("matches SnowballChainingEngine.buildStages(article, { paragraphIndex })", () => {
      const viaHelper = buildParagraphStages(quanXue, 1);
      const viaOption = SnowballChainingEngine.buildStages(quanXue, { paragraphIndex: 1 });
      expect(viaOption).toEqual(viaHelper);
    });

    it("returns an empty array for out-of-range paragraphIndex", () => {
      expect(buildParagraphStages(chiBiFu, -1)).toEqual([]);
      expect(buildParagraphStages(chiBiFu, chiBiFu.paragraphs.length)).toEqual([]);
    });

    it("settles a single paragraph independently via buildSnowballCompletionPlan using global unit indices", () => {
      const fsrs = new FSRSEngine();
      const para1Stages = buildParagraphStages(chiBiFu, 1);
      expect(para1Stages.length).toBeGreaterThan(1);

      const targetBottleneckUnitIndex = para1Stages[0].newlyAddedUnit.index;
      // Global unit index of paragraph 1's first unit must be > 0 (after paragraph 0)
      expect(targetBottleneckUnitIndex).toBeGreaterThan(0);

      const plan = buildSnowballCompletionPlan({
        article: chiBiFu,
        stages: para1Stages,
        bottleneckIndices: [targetBottleneckUnitIndex],
        existingCardStates: new Map<string, CardFsrsState>(),
        fsrs,
        now: 1770000000000
      });

      expect(plan.updatedCards.length).toBe(para1Stages.length);
      expect(plan.bottleneckCount).toBe(1);
      expect(plan.smoothCount).toBe(para1Stages.length - 1);
      expect(plan.immediateLearningCount).toBe(1);

      const bottleneckCard = plan.updatedCards.find(
        c => c.cardId === para1Stages[0].newlyAddedUnit.primaryCardId
      );
      expect(bottleneckCard).toBeDefined();
      expect(bottleneckCard!.state).toBe(CardState.LEARNING);
    });
  });

  describe("buildBridgeCards", () => {
    it("returns empty array for single-paragraph articles", () => {
      expect(buildBridgeCards(singleParaArticle)).toEqual([]);
    });

    it("builds N - 1 inter-paragraph bridge cards for N-paragraph articles", () => {
      const bridges = buildBridgeCards(chiBiFu);
      expect(bridges.length).toBe(chiBiFu.paragraphs.length - 1);

      bridges.forEach((bridge, idx) => {
        expect(bridge.fromParagraphIndex).toBe(idx);
        expect(bridge.toParagraphIndex).toBe(idx + 1);
        expect(bridge.promptSentence.length).toBeGreaterThan(0);
        expect(bridge.targetSentence.length).toBeGreaterThan(0);

        const prevParaStages = buildParagraphStages(chiBiFu, idx);
        const nextParaStages = buildParagraphStages(chiBiFu, idx + 1);
        const expectedPrompt = prevParaStages[prevParaStages.length - 1].newlyAddedUnit.text;
        const expectedTargetUnit = nextParaStages[0].newlyAddedUnit;

        expect(bridge.promptSentence).toBe(expectedPrompt);
        expect(bridge.targetSentence).toBe(expectedTargetUnit.text);
        expect(bridge.targetUnitIndex).toBe(expectedTargetUnit.index);
        expect(bridge.targetPrimaryCardId).toBe(expectedTargetUnit.primaryCardId ?? null);
      });
    });

    it("also works via SnowballChainingEngine.buildBridgeCards", () => {
      expect(SnowballChainingEngine.buildBridgeCards(quanXue)).toEqual(buildBridgeCards(quanXue));
    });
  });
});
