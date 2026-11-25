/**
 * FlipCardBody — renders the 3D flip card, progress bar/header, rating buttons,
 * per-card FSRS interval badges, on-demand precedingClauseHint (L2.2),
 * paragraphGist + backPhonetics (L2.1), and optional TypingRecallInput (L2.3).
 *
 * All state is owned by FlipCardView (via useFlipCardSession); this component
 * is purely presentational.
 */
import React from "react";
import {
  RotateCw,
  CheckCircle,
  RotateCcw,
  X,
  Lightbulb,
  Keyboard,
  ListOrdered,
  Volume2,
} from "lucide-react";
import { Flashcard } from "../../data/flashcardGenerator";
import { Rating } from "../../domain/fsrs/fsrsTypes";
import { TypingRecallInput } from "../TypingRecallInput";

export interface FlipCardBodyProps {
  currentFlashcard: Flashcard;
  currentIndex: number;
  totalCards: number;
  remainingInSession: number;
  isFlipped: boolean;
  intervalBadges: Record<Rating, string>;
  hasRestoredNotice: boolean;
  onFlip: () => void;
  onRate: (rating: Rating) => void;
  onResetIndex: () => void;
  onDismissRestoredNotice: () => void;
  // Track L2.2 & L2.3 optional controls
  showPrecedingHint?: boolean;
  onTogglePrecedingHint?: () => void;
  typingMode?: boolean;
  onToggleTypingMode?: () => void;
  sequentialMode?: boolean;
  onToggleSequentialMode?: () => void;
}

