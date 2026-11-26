import { ARTICLE_INDEX, ARTICLE_INDEX_MAP, MODULES, type ArticleMeta, type Module } from "./curriculumIndex";
import { CORE_GOLDEN_VERSES } from "./goldenVersesData";

export type CurriculumCategory = "ALL" | "GAOKAO72" | "BX_ALL" | "XB_ALL" | "XX_ALL" | string;

export type DynastyEra = "ALL" | "PRE_QIN" | "HAN_WEI" | "TANG_WUDAI" | "SONG" | "YUAN_MING_QING";

export type GenreCategory = "ALL" | "POETRY" | "CI_QU" | "FU" | "PROSE";

export interface DynastyGroup {
  id: DynastyEra;
  label: string;
  subDynasties: string[];
}

export const DYNASTY_GROUPS: DynastyGroup[] = [
  { id: "ALL", label: "全部朝代", subDynasties: [] },
  { id: "PRE_QIN", label: "先秦秦汉", subDynasties: ["先秦", "战国·楚", "秦代", "汉代", "西汉", "东汉"] },
  { id: "HAN_WEI", label: "魏晋南北朝", subDynasties: ["三国·魏", "魏晋", "西晋", "东晋", "南朝·宋"] },
  { id: "TANG_WUDAI", label: "唐代五代", subDynasties: ["唐代", "五代", "五代·南唐"] },
  { id: "SONG", label: "两宋风华", subDynasties: ["宋代"] },
  { id: "YUAN_MING_QING", label: "元明清及近现", subDynasties: ["元代", "明代", "明末清初", "清代", "清末", "近现代"] }
];

export interface GenreGroup {
  id: GenreCategory;
  label: string;
  subGenres: string[];
}

export const GENRE_GROUPS: GenreGroup[] = [
  { id: "ALL", label: "全部体裁", subGenres: [] },
  { id: "POETRY", label: "古诗乐府", subGenres: ["诗", "乐府", "歌行"] },
  { id: "CI_QU", label: "宋词元曲", subGenres: ["词", "曲"] },
  { id: "FU", label: "宏篇文赋", subGenres: ["文赋", "辞赋"] },
  { id: "PROSE", label: "散文论说", subGenres: ["散文"] }
];

export interface ScopeCategoryOption {
  id: string;
  name: string;
  count: number;
  description: string;
  isPopular?: boolean;
}

export interface CurricularTier {
  id: string;
  title: string;
  description: string;
  options: ScopeCategoryOption[];
}

/**
 * Two-tier hierarchical curriculum scope taxonomy for the redesigned picker
 */
export function getCurricularTiers(): CurricularTier[] {
  const gaokaoCount = ARTICLE_INDEX.filter(a => a.isGaoKao72).length;
  const bxCount = ARTICLE_INDEX.filter(a => a.moduleId.startsWith("MODULE_BX")).length;
  const xbCount = ARTICLE_INDEX.filter(a => a.moduleId.startsWith("MODULE_XB")).length;
  const xxCount = ARTICLE_INDEX.filter(a => a.moduleId.startsWith("MODULE_XX")).length;

  return [
    {
      id: "CORE",
      title: "核心备考分类",
      description: "高考核心课标与全套教材",
      options: [
        { id: "GAOKAO72", name: "高考必背 72 篇", count: gaokaoCount, description: "课标 72 篇中本库已收录的必背篇目", isPopular: true },
        { id: "ALL", name: "全 11 册教材全部篇目", count: ARTICLE_INDEX.length, description: "包含课文及诵读全量 100 篇" },
        { id: "BX_ALL", name: "必修全套 (36篇)", count: bxCount, description: "高一必修上/下册全部课内必学篇目" },
        { id: "XB_ALL", name: "选择性必修全套 (35篇)", count: xbCount, description: "高二/高三选必上/中/下册选修提高篇目" },
        { id: "XX_ALL", name: "古代诗歌散文欣赏 (29篇)", count: xxCount, description: "统编高中选修中国古代诗歌散文欣赏全套" }
      ]
    },
    {
      id: "REQUIRED",
      title: "必修教材分册",
      description: "新课标必修教材 (4分册·36篇)",
      options: MODULES.filter(m => m.category === "REQUIRED").map(m => ({
        id: m.id,
        name: m.name,
        count: m.totalArticles,
        description: m.isRecitationOnly ? "教材古诗词专项诵读篇目" : "教材课内文言散文与文赋"
      }))
    },
    {
      id: "SELECTIVE",
      title: "选择性必修分册",
      description: "新课标选择性必修教材 (6分册·35篇)",
      options: MODULES.filter(m => m.category === "SELECTIVE").map(m => ({
        id: m.id,
        name: m.name,
        count: m.totalArticles,
        description: m.isRecitationOnly ? "教材古诗词专项诵读篇目" : "课内经典文赋与先秦散文"
      }))
    },
    {
      id: "ELECTIVE",
      title: "选修拓展分册",
      description: "古代诗歌散文欣赏 (29篇)",
      options: MODULES.filter(m => m.category === "ELECTIVE").map(m => ({
        id: m.id,
        name: m.name,
        count: m.totalArticles,
        description: "高三拓展经典诗词与文赋名篇欣赏"
      }))
    }
  ];
}

