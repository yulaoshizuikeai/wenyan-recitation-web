import React from "react";
import { ChevronDown, Volume2, BookOpen } from "lucide-react";

interface StudyToolbarProps {
  modeLabel: string;
  modeIcon?: React.ReactNode;
  title: string;
  subtitle?: string;
  onSelectTitle?: () => void;
  progressText?: string;
  progressPercent?: number;
  onShowPhonetics?: () => void;
  onShowUnderstanding?: () => void;
  actions?: React.ReactNode;
}

/**
 * 统一学习工作区顶部工具栏：
 * 为滚雪球、渐进遮挡、高考默写、抱佛脚等桌面端学习视图提供一致的选篇、进度与辅助工具栏。
 */
export const StudyToolbar: React.FC<StudyToolbarProps> = ({
  modeLabel,
  modeIcon,
  title,
  subtitle,
  onSelectTitle,
  progressText,
  progressPercent,
  onShowPhonetics,
  onShowUnderstanding,
  actions
}) => {
  const clampedPct =
    progressPercent !== undefined ? Math.min(100, Math.max(0, Math.round(progressPercent))) : undefined;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 transition-colors">
      {/* Left: Mode Badge + Active Article / Scope Selector */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 shrink-0">
          {modeIcon}
          <span>{modeLabel}</span>
        </span>

        {onSelectTitle ? (
          <button
            onClick={onSelectTitle}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-0 group"
            title="点击切换篇目或题目"
          >
            <span className="text-sm font-classical font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {title}
            </span>
            {subtitle && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate hidden md:inline">
                {subtitle}
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 shrink-0 transition-colors" />
          </button>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-classical font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {title}
            </span>
            {subtitle && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate hidden md:inline">
                {subtitle}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: Progress + Auxiliary Tools + Custom Actions */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {progressText && (
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-700/60">
            <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-300">{progressText}</span>
            {clampedPct !== undefined && (
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 dark:bg-red-500 transition-all duration-200"
                  style={{ width: `${clampedPct}%` }}
                />
              </div>
            )}
          </div>
        )}

        {(onShowPhonetics || onShowUnderstanding) && (
          <div className="flex items-center gap-1 pl-1 border-l border-zinc-200 dark:border-zinc-800">
            {onShowPhonetics && (
              <button
                onClick={onShowPhonetics}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                title="查看难词注音"
              >
                <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden md:inline">注音</span>
              </button>
            )}
            {onShowUnderstanding && (
              <button
                onClick={onShowUnderstanding}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                title="查看理解大意"
              >
                <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden md:inline">大意</span>
              </button>
            )}
          </div>
        )}

        {actions && (
          <div className="flex items-center gap-1.5 pl-1 border-l border-zinc-200 dark:border-zinc-800">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
