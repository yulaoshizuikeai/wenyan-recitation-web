import React from "react";
import { LastSessionState, formatRelativeTime } from "../storage/sessionTracker";
import { NavView } from "./Navbar";
import {
  RotateCcw,
  Play,
  Clock,
  ArrowRight,
  Layers,
  Sparkles,
  Eye,
  Flame,
  BookOpen,
  HelpCircle,
  BarChart2,
  X
} from "lucide-react";

export function getModeIcon(view: NavView, className = "w-4 h-4") {
  switch (view) {
    case "snowball":
      return <Layers className={className} />;
    case "flipcard":
      return <Sparkles className={className} />;
    case "cloze":
      return <Eye className={className} />;
    case "cram":
      return <Flame className={`${className} text-red-500`} />;
    case "scenario":
      return <HelpCircle className={className} />;
    case "catalog":
      return <BookOpen className={className} />;
    default:
      return <BarChart2 className={className} />;
  }
}

interface PickUpCardProps {
  session: LastSessionState;
  onResume: (session: LastSessionState) => void;
  onRestart?: (session: LastSessionState) => void;
  onDismiss?: () => void;
  variant?: "hero" | "banner" | "compact";
  className?: string;
}

export const PickUpCard: React.FC<PickUpCardProps> = ({
  session,
  onResume,
  onRestart,
  onDismiss,
  variant = "hero",
  className = ""
}) => {
  const percent = Math.min(100, Math.max(0, session.progressPercent ?? 0));

  // Variant: Banner (Compact horizontal strip for CatalogView or top headers)
  if (variant === "banner") {
    return (
      <div
        className={`bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition-colors ${className}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            {getModeIcon(session.view, "w-4 h-4")}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">上次研读</span>
              <span>·</span>
              <span className="font-mono">{session.modeName}</span>
              <span>·</span>
              <span className="flex items-center gap-0.5 text-zinc-400">
                <Clock className="w-3 h-3" />
                <span>{formatRelativeTime(session.updatedAt)}</span>
              </span>
            </div>

            <div className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5 mt-0.5">
              {session.articleTitle && (
                <span className="font-classical">《{session.articleTitle}》</span>
              )}
              {session.articleAuthor && (
                <span className="text-[11px] font-normal text-zinc-400">
                  {session.articleDynasty ? `〔${session.articleDynasty}〕` : ""}{session.articleAuthor}
                </span>
              )}
              <span className="text-zinc-300 dark:text-zinc-700">|</span>
              <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                {session.progressText}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            onClick={() => onResume(session)}
            className="py-1.5 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98]"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>继续上次进度</span>
          </button>

          {onDismiss && (
            <button
              onClick={onDismiss}
              title="隐藏"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Variant: Compact (Inline notice when resumed inside a view)
  if (variant === "compact") {
    return (
      <div
        className={`bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-700 dark:text-zinc-300 ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          <span className="truncate">
            已恢复至上次进度：<strong>{session.progressText}</strong>
          </span>
          <span className="text-zinc-400 text-[11px] shrink-0 font-mono">
            ({formatRelativeTime(session.updatedAt)})
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRestart && (
            <button
              onClick={() => onRestart(session)}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline underline-offset-2 flex items-center gap-0.5"
            >
              <RotateCcw className="w-3 h-3" />
              <span>从头开始</span>
            </button>
          )}

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const isCompleted = percent >= 100;

  // Variant: Hero (Prominent centerpiece for DashboardView)
  return (
    <div
      className={`relative overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-2xl p-5 sm:p-6 shadow-xs transition-all ${className}`}
    >
      {/* Subtle crimson accent left border indicator */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isCompleted ? "bg-emerald-500 dark:bg-emerald-400" : "bg-red-600 dark:bg-red-500"}`} />

      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2 mb-3.5 pl-1">
        <div className="flex flex-wrap items-center gap-2">
          {isCompleted ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-900/50 text-xs font-semibold">
              <RotateCcw className="w-3 h-3" />
              <span>全篇贯通结业 · 支持重温</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200/80 dark:border-red-900/50 text-xs font-semibold">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>继续上次研习 · 接续进度</span>
            </span>
          )}

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-medium">
            {getModeIcon(session.view, "w-3 h-3")}
            <span>{session.modeName}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatRelativeTime(session.updatedAt)}</span>
          </span>

          {onDismiss && (
            <button
              onClick={onDismiss}
              title="清除上次进度提示"
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Article Title & Author */}
      <div className="pl-1 mb-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-xl sm:text-2xl font-classical font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {session.articleTitle ? `《${session.articleTitle}》` : session.modeName}
          </h2>

          {(session.articleAuthor || session.articleDynasty) && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-sans">
              {session.articleDynasty ? `〔${session.articleDynasty}〕` : ""}{session.articleAuthor}
            </span>
          )}
        </div>
      </div>

      {/* Progress Breakdown & Visual Bar */}
      <div className="pl-1 space-y-1.5 mb-4">
        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span>{isCompleted ? "通篇状态：" : "当前停留："}</span>
            <strong className="text-zinc-800 dark:text-zinc-200 font-semibold font-sans">
              {session.progressText}
            </strong>
          </span>
          <span className={`font-mono font-bold text-sm ${isCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {percent}%
          </span>
        </div>

        <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isCompleted ? "bg-emerald-500 dark:bg-emerald-400" : "bg-red-600 dark:bg-red-500"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pl-1 pt-1 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => (isCompleted && onRestart ? onRestart(session) : onResume(session))}
          className={`py-2.5 px-4 sm:px-5 rounded-xl active:scale-[0.98] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs transition-all ${
            isCompleted
              ? "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {isCompleted ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" />
              <span>从头重温全篇</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-80" />
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>接续上次进度</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-80" />
            </>
          )}
        </button>

        {!isCompleted && onRestart && (
          <button
            onClick={() => onRestart(session)}
            className="py-2.5 px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            <span>从头开始</span>
          </button>
        )}
      </div>
    </div>
  );
};
