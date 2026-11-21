import React, { useState, useMemo } from "react";
import { ALL_ARTICLES, Article, MODULES } from "../data/curriculumData";
import { sound } from "../sound/audioSynthesizer";
import { Search, Layers, Eye, BookOpen, X, BookmarkCheck } from "lucide-react";
import { NavView } from "../components/Navbar";

interface CatalogViewProps {
  onOpenArticleInView: (articleId: string, view: NavView) => void;
  selectedScope: string;
}

export const CatalogView: React.FC<CatalogViewProps> = ({ onOpenArticleInView, selectedScope }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>("ALL");
  const [readingArticle, setReadingArticle] = useState<Article | null>(null);

  const filteredArticles = useMemo(() => {
    let list = ALL_ARTICLES;

    if (selectedModuleFilter === "GAOKAO72") {
      list = list.filter(a => a.isGaoKao72);
    } else if (selectedModuleFilter !== "ALL") {
      list = list.filter(a => a.moduleId === selectedModuleFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        a =>
          a.title.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          a.dynasty.toLowerCase().includes(q) ||
          a.fullContent.includes(q)
      );
    }

    return list;
  }, [selectedModuleFilter, searchQuery]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Search & Filter Header */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-3xl p-6 mb-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-serif text-[#232120] flex items-center gap-2">
              <span>高中课标古诗文典库</span>
              <span className="text-xs font-sans px-2.5 py-0.5 rounded-full bg-[#9E2A2B]/10 text-[#9E2A2B] font-bold border border-[#9E2A2B]/20">
                11 册教材 · 100 篇收录
              </span>
            </h1>
            <p className="text-xs text-[#5C5855] mt-1">
              全量收录古文岛课标篇目，支持快速进入滚雪球串联、渐进遮挡与全篇精读。
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#8C8884] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索诗文标题、作者、名句..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#D5CFBD] bg-[#FAF7F0] focus:bg-white text-xs text-[#232120] focus:outline-none focus:border-[#9E2A2B]"
            />
          </div>
        </div>

        {/* Module Filter Pills */}
        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#F0EDE1] text-xs">
          <button
            onClick={() => {
              sound.playClick();
              setSelectedModuleFilter("ALL");
            }}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              selectedModuleFilter === "ALL"
                ? "bg-[#9E2A2B] text-white border-[#7A1E1F]"
                : "bg-white border-[#D5CFBD] text-[#5C5855] hover:bg-[#FAF7F0]"
            }`}
          >
            全部 (100)
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setSelectedModuleFilter("GAOKAO72");
            }}
            className={`px-3 py-1.5 rounded-lg border font-semibold transition-all ${
              selectedModuleFilter === "GAOKAO72"
                ? "bg-amber-500 text-white border-amber-600 font-bold"
                : "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100"
            }`}
          >
            ★ 高考 72 篇必背
          </button>

          {MODULES.map(m => (
            <button
              key={m.id}
              onClick={() => {
                sound.playClick();
                setSelectedModuleFilter(m.id);
              }}
              className={`px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
                selectedModuleFilter === m.id
                  ? "bg-[#2C4F3D] text-white border-[#1E432F] font-bold"
                  : "bg-white border-[#E3DEC3] text-[#5C5855] hover:bg-[#FAF7F0]"
              }`}
            >
              {m.shortName} ({m.totalArticles})
            </button>
          ))}
        </div>
      </div>

      {/* Articles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredArticles.map(article => (
          <div
            key={article.id}
            className="bg-white/80 backdrop-blur border border-[#E3DEC3] hover:border-[#9E2A2B]/50 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] text-[#8C8884]">
                  〔{article.dynasty}〕{article.author} · {article.genre}
                </span>
                <div className="flex items-center gap-1">
                  {article.recitationScope && article.recitationScope !== "FULL_TEXT" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-[#2B5C8F] font-bold border border-blue-200">
                      {article.recitationScope}
                    </span>
                  )}
                  {article.isGaoKao72 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                      高考72篇
                    </span>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-serif font-bold text-[#232120] mb-2">
                《{article.title}》
              </h3>

              <p className="text-xs text-[#5C5855] line-clamp-3 leading-relaxed mb-4 font-serif bg-[#FAF7F0] p-2.5 rounded-xl border border-[#F0EDE1]">
                {article.fullContent}
              </p>
            </div>

            <div className="flex items-center gap-1.5 pt-3 border-t border-[#F0EDE1] text-xs">
              <button
                onClick={() => {
                  sound.playClick();
                  onOpenArticleInView(article.id, "snowball");
                }}
                className="flex-1 py-1.5 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#2B5C8F] font-bold border border-blue-200 flex items-center justify-center gap-1 transition-all"
              >
                <Layers className="w-3.5 h-3.5" />
                滚雪球
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  onOpenArticleInView(article.id, "cloze");
                }}
                className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#2C4F3D] font-bold border border-emerald-200 flex items-center justify-center gap-1 transition-all"
              >
                <Eye className="w-3.5 h-3.5" />
                遮挡
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  setReadingArticle(article);
                }}
                className="py-1.5 px-2.5 rounded-lg bg-[#FAF7F0] hover:bg-[#F0EDE1] text-[#232120] font-semibold border border-[#D5CFBD] flex items-center gap-1 transition-all"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#9E2A2B]" />
                精读
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Reader Modal */}
      {readingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-[#F7F4EB] border border-[#E3DEC3] rounded-3xl p-6 sm:p-8 max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#E3DEC3]">
              <div>
                <h2 className="text-2xl font-serif font-bold text-[#232120]">
                  《{readingArticle.title}》
                </h2>
                <div className="text-xs text-[#8C8884] mt-0.5">
                  〔{readingArticle.dynasty}〕{readingArticle.author} · {readingArticle.genre}
                </div>
              </div>
              <button
                onClick={() => setReadingArticle(null)}
                className="p-1.5 rounded-xl hover:bg-black/5 text-[#8C8884] hover:text-[#232120]"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-6 space-y-6 pr-2">
              {/* Text paragraphs */}
              <div className="bg-white rounded-2xl p-6 border border-[#E3DEC3] space-y-4">
                <div className="text-xs font-bold text-[#9E2A2B]">【原文诵读】</div>
                {readingArticle.paragraphs.map((p, idx) => (
                  <p key={idx} className="text-lg font-serif leading-loose tracking-wide indent-8 text-[#232120]">
                    {p}
                  </p>
                ))}
              </div>

              {/* Translation */}
              {readingArticle.translation && (
                <div className="bg-white rounded-2xl p-6 border border-[#E3DEC3] space-y-2">
                  <div className="text-xs font-bold text-[#2B5C8F]">【白话译文】</div>
                  <p className="text-sm font-serif leading-relaxed text-[#5C5855]">
                    {readingArticle.translation}
                  </p>
                </div>
              )}

              {/* Annotations */}
              {readingArticle.annotations.length > 0 && (
                <div className="bg-white rounded-2xl p-6 border border-[#E3DEC3] space-y-2">
                  <div className="text-xs font-bold text-[#2C4F3D]">【重点字词注解】</div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#5C5855]">
                    {readingArticle.annotations.map((ann, idx) => (
                      <li key={idx} className="bg-[#FAF7F0] p-2 rounded-lg border border-[#F0EDE1]">
                        {ann}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#E3DEC3] flex justify-end gap-3">
              <button
                onClick={() => {
                  const id = readingArticle.id;
                  setReadingArticle(null);
                  onOpenArticleInView(id, "snowball");
                }}
                className="px-4 py-2.5 rounded-xl bg-[#2B5C8F] hover:bg-[#1E3F63] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Layers className="w-4 h-4" />
                以此篇开启滚雪球串联
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
