import { ARTICLE_INDEX, ARTICLE_INDEX_MAP, type ArticleMeta } from "./curriculumIndex";
import { CardFsrsState, CardState } from "../domain/fsrs/fsrsTypes";

export interface VolumeDeck {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  category: "SPECIAL" | "REQUIRED" | "SELECTIVE" | "ELECTIVE";
  badge: string;
  moduleIds: string[];
  sortOrder: number;
}

export const VOLUME_DECKS: VolumeDeck[] = [
  {
    id: "VOL_BX1",
    name: "必修上册",
    shortName: "必修上",
    subtitle: "高一上 · 课文 15 篇 + 古诗词诵读 4 篇",
    category: "REQUIRED",
    badge: "必修",
    moduleIds: ["MODULE_BX_1", "MODULE_BX_1_RECITE"],
    sortOrder: 1
  },
  {
    id: "VOL_BX2",
    name: "必修下册",
    shortName: "必修下",
    subtitle: "高一下 · 课文 13 篇 + 古诗词诵读 4 篇",
    category: "REQUIRED",
    badge: "必修",
    moduleIds: ["MODULE_BX_2", "MODULE_BX_2_RECITE"],
    sortOrder: 2
  },
  {
    id: "VOL_XB1",
    name: "选择性必修上册",
    shortName: "选必上",
    subtitle: "高二上 · 课文 6 篇 + 古诗词诵读 4 篇",
    category: "SELECTIVE",
    badge: "选必",
    moduleIds: ["MODULE_XB_1", "MODULE_XB_1_RECITE"],
    sortOrder: 3
  },
  {
    id: "VOL_XB2",
    name: "选择性必修中册",
    shortName: "选必中",
    subtitle: "高二中 · 课文 4 篇 + 古诗词诵读 4 篇",
    category: "SELECTIVE",
    badge: "选必",
    moduleIds: ["MODULE_XB_2", "MODULE_XB_2_RECITE"],
    sortOrder: 4
  },
  {
    id: "VOL_XB3",
    name: "选择性必修下册",
    shortName: "选必下",
    subtitle: "高二下 · 课文 13 篇 + 古诗词诵读 4 篇",
    category: "SELECTIVE",
    badge: "选必",
    moduleIds: ["MODULE_XB_3", "MODULE_XB_3_RECITE"],
    sortOrder: 5
  },
  {
    id: "VOL_XX",
    name: "选修(古代诗歌散文欣赏)",
    shortName: "选修欣赏",
    subtitle: "高三拔高 · 古代诗歌散文欣赏全册 29 篇",
    category: "ELECTIVE",
    badge: "选修",
    moduleIds: ["MODULE_XX_APPRECIATION"],
    sortOrder: 6
  }
];

export const SPECIAL_DECKS: VolumeDeck[] = [
  {
    id: "DECK_GAOKAO72",
    name: "★ 高考必背 72 篇专项",
    shortName: "高考必背72",
    subtitle: "课标 72 篇中本库已收录的必背篇目",
    category: "SPECIAL",
    badge: "高考真题",
    moduleIds: [],
    sortOrder: 0
  },
  {
    id: "DECK_ALL",
    name: "全套高中教材全量名篇",
    shortName: "全套100篇",
    subtitle: "统编高中语文 11 册教材 · 全量 100 篇经典",
    category: "SPECIAL",
    badge: "全库",
    moduleIds: [],
    sortOrder: 100
  }
];

export interface DeckCardStats {
  id: string;
  name: string;
  articleCount: number;
  totalCards: number;
  newCount: number;      // 经典 Anki 纯蓝
  learningCount: number; // 经典 Anki 红色/橙色
  dueCount: number;       // 经典 Anki 绿色
  matureCount: number;    // 已熟练掌握 (stability >= 21)
}

/**
 * Get article metadata for a specific volume deck id
 */
export function getArticlesForDeck(deckId: string): ArticleMeta[] {
  if (deckId === "DECK_ALL") {
    return ARTICLE_INDEX;
  }
  if (deckId === "DECK_GAOKAO72") {
    return ARTICLE_INDEX.filter(a => a.isGaoKao72);
  }
  const vol = VOLUME_DECKS.find(v => v.id === deckId);
  if (vol) {
    return ARTICLE_INDEX.filter(a => vol.moduleIds.includes(a.moduleId));
  }
  // If deckId is a single article id
  const single = ARTICLE_INDEX_MAP[deckId];
  if (single) {
    return [single];
  }
  return ARTICLE_INDEX;
}

/**
 * Find the corresponding volume for an article
 */
export function getVolumeForArticle(articleId: string): VolumeDeck | undefined {
  const art = ARTICLE_INDEX_MAP[articleId];
  if (!art) return undefined;
  return VOLUME_DECKS.find(v => v.moduleIds.includes(art.moduleId));
}

function extractArticleIdFromCardId(cardId: string): string | null {
  const unitMatch = /^fc_(.+?)_u\d+_c\d+$/.exec(cardId);
  if (unitMatch) return unitMatch[1];
  const fallbackMatch = /^fc_(.+?)_0$/.exec(cardId);
  return fallbackMatch ? fallbackMatch[1] : null;
}

/**
 * Compute Anki-accurate card statistics from lightweight ArticleMeta[] and cardStatesMap
 * without loading full article bodies or running flashcard regex generation on initial load.
 */
export function computeDeckStats(
  deckId: string,
  deckName: string,
  articles: ArticleMeta[],
  cardStatesMap: Map<string, CardFsrsState>,
  now = Date.now()
): DeckCardStats {
  const articleIdSet = new Set(articles.map(a => a.id));
  let totalCards = 0;
  for (const article of articles) {
    totalCards += article.generatedCardCount;
  }

  let nonNewCount = 0;
  let learningCount = 0;
  let dueCount = 0;
  let matureCount = 0;

  for (const state of cardStatesMap.values()) {
    const artId = extractArticleIdFromCardId(state.cardId);
    if (!artId || !articleIdSet.has(artId)) continue;
    if (state.state === CardState.NEW) continue;

    nonNewCount++;
    if (state.state === CardState.LEARNING || state.state === CardState.RELEARNING) {
      learningCount++;
    } else if (state.state === CardState.REVIEW) {
      if (state.dueTime <= now) {
        dueCount++;
      }
      if (state.stability >= 21) {
        matureCount++;
      }
    }
  }

  const newCount = Math.max(0, totalCards - nonNewCount);

  return {
    id: deckId,
    name: deckName,
    articleCount: articles.length,
    totalCards,
    newCount,
    learningCount,
    dueCount,
    matureCount
  };
}
