import { ALL_ARTICLES, Article, MODULES, Module } from "./curriculumData";
import { flashcardCache } from "./flashcardCache";
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
    subtitle: "教育部新高考命题超高频核心背诵篇目",
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
 * Get articles for a specific volume deck id
 */
export function getArticlesForDeck(deckId: string): Article[] {
  if (deckId === "DECK_ALL") {
    return ALL_ARTICLES;
  }
  if (deckId === "DECK_GAOKAO72") {
    return ALL_ARTICLES.filter(a => a.isGaoKao72);
  }
  const vol = VOLUME_DECKS.find(v => v.id === deckId);
  if (vol) {
    return ALL_ARTICLES.filter(a => vol.moduleIds.includes(a.moduleId));
  }
  // If deckId is a single article id
  const single = ALL_ARTICLES.find(a => a.id === deckId);
  if (single) {
    return [single];
  }
  return ALL_ARTICLES;
}

/**
 * Find the corresponding volume for an article
 */
export function getVolumeForArticle(articleId: string): VolumeDeck | undefined {
  const art = ALL_ARTICLES.find(a => a.id === articleId);
  if (!art) return undefined;
  return VOLUME_DECKS.find(v => v.moduleIds.includes(art.moduleId));
}

/**
 * Compute Anki-accurate card statistics for an array of articles
 */
export function computeDeckStats(
  deckId: string,
  deckName: string,
  articles: Article[],
  cardStatesMap: Map<string, CardFsrsState>,
  now = Date.now()
): DeckCardStats {
  let totalCards = 0;
  let newCount = 0;
  let learningCount = 0;
  let dueCount = 0;
  let matureCount = 0;

  for (const article of articles) {
    const cards = flashcardCache.getCardsForArticle(article);
    totalCards += cards.length;

    for (const card of cards) {
      const state = cardStatesMap.get(card.id);
      if (!state || state.state === CardState.NEW) {
        newCount++;
      } else if (state.state === CardState.LEARNING || state.state === CardState.RELEARNING) {
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
  }

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
