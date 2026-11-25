import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Volume2 } from "lucide-react";
import { Article } from "../data/curriculumData";
import { getPhonetics } from "../data/articlePhonetics";

interface PhoneticsPanelProps {
  article: Article;
  onClose: () => void;
}

/** 难词注音面板：右侧滑出抽屉，列出当前篇目的难读字词与释义 */
export const PhoneticsPanel: React.FC<PhoneticsPanelProps> = ({ article, onClose }) => {
  const entries = getPhonetics(article.id);

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
        className="w-full max-w-md h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden animate-drawer-in"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                难词注音
              </h2>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              《{article.title}》· {article.author} · 共 {entries.length} 条
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

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {entries.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">
              本篇暂无难词注音数据
            </p>
          ) : (
            <ul className="space-y-3">
              {entries.map((entry, idx) => (
                <li
                  key={`${entry.word}_${idx}`}
                  className="flex items-start gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 last:pb-0"
                >
                  <div className="shrink-0 min-w-[4.5em]">
                    <span className="font-classical text-xl text-zinc-900 dark:text-zinc-100">
                      {entry.word}
                    </span>
                    {entry.isTongjia && (
                      <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 align-middle">
                        通假
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-emerald-700 dark:text-emerald-400">
                      {entry.pinyin}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
                      {entry.meaning}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
