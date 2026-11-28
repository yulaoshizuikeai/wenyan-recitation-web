import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FSRSEngine,
  createFsrsEngine,
  getFsrsSettings,
  saveFsrsSettings,
  DEFAULT_FSRS_SETTINGS,
  DEFAULT_FSRS_5_WEIGHTS
} from "../src/domain/fsrs/fsrsEngine";
import { CardState, Rating } from "../src/domain/fsrs/fsrsTypes";

// Mock IndexedDB storage layer for getFsrsSettings / saveFsrsSettings
const storageMap = new Map<string, any>();

vi.mock("../src/storage/db", () => ({
  getSetting: vi.fn(async (key: string, defaultValue: any) => {
    return storageMap.has(key) ? storageMap.get(key) : defaultValue;
  }),
  setSetting: vi.fn(async (key: string, value: any) => {
    storageMap.set(key, value);
  })
}));

describe("FSRSEngine", () => {
  let engine: FSRSEngine;
  const mockNow = 1770000000000; // Deterministic fixed timestamp

  beforeEach(() => {
    storageMap.clear();
    engine = new FSRSEngine();
  });

  describe("Card Creation (createInitialCard)", () => {
    it("creates a brand-new card with initial default state", () => {
      const card = engine.createInitialCard("card_001");
      expect(card.cardId).toBe("card_001");
      expect(card.state).toBe(CardState.NEW);
      expect(card.step).toBeNull();
      expect(card.stability).toBe(0);
      expect(card.difficulty).toBe(0);
      expect(card.elapsedDays).toBe(0);
      expect(card.scheduledDays).toBe(0);
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
      expect(card.lastReviewTime).toBeNull();
      expect(card.isLeech).toBe(false);
      expect(card.dueTime).toBeGreaterThan(0);
    });
  });

  describe("Review Transitions across Ratings 1..4 (evaluateReview / reviewCard)", () => {
    describe("From CardState.NEW", () => {
      it("Rating 1 (AGAIN): transitions to LEARNING step 0 with 1 minute due interval", () => {
        const card = engine.createInitialCard("c1");
        const res = engine.evaluateReview(card, Rating.AGAIN, mockNow);

        expect(res.updatedCard.state).toBe(CardState.LEARNING);
        expect(res.updatedCard.step).toBe(0);
        expect(res.updatedCard.reps).toBe(1);
        expect(res.updatedCard.lapses).toBe(0);
        expect(res.updatedCard.scheduledDays).toBe(0);
        expect(res.updatedCard.dueTime).toBe(mockNow + 60_000);
        expect(res.updatedCard.lastReviewTime).toBe(mockNow);
        expect(res.reviewLog.previousState).toBe(CardState.NEW);
        expect(res.reviewLog.currentState).toBe(CardState.LEARNING);
        expect(res.reviewLog.rating).toBe(Rating.AGAIN);
      });

      it("Rating 2 (HARD): transitions to LEARNING step 0 with midpoint between step 0 and step 1", () => {
        const card = engine.createInitialCard("c1");
        const res = engine.evaluateReview(card, Rating.HARD, mockNow);

        expect(res.updatedCard.state).toBe(CardState.LEARNING);
        expect(res.updatedCard.step).toBe(0);
        expect(res.updatedCard.reps).toBe(1);
        // Default learningSteps = [60_000, 600_000] -> midpoint = 330_000ms (5.5m -> "5分")
        expect(res.updatedCard.dueTime).toBe(mockNow + Math.round((60_000 + 600_000) / 2));
      });

      it("Rating 3 (GOOD): advances to LEARNING step 1 (10 minutes) when multi-step learning configured", () => {
        const card = engine.createInitialCard("c1");
        const res = engine.evaluateReview(card, Rating.GOOD, mockNow);

        expect(res.updatedCard.state).toBe(CardState.LEARNING);
        expect(res.updatedCard.step).toBe(1);
        expect(res.updatedCard.reps).toBe(1);
        expect(res.updatedCard.dueTime).toBe(mockNow + 600_000);
      });

      it("Rating 4 (EASY): immediately graduates to CardState.REVIEW with positive scheduledDays", () => {
        const card = engine.createInitialCard("c1");
        const res = engine.evaluateReview(card, Rating.EASY, mockNow);

        expect(res.updatedCard.state).toBe(CardState.REVIEW);
        expect(res.updatedCard.step).toBeNull();
        expect(res.updatedCard.reps).toBe(1);
        expect(res.updatedCard.scheduledDays).toBeGreaterThanOrEqual(1);
        expect(res.updatedCard.dueTime).toBe(mockNow + res.updatedCard.scheduledDays * 86_400_000);
        expect(res.nextIntervalDays).toBe(res.updatedCard.scheduledDays);
      });
    });

    describe("From CardState.LEARNING", () => {
      it("Rating 1 (AGAIN): resets step back to 0", () => {
        const initial = engine.createInitialCard("c1");
        const step1Card = engine.evaluateReview(initial, Rating.GOOD, mockNow).updatedCard;
        expect(step1Card.step).toBe(1);

        const res = engine.evaluateReview(step1Card, Rating.AGAIN, mockNow + 300_000);
        expect(res.updatedCard.state).toBe(CardState.LEARNING);
        expect(res.updatedCard.step).toBe(0);
        expect(res.updatedCard.dueTime).toBe(mockNow + 300_000 + 60_000);
      });

      it("Rating 3 (GOOD): graduates to CardState.REVIEW when completing final learning step", () => {
        const initial = engine.createInitialCard("c1");
        const step1 = engine.evaluateReview(initial, Rating.GOOD, mockNow).updatedCard;
        expect(step1.step).toBe(1); // Final step of [60_000, 600_000]

        const graduated = engine.evaluateReview(step1, Rating.GOOD, mockNow + 600_000).updatedCard;
        expect(graduated.state).toBe(CardState.REVIEW);
        expect(graduated.step).toBeNull();
        expect(graduated.scheduledDays).toBeGreaterThanOrEqual(1);
      });
    });

    describe("From CardState.REVIEW", () => {
      it("Rating 1 (AGAIN): enters RELEARNING, increments lapses, and marks leech on 4th lapse", () => {
        const initial = engine.createInitialCard("c1");
        let reviewCard = engine.evaluateReview(initial, Rating.EASY, mockNow).updatedCard;
        expect(reviewCard.state).toBe(CardState.REVIEW);

        // Lapse 1
        let lapseRes = engine.evaluateReview(reviewCard, Rating.AGAIN, mockNow + 86_400_000);
        expect(lapseRes.updatedCard.state).toBe(CardState.RELEARNING);
        expect(lapseRes.updatedCard.lapses).toBe(1);
        expect(lapseRes.updatedCard.isLeech).toBe(false);

        // Graduate back to review
        reviewCard = engine.evaluateReview(lapseRes.updatedCard, Rating.GOOD, mockNow + 86_400_000 + 600_000).updatedCard;
        expect(reviewCard.state).toBe(CardState.REVIEW);

        // Simulate up to 4 lapses
        reviewCard.lapses = 3;
        lapseRes = engine.evaluateReview(reviewCard, Rating.AGAIN, mockNow + 172_800_000);
        expect(lapseRes.updatedCard.lapses).toBe(4);
        expect(lapseRes.updatedCard.isLeech).toBe(true);
      });

      it("Rating 2 (HARD) vs Rating 3 (GOOD) vs Rating 4 (EASY): expands intervals monotonically", () => {
        const initial = engine.createInitialCard("c1");
        const reviewCard = engine.evaluateReview(initial, Rating.EASY, mockNow).updatedCard;
        const reviewNow = mockNow + 10 * 86_400_000;

        const hardRes = engine.evaluateReview(reviewCard, Rating.HARD, reviewNow);
        const goodRes = engine.evaluateReview(reviewCard, Rating.GOOD, reviewNow);
        const easyRes = engine.evaluateReview(reviewCard, Rating.EASY, reviewNow);

        expect(hardRes.updatedCard.scheduledDays).toBeGreaterThan(0);
        expect(goodRes.updatedCard.scheduledDays).toBeGreaterThan(hardRes.updatedCard.scheduledDays);
        expect(easyRes.updatedCard.scheduledDays).toBeGreaterThanOrEqual(goodRes.updatedCard.scheduledDays + 1);
      });
    });
  });

  describe("Interval Boundaries & Fuzz", () => {
    it("enforces minimum interval of 1 day even when stability is extremely low or non-finite", () => {
      expect(engine.nextInterval(0)).toBe(1);
      expect(engine.nextInterval(-5)).toBe(1);
      expect(engine.nextInterval(NaN)).toBe(1);
      expect(engine.nextInterval(Infinity)).toBe(1);
      expect(engine.nextInterval(-Infinity)).toBe(1);
      expect(engine.nextInterval(0.0001)).toBeGreaterThanOrEqual(1);
    });

    it("handles corrupted REVIEW card stability/difficulty under Rating.EASY without NaN", () => {
      const corruptedCard = {
        ...engine.createInitialCard("c_corrupted"),
        state: CardState.REVIEW,
        stability: 0,
        difficulty: NaN,
        reps: 2,
        lastReviewTime: mockNow - 2 * 86_400_000,
      };
      const res = engine.evaluateReview(corruptedCard, Rating.EASY, mockNow);
      expect(Number.isFinite(res.updatedCard.stability)).toBe(true);
      expect(res.updatedCard.stability).toBeGreaterThan(0);
      expect(Number.isFinite(res.updatedCard.difficulty)).toBe(true);
      expect(Number.isFinite(res.updatedCard.scheduledDays)).toBe(true);
      expect(res.updatedCard.scheduledDays).toBeGreaterThanOrEqual(1);
    });

    it("computes calendar elapsedDays via UTC midnights across a 23-hour day boundary", () => {
      const initial = engine.createInitialCard("c_dst");
      const reviewCard = engine.evaluateReview(initial, Rating.EASY, mockNow).updatedCard;
      const day1Late = new Date(2026, 2, 7, 23, 30, 0).getTime();
      const day2Earlier = new Date(2026, 2, 8, 22, 30, 0).getTime();
      reviewCard.lastReviewTime = day1Late;

      const utcSpy = vi.spyOn(Date, "UTC");
      const res = engine.evaluateReview(reviewCard, Rating.GOOD, day2Earlier);
      expect(utcSpy).toHaveBeenCalled();
      expect(res.updatedCard.elapsedDays).toBe(1);
      utcSpy.mockRestore();
    });

    it("keeps REVIEW + EASY post-fuzz interval strictly greater than post-fuzz GOOD interval", () => {
      const reviewCard = {
        ...engine.createInitialCard("c_fuzz_order"),
        state: CardState.REVIEW,
        stability: 10,
        difficulty: 5,
        reps: 3,
        lastReviewTime: mockNow - 10 * 86_400_000,
      };

      const nextIntervalSpy = vi.spyOn(engine, "nextInterval")
        .mockReturnValueOnce(30) // easy newStability -> easyIvl = 30
        .mockReturnValueOnce(29) // goodStability -> goodIvl = 29
        .mockReturnValueOnce(30); // easyIvl = 30
      const fuzzSpy = vi.spyOn(engine, "applyFuzz").mockImplementation((ivl) => {
        if (ivl === 29) return 30; // fuzzedGoodIvl = 30
        if (ivl === 30) return 29; // fuzzedEasyIvl = 29 (< fuzzedGoodIvl!)
        return ivl;
      });

      const res = engine.evaluateReview(reviewCard, Rating.EASY, mockNow);
      expect(res.updatedCard.scheduledDays).toBeGreaterThanOrEqual(31);

      nextIntervalSpy.mockRestore();
      fuzzSpy.mockRestore();

      // Verify invariant across many card IDs with real engine calls
      for (let i = 0; i < 50; i++) {
        const card = { ...reviewCard, cardId: `card_fuzz_${i}`, reps: i };
        const goodRes = engine.evaluateReview(card, Rating.GOOD, mockNow);
        const easyRes = engine.evaluateReview(card, Rating.EASY, mockNow);
        expect(easyRes.updatedCard.scheduledDays).toBeGreaterThanOrEqual(
          Math.min(goodRes.updatedCard.scheduledDays + 1, engine.maximumInterval)
        );
      }
    });

    it("respects maximumInterval boundary cap (36500 days)", () => {
      const hugeStability = 1_000_000;
      const ivl = engine.nextInterval(hugeStability);
      expect(ivl).toBe(engine.maximumInterval);
      expect(ivl).toBeLessThanOrEqual(36500);
    });

    it("does not apply fuzz to intervals less than 3 days", () => {
      expect(engine.applyFuzz(1, "card_a", 0)).toBe(1);
      expect(engine.applyFuzz(2, "card_a", 0)).toBe(2);
    });

    it("applies deterministic bounded fuzz for intervals >= 3 days", () => {
      const ivl = 20;
      const fuzzed = engine.applyFuzz(ivl, "card_test", 1);
      const maxFuzz = Math.max(1, Math.round(ivl * 0.05)); // 1 day
      expect(fuzzed).toBeGreaterThanOrEqual(ivl - maxFuzz);
      expect(fuzzed).toBeLessThanOrEqual(ivl + maxFuzz);

      // Deterministic check: same inputs yield identical fuzzed output
      expect(engine.applyFuzz(ivl, "card_test", 1)).toBe(fuzzed);
    });
  });

  describe("Preview Intervals (previewIntervals)", () => {
    it("returns formatted duration / day badges for all 4 ratings on NEW card", () => {
      const card = engine.createInitialCard("c_preview");
      const previews = engine.previewIntervals(card, mockNow);

      expect(previews[Rating.AGAIN]).toBe("1分");
      expect(previews[Rating.HARD]).toBe("5分");
      expect(previews[Rating.GOOD]).toBe("10分");
      expect(previews[Rating.EASY]).toMatch(/\d+天/);
    });

    it("returns interval badges for REVIEW card", () => {
      const initial = engine.createInitialCard("c_preview");
      const reviewCard = engine.evaluateReview(initial, Rating.EASY, mockNow).updatedCard;
      const previews = engine.previewIntervals(reviewCard, mockNow + 86_400_000);

      expect(previews[Rating.AGAIN]).toMatch(/\d+分/); // Enters relearning
      expect(previews[Rating.HARD]).toMatch(/\d+天/);
      expect(previews[Rating.GOOD]).toMatch(/\d+天/);
      expect(previews[Rating.EASY]).toMatch(/\d+天/);
    });
  });

  describe("Settings Management (getFsrsSettings & saveFsrsSettings)", () => {
    it("returns DEFAULT_FSRS_SETTINGS when no settings are saved", async () => {
      const settings = await getFsrsSettings();
      expect(settings).toEqual(DEFAULT_FSRS_SETTINGS);
      expect(settings.requestRetention).toBe(0.93);
      expect(settings.recitationStabilityFactor).toBe(0.72);
    });

    it("persists and retrieves updated FSRS settings", async () => {
      const customSettings = {
        requestRetention: 0.9,
        recitationStabilityFactor: 0.8
      };
      await saveFsrsSettings(customSettings);

      const loaded = await getFsrsSettings();
      expect(loaded).toEqual(customSettings);
    });

    it("creates engine with custom settings via createFsrsEngine", () => {
      const engineCustom = createFsrsEngine({ requestRetention: 0.88, recitationStabilityFactor: 0.65 });
      expect(engineCustom.requestRetention).toBe(0.88);
      expect(engineCustom.recitationStabilityFactor).toBe(0.65);
    });
  });
});
