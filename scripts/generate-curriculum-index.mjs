import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const CURRICULUM_DATA_PATH = path.join(ROOT, "src/data/curriculumData.ts");
const CURRICULUM_INDEX_PATH = path.join(ROOT, "src/data/curriculumIndex.ts");
const CURRICULUM_BOOKS_DIR = path.join(ROOT, "src/data/curriculumBooks");

const PUNCTUATION_SET = new Set([
  "，", "。", "！", "？", "；", "：", "、", "“", "”", "‘", "’",
  "（", "）", "【", "】", "《", "》", "—", "…", "·", " ", "\n", "\r", "\t",
  ",", ".", "!", "?", ";", ":", "'", "\"", "(", ")"
]);

function countNetLength(text) {
  let n = 0;
  for (const ch of text) {
    if (!PUNCTUATION_SET.has(ch)) n++;
  }
  return n;
}

const END_PUNCTS = new Set(["。", "！", "？", "；"]);
const SENTENCE_REGEX = /[^。！？；\n]+[。！？；]?[”’"']?/g;
const SPEAKER_INTRO_RE = /^[^，。！？；：]{1,7}(?:曰|云|问|叹曰|歌曰|对曰)$/;
function isSpeakerIntroClause(c) { return c.sepAfter === "：" && SPEAKER_INTRO_RE.test(c.text); }

/**
 * Mirrors flashcardGenerator.ts clause-splitting logic to compute exact generatedCardCount
 * without importing browser/learningContent modules at build-script time.
 */
function countGeneratedFlashcards(article) {
  const paragraphs =
    article.paragraphs && article.paragraphs.length > 0
      ? article.paragraphs
      : [article.fullContent];
  let count = 0;

  for (const paraText of paragraphs) {
    const rawMatches = (paraText.match(SENTENCE_REGEX) || [])
      .map((s) => s.trim())
      .filter((s) => s.replace(/[“”‘’"'\s]/g, "").length > 0);

    const rawUnits = [];
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

    for (const rawUnit of rawUnits) {
      const trimmedEnd = rawUnit.replace(/[”’"']+$/, "");
      const lastChar = trimmedEnd.charAt(trimmedEnd.length - 1);
      const hasEndPunct = END_PUNCTS.has(lastChar);
      const coreText = hasEndPunct ? trimmedEnd.slice(0, -1) : trimmedEnd;

      const parts = coreText.split(/([，：])/);
      const rawClauses = [];
      for (let p = 0; p < parts.length; p += 2) {
        const cleaned = (parts[p] ?? "").trim().replace(/^[“”‘’]+|[“”‘’]+$/g, "");
        const delim = parts[p + 1] ?? "";
        if (cleaned.length > 0) {
          rawClauses.push({ text: cleaned, sepAfter: delim });
        } else if (rawClauses.length > 0 && delim) {
          rawClauses[rawClauses.length - 1].sepAfter = delim;
        }
      }

      const clauses = [];
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

      if (clauses.length === 0) continue;

      if (clauses.length === 1) {
        count += 1;
      } else {
        const chunks = [];
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
            count += 1;
          } else {
            const targets = chunk.filter((c) => !isSpeakerIntroClause(c));
            count += targets.length > 0 ? targets.length : 1;
          }
        }
      }
    }
  }

  return count === 0 ? 1 : count;
}

function getVolumeKey(moduleId) {
  if (moduleId === "MODULE_BX_1" || moduleId === "MODULE_BX_1_RECITE") return "vol_bx1";
  if (moduleId === "MODULE_BX_2" || moduleId === "MODULE_BX_2_RECITE") return "vol_bx2";
  if (moduleId === "MODULE_XB_1" || moduleId === "MODULE_XB_1_RECITE") return "vol_xb1";
  if (moduleId === "MODULE_XB_2" || moduleId === "MODULE_XB_2_RECITE") return "vol_xb2";
  if (moduleId === "MODULE_XB_3" || moduleId === "MODULE_XB_3_RECITE") return "vol_xb3";
  return "vol_xx";
}

function loadCurriculumData() {
  const source = fs.readFileSync(CURRICULUM_DATA_PATH, "utf8");
  // Strip TypeScript interface blocks and type annotations from the generated data file
  const jsSource = source
    .replace(/export interface \w+\s*\{[\s\S]*?\}\r?\n/g, "")
    .replace(/export const MODULES:\s*Module\[\]\s*=/, "const MODULES =")
    .replace(/export const ALL_ARTICLES:\s*Article\[\]\s*=/, "const ALL_ARTICLES =")
    .replace(/export const ARTICLE_MAP:[\s\S]*$/m, "");

  const context = vm.createContext({});
  vm.runInContext(`${jsSource}\nthis.MODULES = MODULES; this.ALL_ARTICLES = ALL_ARTICLES;`, context);
  return { MODULES: context.MODULES, ALL_ARTICLES: context.ALL_ARTICLES };
}

function main() {
  const { MODULES, ALL_ARTICLES } = loadCurriculumData();

  const rows = ALL_ARTICLES.map((a) => [
    a.id,
    a.moduleId,
    a.title,
    a.subtitle,
    a.author,
    a.dynasty,
    a.genre,
    a.isGaoKao72 ? 1 : 0,
    a.recitationScope,
    a.fullContent.length,
    countNetLength(a.fullContent),
    a.paragraphs.length,
    a.sortOrder,
    a.totalSegments,
    a.totalCards,
    countGeneratedFlashcards(a)
  ]);

  const indexContent = `// Auto-generated by scripts/generate-curriculum-index.mjs — DO NOT EDIT MANUALLY
import type { Module, ArticleMeta } from "./curriculumTypes";

export type { Module, ArticleMeta };

export const MODULES: Module[] = ${JSON.stringify(MODULES)};

export const MODULE_MAP: Record<string, Module> = Object.fromEntries(
  MODULES.map((m) => [m.id, m])
);

type ArticleRow = [
  string, string, string, string | null, string, string, string,
  number, string, number, number, number, number, number, number, number
];

const ROWS: ArticleRow[] = ${JSON.stringify(rows)};

export const ARTICLE_INDEX: ArticleMeta[] = ROWS.map((r) => ({
  id: r[0],
  moduleId: r[1],
  book: MODULE_MAP[r[1]]?.name ?? r[1],
  title: r[2],
  subtitle: r[3],
  author: r[4],
  dynasty: r[5],
  genre: r[6],
  isGaoKao72: r[7] === 1,
  recitationScope: r[8],
  charCount: r[9],
  netLength: r[10],
  paragraphCount: r[11],
  sortOrder: r[12],
  totalSegments: r[13],
  totalCards: r[14],
  generatedCardCount: r[15]
}));

export const ARTICLE_INDEX_MAP: Record<string, ArticleMeta> = Object.fromEntries(
  ARTICLE_INDEX.map((a) => [a.id, a])
);
`;

  fs.writeFileSync(CURRICULUM_INDEX_PATH, indexContent, "utf8");
  const indexBytes = Buffer.byteLength(indexContent, "utf8");

  fs.mkdirSync(CURRICULUM_BOOKS_DIR, { recursive: true });
  const shards = new Map();
  for (const article of ALL_ARTICLES) {
    const key = getVolumeKey(article.moduleId);
    if (!shards.has(key)) shards.set(key, []);
    shards.get(key).push(article);
  }

  for (const [key, articles] of shards.entries()) {
    const shardPath = path.join(CURRICULUM_BOOKS_DIR, `${key}.ts`);
    const shardContent = `// Auto-generated by scripts/generate-curriculum-index.mjs — DO NOT EDIT MANUALLY
import type { Article } from "../curriculumTypes";

export const ARTICLES: Article[] = ${JSON.stringify(articles)};
`;
    fs.writeFileSync(shardPath, shardContent, "utf8");
  }

  console.log(
    `[generate-curriculum-index] Generated curriculumIndex.ts (${(indexBytes / 1024).toFixed(2)} KB) and ${shards.size} book shards.`
  );
}

main();
