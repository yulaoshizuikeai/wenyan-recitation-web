/**
 * ArticlePickerModal — Phase 2.3 Part A 统一选篇弹窗
 *
 * 从 SnowballView 和 ClozeView 中抽提的通用「朝代筛选 + 搜索」选篇弹窗。
 * 两个视图共享同一份 UI 逻辑，不再各自维护 100 行+的选篇弹窗代码。
 *
 * @example
 * ```tsx
 * <ArticlePickerModal
 *   isOpen={showPicker}
 *   onClose={() => setShowPicker(false)}
 *   articles={filteredArticles}
 *   activeArticleId={selectedId}
 *   onSelectArticle={(id) => { setSelectedId(id); setShowPicker(false); }}
 *   title="选择滚雪球篇目"
 * />
 * ```
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { DYNASTY_GROUPS, filterArticlesByScope, type DynastyEra } from "../data/articleTaxonomy";
import type { Article } from "../data/curriculumData";

// ─── Props ──────────────────────────────────────────────────────────────────────

export interface ArticlePickerModalProps {
  /** 是否展示弹窗 */
  isOpen: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 可选篇目列表（已按当前 scope 过滤或传入全量列表配合 selectedScope） */
  articles: Article[];
  /** 当前选中的篇目 ID */
  activeArticleId?: string;
  /** 选择篇目后的回调 */
  onSelectArticle: (articleId: string) => void;
  /** 可选教材范围 ID；传入时按范围收敛列表 */
  selectedScope?: string;
  /** 弹窗标题（如"选择滚雪球篇目"） */
  title?: string;
  /** 弹窗副标题 */
  subtitle?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export const ArticlePickerModal: React.FC<ArticlePickerModalProps> = ({
  isOpen,
  onClose,
  articles,
  activeArticleId,
  onSelectArticle,
  selectedScope,
  title = "选择篇目",
  subtitle = "按朝代或关键字快速定位",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [dynastyFilter, setDynastyFilter] = useState<DynastyEra>("ALL");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setDynastyFilter("ALL");
      // 延迟聚焦以等待动画完成
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Esc 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // 过滤逻辑：范围 + 朝代 + 搜索
  const filteredArticles = useMemo(() => {
    let result = selectedScope && selectedScope !== "ALL"
      ? filterArticlesByScope(articles, selectedScope)
      : articles;

    // 朝代筛选
    if (dynastyFilter !== "ALL") {
      const group = DYNASTY_GROUPS.find(g => g.id === dynastyFilter);
      if (group && group.subDynasties.length > 0) {
        result = result.filter(a => group.subDynasties.includes(a.dynasty));
      }
    }

    // 搜索
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        a =>
          a.title.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          a.dynasty.toLowerCase().includes(q) ||
          (a.genre && a.genre.toLowerCase().includes(q))
      );
    }

    return result;
  }, [articles, selectedScope, dynastyFilter, searchQuery]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{title}</h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索篇目名或作者（如：劝学、赤壁赋、苏轼）..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400 dark:focus:border-zinc-600"
            />
          </div>
        </div>

        {/* Dynasty Filter Chips */}
        <div className="px-5 py-2 flex items-center gap-1 overflow-x-auto border-b border-zinc-100 dark:border-zinc-800/50 text-[11px]">
          {DYNASTY_GROUPS.map(d => (
            <button
              key={d.id}
              onClick={() => setDynastyFilter(d.id)}
              className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                dynastyFilter === d.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Article List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {filteredArticles.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400 dark:text-zinc-500">
              未找到匹配的篇目
            </div>
          ) : (
            filteredArticles.map(article => {
              const isActive = article.id === activeArticleId;
              return (
                <button
                  key={article.id}
                  onClick={() => onSelectArticle(article.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-colors flex items-center justify-between ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                      : "bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold font-classical">《{article.title}》</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        isActive
                          ? "text-zinc-300 dark:text-zinc-600"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {article.dynasty} · {article.author} · {article.genre}
                    </div>
                  </div>
                  {article.isGaoKao72 && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isActive
                          ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      高考72篇
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
