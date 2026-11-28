/**
 * TypingRecallInput — Track L2.3 reusable typing recall input for FlipCard & Cloze L1.
 * Normalizes punctuation/whitespace, handles Chinese IME composition cleanly,
 * isolates keyboard events from global shortcuts, and renders per-character feedback.
 */
import React, { useState, useEffect, useRef } from "react";
import { Check, RotateCcw, Keyboard } from "lucide-react";
import { sound } from "../sound/audioSynthesizer";
import { evaluateScenarioAnswer, DiffChar } from "../domain/scenario/diffEngine";

export function normalizeRecallText(text: string): string {
  return text
    .replace(/[\s，。！？；：、“”‘’（）()【】\[\]《》〈〉—…·,.;:!?'"`~]/g, "")
    .trim();
}

export interface TypingRecallInputProps {
  expectedAnswer: string;
  placeholder?: string;
  successHint?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onResult?: (isCorrect: boolean, userInput: string) => void;
  onSubmitCorrect?: () => void;
  className?: string;
}

function evaluateChars(typedRaw: string, expectedRaw: string): {
  isMatch: boolean;
  diffs: DiffChar[];
} {
  const typed = normalizeRecallText(typedRaw);
  const expected = normalizeRecallText(expectedRaw);
  const summary = evaluateScenarioAnswer(typed, expected);
  return {
    isMatch: typed.length > 0 && summary.isMatch,
    diffs: summary.diffs
  };
}

export const TypingRecallInput: React.FC<TypingRecallInputProps> = ({
  expectedAnswer,
  placeholder = "手打盲默正解（自动忽略标点，Enter 核对）...",
  successHint = "字形完全正确！",
  autoFocus = false,
  disabled = false,
  compact = false,
  onResult,
  onSubmitCorrect,
  className = "",
}) => {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset whenever target answer changes
  useEffect(() => {
    setValue("");
    setSubmitted(false);
  }, [expectedAnswer]);

  const evaluation = submitted ? evaluateChars(value, expectedAnswer) : null;

  const handleSubmit = () => {
    if (disabled || !normalizeRecallText(value)) return;
    const res = evaluateChars(value, expectedAnswer);
    setSubmitted(true);
    if (res.isMatch) {
      inputRef.current?.blur();
      sound.playCorrect();
      onResult?.(true, value);
      onSubmitCorrect?.();
    } else {
      sound.playWrong();
      onResult?.(false, value);
    }
  };

  const handleReset = () => {
    setValue("");
    setSubmitted(false);
    inputRef.current?.focus();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`w-full text-left ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Keyboard className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            autoFocus={autoFocus}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => {
              setValue(e.target.value);
              if (submitted) setSubmitted(false);
            }}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.nativeEvent.isComposing || e.keyCode === 229 || isComposing) return;
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className={`w-full pl-8.5 pr-3 ${
              compact ? "py-1.5 text-xs" : "py-2 text-sm"
            } rounded-xl border bg-zinc-50 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-classical focus:outline-hidden focus:ring-2 transition-colors ${
              evaluation
                ? evaluation.isMatch
                  ? "border-emerald-400 dark:border-emerald-700 focus:ring-emerald-500/30"
                  : "border-red-400 dark:border-red-700 focus:ring-red-500/30"
                : "border-zinc-200 dark:border-zinc-700 focus:ring-zinc-400/40"
            }`}
          />
        </div>

        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || !normalizeRecallText(value)}
            className={`shrink-0 ${
              compact ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-xs"
            } rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-40 transition-colors`}
          >
            核对
          </button>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            className={`shrink-0 ${
              compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-xs"
            } rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors`}
            title="重写"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重填</span>
          </button>
        )}
      </div>

      {/* Instant Character Feedback */}
      {evaluation && (
        <div
          className={`mt-2 px-3 py-2 rounded-xl border text-xs ${
            evaluation.isMatch
              ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300"
              : "bg-red-50/60 dark:bg-red-950/25 border-red-200 dark:border-red-900/50 text-zinc-700 dark:text-zinc-300"
          }`}
        >
          {evaluation.isMatch ? (
            <div className="flex items-center gap-1.5 font-medium">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{successHint}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-red-600 dark:text-red-400">
                字形核对有误（绿=对，红=错，黄=漏，紫=多）：
              </div>
              <div className="flex flex-wrap items-center gap-1 font-classical text-sm">
                {evaluation.diffs.map((d, idx) => {
                  if (d.status === "correct") {
                    return (
                      <span
                        key={idx}
                        className="px-1 rounded bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                      >
                        {d.char}
                      </span>
                    );
                  }
                  if (d.status === "wrong") {
                    return (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-0.5 px-1 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                      >
                        <span className="line-through opacity-60">{d.char}</span>
                        <span className="font-semibold">{d.expected}</span>
                      </span>
                    );
                  }
                  if (d.status === "missing") {
                    return (
                      <span
                        key={idx}
                        className="px-1 rounded border border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                      >
                        {d.expected}
                      </span>
                    );
                  }
                  return (
                    <span
                      key={idx}
                      className="px-1 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 line-through"
                    >
                      {d.char}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
