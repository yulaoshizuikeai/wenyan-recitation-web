import React, { useState, useMemo, useEffect } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import {
  DYNASTY_GROUPS,
  DynastyEra,
  GENRE_GROUPS,
  GenreCategory,
  filterArticlesMulti
} from "../data/articleTaxonomy";
import { VOLUME_DECKS, VolumeDeck } from "../data/ankiDecks";
import {
  Search,
  Layers,
  Eye,
  BookOpen,
  X,
  Filter,
  ChevronDown,
  Sparkles,
  LayoutGrid,
  ListTree,
  Play,
  Flame
} from "lucide-react";
import { NavView } from "../components/Navbar";
import { useLastSession, LastSessionState, saveLastSession, SessionExtra } from "../storage/sessionTracker";
import { PickUpCard } from "../components/PickUpCard";

interface CatalogViewProps {
  initialArticleId?: string;
  resumeExtra?: SessionExtra;
  onOpenArticleInView: (articleId: string, view: NavView) => void;
  onResumeSession?: (session: LastSessionState) => void;
  selectedScope: string;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  initialArticleId,
  resumeExtra,
  onOpenArticleInView,
  onResumeSession,
  selectedScope
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCurriculum, setSelectedCurriculum] = useState<string>("ALL");
  const [selectedDynasty, setSelectedDynasty] = useState<DynastyEra>("ALL");
  const [selectedGenre, setSelectedGenre] = useState<GenreCategory>("ALL");
  const [catalogLayout, setCatalogLayout] = useState<"volumes" | "grid">("volumes");
  const [readingArticle, setReadingArticle] = useState<Article | null>(() => {
    if (resumeExtra?.openReader && initialArticleId) {
      return ALL_ARTICLES.find(a => a.id === initialArticleId) || null;
    }
    return null;
  });

  const { lastSession, clearSession } = useLastSession();

  // If resumed into catalog with an openReader target, open reading modal
  useEffect(() => {
    if (resumeExtra?.openReader && initialArticleId) {
      const art = ALL_ARTICLES.find(a => a.id === initialArticleId);
      if (art) {
        setReadingArticle(art);
      }
    }
  }, [resumeExtra, initialArticleId]);

  const handleResume = (session: LastSessionState) => {
    if (session.view === "catalog" && session.articleId) {
      const art = ALL_ARTICLES.find(a => a.id === session.articleId);
      if (art) {
        setReadingArticle(art);
        return;
      }
    }
    if (onResumeSession) {
      onResumeSession(session);
    } else if (session.articleId) {
      onOpenArticleInView(session.articleId, session.view);
    }
  };

  const handleOpenReadingModal = (article: Article) => {
    setReadingArticle(article);
    saveLastSession({
      view: "catalog",
      articleId: article.id,
      articleTitle: article.title,
      articleAuthor: article.author,
      articleDynasty: article.dynasty,
      modeName: "诗文典库",
      progressText: "全文研览",
      progressPercent: 100,
      updatedAt: Date.now(),
      extra: {
        openReader: true
      }
    });
  };

  // Performance chunking: render 24 initially, load more on demand
  const [visibleCount, setVisibleCount] = useState<number>(24);

  const filteredArticles = useMemo(() => {
    return filterArticlesMulti(ALL_ARTICLES, {
      scopeId: selectedCurriculum,
      dynastyEra: selectedDynasty,
      genreCategory: selectedGenre,
      searchQuery: searchQuery
    });
  }, [selectedCurriculum, selectedDynasty, selectedGenre, searchQuery]);

  // Sliced articles for zero-lag rendering
  const displayedArticles = useMemo(() => {
    return filteredArticles.slice(0, visibleCount);
  }, [filteredArticles, visibleCount]);

  // Group filtered articles by Volume Deck
  const articlesByVolume = useMemo(() => {
    const map = new Map<string, { volume: VolumeDeck; articles: Article[] }>();
    for (const vol of VOLUME_DECKS) {
      map.set(vol.id, { volume: vol, articles: [] });
    }

    for (const art of filteredArticles) {
      const vol = VOLUME_DECKS.find(v => v.moduleIds.includes(art.moduleId));
      if (vol && map.has(vol.id)) {
        map.get(vol.id)!.articles.push(art);
      }
    }

    return Array.from(map.values()).filter(group => group.articles.length > 0);
  }, [filteredArticles]);

  const handleResetFilters = () => {
    setSelectedCurriculum("ALL");
    setSelectedDynasty("ALL");
    setSelectedGenre("ALL");
    setSearchQuery("");
    setVisibleCount(24);
  };

  const hasActiveFilters = selectedCurriculum !== "ALL" || selectedDynasty !== "ALL" || selectedGenre !== "ALL" || searchQuery.trim().length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 pb-24">
      {/* Pick Up Where You Left Off Quick Banner */}
      {lastSession && (
        <div className="mb-4">
          <PickUpCard
            variant="banner"
            session={lastSession}
            onResume={handleResume}
            onDismiss={clearSession}
          />
        </div>
      )}

      {/* Search & Multi-dimensional Filter Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>高中课标古诗文典库</span>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                收录 100 篇
              </span>
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              按选册排架体系化检索，支持一键转入 Anki 闪卡背诵、长篇滚雪球与渐进遮挡
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索标题、作者、名句..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setVisibleCount(24);
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400"
            />
          </div>
        </div>

        {/* 1. Curricular Tier Segmented Bar with Exact 6 Volumes */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-[11px] text-zinc-400 w-12 shrink-0">选册：</span>
          {[
            { id: "ALL", label: "全部 (100)" },
            { id: "GAOKAO72", label: "★ 高考必背 72 篇" },
            { id: "VOL_BX1", label: "必修上 (19)" },
            { id: "VOL_BX2", label: "必修下 (17)" },
            { id: "VOL_XB1", label: "选必上 (10)" },
            { id: "VOL_XB2", label: "选必中 (8)" },
            { id: "VOL_XB3", label: "选必下 (17)" },
            { id: "VOL_XX", label: "选修欣赏 (29)" }
          ].map(c => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedCurriculum(c.id);
                setVisibleCount(24);
              }}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                selectedCurriculum === c.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* 2. Dynasty Era Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] text-zinc-400 w-12 shrink-0">朝代：</span>
          {DYNASTY_GROUPS.map(d => (
            <button
              key={d.id}
              onClick={() => {
                setSelectedDynasty(d.id);
                setVisibleCount(24);
              }}
              className={`px-2 py-0.5 rounded-md transition-colors text-xs ${
                selectedDynasty === d.id
                  ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 font-medium"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* 3. Genre Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[11px] text-zinc-400 w-12 shrink-0">体裁：</span>
          {GENRE_GROUPS.map(g => (
            <button
              key={g.id}
              onClick={() => {
                setSelectedGenre(g.id);
                setVisibleCount(24);
              }}
              className={`px-2 py-0.5 rounded-md transition-colors text-xs ${
                selectedGenre === g.id
                  ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 font-medium"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {g.label}
            </button>
          ))}

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="ml-auto text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2"
            >
              重置所有筛选
            </button>
          )}
        </div>
      </div>

      {/* Results Count Bar & Layout Toggle */}
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-4 px-1">
        <span>已筛选找到 <strong>{filteredArticles.length}</strong> 篇诗文</span>

        {/* Layout Mode Switcher */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-800 text-xs">
          <button
            onClick={() => setCatalogLayout("volumes")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
              catalogLayout === "volumes"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-medium"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>按选册排架</span>
          </button>
          <button
            onClick={() => setCatalogLayout("grid")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
              catalogLayout === "grid"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-medium"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>平铺网格</span>
          </button>
        </div>
      </div>

      {/* Mode A: 按选册排架 (Volume Grouped Sections) */}
      {catalogLayout === "volumes" && (
        <div className="space-y-6">
          {articlesByVolume.map(({ volume, articles }) => (
            <div
              key={volume.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs transition-colors"
            >
              {/* Volume Header Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[11px] font-mono font-semibold">
                    {volume.badge}
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <span>{volume.name}</span>
                      <span className="text-xs font-mono font-normal text-zinc-400">
                        ({articles.length} 篇)
                      </span>
                    </h2>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                      {volume.subtitle}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onOpenArticleInView(articles[0]?.id || "art_bx1_12", "flipcard")}
                  className="px-3 py-1.5 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-300 text-xs font-medium flex items-center gap-1.5 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                  <span>背诵本册 Anki 闪卡</span>
                </button>
              </div>

              {/* Volume's Articles Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {articles.map(article => (
                  <div
                    key={article.id}
                    className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/30 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 text-[11px] text-zinc-400 mb-1">
                        <span>{article.dynasty} · {article.author}</span>
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono text-[10px]">
                            {article.genre}
                          </span>
                          {article.isGaoKao72 && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-semibold">
                              高考72
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-sm font-classical font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
                        《{article.title}》
                      </h3>

                      <p className="text-xs font-classical text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-3">
                        {article.fullContent}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 text-xs">
                      <button
                        onClick={() => onOpenArticleInView(article.id, "flipcard")}
                        className="flex-1 py-1 px-2 rounded-lg bg-sky-600 text-white dark:bg-sky-500 dark:text-zinc-950 font-medium flex items-center justify-center gap-1 transition-colors hover:bg-sky-700"
                        title="Anki 翻转闪卡"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>闪卡</span>
                      </button>

                      <button
                        onClick={() => onOpenArticleInView(article.id, "snowball")}
                        className="py-1 px-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium flex items-center justify-center gap-1 transition-colors"
                        title="滚雪球串联"
                      >
                        <Layers className="w-3 h-3" />
                        <span>滚雪球</span>
                      </button>

                      <button
                        onClick={() => onOpenArticleInView(article.id, "cloze")}
                        className="py-1 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="渐进遮挡"
                      >
                        遮挡
                      </button>

                      <button
                        onClick={() => handleOpenReadingModal(article)}
                        className="py-1 px-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="全篇精读"
                      >
                        精读
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mode B: 平铺网格 (Chunk Rendered for 60fps) */}
      {catalogLayout === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {displayedArticles.map(article => (
            <div
              key={article.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1 text-[11px] text-zinc-400 mb-1">
                  <span>{article.dynasty} · {article.author}</span>
                  <div className="flex items-center gap-1">
                    <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono text-[10px]">
                      {article.genre}
                    </span>
                    {article.isGaoKao72 && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-semibold">
                        高考72
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-base font-classical font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  《{article.title}》
                </h3>

                <p className="text-xs font-classical text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-4 bg-zinc-50 dark:bg-zinc-800/40 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                  {article.fullContent}
                </p>
              </div>

              <div className="flex items-center gap-1.5 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/60 text-xs">
                <button
                  onClick={() => onOpenArticleInView(article.id, "flipcard")}
                  className="py-1.5 px-2 rounded-lg bg-sky-600 text-white dark:bg-sky-500 dark:text-zinc-950 font-medium flex items-center justify-center gap-1 transition-colors hover:bg-sky-700"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>闪卡</span>
                </button>

                <button
                  onClick={() => onOpenArticleInView(article.id, "snowball")}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>滚雪球</span>
                </button>

                <button
                  onClick={() => onOpenArticleInView(article.id, "cloze")}
                  className="py-1.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>遮挡</span>
                </button>

                <button
                  onClick={() => handleOpenReadingModal(article)}
                  className="py-1.5 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>精读</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More Button for Chunk Rendering */}
      {catalogLayout === "grid" && visibleCount < filteredArticles.length && (
        <div className="text-center pt-6">
          <button
            onClick={() => setVisibleCount(prev => prev + 24)}
            className="px-5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
          >
            加载更多篇目（剩余 {filteredArticles.length - visibleCount} 篇）
          </button>
        </div>
      )}

      {/* Minimal Reader Modal */}
      {readingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-7 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-xl font-classical font-semibold text-zinc-900 dark:text-zinc-100">
                  《{readingArticle.title}》
                </h2>
                <div className="text-xs text-zinc-400 mt-0.5">
                  〔{readingArticle.dynasty}〕{readingArticle.author} · {readingArticle.genre}
                </div>
              </div>
              <button
                onClick={() => setReadingArticle(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1">
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60">
                <p className="text-base font-classical text-zinc-800 dark:text-zinc-200 leading-loose whitespace-pre-line text-justify">
                  {readingArticle.fullContent}
                </p>
              </div>

              {readingArticle.translation && (
                <div className="p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/20 border border-zinc-100 dark:border-zinc-800/40 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-300 font-sans">【白话译文】</div>
                  <p className="leading-relaxed font-classical">{readingArticle.translation}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  const id = readingArticle.id;
                  setReadingArticle(null);
                  onOpenArticleInView(id, "flipcard");
                }}
                className="py-1.5 px-3 rounded-lg bg-sky-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-sky-700 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>背诵闪卡</span>
              </button>

              <button
                onClick={() => {
                  const id = readingArticle.id;
                  setReadingArticle(null);
                  onOpenArticleInView(id, "snowball");
                }}
                className="py-1.5 px-3 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold flex items-center gap-1"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>进入滚雪球</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
