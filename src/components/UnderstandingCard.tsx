import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, BookOpen } from "lucide-react";
import { Article } from "../data/curriculumData";
import {
  getCachedArticleUnderstanding,
  isArticleUnderstandingLoaded,
  loadArticleUnderstanding
} from "../data/articleUnderstanding";
import type { ArticleUnderstanding } from "../data/learningContentTypes";
import { useRegisterModalOpen } from "../state/StudyAppContext";

interface UnderstandingCardProps {
  article: Article;
  onClose: () => void;
  /** 当前正在背的文本，用于高亮对应段落 */
  highlightText?: string;
}

/** 去掉标点空白，便于比对段落归属 */
function normalize(text: string): string {
  return text.replace(/[，。？！；：、“”‘’\s《》]/g, "");
}

/** 找出当前背诵内容所在段落索引 */
function findParagraphIndex(paragraphs: string[], highlightText?: string): number {
  if (!highlightText) return -1;
  const needle = normalize(highlightText).slice(0, 12);
  if (!needle) return -1;
  for (let i = 0; i < paragraphs.length; i++) {
    if (normalize(paragraphs[i]).includes(needle)) return i;
  }
  // 退化比对：段落是否包含在背诵内容中
  const full = normalize(highlightText);
  for (let i = 0; i < paragraphs.length; i++) {
    const p = normalize(paragraphs[i]);
    if (p.length > 0 && full.includes(p.slice(0, 12))) return i;
  }
  return -1;
}

/** 理解卡片：整篇大意 + 逐段串讲 */
export const UnderstandingCard: React.FC<UnderstandingCardProps> = ({
  article,
  onClose,
  highlightText
}) => {
  const [data, setData] = useState<ArticleUnderstanding | undefined>(
    () => getCachedArticleUnderstanding(article.id)
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !isArticleUnderstandingLoaded(article.id)
  );

  useEffect(() => {
    if (isArticleUnderstandingLoaded(article.id)) {
      setData(getCachedArticleUnderstanding(article.id));
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    loadArticleUnderstanding(article.id)
      .then((loaded) => {
        if (!cancelled) {
          setData(loaded);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(undefined);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [article.id]);

  useRegisterModalOpen(true);

  const activeIndex = findParagraphIndex(article.paragraphs, highlightText);
  const activeRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (data && activeRef.current) {
      activeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeIndex, data]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25 dark:bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="理解大意"
        className="w-full max-w-lg h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden animate-drawer-in"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                理解大意
              </h2>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              《{article.title}》· {article.author} · {article.genre}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">
              正在加载理解内容...
            </p>
          ) : !data ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">
              本篇暂无理解内容
            </p>
          ) : (
            <>
              <section>
                <h3 className="text-[11px] font-medium tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">
                  全篇大意
                </h3>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {data.gist}
                </p>
              </section>

              <section>
                <h3 className="text-[11px] font-medium tracking-wide text-zinc-400 dark:text-zinc-500 mb-2">
                  逐段串讲
                </h3>
                <ul className="space-y-2">
                  {data.paragraphGists.map((gist, idx) => {
                    const isActive = idx === activeIndex;
                    const source = article.paragraphs[idx] || "";
                    return (
                      <li
                        key={idx}
                        ref={isActive ? activeRef : null}
                        className={`rounded-xl border px-3.5 py-3 transition-colors ${
                          isActive
                            ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20"
                            : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              isActive
                                ? "bg-emerald-600 text-white dark:bg-emerald-500"
                                : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                            }`}
                          >
                            第 {idx + 1} 段
                          </span>
                          {isActive && (
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                              当前背诵
                            </span>
                          )}
                        </div>
                        {source && (
                          <p className="text-[11px] font-classical text-zinc-400 dark:text-zinc-500 line-clamp-1 mb-1.5">
                            {source}
                          </p>
                        )}
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                          {gist}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
