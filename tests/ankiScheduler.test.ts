import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AnkiScheduler,
  burySiblingCards,
  DEFAULT_SCHEDULER_SETTINGS,
  SchedulerSettings
} from "../src/domain/fsrs/ankiScheduler";
import { Flashcard } from "../src/data/flashcardGenerator";
import { CardFsrsState, CardState, Rating } from "../src/domain/fsrs/fsrsTypes";
import { ALL_ARTICLES, Article } from "../src/data/curriculumData";
import { FSRSEngine } from "../src/domain/fsrs/fsrsEngine";

// Mock IndexedDB storage for scheduler settings
const schedulerStorage = new Map<string, any>();

vi.mock("../src/storage/db", () => ({
  getSetting: vi.fn(async (key: string, defaultValue: any) => {
    return schedulerStorage.has(key) ? schedulerStorage.get(key) : defaultValue;
  }),
  setSetting: vi.fn(async (key: string, value: any) => {
    schedulerStorage.set(key, value);
  })
}));

describe("AnkiScheduler & Sibling Burying (Track L1.2)", () => {
  let scheduler: AnkiScheduler;
  const fixedNow = 1770000000000; // Fixed deterministic timestamp

  beforeEach(() => {
    schedulerStorage.clear();
    scheduler = new AnkiScheduler();
  });

  describe("burySiblingCards", () => {
    const cardUpper: Flashcard = {
      id: "fc_art_1_u0_upper",
      segmentId: "seg_art_1_0",
      articleId: "art_1",
      cardType: "UPPER_PROMPT_LOWER",
      frontTitle: "标题",
      frontPrompt: "出句提示",
      frontHint: null,
      backAnswer: "对句正解",
      backTranslation: null,
      backNotes: null,
      isPrimary: true,
      clozeIndex: 1,
      totalClozes: 2,
      fullVerseContext: "出句，对句。",
      maskedSegment: "对句",
      unitIndex: 0,
      totalUnits: 1,
      precedingClauseHint: null
    };

    const cardLower: Flashcard = {
      id: "fc_art_1_u0_lower",
      segmentId: "seg_art_1_0",
      articleId: "art_1",
      cardType: "LOWER_PROMPT_UPPER",
      frontTitle: "标题",
      frontPrompt: "对句提示",
      frontHint: null,
      backAnswer: "出句正解",
      backTranslation: null,
      backNotes: null,
      isPrimary: false,
      clozeIndex: 2,
      totalClozes: 2,
      fullVerseContext: "出句，对句。",
      maskedSegment: "出句",
      unitIndex: 0,
      totalUnits: 1,
      precedingClauseHint: null
    };

    it("buries sibling cards sharing the same segmentId, selecting only one", () => {
      const candidates = [cardLower, cardUpper];
      const { selected, buried } = burySiblingCards(candidates);

      expect(selected).toHaveLength(1);
      expect(buried).toHaveLength(1);
      expect(selected[0].segmentId).toBe("seg_art_1_0");
    });

    it("prioritizes isPrimary === true cards over non-primary siblings", () => {
      // cardUpper has isPrimary: true, cardLower has isPrimary: false
      const { selected, buried } = burySiblingCards([cardLower, cardUpper]);
      expect(selected[0].id).toBe(cardUpper.id);
      expect(buried[0].id).toBe(cardLower.id);
    });

    it("prioritizes priorityCardIds over isPrimary", () => {
      const prioritySet = new Set([cardLower.id]);
      const { selected, buried } = burySiblingCards([cardLower, cardUpper], new Set(), prioritySet);

      expect(selected[0].id).toBe(cardLower.id);
      expect(buried[0].id).toBe(cardUpper.id);
    });

    it("buries all candidates whose segment is in blockedSegments", () => {
      const blocked = new Set(["seg_art_1_0"]);
      const { selected, buried } = burySiblingCards([cardUpper, cardLower], blocked);

      expect(selected).toHaveLength(0);
      expect(buried).toHaveLength(2);
    });
  });

  describe("AnkiScheduler.buildDailyPlan with burySiblings", () => {
    const testArticles = ALL_ARTICLES.slice(0, 3);

    it("ensures default 20 new cards cover 20 distinct segmentIds when burySiblings is true", () => {
      const cardStatesMap = new Map<string, CardFsrsState>();
      const plan = scheduler.buildDailyPlan(
        testArticles,
        cardStatesMap,
        { ...DEFAULT_SCHEDULER_SETTINGS, dailyNewLimit: 20, burySiblings: true },
        0,
        0,
        fixedNow
      );

      expect(plan.newCards.length).toBeLessThanOrEqual(20);
      const segmentIds = plan.newCards.map(c => c.segmentId || c.id);
      const uniqueSegments = new Set(segmentIds);
      // All selected new cards must have unique segments!
      expect(uniqueSegments.size).toBe(plan.newCards.length);
      expect(plan.buriedSiblingsCount).toBeGreaterThan(0);
    });

    it("allows same-segment cards in newCards when burySiblings is disabled", () => {
      const cardStatesMap = new Map<string, CardFsrsState>();
      const plan = scheduler.buildDailyPlan(
        testArticles,
        cardStatesMap,
        { ...DEFAULT_SCHEDULER_SETTINGS, dailyNewLimit: 50, burySiblings: false },
        0,
        0,
        fixedNow
      );

      const segmentIds = plan.newCards.map(c => c.segmentId || c.id);
      const uniqueSegments = new Set(segmentIds);
      // Without sibling burying, multiple cloze variants of the same segment appear on the same day
      expect(uniqueSegments.size).toBeLessThan(plan.newCards.length);
      expect(plan.buriedSiblingsCount).toBe(0);
    });

    it("buries due and new siblings if their segment is already in active learning queue", () => {
      const cardStatesMap = new Map<string, CardFsrsState>();
      // Find two sibling cards
      const allCards = scheduler.buildDailyPlan(testArticles, cardStatesMap, {
        ...DEFAULT_SCHEDULER_SETTINGS,
        dailyNewLimit: 100,
        burySiblings: false
      }).newCards;

      const segmentMap = new Map<string, Flashcard[]>();
      for (const card of allCards) {
        const seg = card.segmentId || card.id;
        if (!segmentMap.has(seg)) segmentMap.set(seg, []);
        segmentMap.get(seg)!.push(card);
      }

      const multiCardSeg = Array.from(segmentMap.values()).find(cards => cards.length >= 2);
      expect(multiCardSeg).toBeDefined();

      if (multiCardSeg) {
        const [card1, card2] = multiCardSeg;
        // Mark card1 as in LEARNING state
        cardStatesMap.set(card1.id, {
          cardId: card1.id,
          state: CardState.LEARNING,
          step: 0,
          stability: 1,
          difficulty: 5,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 1,
          lapses: 0,
          lastReviewTime: fixedNow,
          dueTime: fixedNow - 1000,
          isLeech: false
        });

        // card2 is NEW
        const plan = scheduler.buildDailyPlan(
          testArticles,
          cardStatesMap,
          { ...DEFAULT_SCHEDULER_SETTINGS, dailyNewLimit: 20, burySiblings: true },
          0,
          0,
          fixedNow
        );

        // card1 is in learningCards
        expect(plan.learningCards.some(c => c.id === card1.id)).toBe(true);
        // card2 must NOT appear in newCards because its segment is already claimed by card1!
        expect(plan.newCards.some(c => c.id === card2.id)).toBe(false);
      }
    });

    it("buries remaining siblings when one sibling was already completed today", () => {
      const cardStatesMap = new Map<string, CardFsrsState>();
      const allCards = scheduler.buildDailyPlan(testArticles, cardStatesMap, {
        ...DEFAULT_SCHEDULER_SETTINGS,
        dailyNewLimit: 100,
        burySiblings: false
      }).newCards;

      const segmentMap = new Map<string, Flashcard[]>();
      for (const card of allCards) {
        const seg = card.segmentId || card.id;
        if (!segmentMap.has(seg)) segmentMap.set(seg, []);
        segmentMap.get(seg)!.push(card);
      }

      const [card1, card2] = Array.from(segmentMap.values()).find(cards => cards.length >= 2)!;

      // card1 was reviewed today and scheduled for 2 days later
      cardStatesMap.set(card1.id, {
        cardId: card1.id,
        state: CardState.REVIEW,
        step: null,
        stability: 3,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 2,
        reps: 2,
        lapses: 0,
        lastReviewTime: fixedNow,
        dueTime: fixedNow + 2 * 86_400_000,
        isLeech: false
      });

      const todayPlan = scheduler.buildDailyPlan(
        testArticles,
        cardStatesMap,
        { ...DEFAULT_SCHEDULER_SETTINGS, dailyNewLimit: 100, burySiblings: true },
        0,
        0,
        fixedNow
      );

      // card2 is buried today because card1 was already completed today
      expect(todayPlan.newCards.some(c => c.id === card2.id)).toBe(false);

      // Simulate next day: card1 is not due yet (due on day 2), so card2 becomes eligible!
      const nextDayTime = fixedNow + 86_400_000;
      const tomorrowPlan = scheduler.buildDailyPlan(
        testArticles,
        cardStatesMap,
        { ...DEFAULT_SCHEDULER_SETTINGS, dailyNewLimit: 100, burySiblings: true },
        0,
        0,
        nextDayTime
      );
      expect(tomorrowPlan.newCards.some(c => c.id === card2.id)).toBe(true);
    });
  });

  describe("Queue management & in-session looping", () => {
    it("createSessionQueue arranges cards in order: Learning -> Due -> New", () => {
      const dummyCard = (id: string): Flashcard => ({
        id,
        segmentId: "s",
        articleId: "a",
        cardType: "t",
        frontTitle: "t",
        frontPrompt: "p",
        frontHint: null,
        backAnswer: "a",
        backTranslation: null,
        backNotes: null,
        isPrimary: true,
        clozeIndex: 1,
        totalClozes: 1,
        fullVerseContext: null,
        maskedSegment: null,
        unitIndex: 0,
        totalUnits: 1,
        precedingClauseHint: null
      });

      const plan = {
        totalTargetCards: 3,
        learningCards: [dummyCard("learn_1")],
        dueCards: [dummyCard("due_1")],
        newCards: [dummyCard("new_1")],
        estimatedMinutes: 2,
        statusMessage: "msg",
        hasFinishedToday: false,
        todayNewLearnedCount: 0,
        todayReviewedCount: 0
      };

      const queue = scheduler.createSessionQueue(plan);
      expect(queue.map(c => c.id)).toEqual(["learn_1", "due_1", "new_1"]);
    });

    it("requeueFailedCard re-inserts failed card at specified offset", () => {
      const dummyCard = (id: string): Flashcard => ({
        id,
        segmentId: "s",
        articleId: "a",
        cardType: "t",
        frontTitle: "t",
        frontPrompt: "p",
        frontHint: null,
        backAnswer: "a",
        backTranslation: null,
        backNotes: null,
        isPrimary: true,
        clozeIndex: 1,
        totalClozes: 1,
        fullVerseContext: null,
        maskedSegment: null,
        unitIndex: 0,
        totalUnits: 1,
        precedingClauseHint: null
      });

      const queue = [dummyCard("c0"), dummyCard("c1"), dummyCard("c2"), dummyCard("c3"), dummyCard("c4"), dummyCard("c5")];
      const requeued = scheduler.requeueFailedCard(queue, 1, queue[1], 3);

      // Inserted at index min(6, 1 + 3) = 4
      expect(requeued[4].id).toBe("c1");
      expect(requeued.length).toBe(7);
    });
  });

  describe("Settings persistence", () => {
    it("getSettings returns default settings when none stored", async () => {
      const settings = await scheduler.getSettings();
      expect(settings).toEqual(DEFAULT_SCHEDULER_SETTINGS);
      expect(settings.burySiblings).toBe(true);
    });

    it("saveSettings persists updated scheduler settings", async () => {
      const custom: SchedulerSettings = {
        dailyNewLimit: 30,
        dailyReviewLimit: 150,
        cardOrder: "random",
        enableSessionLoop: false,
        burySiblings: false
      };
      await scheduler.saveSettings(custom);
      const loaded = await scheduler.getSettings();
      expect(loaded).toEqual(custom);
    });
  });
});