export const FlipCardBody: React.FC<FlipCardBodyProps> = ({
  currentFlashcard,
  currentIndex,
  totalCards,
  remainingInSession,
  isFlipped,
  intervalBadges,
  hasRestoredNotice,
  onFlip,
  onRate,
  onResetIndex,
  onDismissRestoredNotice,
  showPrecedingHint = false,
  onTogglePrecedingHint,
  typingMode = false,
  onToggleTypingMode,
  sequentialMode = false,
  onToggleSequentialMode,
}) => {
  const cleanAnswer = currentFlashcard.backAnswer.replace(/【填空正解】/g, "");
  const contextExplanation = currentFlashcard.paragraphGist || currentFlashcard.backTranslation;
  const contextLabel = currentFlashcard.paragraphGist ? "【段落串讲】" : "【大意】";
  const phonetics = currentFlashcard.backPhonetics || [];

  return (
    <>
      {/* Progress Restored Toast */}
      {hasRestoredNotice && currentIndex > 0 && totalCards > 0 && (
        <div className="mb-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              已接续闪卡进度至<strong>第 {currentIndex + 1} 张</strong>（共 {totalCards} 张）
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onResetIndex}
              className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 underline underline-offset-2 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>从第 1 张开始</span>
            </button>
            <button
              onClick={onDismissRestoredNotice}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Progress Header + L2.2/L2.3 Mode Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">
          第 <strong>{currentIndex + 1}</strong> / {totalCards} 张
          {remainingInSession > 0 && (
            <span className="text-[11px] text-zinc-400 ml-1.5 font-mono">
              (剩余 {remainingInSession} 张)
            </span>
          )}
        </span>

        <div className="flex items-center gap-1.5">
          {onToggleSequentialMode && (
            <button
              type="button"
              onClick={onToggleSequentialMode}
              title="按课文段落顺序连背"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                sequentialMode
                  ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-100"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <ListOrdered className="w-3 h-3" />
              <span>语序连背</span>
            </button>
          )}
          {onToggleTypingMode && (
            <button
              type="button"
              onClick={onToggleTypingMode}
              title="开启手打盲默字形校验"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                typingMode
                  ? "bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:border-sky-500"
                  : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Keyboard className="w-3 h-3" />
              <span>手打盲默</span>
            </button>
          )}
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono hidden md:inline ml-1">
            空格翻卡 ｜ 1-4 评分
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-300 ease-out"
          style={{ width: `${Math.round(((currentIndex + 1) / Math.max(1, totalCards)) * 100)}%` }}
        />
      </div>

      {/* 3D Flip Card Container */}
      <div
        onClick={onFlip}
        className="perspective-1000 min-h-[300px] sm:min-h-[340px] cursor-pointer mb-5 select-none group"
      >
        <div
          className={`relative w-full h-full min-h-[300px] sm:min-h-[340px] rounded-2xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 group-hover:border-zinc-300 dark:group-hover:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm group-hover:shadow-md transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] transform-style-3d flex flex-col justify-between ${
            isFlipped ? "rotate-y-180" : ""
          }`}
        >
          {/* Front Face */}
          {!isFlipped ? (
            <div className="flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
                  <span className="font-medium">{currentFlashcard.frontTitle}</span>
                  <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 font-mono text-[10px]">
                    {currentFlashcard.frontHint}
                  </span>
                </div>

                {/* On-demand Preceding Clause Hint (Track L2.2) */}
                {currentFlashcard.precedingClauseHint && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mb-3 flex flex-col items-center gap-1.5"
                  >
                    {showPrecedingHint ? (
                      <div className="w-full px-3 py-2 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-200 text-center font-classical">
                        <span className="font-sans text-[11px] text-amber-600 dark:text-amber-400 mr-1.5">
                          【前句引子】
                        </span>
                        {currentFlashcard.precedingClauseHint}
                      </div>
                    ) : (
                      onTogglePrecedingHint && (
                        <button
                          type="button"
                          onClick={onTogglePrecedingHint}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-zinc-800/60 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-300 dark:hover:border-amber-800 transition-colors"
                        >
                          <Lightbulb className="w-3 h-3" />
                          <span>提示上一句 (H)</span>
                        </button>
                      )
                    )}
                  </div>
                )}

                <div className="my-6 text-center space-y-3">
                  <p className="text-xl sm:text-2xl font-classical font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed tracking-wide">
                    {currentFlashcard.frontPrompt}
                  </p>
                </div>

                {/* Optional Typing Recall Input (Track L2.3) */}
                {typingMode && (
                  <div className="mt-4">
                    <TypingRecallInput expectedAnswer={cleanAnswer} />
                  </div>
                )}
              </div>

              <div className="text-center pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>点击翻转卡片 或 按空格键查看正解</span>
                </span>
              </div>
            </div>
          ) : (
            /* Back Face */
            <div className="flex flex-col justify-between h-full space-y-4 rotate-y-180">
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-3">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>背诵正解</span>
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {currentFlashcard.frontTitle}
                  </span>
                </div>

                <div className="my-4 text-center">
                  <p className="text-xl sm:text-2xl font-classical font-semibold text-emerald-700 dark:text-emerald-400 leading-relaxed tracking-wide bg-emerald-50/50 dark:bg-emerald-950/20 py-4 px-3 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                    {cleanAnswer}
                  </p>
                </div>

                {/* Matched Phonetics & Tongjia tags (Track L2.1) */}
                {phonetics.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {phonetics.map((p, idx) => (
                      <span
                        key={`${p.word}_${idx}`}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] ${
                          p.isTongjia
                            ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300"
                            : "bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200/80 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <Volume2 className="w-3 h-3 opacity-60 shrink-0" />
                        <strong className="font-classical">{p.word}</strong>
                        <span className="font-mono text-[10px] opacity-80">[{p.pinyin}]</span>
                        <span className="opacity-85">· {p.meaning}</span>
                        {p.isTongjia && (
                          <span className="px-1 py-0.2 rounded bg-amber-200/70 dark:bg-amber-900/60 text-[9px] font-semibold">
                            通假/破读
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {/* Paragraph Gist / Fallback Translation (Track L2.1) */}
                {contextExplanation && (
                  <div className="mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-classical">
                    <span className="font-sans font-medium text-zinc-400 mr-1.5">
                      {contextLabel}
                    </span>
                    {contextExplanation}
                  </div>
                )}
              </div>

              <div className="text-center pt-2 text-[11px] text-zinc-400 font-mono">
                点击下方按钮 或 键盘按 1 / 2 / 3 / 4 评分
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FSRS 4-Grade Rating Entry */}
      {isFlipped ? (
        <div className="grid grid-cols-4 gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            onClick={() => onRate(Rating.AGAIN)}
            className="flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors group"
          >
            <span className="text-xs font-semibold flex items-center gap-1">
              <span className="opacity-60 text-[10px]">[1]</span> 重来
            </span>
            <span className="text-[10px] text-red-500 dark:text-red-400 font-mono mt-0.5">
              {intervalBadges[Rating.AGAIN]}
            </span>
          </button>

          <button
            onClick={() => onRate(Rating.HARD)}
            className="flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors group"
          >
            <span className="text-xs font-semibold flex items-center gap-1">
              <span className="opacity-60 text-[10px]">[2]</span> 困难
            </span>
            <span className="text-[10px] text-amber-500 dark:text-amber-400 font-mono mt-0.5">
              {intervalBadges[Rating.HARD]}
            </span>
          </button>

          <button
            onClick={() => onRate(Rating.GOOD)}
            className="flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors group"
          >
            <span className="text-xs font-semibold flex items-center gap-1">
              <span className="opacity-60 text-[10px]">[3]</span> 良好
            </span>
            <span className="text-[10px] text-sky-500 dark:text-sky-400 font-mono mt-0.5">
              {intervalBadges[Rating.GOOD]}
            </span>
          </button>

          <button
            onClick={() => onRate(Rating.EASY)}
            className="flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors group"
          >
            <span className="text-xs font-semibold flex items-center gap-1">
              <span className="opacity-60 text-[10px]">[4]</span> 简单
            </span>
            <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-mono mt-0.5">
              {intervalBadges[Rating.EASY]}
            </span>
          </button>
        </div>
      ) : (
        <button
          onClick={onFlip}
          className="w-full py-3 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] transition-all shadow-xs"
        >
          <RotateCw className="w-4 h-4" />
          <span>显示对句答案 (Space / Enter)</span>
        </button>
      )}
    </>
  );
};
