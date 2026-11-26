import { describe, expect, it } from "vitest";
import {
  buildRescueFlashcardQueue,
  buildRescueQueueEntries,
  findMatchingFlashcardsForText,
} from "../src/domain/fsrs/rescueQueue";
import { Flashcard } from "../src/data/flashcardGenerator";
import { GoldenVerse } from "../src/data/goldenVersesData";
import { CardFsrsState, CardState } from "../src/domain/fsrs/fsrsTypes";

function makeCard(overrides: Partial<Flashcard> & { id: string; articleId: string }): Flashcard {
  return {
    segmentId: `seg_${overrides.articleId}_0`,
    cardType: "FULL_SENTENCE_RECALL",
    frontTitle: "《劝学》· 荀子",
    frontPrompt: "【填空默写】⟦ ________ ⟧。",
    frontHint: null,
    backAnswer: "【填空正解】测试句",
    backTranslation: null,
    backNotes: null,
    isPrimary: true,
    clozeIndex: 1,
    totalClozes: 1,
    fullVerseContext: "【测试句】。",
    maskedSegment: "测试句",
    unitIndex: 0,
    totalUnits: 1,
    precedingClauseHint: null,
    ...overrides,
  };
}

function makeCardState(cardId: string, lapses: number): CardFsrsState {
  return {
    cardId,
    state: CardState.REVIEW,
    step: null,
    stability: 5,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 5,
    reps: 3,
    lapses,
    lastReviewTime: Date.now() - 86_400_000,
    dueTime: Date.now(),
    isLeech: lapses >= 4,
  };
}

