import React, { useState, useMemo, useEffect } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import {
  DYNASTY_GROUPS,
  DynastyEra,
  GENRE_GROUPS,
  GenreCategory,
  filterArticlesMulti
} from "../data/articleTaxonomy";
import {
  Search,
  Layers,
  Eye,
  BookOpen,
  X,
  Filter,
  ChevronDown
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

  // Performance chunking: render 18 initially, load more on demand
  const [visibleCount, setVisibleCount] = useState<number>(18);

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

  const handleResetFilters = () => {
    setSelectedCurriculum("ALL");
    setSelectedDynasty("ALL");
    setSelectedGenre("ALL");
    setSearchQuery("");
    setVisibleCount(18);
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
              四维立体检索课标名篇，支持一键转入滚雪球串联、渐进遮挡与全篇精读
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
                setVisibleCount(18);
              }}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400"
            />
          </div>
        </div>

        {/* 1. Curricular Tier Segmented Bar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-[11px] text-zinc-400 w-12 shrink-0">课标：</span>
          {[
            { id: "ALL", label: "全部 (100)" },
            { id: "GAOKAO72", label: "★ 高考必背 72 篇" },
            { id: "BX_ALL", label: "必修全套 (36)" },
            { id: "XB_ALL", label: "选择性必修 (35)" }
          ].map(c => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedCurriculum(c.id);
                setVisibleCount(18);
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
                setVisibleCount(18);
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
                setVisibleCount(18);
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

      {/* Results Count Bar */}
      <div className="flex items-center justify-between text-xs text-zinc-400 mb-3 px-1">
        <span>已筛选找到 <strong>{filteredArticles.length}</strong> 篇诗文</span>
        <span>当前显示 {displayedArticles.length} 篇</span>
      </div>

      {/* Articles Grid (Chunk Rendered for 60fps) */}
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
                    <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[10px] font-semibold">
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

      {/* Load More Button for Chunk Rendering */}
      {visibleCount < filteredArticles.length && (
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
              <div className="space-y-3">
                <div className="text-xs font-semibold text-zinc-500">【原文诵读】</div>
                {readingArticle.paragraphs.map((p, idx) => (
                  <p key={idx} className="text-base font-classical leading-relaxed indent-8 text-zinc-900 dark:text-zinc-100">
                    {p}
                  </p>
                ))}
              </div>

              {readingArticle.translation && (
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1.5">
                  <div className="text-xs font-semibold text-zinc-500">【白话译文】</div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {readingArticle.translation}
                  </p>
                </div>
              )}

              {readingArticle.annotations.length > 0 && (
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                  <div className="text-xs font-semibold text-zinc-500">【重点字词注解】</div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {readingArticle.annotations.map((ann, idx) => (
                      <li key={idx} className="bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800/60">
                        {ann}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
              <button
                onClick={() => {
                  const id = readingArticle.id;
                  setReadingArticle(null);
                  onOpenArticleInView(id, "snowball");
                }}
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>以此篇开启滚雪球</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