/**
 * Filter articles by curriculum scope
 */
export function filterArticlesByScope<T extends { moduleId: string; isGaoKao72: boolean }>(
  articles: T[],
  scopeId: string
): T[] {
  if (!scopeId || scopeId === "ALL") return articles;
  if (scopeId === "GAOKAO72" || scopeId === "DECK_GAOKAO72") return articles.filter(a => a.isGaoKao72);
  if (scopeId === "BX_ALL") return articles.filter(a => a.moduleId.startsWith("MODULE_BX"));
  if (scopeId === "XB_ALL") return articles.filter(a => a.moduleId.startsWith("MODULE_XB"));
  if (scopeId === "XX_ALL") return articles.filter(a => a.moduleId.startsWith("MODULE_XX"));
  if (scopeId === "VOL_BX1") return articles.filter(a => a.moduleId === "MODULE_BX_1" || a.moduleId === "MODULE_BX_1_RECITE");
  if (scopeId === "VOL_BX2") return articles.filter(a => a.moduleId === "MODULE_BX_2" || a.moduleId === "MODULE_BX_2_RECITE");
  if (scopeId === "VOL_XB1") return articles.filter(a => a.moduleId === "MODULE_XB_1" || a.moduleId === "MODULE_XB_1_RECITE");
  if (scopeId === "VOL_XB2") return articles.filter(a => a.moduleId === "MODULE_XB_2" || a.moduleId === "MODULE_XB_2_RECITE");
  if (scopeId === "VOL_XB3") return articles.filter(a => a.moduleId === "MODULE_XB_3" || a.moduleId === "MODULE_XB_3_RECITE");
  if (scopeId === "VOL_XX") return articles.filter(a => a.moduleId === "MODULE_XX_APPRECIATION");
  return articles.filter(a => a.moduleId === scopeId);
}

const goldenVerseSearchTextByArticleId: ReadonlyMap<string, string> = (() => {
  const buckets = new Map<string, string[]>();
  const titleIndex = new Map<string, ArticleMeta[]>();
  for (const meta of ARTICLE_INDEX) {
    const arr = titleIndex.get(meta.title);
    if (arr) arr.push(meta);
    else titleIndex.set(meta.title, [meta]);
  }

  for (const gv of CORE_GOLDEN_VERSES) {
    let targetId: string | undefined = ARTICLE_INDEX_MAP[gv.articleId] ? gv.articleId : undefined;
    if (!targetId) {
      const candidates = titleIndex.get(gv.articleTitle);
      if (candidates && candidates.length > 0) {
        targetId = (candidates.find(c => c.author === gv.author) ?? candidates[0]).id;
      }
    }
    if (!targetId) continue;

    const snippet = [gv.verse, gv.highlightPart ?? "", ...gv.scenarioTags]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const list = buckets.get(targetId);
    if (list) list.push(snippet);
    else buckets.set(targetId, [snippet]);
  }

  const joined = new Map<string, string>();
  for (const [id, parts] of buckets.entries()) {
    joined.set(id, parts.join("\n"));
  }
  return joined;
})();

/**
 * Check if any curated golden verse belonging to `articleId` matches the query string.
 */
