import React, { useState, useMemo, useEffect } from "react";
import { GAOKAO_SCENARIO_QUESTIONS, GaoKaoScenarioQuestion } from "../data/scenarioData";
import { ALL_ARTICLES } from "../data/curriculumData";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { StudySidebar } from "../components/StudySidebar";
import { saveLastSession, SessionExtra } from "../storage/sessionTracker";
import {
  HelpCircle,
  Check,
  ArrowRight,
  RotateCcw,
  AlertCircle,
  Layers,
  ChevronRight,
  X,
  Trophy
} from "lucide-react";

interface DiffChar {
  char: string;
  expected?: string;
  status: "correct" | "wrong" | "missing";
}

interface ScenarioViewProps {
  resumeExtra?: SessionExtra;
}

export const ScenarioView: React.FC<ScenarioViewProps> = ({ resumeExtra }) => {
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (resumeExtra?.scenarioQuestionIndex !== undefined && resumeExtra.scenarioQuestionIndex > 0) {
      return Math.min(resumeExtra.scenarioQuestionIndex, Math.max(0, GAOKAO_SCENARIO_QUESTIONS.length - 1));
    }
    return 0;
  });

  const [hasRestoredNotice, setHasRestoredNotice] = useState(() => {
    return resumeExtra?.scenarioQuestionIndex !== undefined && resumeExtra.scenarioQuestionIndex > 0;
  });

  useEffect(() => {
    if (resumeExtra?.scenarioQuestionIndex !== undefined && resumeExtra.scenarioQuestionIndex >= 0) {
      const clamped = Math.min(resumeExtra.scenarioQuestionIndex, Math.max(0, GAOKAO_SCENARIO_QUESTIONS.length - 1));
      setCurrentIndex(clamped);
      setHasRestoredNotice(clamped > 0);
    }
  }, [resumeExtra]);

  const [wrongQuestionIndices, setWrongQuestionIndices] = useState<number[] | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  const activeQuestions = useMemo(() => {
    if (!wrongQuestionIndices) return GAOKAO_SCENARIO_QUESTIONS;
    return wrongQuestionIndices
      .map(idx => GAOKAO_SCENARIO_QUESTIONS[idx])
      .filter(Boolean);
  }, [wrongQuestionIndices]);

  // Keep currentIndex clamped in bounds
  useEffect(() => {
    if (currentIndex >= activeQuestions.length && activeQuestions.length > 0) {
      setCurrentIndex(activeQuestions.length - 1);
    }
  }, [currentIndex, activeQuestions.length]);

  const [userInput, setUserInput] = useState("");
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [isEvaluated, setIsEvaluated] = useState(false);
  const [answeredMap, setAnsweredMap] = useState<Map<number, boolean>>(new Map()); // index -> isCorrect
  const [showQuestionDrawer, setShowQuestionDrawer] = useState(false);

  const currentQ: GaoKaoScenarioQuestion = activeQuestions[currentIndex] || activeQuestions[0] || GAOKAO_SCENARIO_QUESTIONS[0];

  // Synchronize session tracker
  useEffect(() => {
    if (!currentQ || wrongQuestionIndices !== null) return;
    const relatedArticle = ALL_ARTICLES.find(a => a.id === currentQ.articleId);
    saveLastSession({
      view: "scenario",
      articleId: currentQ.articleId,
      articleTitle: currentQ.articleTitle,
      articleAuthor: currentQ.author,
      articleDynasty: relatedArticle?.dynasty || "",
      modeName: "高考默写",
      progressText: `第 ${currentIndex + 1} / ${GAOKAO_SCENARIO_QUESTIONS.length} 题`,
      progressPercent: Math.min(100, Math.round(((currentIndex + 1) / GAOKAO_SCENARIO_QUESTIONS.length) * 100)),
      updatedAt: Date.now(),
      extra: {
        scenarioQuestionIndex: currentIndex,
        totalCards: GAOKAO_SCENARIO_QUESTIONS.length
      }
    });
  }, [currentIndex, currentQ, wrongQuestionIndices]);

  // Character-by-character diff engine
  const diffResult = useMemo<DiffChar[]>(() => {
    if (!isEvaluated) return [];

    const normUser = userInput.replace(/[，。？！；：、“”‘’\s]/g, "");
    const normAns = currentQ.answer.replace(/[，。？！；：、“”‘’\s]/g, "");

    const diffs: DiffChar[] = [];
    const maxLen = Math.max(normUser.length, normAns.length);

    for (let i = 0; i < maxLen; i++) {
      const uChar = normUser[i];
      const aChar = normAns[i];

      if (uChar && aChar) {
        if (uChar === aChar) {
          diffs.push({ char: uChar, status: "correct" });
        } else {
          diffs.push({ char: uChar, expected: aChar, status: "wrong" });
        }
      } else if (!uChar && aChar) {
        diffs.push({ char: "_", expected: aChar, status: "missing" });
      } else if (uChar && !aChar) {
        diffs.push({ char: uChar, status: "wrong" });
      }
    }
    return diffs;
  }, [isEvaluated, userInput, currentQ.answer]);

  const handleVerify = () => {
    setIsEvaluated(true);
    setIsAnswerRevealed(true);

    const normUser = userInput.replace(/[，。？！；：、“”‘’\s]/g, "");
    const normAns = currentQ.answer.replace(/[，。？！；：、“”‘’\s]/g, "");

    const isMatch = normUser === normAns;
    if (isMatch) {
      sound.playCorrect();
    } else {
      sound.playWrong();
    }

    setAnsweredMap(prev => {
      const next = new Map(prev);
      next.set(currentIndex, isMatch);
      return next;
    });
  };

  const handleNext = () => {
    if (currentIndex + 1 < activeQuestions.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      sound.playCelebration();
      fireConfetti();
      setIsCompleted(true);
    }
    setUserInput("");
    setIsAnswerRevealed(false);
    setIsEvaluated(false);
  };

  const handleRestartAll = () => {
    setWrongQuestionIndices(null);
    setCurrentIndex(0);
    setAnsweredMap(new Map());
    setUserInput("");
    setIsAnswerRevealed(false);
    setIsEvaluated(false);
    setIsCompleted(false);
    setHasRestoredNotice(false);
  };

  const wrongIndices = useMemo(() => {
    const list: number[] = [];
    answeredMap.forEach((isCorrect, idx) => {
      if (!isCorrect) {
        const globalIdx = wrongQuestionIndices ? wrongQuestionIndices[idx] : idx;
        if (globalIdx !== undefined) list.push(globalIdx);
      }
    });
    return list;
  }, [answeredMap, wrongQuestionIndices]);

  const handleRetryWrong = () => {
    if (wrongIndices.length === 0) return;
    setWrongQuestionIndices(wrongIndices);
    setCurrentIndex(0);
    setAnsweredMap(new Map());
    setUserInput("");
    setIsAnswerRevealed(false);
    setIsEvaluated(false);
    setIsCompleted(false);
    setHasRestoredNotice(false);
  };

  const insertPunctuation = (punct: string) => {
    setUserInput(prev => prev + punct);
  };

  // PC 键盘操作：Ctrl/Cmd + Enter 在输入框内提交，Enter 在卡片区提交或进入下一题
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const inInput =
        e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (!isAnswerRevealed && userInput.trim()) {
          e.preventDefault();
          handleVerify();
        }
        return;
      }

      if (inInput || showQuestionDrawer || isCompleted) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.code === "Enter" || e.code === "NumpadEnter") {
        if (!isAnswerRevealed) {
          if (!userInput.trim()) return;
          e.preventDefault();
          handleVerify();
        } else {
          e.preventDefault();
          handleNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAnswerRevealed, userInput, showQuestionDrawer, isCompleted]);

  const totalAnswered = answeredMap.size;
  const correctCount = Array.from(answeredMap.values()).filter(Boolean).length;
  const accuracyPercent = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

  return (
      <div className="max-w-2xl xl:max-w-5xl mx-auto px-4 py-5 pb-24">
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_288px] xl:gap-6 xl:items-start">
      <div className="min-w-0">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4 text-xs">
        <button
          onClick={() => setShowQuestionDrawer(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors font-medium"
        >
          <Layers className="w-3.5 h-3.5 text-zinc-500" />
          <span>题号索引：第 {currentIndex + 1} / {activeQuestions.length} 题</span>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
        </button>

        <div className="text-zinc-500 dark:text-zinc-400 font-mono">
          已答 {totalAnswered} 题 ｜ 正确率：
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {accuracyPercent}%
          </span>
        </div>
      </div>

      {/* Progress Restored Toast */}
      {hasRestoredNotice && currentIndex > 0 && (
        <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>已接续高考默写进度至<strong>第 {currentIndex + 1} 题</strong>（共 {GAOKAO_SCENARIO_QUESTIONS.length} 题）</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCurrentIndex(0);
                setUserInput("");
                setIsAnswerRevealed(false);
                setIsEvaluated(false);
                setHasRestoredNotice(false);
              }}
              className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline underline-offset-2 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>从第 1 题开始</span>
            </button>
            <button
              onClick={() => setHasRestoredNotice(false)}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Completion Summary Card or Main Question Card */}
      {isCompleted ? (
        <div className="py-10 px-6 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs space-y-5 animate-in zoom-in-95 duration-150">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center mx-auto">
            <Trophy className="w-6 h-6 text-amber-500" />
          </div>

          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {wrongQuestionIndices ? "错题专练完成！" : "本轮高考情境默写完成！"}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              共作答 <strong>{totalAnswered}</strong> 题，正确 <strong>{correctCount}</strong> 题，正确率{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">{accuracyPercent}%</strong>
              {wrongIndices.length > 0 && `，错题 ${wrongIndices.length} 道`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-1">
            <button
              onClick={handleRestartAll}
              className="py-2.5 px-5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold text-xs hover:bg-zinc-800 dark:hover:bg-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重新刷一遍</span>
            </button>
            {wrongIndices.length > 0 && (
              <button
                onClick={handleRetryWrong}
                className="py-2.5 px-5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 font-semibold text-xs hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
              >
                仅重做错题 ({wrongIndices.length})
              </button>
            )}
          </div>
        </div>
      ) : (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-7 shadow-xs space-y-5 transition-colors">
        <div>
          <div className="flex items-center gap-2 text-xs mb-2">
            <span className="font-semibold font-classical text-zinc-900 dark:text-zinc-100 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
              《{currentQ.articleTitle}》
            </span>
            <span className="text-zinc-400">{currentQ.author}</span>
          </div>

          <h3 className="text-base sm:text-lg font-classical font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed">
            {currentQ.prompt}
          </h3>
        </div>

        {/* Input Box & Quick Punctuation */}
        <div className="space-y-2.5">
          <textarea
            rows={2}
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            disabled={isAnswerRevealed}
            placeholder="在此默写名句（如：君子生非异也，善假于物也）..."
            className="w-full px-3.5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-base font-classical text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400 dark:focus:border-zinc-600 leading-relaxed transition-all resize-none"
          />

          {!isAnswerRevealed && (
            <div className="flex items-center justify-between gap-2">
              {/* Quick Punctuations for Mobile */}
              <div className="flex items-center gap-1">
                {["，", "。", "！", "？", "；"].map(p => (
                  <button
                    key={p}
                    onClick={() => insertPunctuation(p)}
                    className="px-2 py-1 text-xs rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-mono transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    sound.playReveal();
                    setIsAnswerRevealed(true);
                    setIsEvaluated(false);
                  }}
                  className="py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  看正解
                </button>
                <button
                  onClick={handleVerify}
                  className="py-2 px-4 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold flex items-center gap-1 transition-all active:scale-[0.98]"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>提交核对</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Character-by-Character Diff Output */}
        {isEvaluated && diffResult.length > 0 && (
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/80 space-y-2 animate-in fade-in duration-150">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">逐字比对诊断：</div>
            <div className="flex flex-wrap gap-1.5 text-lg font-classical">
              {diffResult.map((d, idx) => {
                if (d.status === "correct") {
                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center justify-center w-7 h-7 rounded bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold"
                    >
                      {d.char}
                    </span>
                  );
                }
                if (d.status === "wrong") {
                  return (
                    <div key={idx} className="relative inline-flex flex-col items-center">
                      <span className="text-[10px] text-zinc-400 font-sans -mb-1">{d.expected}</span>
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 font-semibold line-through">
                        {d.char}
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={idx} className="relative inline-flex flex-col items-center">
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-sans -mb-1">
                      {d.expected}
                    </span>
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded border border-dashed border-amber-400 text-amber-600 dark:text-amber-400 font-semibold">
                      缺
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Revealed Standard Answer & Notes */}
        {isAnswerRevealed && (
          <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60 animate-in fade-in duration-150">
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
              <div className="text-[11px] font-medium text-zinc-400 mb-1">【高考标答正解】</div>
              <p className="text-lg font-classical font-semibold text-zinc-900 dark:text-zinc-100">
                {currentQ.answer}
              </p>
            </div>

            {currentQ.keyPoints.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-zinc-500 mb-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>易错字与通假采分警示：</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {currentQ.keyPoints.map((pt, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium"
                    >
                      {pt}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {currentQ.explanation && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
                <strong className="text-zinc-700 dark:text-zinc-300">真题考点导析：</strong>
                {currentQ.explanation}
              </p>
            )}

            <button
              onClick={handleNext}
              className="w-full py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
            >
              <span>{currentIndex + 1 < activeQuestions.length ? "下一题" : "完成本轮"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      )}

      </div>

      <StudySidebar
        article={{
          title: currentQ.articleTitle,
          author: currentQ.author
        }}
        progressLabel={`第 ${currentIndex + 1} / ${activeQuestions.length} 题`}
        progressPercent={((currentIndex + 1) / Math.max(1, activeQuestions.length)) * 100}
        shortcuts={[
          { keys: "Enter", label: "提交核对 / 下一题" },
          { keys: "Ctrl + Enter", label: "输入框内直接提交" }
        ]}
        hint="先自己默写完整，再看逐字比对。标红的字是真写错，黄色「缺」是漏字，抄一遍比读三遍管用。"
      />

      </div>

      {/* Question Index Palette Drawer */}
      {showQuestionDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">题目快速跳转</h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  共 {activeQuestions.length} 道{wrongQuestionIndices ? "错题专练" : "历年高考情境真题"}
                </p>
              </div>
              <button
                onClick={() => setShowQuestionDrawer(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 grid grid-cols-6 sm:grid-cols-8 gap-2 overflow-y-auto flex-1">
              {activeQuestions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const hasAnswered = answeredMap.has(idx);
                const isCorrect = answeredMap.get(idx);

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setUserInput("");
                      setIsAnswerRevealed(false);
                      setIsEvaluated(false);
                      setShowQuestionDrawer(false);
                    }}
                    className={`h-10 rounded-lg text-xs font-mono font-medium transition-colors flex items-center justify-center ${
                      isCurrent
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-bold"
                        : hasAnswered
                        ? isCorrect
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                          : "bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
