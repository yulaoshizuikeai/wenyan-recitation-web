import { Article } from "./curriculumData";
import { getCachedArticleUnderstanding } from "./articleUnderstanding";
import { getCachedArticlePhonetics } from "./articlePhonetics";
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

export function matchPhoneticsForText(phonetics: PhoneticsEntry[], text: string): PhoneticsEntry[] {
  if (phonetics.length === 0 || !text) return [];
  return phonetics.filter(entry => entry.word && text.includes(entry.word));
}

const END_PUNCTS = new Set(["。", "！", "？", "；"]);
const SENTENCE_REGEX = /[^。！？；\n]+[。！？；]?[”’"']?/g;

interface ClausePiece {
  text: string;
  sepAfter: string;
}

interface ParsedUnit {
  rawUnit: string;
  endPunct: string;
  clauses: ClausePiece[];
}

function splitParagraphIntoUnits(paraText: string): ParsedUnit[] {
  const rawMatches = (paraText.match(SENTENCE_REGEX) || [])
    .map(s => s.trim())
    .filter(s => s.replace(/[“”‘’"'\s]/g, "").length > 0);

  // Merge short exclamations/units (< 4 chars, e.g. "嗟乎！", "呜呼！", "悲夫！") with adjacent unit
  const rawUnits: string[] = [];
  for (let mIdx = 0; mIdx < rawMatches.length; mIdx++) {
    let current = rawMatches[mIdx];
    while (current.length < 4 && mIdx + 1 < rawMatches.length) {
      mIdx++;
      current += rawMatches[mIdx];
    }
    if (current.length < 4 && rawUnits.length > 0) {
      rawUnits[rawUnits.length - 1] += current;
    } else if (current.length >= 2) {
      rawUnits.push(current);
    }
  }

  const parsed: ParsedUnit[] = [];
  for (const rawUnit of rawUnits) {
    const trimmedEnd = rawUnit.replace(/[”’"']+$/, "");
    const lastChar = trimmedEnd.charAt(trimmedEnd.length - 1);
    const hasEndPunct = END_PUNCTS.has(lastChar);
    const endPunct = hasEndPunct ? lastChar : "。";
    const coreText = hasEndPunct ? trimmedEnd.slice(0, -1) : trimmedEnd;

    // Split only on ，/： (never 、) while capturing original delimiters
    const parts = coreText.split(/([，：])/);
    const rawClauses: ClausePiece[] = [];
    for (let p = 0; p < parts.length; p += 2) {
      const cleaned = (parts[p] ?? "").trim().replace(/^[“”‘’]+|[“”‘’]+$/g, "");
      const delim = parts[p + 1] ?? "";
      if (cleaned.length > 0) {
        rawClauses.push({ text: cleaned, sepAfter: delim });
      } else if (rawClauses.length > 0 && delim) {
        rawClauses[rawClauses.length - 1].sepAfter = delim;
      }
    }

    // Merge 1-character clauses (e.g. "青，...", "冰，...", "曰：...") with adjacent clause preserving separator
    const clauses: ClausePiece[] = [];
    for (let idx = 0; idx < rawClauses.length; idx++) {
      let piece = { ...rawClauses[idx] };
      while (piece.text.length < 2 && idx + 1 < rawClauses.length) {
        idx++;
        const nextPiece = rawClauses[idx];
        piece = {
          text: `${piece.text}${piece.sepAfter}${nextPiece.text}`,
          sepAfter: nextPiece.sepAfter
        };
      }
      if (piece.text.length < 2 && clauses.length > 0) {
        const prev = clauses[clauses.length - 1];
        prev.text = `${prev.text}${prev.sepAfter}${piece.text}`;
        prev.sepAfter = piece.sepAfter;
      } else if (piece.text.length >= 2 || (clauses.length === 0 && idx === rawClauses.length - 1)) {
        clauses.push(piece);
      }
    }

    if (clauses.length > 0) {
      parsed.push({ rawUnit, endPunct, clauses });
    }
  }
  return parsed;
}

export function generateFlashcardsForArticle(article: Article): Flashcard[] {
  const list: Flashcard[] = [];
  const understanding = getCachedArticleUnderstanding(article.id);
  const articlePhonetics = getCachedArticlePhonetics(article.id) ?? [];
  const paragraphs =
    article.paragraphs && article.paragraphs.length > 0
      ? article.paragraphs
      : [article.fullContent];

  let unitIndex = 0;
  let prevVerseContext: string | null = null;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const parsedUnits = splitParagraphIntoUnits(paragraphs[pIdx]);

    const paragraphGist = understanding?.paragraphGists?.[pIdx] ?? null;
    const resolvedTranslation =
      paragraphGist ?? (pIdx === 0 ? article.translation : null);

    for (const { rawUnit, endPunct, clauses } of parsedUnits) {
      if (clauses.length === 1) {
        const clause = clauses[0].text;
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
        const chunks: ClausePiece[][] = [];
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

        for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
          const chunk = chunks[chunkIdx];
          const isLastChunk = chunkIdx === chunks.length - 1;
          const chunkEndPunct = isLastChunk
            ? endPunct
            : (chunk[chunk.length - 1].sepAfter || "，");

          if (chunk.length === 1) {
            const singleClause = chunk[0].text;
            const matchedPhonetics = matchPhoneticsForText(articlePhonetics, singleClause);
            list.push({
              id: `fc_${article.id}_u${unitIndex}_c0`,
              segmentId: `seg_${article.id}_${unitIndex}`,
              articleId: article.id,
              cardType: "FULL_SENTENCE_RECALL",
              frontTitle: `《${article.title}》· ${article.author}`,
              frontPrompt: `【填空默写】⟦ ________ ⟧${chunkEndPunct}`,
              frontHint: `朝代：${article.dynasty} · 体裁：${article.genre}`,
              backAnswer: `【填空正解】${singleClause}`,
              backTranslation: resolvedTranslation,
              backNotes: null,
              isPrimary: true,
              clozeIndex: 1,
              totalClozes: 1,
              fullVerseContext: `【${singleClause}】${chunkEndPunct}`,
              maskedSegment: singleClause,
              unitIndex: unitIndex,
              totalUnits: 1,
              precedingClauseHint: prevVerseContext,
              paragraphIndex: pIdx,
              paragraphGist,
              backPhonetics: matchedPhonetics
            });
            prevVerseContext = singleClause + chunkEndPunct;
            unitIndex++;
            continue;
          }

          let chunkText = "";
          for (let j = 0; j < chunk.length; j++) {
            chunkText += chunk[j].text;
            chunkText += j < chunk.length - 1 ? (chunk[j].sepAfter || "，") : chunkEndPunct;
          }
          const matchedPhonetics = matchPhoneticsForText(articlePhonetics, chunkText);
          const totalVariants = chunk.length;
          for (let k = 0; k < chunk.length; k++) {
            const targetClause = chunk[k].text;
            let promptStr = "";
            let contextStr = "";

            for (let j = 0; j < chunk.length; j++) {
              if (j === k) {
                promptStr += "⟦ ________ ⟧";
                contextStr += `【${chunk[j].text}】`;
              } else {
                promptStr += chunk[j].text;
                contextStr += chunk[j].text;
              }

              if (j < chunk.length - 1) {
                const sep = chunk[j].sepAfter || "，";
                promptStr += sep;
                contextStr += sep;
              } else {
                promptStr += chunkEndPunct;
                contextStr += chunkEndPunct;
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
