import { describe, it, expect } from "vitest";
import { sortCardsSequentially } from "../src/hooks/useFlipCardSession";
import { normalizeRecallText } from "../src/components/TypingRecallInput";
import { Flashcard } from "../src/data/flashcardGenerator";

describe("Track L2.2 & L2.3 Helpers (Sequential Mode & Typing Recall)", () => {
  describe("normalizeRecallText", () => {
    it("strips whitespace, common punctuation, fullwidth and halfwidth quotes and brackets", () => {
      const raw = "  【填空正解】故木受绳则直，金就砺则利！ (荀子) \n\t";
      expect(normalizeRecallText(raw)).toBe("填空正解故木受绳则直金就砺则利荀子");
    });

    it("leaves Chinese characters and Latin letters intact without punctuation", () => {
      const text = "白日依山尽黄河入海流";
      expect(normalizeRecallText(text)).toBe("白日依山尽黄河入海流");
    });

    it("handles empty or punctuation-only string", () => {
      expect(normalizeRecallText("")).toBe("");
      expect(normalizeRecallText("，。！？；：、“”‘’")).toBe("");
    });
  });

  describe("sortCardsSequentially", () => {
    const makeCard = (
      id: string,
      articleId: string,
      paragraphIndex: number,
      unitIndex: number,
      clozeIndex: number
    ): Flashcard => ({
      id,
      segmentId: `seg_${id}`,
      articleId,
      cardType: "UPPER_PROMPT_LOWER",
      frontTitle: "",
      frontPrompt: "",
      frontHint: null,
      backAnswer: "",
      backTranslation: null,
      backNotes: null,
      isPrimary: true,
      clozeIndex,
      totalClozes: 2,
      fullVerseContext: null,
      maskedSegment: null,
      unitIndex,
      totalUnits: 5,
      precedingClauseHint: null,
      paragraphIndex
    });

    it("sorts cards by articleId -> paragraphIndex -> unitIndex -> clozeIndex", () => {
      const cards: Flashcard[] = [
        makeCard("c3", "art_01", 1, 2, 1),
        makeCard("c1", "art_01", 0, 0, 1),
        makeCard("c5", "art_02", 0, 0, 1),
        makeCard("c2", "art_01", 0, 0, 2),
        makeCard("c4", "art_01", 1, 1, 1)
      ];

      const sorted = sortCardsSequentially(cards);
      expect(sorted.map(c => c.id)).toEqual(["c1", "c2", "c4", "c3", "c5"]);
    });

    it("does not mutate original array", () => {
      const original: Flashcard[] = [
        makeCard("c2", "art_01", 1, 0, 1),
        makeCard("c1", "art_01", 0, 0, 1)
      ];
      const copy = [...original];

      const sorted = sortCardsSequentially(original);
      expect(original).toEqual(copy);
      expect(sorted[0].id).toBe("c1");
    });
  });
});
