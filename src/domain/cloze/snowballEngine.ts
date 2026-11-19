import { Article } from "../../data/curriculumData";
import { generateFlashcardsForArticle } from "../../data/flashcardGenerator";

export interface SnowballUnit {
  index: number;
  text: string;
  cardIds: string[];
}

export interface SnowballStage {
  stageIndex: number;
  totalStages: number;
  newlyAddedUnit: SnowballUnit;
  chainUnits: SnowballUnit[];
  progressRatio: number;
}

export class SnowballChainingEngine {
  static buildStages(article: Article): SnowballStage[] {
    const flashcards = generateFlashcardsForArticle(article);
    let units: SnowballUnit[] = [];

    if (flashcards.length > 0) {
      const unitMap = new Map<number, typeof flashcards>();
      for (const card of flashcards) {
        if (!unitMap.has(card.unitIndex)) {
          unitMap.set(card.unitIndex, []);
        }
        unitMap.get(card.unitIndex)!.push(card);
      }

      const sortedEntries = Array.from(unitMap.entries()).sort((a, b) => a[0] - b[0]);
      units = sortedEntries.map(([idx, cardsForUnit]) => {
        const firstCard = cardsForUnit[0];
        const rawText = firstCard.fullVerseContext || firstCard.backAnswer;
        const cleanText = rawText
          .replace(/【/g, "")
          .replace(/】/g, "")
          .replace(/⟦ ________ ⟧/g, "")
          .replace(/【填空正解】/g, "")
          .replace(/【对句】/g, "")
          .trim();
        return {
          index: idx,
          text: cleanText,
          cardIds: cardsForUnit.map(c => c.id)
        };
      });
    } else {
      units = article.paragraphs.map((p, idx) => ({
        index: idx,
        text: p,
        cardIds: []
      }));
    }

    if (units.length === 0) return [];

    const stages: SnowballStage[] = [];
    const total = units.length;

    for (let i = 0; i < total; i++) {
      const chain = units.slice(0, i + 1);
      stages.push({
        stageIndex: i,
        totalStages: total,
        newlyAddedUnit: units[i],
        chainUnits: chain,
        progressRatio: (i + 1) / total
      });
    }

    return stages;
  }
}
