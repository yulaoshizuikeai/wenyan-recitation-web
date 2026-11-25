import React from "react";
import { Volume2, BookOpen, Search, Keyboard, Layers } from "lucide-react";

export interface SidebarShortcut {
  keys: string;
  label: string;
}

interface StudySidebarProps {
  article?: {
    title: string;
    author: string;
    dynasty?: string;
    genre?: string;
    isGaoKao72?: boolean;
  };
  progressLabel?: string;
  progressPercent?: number;
  shortcuts?: SidebarShortcut[];
  onShowPhonetics?: () => void;
  onShowUnderstanding?: () => void;
  onChangeArticle?: () => void;
  hint?: string;
}

/**
 * PC 宽屏右侧常驻信息栏。
 * 仅在 xl 及以上显示，移动端与窄屏完全不受影响。
 */
export const StudySidebar: React.FC<StudySidebarProps> = ({
  article,
  progressLabel,
  progressPercent,
  shortcuts = [],
  onShowPhonetics,
  onShowUnderstanding,
  onChangeArticle,
  hint
}) => {
  const hasActions = onShowPhonetics || onShowUnderstanding || onChangeArticle;

  return (
    <aside className="hidden xl:flex xl:flex-col gap-3 sticky top-16">
      {article && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">当前篇目</span>
          </div>
          <h3 className="text-sm font-classical font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
            《{article.title}》
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
            {article.dynasty ? `〔${article.dynasty}〕` : ""}
            {article.author}
            {article.genre ? ` · ${article.genre}` : ""}
          </p>
          {article.isGaoKao72 && (
            <span className="inline-block mt-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              高考 72 篇
            </span>
          )}

          {progressPercent !== undefined && (
            <div className="mt-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-zinc-500 dark:text-zinc-400 truncate">{progressLabel || "进度"}</span>
                <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {Math.min(100, Math.max(0, Math.round(progressPercent)))}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 dark:bg-red-500 transition-all duration-200"
                  style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {hasActions && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2 shadow-xs space-y-0.5">
          {onShowPhonetics && (
            <button
              onClick={onShowPhonetics}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>难词注音</span>
            </button>
          )}
          {onShowUnderstanding && (
            <button
              onClick={onShowUnderstanding}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
              <span>理解大意</span>
            </button>
          )}
          {onChangeArticle && (
            <button
              onClick={onChangeArticle}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <span>换一篇</span>
            </button>
          )}
        </div>
      )}

      {shortcuts.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Keyboard className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">键盘操作</span>
          </div>
          <ul className="space-y-1.5">
            {shortcuts.map(item => (
              <li key={item.keys + item.label} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-zinc-600 dark:text-zinc-300">{item.label}</span>
                <kbd className="kbd shrink-0">{item.keys}</kbd>
              </li>
            ))}
          </ul>
          <p className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
            按 <kbd className="kbd">?</kbd> 查看全站快捷键
          </p>
        </div>
      )}

      {hint && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3.5">
          <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">{hint}</p>
        </div>
      )}
    </aside>
  );
};
