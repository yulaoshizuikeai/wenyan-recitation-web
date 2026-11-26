/**
 * CramCardPractice — flashcard/cram card practice subcomponent for CramModeView.
 * Renders the progress header/bar, 3D flip card (context clue on front, verse +
 * highlightPart + examKeyPoints on back), and bottom action dock (prev, 1/2/3 ratings, next).
 */
import React from "react";
import {
  Sparkles,
  Volume2,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  HelpCircle,
  XCircle,
} from "lucide-react";
import { GoldenVerse } from "../../data/goldenVersesData";

export type CramRating = "stuck" | "doubt" | "mastered";

interface CramCardPracticeProps {
  currentVerse: GoldenVerse;
  currentIndex: number;
  totalCount: number;
  isFlipped: boolean;
  currentRating?: CramRating;
  onFlip: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRateAndAdvance: (verseId: string, rating: CramRating) => void;
  onSpeak: (text: string, e?: React.MouseEvent) => void;
}

export const CramCardPractice: React.FC<CramCardPracticeProps> = ({
  currentVerse,
  currentIndex,
  totalCount,
  isFlipped,
  currentRating,
  onFlip,
  onPrev,
  onNext,
  onRateAndAdvance,
  onSpeak,
}) => {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Card Top Progress */}
      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {currentVerse.articleTitle}
          </span>
          <span>·</span>
          <span>{currentVerse.author}</span>
          <span className="text-[11px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            {currentVerse.moduleName}
          </span>
          {currentVerse.isGaoKao72 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-bold">
              72篇
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 font-mono">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {currentIndex + 1}
          </span>
          <span>/</span>
          <span>{totalCount}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-200"
          style={{ width: `${((currentIndex + 1) / totalCount) * 100}%` }}
        />
      </div>

      {/* 3D Flip Card */}
      <div
        className="w-full min-h-[380px] cursor-pointer perspective-1000 select-none"
        onClick={onFlip}
      >
        <div
          className={`relative w-full min-h-[380px] grid grid-cols-1 grid-rows-1 transition-transform duration-500 transform-style-3d ${
            isFlipped ? "rotate-y-180" : ""
          }`}
        >
          {/* Card Front: Context Clue */}
          <div
            aria-hidden={isFlipped}
            className={`col-start-1 row-start-1 w-full h-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-2xl p-6 sm:p-8 flex flex-col justify-between backface-hidden ${
              isFlipped ? "pointer-events-none" : ""
            }`}
          >
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                <HelpCircle className="w-3.5 h-3.5" />
                理解性默写 · 情境导引
              </span>
              <span className="text-[11px] text-zinc-400">轻触翻转看金句</span>
            </div>

            <div className="my-auto py-4 text-center space-y-4">
              <p className="text-lg sm:text-2xl font-sans font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed max-w-xl mx-auto">
                {currentVerse.contextClue}
              </p>

              {/* Scenario Tags */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                {currentVerse.scenarioTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-mono"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="text-center text-xs text-zinc-400 dark:text-zinc-500 flex items-center justify-center gap-2">
              <span>点击卡片或按空格揭晓金句与字形警示</span>
            </div>
          </div>

          {/* Card Back: Verse & Key Points */}
          <div
            aria-hidden={!isFlipped}
            className={`col-start-1 row-start-1 w-full h-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-2xl p-6 sm:p-8 flex flex-col justify-between rotate-y-180 backface-hidden ${
              !isFlipped ? "pointer-events-none" : ""
            }`}
          >
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5 font-semibold text-red-600 dark:text-red-400">
                <Sparkles className="w-3.5 h-3.5" />
                高考核心金句
              </span>

              <button
                onClick={(e) => onSpeak(currentVerse.verse, e)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                title="朗读发音"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            <div className="my-auto py-3 space-y-5 text-center">
              {/* Classical Sentence */}
              <div className="text-xl sm:text-2xl font-classical font-semibold text-zinc-950 dark:text-zinc-50 leading-relaxed tracking-wide px-2">
                {currentVerse.verse}
              </div>

              {/* Highlight Part Pill if exists */}
              {currentVerse.highlightPart && (
                <div className="inline-block px-3 py-1 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 font-medium">
                  <span>核心采分点：</span>
                  <strong className="underline underline-offset-4 decoration-red-500">
                    {currentVerse.highlightPart}
                  </strong>
                </div>
              )}

              {/* Exam Key Points / Typos */}
              {currentVerse.examKeyPoints.length > 0 && (
                <div className="max-w-md mx-auto p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-left space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>字形排雷与考点提示</span>
                  </div>
                  <ul className="text-xs text-amber-900 dark:text-amber-200/90 space-y-1 pl-4 list-disc">
                    {currentVerse.examKeyPoints.map((pt, idx) => (
                      <li key={idx} className="leading-snug">
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Rating State Pill */}
            <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-[11px]">
                当前状态:{" "}
                {currentRating === "mastered" ? (
                  <strong className="text-emerald-600">已牢固</strong>
                ) : currentRating === "doubt" ? (
                  <strong className="text-amber-600">存疑</strong>
                ) : currentRating === "stuck" ? (
                  <strong className="text-red-600">卡壳</strong>
                ) : (
                  <span className="text-zinc-400">未标记</span>
                )}
              </span>
              <span className="text-[11px] text-zinc-400">1/2/3 快捷打标并切下一句</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Dock: Rating Buttons + Prev/Next */}
      <div className="grid grid-cols-5 gap-2 pt-1">
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs font-medium flex items-center justify-center gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">上一句</span>
        </button>

        <button
          onClick={() => onRateAndAdvance(currentVerse.id, "stuck")}
          className="py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors active:scale-95"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>卡壳 (1)</span>
        </button>

        <button
          onClick={() => onRateAndAdvance(currentVerse.id, "doubt")}
          className="py-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors active:scale-95"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>存疑 (2)</span>
        </button>

        <button
          onClick={() => onRateAndAdvance(currentVerse.id, "mastered")}
          className="py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors active:scale-95"
        >
          <Check className="w-3.5 h-3.5" />
          <span>牢固 (3)</span>
        </button>

        <button
          onClick={onNext}
          className="py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs font-medium flex items-center justify-center gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <span className="hidden sm:inline">下一句</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