export function matchesArticleGoldenVerse(articleId: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return (goldenVerseSearchTextByArticleId.get(articleId) ?? "").includes(q);
}

function extractArticleIdFromCardId(cardId: string): string | null {
  const unitMatch = /^fc_(.+?)_u\d+_c\d+$/.exec(cardId);
  if (unitMatch) return unitMatch[1];
  const fallbackMatch = /^fc_(.+?)_0$/.exec(cardId);
  return fallbackMatch ? fallbackMatch[1] : null;
}

function countCardsByArticle(cardIds?: ReadonlySet<string>): Map<string, number> {
  const counts = new Map<string, number>();
  if (!cardIds) return counts;
  for (const cardId of cardIds) {
    const artId = extractArticleIdFromCardId(cardId);
    if (!artId) continue;
    counts.set(artId, (counts.get(artId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Multi-dimensional filter
 */
export function filterArticlesMulti<
  T extends {
    id: string;
    moduleId: string;
    title: string;
    author: string;
    dynasty: string;
    genre: string;
    isGaoKao72: boolean;
    subtitle?: string | null;
    fullContent?: string;
    generatedCardCount?: number;
  }
>(
  articles: T[],
  options: {
    scopeId?: string;
    dynastyEra?: DynastyEra;
    genreCategory?: GenreCategory;
    searchQuery?: string;
    masteryStatus?: "ALL" | "UNLEARNED" | "LEARNING" | "MASTERED";
    matureCardIds?: Set<string>;
    learnedCardIds?: Set<string>;
    searchableTextMap?: ReadonlyMap<string, string>;
  }
): T[] {
  let list = articles;

  // 1. Scope filter
  if (options.scopeId && options.scopeId !== "ALL") {
    list = filterArticlesByScope(list, options.scopeId);
  }

  // 2. Dynasty filter
  if (options.dynastyEra && options.dynastyEra !== "ALL") {
    const group = DYNASTY_GROUPS.find(g => g.id === options.dynastyEra);
    if (group && group.subDynasties.length > 0) {
      list = list.filter(a => group.subDynasties.includes(a.dynasty));
    }
  }

  // 3. Genre filter
  if (options.genreCategory && options.genreCategory !== "ALL") {
    const group = GENRE_GROUPS.find(g => g.id === options.genreCategory);
    if (group && group.subGenres.length > 0) {
      list = list.filter(a => group.subGenres.includes(a.genre));
    }
  }

  // 4. Mastery status filter
  if (options.masteryStatus && options.masteryStatus !== "ALL") {
    const matureCounts = countCardsByArticle(options.matureCardIds);
    const learnedCounts = options.learnedCardIds
      ? countCardsByArticle(options.learnedCardIds)
      : matureCounts;

    list = list.filter(a => {
      const matureCount = matureCounts.get(a.id) ?? 0;
      const learnedCount = Math.max(matureCount, learnedCounts.get(a.id) ?? 0);
      const totalCards = a.generatedCardCount ?? ARTICLE_INDEX_MAP[a.id]?.generatedCardCount ?? 0;

      const status: "UNLEARNED" | "LEARNING" | "MASTERED" =
        learnedCount === 0
          ? "UNLEARNED"
          : totalCards > 0
            ? (matureCount / totalCards >= 0.8 ? "MASTERED" : "LEARNING")
            : (matureCount > 0 ? "MASTERED" : "LEARNING");

      return status === options.masteryStatus;
    });
  }

  // 5. Search query (matches metadata, fullContent when loaded, optional extra text, and golden verses)
  if (options.searchQuery && options.searchQuery.trim()) {
    const q = options.searchQuery.trim().toLowerCase();
    list = list.filter(
      a =>
        a.title.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        a.dynasty.toLowerCase().includes(q) ||
        (typeof a.subtitle === "string" && a.subtitle.toLowerCase().includes(q)) ||
        (typeof a.fullContent === "string" && a.fullContent.toLowerCase().includes(q)) ||
        (options.searchableTextMap?.get(a.id)?.toLowerCase().includes(q) ?? false) ||
        (goldenVerseSearchTextByArticleId.get(a.id)?.includes(q) ?? false)
    );
  }

  return list;
}
