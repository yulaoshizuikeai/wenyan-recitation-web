import { Article } from "./curriculumData";
import { getUnderstanding } from "./articleUnderstanding";
import { getPhonetics } from "./articlePhonetics";
import { PhoneticsEntry } from "./learningContentTypes";

export interface Flashcard {
  id: string;
  segmentId: string;
  articleId: string;
  cardType: string;
  frontTitle: string;
  frontPrompt: string;
  frontHint: string | null;
  backAnswer: string;
  backTranslation: string | null;
  backNotes: string | null;
  isPrimary: boolean;
  clozeIndex: number;
  totalClozes: number;
  fullVerseContext: string | null;
  maskedSegment: string | null;
  unitIndex: number;
  totalUnits: number;
  precedingClauseHint: string | null;
  paragraphIndex?: number;
  paragraphGist?: string | null;
  backPhonetics?: PhoneticsEntry[];
}

function matchPhoneticsForText(phonetics: PhoneticsEntry[], text: string): PhoneticsEntry[] {
  if (phonetics.length === 0 || !text) return [];
  return phonetics.filter(entry => entry.word && text.includes(entry.word));
}

export function generateFlashcardsForArticle(article: Article): Flashcard[] {
  const list: Flashcard[] = [];
  const understanding = getUnderstanding(article.id);
  const articlePhonetics = getPhonetics(article.id);
  const paragraphs =
    article.paragraphs && article.paragraphs.length > 0
      ? article.paragraphs
      : [article.fullContent];

  const sentenceRegex = /[^。！？；\n]+[。！？；]?/g;

  let unitIndex = 0;
  let prevVerseContext: string | null = null;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paraText = paragraphs[pIdx];
    const matches = paraText.match(sentenceRegex) || [];
    const rawUnits = matches.map(s => s.trim()).filter(s => s.length >= 4);

    const paragraphGist = understanding?.paragraphGists?.[pIdx] ?? null;
    const resolvedTranslation =
      paragraphGist ?? (pIdx === 0 ? article.translation : null);

    for (const rawUnit of rawUnits) {
      const lastChar = rawUnit.charAt(rawUnit.length - 1);
      const endPunct = ['。', '！', '？', '；'].includes(lastChar) ? lastChar : '。';
      const coreText = ['。', '！', '？', '；'].includes(lastChar) ? rawUnit.slice(0, -1) : rawUnit;

      const clauses = coreText
        .split(/[，、：]/)
        .map(c => c.trim().replace(/^[“”‘’]+|[“”‘’]+$/g, ''))
        .filter(c => c.length >= 2);

      if (clauses.length === 0) continue;

      if (clauses.length === 1) {
        const clause = clauses[0];
        const matchedPhonetics = matchPhoneticsForText(articlePhonetics, clause);
        list.push({
          id: `fc_${article.id}_u${unitIndex}_c0`,
          segmentId: `seg_${article.id}_${unitIndex}`,
          articleId: article.id,
          cardType: "FULL_SENTENCE_RECALL",
          frontTitle: `《${article.title}》· ${article.author}`,
          frontPrompt: `【填空默写】⟦ ________ ⟧${endPunct}`,
          frontHint: `朝代：${article.dynasty} · 体裁：${article.genre}`,
          backAnswer: `【填空正解】${clause}`,
          backTranslation: resolvedTranslation,
          backNotes: null,
          isPrimary: true,
          clozeIndex: 1,
          totalClozes: 1,
          fullVerseContext: `【${clause}】${endPunct}`,
          maskedSegment: clause,
          unitIndex: unitIndex,
          totalUnits: 1,
          precedingClauseHint: prevVerseContext,
          paragraphIndex: pIdx,
          paragraphGist,
          backPhonetics: matchedPhonetics
        });
        prevVerseContext = rawUnit;
        unitIndex++;
      } else {
        // Chunk into 2-clause pairs or 3 if odd
        const chunks: string[][] = [];
        let i = 0;
        while (i < clauses.length) {
          if (clauses.length - i === 3) {
            chunks.push([clauses[i], clauses[i + 1], clauses[i + 2]]);
            i += 3;
          } else {
            chunks.push(clauses.slice(i, Math.min(i + 2, clauses.length)));
            i += 2;
          }
        }

        for (const chunk of chunks) {
          if (chunk.length === 1) {
            const singleClause = chunk[0];
            const matchedPhonetics = matchPhoneticsForText(articlePhonetics, singleClause);
            list.push({
              id: `fc_${article.id}_u${unitIndex}_c0`,
              segmentId: `seg_${article.id}_${unitIndex}`,
              articleId: article.id,
              cardType: "FULL_SENTENCE_RECALL",
              frontTitle: `《${article.title}》· ${article.author}`,
              frontPrompt: `【填空默写】⟦ ________ ⟧${endPunct}`,
              frontHint: `朝代：${article.dynasty} · 体裁：${article.genre}`,
              backAnswer: `【填空正解】${singleClause}`,
              backTranslation: resolvedTranslation,
              backNotes: null,
              isPrimary: true,
              clozeIndex: 1,
              totalClozes: 1,
              fullVerseContext: `【${singleClause}】${endPunct}`,
              maskedSegment: singleClause,
              unitIndex: unitIndex,
              totalUnits: 1,
              precedingClauseHint: prevVerseContext,
              paragraphIndex: pIdx,
              paragraphGist,
              backPhonetics: matchedPhonetics
            });
            prevVerseContext = singleClause + endPunct;
            unitIndex++;
            continue;
          }

          const chunkText = chunk.join("，") + endPunct;
          const matchedPhonetics = matchPhoneticsForText(articlePhonetics, chunkText);
          const totalVariants = chunk.length;
          for (let k = 0; k < chunk.length; k++) {
            const targetClause = chunk[k];
            let promptStr = "";
            let contextStr = "";

            for (let j = 0; j < chunk.length; j++) {
              if (j === k) {
                promptStr += "⟦ ________ ⟧";
                contextStr += `【${chunk[j]}】`;
              } else {
                promptStr += chunk[j];
                contextStr += chunk[j];
              }

              if (j < chunk.length - 1) {
                promptStr += "，";
                contextStr += "，";
              } else {
                promptStr += endPunct;
                contextStr += endPunct;
              }
            }

            let cardType = "MULTI_CLOZE_VARIANT";
            if (chunk.length === 2) {
              cardType = (k === 1) ? "UPPER_PROMPT_LOWER" : "LOWER_PROMPT_UPPER";
            }

            let positionLabel = `第 ${k + 1}/${totalVariants} 空`;
            if (chunk.length === 2) {
              positionLabel = (k === 1) ? "出句测对句" : "对句测出句";
            }

            list.push({
              id: `fc_${article.id}_u${unitIndex}_c${k}`,
              segmentId: `seg_${article.id}_${unitIndex}`,
              articleId: article.id,
              cardType: cardType,
              frontTitle: `《${article.title}》· ${article.author}`,
              frontPrompt: promptStr,
              frontHint: `朝代：${article.dynasty} · 【${positionLabel} · 语境填空】`,
              backAnswer: `【填空正解】${targetClause}`,
              backTranslation: resolvedTranslation,
              backNotes: null,
              isPrimary: (k === 0 || (chunk.length === 2 && k === 1)),
              clozeIndex: k + 1,
              totalClozes: totalVariants,
              fullVerseContext: contextStr,
              maskedSegment: targetClause,
              unitIndex: unitIndex,
              totalUnits: 1,
              precedingClauseHint: prevVerseContext,
              paragraphIndex: pIdx,
              paragraphGist,
              backPhonetics: matchedPhonetics
            });
          }
          prevVerseContext = chunkText;
          unitIndex++;
        }
      }
    }
  }

  if (list.length === 0) {
    const fallbackText = article.paragraphs[0] || article.fullContent.slice(0, 40);
    const paragraphGist = understanding?.paragraphGists?.[0] ?? null;
    list.push({
      id: `fc_${article.id}_0`,
      segmentId: `seg_${article.id}_0`,
      articleId: article.id,
      cardType: "FULL_SENTENCE_RECALL",
      frontTitle: `《${article.title}》· ${article.author}`,
      frontPrompt: `背诵名句（${article.genre} · ${article.dynasty}）`,
      frontHint: null,
      backAnswer: fallbackText,
      backTranslation: paragraphGist ?? article.translation,
      backNotes: null,
      isPrimary: true,
      clozeIndex: 1,
      totalClozes: 1,
      fullVerseContext: article.fullContent.slice(0, 40),
      maskedSegment: article.fullContent.slice(0, 40),
      unitIndex: 0,
      totalUnits: 1,
      precedingClauseHint: null,
      paragraphIndex: 0,
      paragraphGist,
      backPhonetics: matchPhoneticsForText(articlePhonetics, fallbackText)
    });
  }

  const finalTotalUnits = Math.max(...list.map(c => c.unitIndex), 0) + 1;
  return list.map(c => ({ ...c, totalUnits: finalTotalUnits }));
}
