import { Article, ALL_ARTICLES, MODULES, Module } from "./curriculumData";

export type CurriculumCategory = "ALL" | "GAOKAO72" | "BX_ALL" | "XB_ALL" | string;

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
  const gaokaoCount = ALL_ARTICLES.filter(a => a.isGaoKao72).length;
  const bxCount = ALL_ARTICLES.filter(a => a.moduleId.startsWith("MODULE_BX")).length;
  const xbCount = ALL_ARTICLES.filter(a => a.moduleId.startsWith("MODULE_XB")).length;

  return [
    {
      id: "CORE",
      title: "核心备考分类",
      description: "高考核心课标与全套教材",
      options: [
        { id: "GAOKAO72", name: "高考必背 72 篇", count: gaokaoCount, description: "高考命题超高频经典重点必背", isPopular: true },
        { id: "ALL", name: "全 11 册教材全部篇目", count: ALL_ARTICLES.length, description: "包含课文及诵读全量 100 篇" },
        { id: "BX_ALL", name: "必修全套", count: bxCount, description: "高一必修上/下册全部课内必学篇目" },
        { id: "XB_ALL", name: "选择性必修全套", count: xbCount, description: "高二/高三选必上/中/下册选修提高篇目" }
      ]
    },
    {
      id: "REQUIRED",
      title: "必修教材分册",
      description: "新课标普通高中必修教材",
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
      description: "新课标选择性必修教材",
      options: MODULES.filter(m => m.category === "SELECTIVE_REQUIRED").map(m => ({
        id: m.id,
        name: m.name,
        count: m.totalArticles,
        description: m.isRecitationOnly ? "教材古诗词专项诵读篇目" : "课内经典文赋与先秦散文"
      }))
    }
  ];
}

/**
 * Filter articles by curriculum scope
 */
export function filterArticlesByScope(articles: Article[], scopeId: string): Article[] {
  if (!scopeId || scopeId === "ALL") return articles;
  if (scopeId === "GAOKAO72") return articles.filter(a => a.isGaoKao72);
  if (scopeId === "BX_ALL") return articles.filter(a => a.moduleId.startsWith("MODULE_BX"));
  if (scopeId === "XB_ALL") return articles.filter(a => a.moduleId.startsWith("MODULE_XB"));
  return articles.filter(a => a.moduleId === scopeId);
}

/**
 * Multi-dimensional filter
 */
export function filterArticlesMulti(
  articles: Article[],
  options: {
    scopeId?: string;
    dynastyEra?: DynastyEra;
    genreCategory?: GenreCategory;
    searchQuery?: string;
    masteryStatus?: "ALL" | "UNLEARNED" | "LEARNING" | "MASTERED";
    matureCardIds?: Set<string>;
  }
): Article[] {
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

  // 4. Search query
  if (options.searchQuery && options.searchQuery.trim()) {
    const q = options.searchQuery.trim().toLowerCase();
    list = list.filter(
      a =>
        a.title.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        a.dynasty.toLowerCase().includes(q) ||
        a.fullContent.includes(q)
    );
  }

  return list;
}