describe("rescueQueue", () => {
  it("aggregates bottleneck, cram stuck, and scenario wrong items and deduplicates by cardId", () => {
    const cardA = makeCard({
      id: "fc_a",
      articleId: "art_bx1_12",
      maskedSegment: "君子生非异也",
      fullVerseContext: "【君子生非异也】，善假于物也。",
    });
    const cardB = makeCard({
      id: "fc_b",
      articleId: "art_bx1_12",
      maskedSegment: "驽马十驾",
      fullVerseContext: "【驽马十驾】，功在不舍。",
      unitIndex: 1,
    });
    const cardC = makeCard({
      id: "fc_c",
      articleId: "art_bx1_13",
      maskedSegment: "道之所存",
      fullVerseContext: "【道之所存】，师之所存也。",
    });

    const verseA: GoldenVerse = {
      id: "gv_a",
      articleId: "art_bx1_12",
      articleTitle: "劝学",
      author: "荀子",
      dynasty: "先秦",
      moduleId: "MODULE_BX_1",
      moduleName: "必修上册",
      isGaoKao72: true,
      verse: "君子生非异也，善假于物也。",
      contextClue: "",
      examKeyPoints: [],
      scenarioTags: [],
    };
    const verseMastered: GoldenVerse = {
      ...verseA,
      id: "gv_mastered",
      verse: "驽马十驾，功在不舍。",
    };

    const queue = buildRescueFlashcardQueue({
      bottlenecks: new Map([["art_bx1_12", [0]]]),
      cramRatings: {
        gv_a: "stuck",
        gv_mastered: "mastered",
      },
      scenarioWrongItems: [
        {
          questionId: "gk_shishuo_01",
          articleId: "art_bx1_13",
          answer: "道之所存，师之所存也。",
          markedAt: 2000,
        },
      ],
      getBottleneckCards: () => [cardA, cardB],
      getGoldenVerseById: (id) => (id === "gv_a" ? verseA : id === "gv_mastered" ? verseMastered : undefined),
      getCardsForArticle: (articleId) => {
        if (articleId === "art_bx1_12") return [cardA, cardB];
        if (articleId === "art_bx1_13") return [cardC];
        return [];
      },
    });

    // cardA appears in bottleneck + cram_stuck => deduplicated to 1 entry and ranked first
    expect(queue.map((c) => c.id)).toEqual(["fc_a", "fc_c", "fc_b"]);
  });

  it("prioritizes multi-signal cards (3 > 2 > 1) and most recently marked scenario items", () => {
    const cardMulti3 = makeCard({
      id: "fc_multi3",
      articleId: "art_1",
      maskedSegment: "学不可以已",
      fullVerseContext: "【学不可以已】。",
    });
    const cardMulti2 = makeCard({
      id: "fc_multi2",
      articleId: "art_1",
      maskedSegment: "青取之于蓝",
      fullVerseContext: "【青取之于蓝】。",
      unitIndex: 1,
    });
    const cardRecent = makeCard({
      id: "fc_recent",
      articleId: "art_2",
      maskedSegment: "师者所以传道受业解惑也",
      fullVerseContext: "【师者所以传道受业解惑也】。",
    });
    const cardOlder = makeCard({
      id: "fc_older",
      articleId: "art_3",
      maskedSegment: "逝者如斯",
      fullVerseContext: "【逝者如斯】。",
    });

    const entries = buildRescueQueueEntries({
      bottlenecks: new Map([["art_1", [0, 1]]]),
      cramRatings: {
        gv_1: "stuck",
        gv_2: "stuck",
      },
      scenarioWrongItems: [
        { questionId: "q_old", articleId: "art_3", answer: "逝者如斯", markedAt: 1000 },
        { questionId: "q_multi", articleId: "art_1", answer: "学不可以已", markedAt: 1500 },
        { questionId: "q_new", articleId: "art_2", answer: "师者所以传道受业解惑也", markedAt: 5000 },
      ],
      getBottleneckCards: () => [cardMulti3, cardMulti2],
      getGoldenVerseById: (id) => {
        if (id === "gv_1") {
          return {
            id: "gv_1",
            articleId: "art_1",
            articleTitle: "劝学",
            author: "荀子",
            dynasty: "先秦",
            moduleId: "MODULE_BX_1",
            moduleName: "必修上册",
            isGaoKao72: true,
            verse: "学不可以已",
            contextClue: "",
            examKeyPoints: [],
            scenarioTags: [],
          };
        }
        if (id === "gv_2") {
          return {
            id: "gv_2",
            articleId: "art_1",
            articleTitle: "劝学",
            author: "荀子",
            dynasty: "先秦",
            moduleId: "MODULE_BX_1",
            moduleName: "必修上册",
            isGaoKao72: true,
            verse: "青取之于蓝",
            contextClue: "",
            examKeyPoints: [],
            scenarioTags: [],
          };
        }
        return undefined;
      },
      getCardsForArticle: (articleId) => {
        if (articleId === "art_1") return [cardMulti3, cardMulti2];
        if (articleId === "art_2") return [cardRecent];
        if (articleId === "art_3") return [cardOlder];
        return [];
      },
    });

    expect(entries.map((e) => e.card.id)).toEqual([
      "fc_multi3",
      "fc_multi2",
      "fc_recent",
      "fc_older",
    ]);
    expect(entries[0].sourceCount).toBe(3);
    expect(entries[1].sourceCount).toBe(2);
    expect(entries[2].sourceCount).toBe(1);
    expect(entries[2].latestMarkedAt).toBe(5000);
  });

  it("uses FSRS lapses as tie-breaker when sourceCount and markedAt are equal", () => {
    const cardLow = makeCard({ id: "fc_low", articleId: "art_1", maskedSegment: "甲乙丙" });
    const cardHigh = makeCard({ id: "fc_high", articleId: "art_1", maskedSegment: "丁戊己", unitIndex: 1 });

    const queue = buildRescueFlashcardQueue({
      bottlenecks: new Map([["art_1", [0, 1]]]),
      cramRatings: {},
      scenarioWrongItems: [],
      cardStatesMap: new Map([
        ["fc_low", makeCardState("fc_low", 1)],
        ["fc_high", makeCardState("fc_high", 5)],
      ]),
      getBottleneckCards: () => [cardLow, cardHigh],
    });

    expect(queue.map((c) => c.id)).toEqual(["fc_high", "fc_low"]);
  });

  it("matches real curriculum flashcards for GaoKao scenario answers and falls back to primary cards", () => {
    const matched = findMatchingFlashcardsForText(
      "art_bx1_12",
      "君子生非异也，善假于物也。"
    );
    expect(matched.length).toBeGreaterThan(0);
    expect(
      matched.some((c) => c.fullVerseContext?.includes("善假于物也"))
    ).toBe(true);

    const fallback = findMatchingFlashcardsForText(
      "art_bx1_12",
      "完全不存在的测试文本"
    );
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.length).toBeLessThanOrEqual(2);
    expect(fallback.every((c) => c.isPrimary)).toBe(true);
  });

  it("resolves legacy GoldenVerse.articleId via title/author fallback when direct lookup returns empty", () => {
    const legacyVerse: GoldenVerse = {
      id: "gv_legacy_jjj",
      articleId: "legacy_nonexistent_jjj",
      articleTitle: "将进酒",
      author: "李白",
      dynasty: "唐代",
      moduleId: "MODULE_XB_1_RECITE",
      moduleName: "选择性必修上册",
      isGaoKao72: true,
      verse: "天生我材必有用，千金散尽还复来。",
      contextClue: "",
      examKeyPoints: [],
      scenarioTags: [],
    };

    const canonicalCard = makeCard({
      id: "fc_jjj_real",
      articleId: "art_xb1_recite_03",
      maskedSegment: "天生我材必有用",
      fullVerseContext: "【天生我材必有用】，千金散尽还复来。",
    });

    const mockedQueue = buildRescueFlashcardQueue({
      bottlenecks: new Map(),
      cramRatings: { gv_legacy_jjj: "stuck" },
      scenarioWrongItems: [],
      getGoldenVerseById: (id) => (id === "gv_legacy_jjj" ? legacyVerse : undefined),
      getCardsForArticle: (articleId) =>
        articleId === "art_xb1_recite_03" ? [canonicalCard] : [],
    });

    expect(mockedQueue.map((c) => c.id)).toEqual(["fc_jjj_real"]);

    // Also verify against real curriculum flashcard repository
    const realQueue = buildRescueFlashcardQueue({
      bottlenecks: new Map(),
      cramRatings: { gv_legacy_jjj: "stuck" },
      scenarioWrongItems: [],
      getGoldenVerseById: (id) => (id === "gv_legacy_jjj" ? legacyVerse : undefined),
    });

    expect(realQueue.length).toBeGreaterThan(0);
    expect(realQueue.every((c) => c.articleId === "art_xb1_recite_03")).toBe(true);
  });
});
