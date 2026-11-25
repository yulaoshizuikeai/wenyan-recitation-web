/**
 * CramReferenceList — quick-reference list/table subcomponent for CramModeView.
 * Supports blur-masking for eye-movement self-testing, per-item reveal toggles,
 * TTS pronunciation, exam key points, and quick rating buttons.
 */
import React from "react";
import {
  Volume2,
  Check,
  AlertTriangle,
  HelpCircle,
  XCircle,
} from "lucide-react";
import { GoldenVerse } from "../../data/goldenVersesData";
import { CramRating } from "./CramCardPractice";

interface CramReferenceListProps {
  verses: GoldenVerse[];
  ratings: Record<string, CramRating>;
  isListMasked: boolean;
  revealedIds: Set<string>;
  onToggleReveal: (verseId: string) => void;
  onRate: (verseId: string, rating: CramRating) => void;
  onSpeak: (text: string, e?: React.MouseEvent) => void;
}

export const CramReferenceList: React.FC<CramReferenceListProps> = ({
  verses,
  ratings,
  isListMasked,
  revealedIds,
  onToggleReveal,
  onRate,
  onSpeak,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 text-xs text-zinc-400">
        <span>
          共收录 <strong>{verses.length}</strong> 句核心金句
        </span>
        {isListMasked && (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">
            提示：自测模式已开启，悬浮或点击金句区域即可揭晓
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {verses.map((item) => {
          const currentRating = ratings[item.id];
          const isRevealed = !isListMasked || revealedIds.has(item.id);

          return (
            <div
              key={item.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                {/* Left: Article info & Scenario Clue */}
                <div className="space-y-2 lg:max-w-md">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.articleTitle}
                    </span>
                    <span className="text-zinc-400">· {item.author}</span>
                    <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono text-[10px]">
                      {item.moduleName}
                    </span>
                    {item.isGaoKao72 && (
                      <span className="px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-bold text-[10px]">
                        72篇
                      </span>
                    )}
                  </div>

                  {/* Scenario Clue */}
                  <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed">
                    {item.contextClue}
                  </p>

                  {/* Scenario Tags */}
                  <div className="flex flex-wrap items-center gap-1">
                    {item.scenarioTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.2 rounded bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60 text-[10px] text-zinc-500 font-mono"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Right: Golden Verse & Key Points */}
                <div className="flex-1 space-y-2">
                  <div
                    onClick={() => {
                      if (isListMasked) {
                        onToggleReveal(item.id);
                      }
                    }}
                    className={`p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 cursor-pointer transition-all ${
                      !isRevealed ? "select-none group" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 text-[11px] text-zinc-400">
                      <span>核心金句</span>
                      <button
                        onClick={(e) => onSpeak(item.verse, e)}
                        className="hover:text-zinc-700 dark:hover:text-zinc-200"
                        title="朗读"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div
                      className={`font-classical text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 leading-relaxed tracking-wide transition-all ${
                        !isRevealed
                          ? "filter blur-sm group-hover:blur-none opacity-40 group-hover:opacity-100"
                          : ""
                      }`}
                    >
                      {item.verse}
                    </div>

                    {!isRevealed && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-sans">
                        (遮挡自测中 · 点击或悬浮即可显露)
                      </div>
                    )}
                  </div>

                  {/* Exam Key Points */}
                  {item.examKeyPoints.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                      {item.examKeyPoints.map((pt, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40"
                        >
                          {pt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Rating Selector */}
                <div className="flex lg:flex-col items-center gap-1 shrink-0 pt-1 lg:pt-0">
                  <button
                    onClick={() => onRate(item.id, "stuck")}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                      currentRating === "stuck"
                        ? "bg-red-500 text-white shadow-2xs"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    }`}
                    title="标记为卡壳"
                  >
                    <XCircle className="w-3 h-3" />
                    <span>卡壳</span>
                  </button>

                  <button
                    onClick={() => onRate(item.id, "doubt")}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                      currentRating === "doubt"
                        ? "bg-amber-500 text-white shadow-2xs"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40"
                    }`}
                    title="标记为存疑"
                  >
                    <HelpCircle className="w-3 h-3" />
                    <span>存疑</span>
                  </button>

                  <button
                    onClick={() => onRate(item.id, "mastered")}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                      currentRating === "mastered"
                        ? "bg-emerald-500 text-white shadow-2xs"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40"
                    }`}
                    title="标记为牢固"
                  >
                    <Check className="w-3 h-3" />
                    <span>牢固</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
