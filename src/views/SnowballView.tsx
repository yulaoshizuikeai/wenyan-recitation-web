import React, { useState, useEffect, useMemo, useRef } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { SnowballChainingEngine, SnowballStage } from "../domain/cloze/snowballEngine";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { FSRSEngine } from "../domain/fsrs/fsrsEngine";
import { Rating } from "../domain/fsrs/fsrsTypes";
import { getCardState, saveCardStatesBatch, recordReviewLog, getBottlenecks, saveBottlenecks } from "../storage/db";
import { saveLastSession, SessionExtra } from "../storage/sessionTracker";
import {
  filterArticlesByScope,
  DYNASTY_GROUPS,
  DynastyEra
} from "../data/articleTaxonomy";
import {
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Trophy,
  Search,
  X,
  Layers,
  Sparkles,
  Command
} from "lucide-react";

interface SnowballViewProps {
  initialArticleId?: string;
  selectedScope: string;
  resumeExtra?: SessionExtra;
}

export const SnowballView: React.FC<SnowballViewProps> = ({ initialArticleId, selectedScope, resumeExtra }) => {
  const filteredArticles = useMemo(() => {
    return filterArticlesByScope(ALL_ARTICLES, selectedScope);
  }, [selectedScope]);

  const [selectedArticleId, setSelectedArticleId] = useState<string>(() => {
    if (initialArticleId) return initialArticleId;
    return filteredArticles[0]?.id || "art_bx1_12"; // 劝学
  });

  // Keep selectedArticleId in sync when initialArticleId prop changes
  useEffect(() => {
    if (initialArticleId) {
      setSelectedArticleId(initialArticleId);
    }
  }, [initialArticleId]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDynastyFilter, setSelectedDynastyFilter] = useState<DynastyEra>("ALL");
  const [showArticlePicker, setShowArticlePicker] = useState(false);

  const currentArticle: Article = useMemo(() => {
    return ALL_ARTICLES.find(a => a.id === selectedArticleId) || ALL_ARTICLES[0];
  }, [selectedArticleId]);

  const stages: SnowballStage[] = useMemo(() => {
    return SnowballChainingEngine.buildStages(currentArticle);
  }, [currentArticle]);

  const [currentStageIndex, setCurrentStageIndex] = useState<number>(() => {
    const artId = (initialArticleId && ALL_ARTICLES.some(a => a.id === initialArticleId))
      ? initialArticleId
      : (filteredArticles[0]?.id || "art_bx1_12");
    if (resumeExtra?.stageIndex !== undefined && resumeExtra.stageIndex >= 0) {
      return resumeExtra.stageIndex;
    }
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem(`snowball_stage_${artId}`);
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return 0;
  });

  const [maskHistory, setMaskHistory] = useState(true);
  const [bottleneckIndices, setBottleneckIndices] = useState<Set<number>>(new Set());
  const [revealedUnitIndices, setRevealedUnitIndices] = useState<Set<number>>(new Set());
  const [hasRestoredProgress, setHasRestoredProgress] = useState<boolean>(() => {
    if (resumeExtra?.stageIndex !== undefined && resumeExtra.stageIndex > 0) return true;
    const artId = (initialArticleId && ALL_ARTICLES.some(a => a.id === initialArticleId))
      ? initialArticleId
      : (filteredArticles[0]?.id || "art_bx1_12");
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem(`snowball_stage_${artId}`);
      return Boolean(saved && parseInt(saved, 10) > 0);
    }
    return false;
  });
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementStats, setSettlementStats] = useState<{
    totalUnits: number;
    smoothCount: number;
    bottleneckCount: number;
    avgNextInterval: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastResumedStageRef = useRef<number | undefined>(resumeExtra?.stageIndex);

  // Sync lastResumedStageRef when a new resumeExtra is passed from above
  useEffect(() => {
    lastResumedStageRef.current = resumeExtra?.stageIndex;
  }, [resumeExtra]);

  // Load existing bottlenecks & saved progress for article
  useEffect(() => {
    getBottlenecks(currentArticle.id).then(indices => {
      setBottleneckIndices(new Set(indices));
    });

    // Check resumeExtra first only if it matches the current resume event
    let targetIdx = 0;
    if (
      resumeExtra?.stageIndex !== undefined &&
      resumeExtra.stageIndex < stages.length &&
      resumeExtra.stageIndex === lastResumedStageRef.current
    ) {
      targetIdx = resumeExtra.stageIndex;
    } else {
      const savedStr = localStorage.getItem(`snowball_stage_${currentArticle.id}`);
      targetIdx = savedStr ? parseInt(savedStr, 10) : 0;
    }

    if (targetIdx > 0 && targetIdx < stages.length) {
      setCurrentStageIndex(targetIdx);
      setHasRestoredProgress(true);
    } else {
      setCurrentStageIndex(0);
      setHasRestoredProgress(false);
    }
    setRevealedUnitIndices(new Set());
  }, [currentArticle.id, stages.length, resumeExtra]);

  // Synchronize session tracker whenever article or stage changes
  useEffect(() => {
    if (!currentArticle || stages.length === 0) return;
    saveLastSession({
      view: "snowball",
      articleId: currentArticle.id,
      articleTitle: currentArticle.title,
      articleAuthor: currentArticle.author,
      articleDynasty: currentArticle.dynasty,
      modeName: "长卷滚雪球",
      progressText: `第 ${currentStageIndex + 1} / ${stages.length} 联`,
      progressPercent: Math.min(100, Math.round(((currentStageIndex + 1) / Math.max(1, stages.length)) * 100)),
      updatedAt: Date.now(),
      extra: {
        stageIndex: currentStageIndex,
        totalStages: stages.length
      }
    });
  }, [currentArticle, currentStageIndex, stages.length]);

  const currentStage = stages[currentStageIndex];
  const isCompleted = currentStageIndex >= stages.length - 1;

  const handleResetToFirstStage = () => {
    setCurrentStageIndex(0);
    setHasRestoredProgress(false);
    localStorage.removeItem(`snowball_stage_${currentArticle.id}`);
    if (currentArticle && stages.length > 0) {
      saveLastSession({
        view: "snowball",
        articleId: currentArticle.id,
        articleTitle: currentArticle.title,
        articleAuthor: currentArticle.author,
        articleDynasty: currentArticle.dynasty,
        modeName: "长卷滚雪球",
        progressText: `第 1 / ${stages.length} 联`,
        progressPercent: Math.min(100, Math.round((1 / Math.max(1, stages.length)) * 100)),
        updatedAt: Date.now(),
        extra: {
          stageIndex: 0,
          totalStages: stages.length
        }
      });
    }
  };

  const toggleBottleneck = (index: number) => {
    const next = new Set(bottleneckIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setBottleneckIndices(next);
    saveBottlenecks(currentArticle.id, Array.from(next));
  };

  const handleNextStage = async () => {
    if (isCompleted) {
      sound.playCelebration();
      fireConfetti();
      localStorage.removeItem(`snowball_stage_${currentArticle.id}`);

      const fsrs = new FSRSEngine();
      const updatedCards = [];
      let totalNextDays = 0;
      let ratedCardsCount = 0;

      for (const stg of stages) {
        const rating = bottleneckIndices.has(stg.stageIndex) ? Rating.HARD : Rating.GOOD;
        for (const cid of stg.newlyAddedUnit.cardIds) {
          const card = (await getCardState(cid)) || fsrs.createInitialCard(cid);
          const result = fsrs.evaluateReview(card, rating);
          updatedCards.push(result.updatedCard);
          await recordReviewLog(result.reviewLog);
          totalNextDays += result.nextIntervalDays;
          ratedCardsCount++;
        }
      }

      if (updatedCards.length > 0) {
        await saveCardStatesBatch(updatedCards);
      }

      setSettlementStats({
        totalUnits: stages.length,
        smoothCount: stages.length - bottleneckIndices.size,
        bottleneckCount: bottleneckIndices.size,
        avgNextInterval: ratedCardsCount > 0 ? totalNextDays / ratedCardsCount : 3.0
      });

      setShowSettlementModal(true);
    } else {
      sound.playCorrect();
      const nextIdx = currentStageIndex + 1;
      setCurrentStageIndex(nextIdx);
      localStorage.setItem(`snowball_stage_${currentArticle.id}`, String(nextIdx));
      // Auto smooth scroll to top of card if needed
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrevStage = () => {
    if (currentStageIndex > 0) {
      const prevIdx = currentStageIndex - 1;
      setCurrentStageIndex(prevIdx);
      localStorage.setItem(`snowball_stage_${currentArticle.id}`, String(prevIdx));
    }
  };

  const toggleRevealUnit = (index: number) => {
    sound.playReveal();
    const next = new Set(revealedUnitIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setRevealedUnitIndices(next);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if picker or modal is open
      if (showArticlePicker || showSettlementModal) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleNextStage();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePrevStage();
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        toggleBottleneck(currentStageIndex);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setMaskHistory(prev => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStageIndex, isCompleted, showArticlePicker, showSettlementModal, stages, bottleneckIndices]);

  // Filtered articles for switcher modal
  const searchedArticles = useMemo(() => {
    let list = filteredArticles;

    if (selectedDynastyFilter !== "ALL") {
      const group = DYNASTY_GROUPS.find(g => g.id === selectedDynastyFilter);
      if (group && group.subDynasties.length > 0) {
        list = list.filter(a => group.subDynasties.includes(a.dynasty));
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        a => a.title.toLowerCase().includes(q) || a.author.toLowerCase().includes(q)
      );
    }

    return list;
  }, [filteredArticles, selectedDynastyFilter, searchQuery]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-32" ref={scrollRef}>
      {/* Article Header & Selector */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5 shadow-xs transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                {currentArticle.dynasty} · {currentArticle.author} · {currentArticle.genre}
              </span>
              {currentArticle.isGaoKao72 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium border border-zinc-200 dark:border-zinc-700">
                  高考72篇
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-classical font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              《{currentArticle.title}》
            </h1>
          </div>

          <button
            onClick={() => setShowArticlePicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <span>换一篇 ({filteredArticles.length})</span>
          </button>
        </div>

        {/* Segmented Progress Bar */}
        {currentStage && (
          <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-500 dark:text-zinc-400">
                滚雪球第 <strong>{currentStageIndex + 1}</strong> / {stages.length} 联
              </span>
              <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {Math.round(((currentStageIndex + 1) / stages.length) * 100)}%
              </span>
            </div>

            {/* Clean Segmented Track */}
            <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-200"
                style={{ width: `${((currentStageIndex + 1) / stages.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace */}
      {currentStage ? (
        <div className="space-y-4">
          {/* Progress Restore Toast */}
          {hasRestoredProgress && (
            <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-700 dark:text-zinc-300">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span>已接续背诵进度至<strong>第 {currentStageIndex + 1} 联</strong>（共 {stages.length} 联）</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleResetToFirstStage}
                  className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline underline-offset-2 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>从头开始</span>
                </button>
                <button
                  onClick={() => setHasRestoredProgress(false)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Current Spotlight Unit Card */}
          <div
            className={`border rounded-2xl p-5 shadow-xs transition-colors ${
              bottleneckIndices.has(currentStageIndex)
                ? "bg-red-50/40 dark:bg-red-950/20 border-red-300 dark:border-red-900/60"
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  当前攻坚（第 {currentStageIndex + 1} 联）
                </span>
                {bottleneckIndices.has(currentStageIndex) && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-medium">
                    转折卡壳标记
                  </span>
                )}
              </div>

              <button
                onClick={() => toggleBottleneck(currentStageIndex)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                  bottleneckIndices.has(currentStageIndex)
                    ? "bg-red-600 text-white border-red-700 dark:bg-red-500"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
                title="快捷键: B"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{bottleneckIndices.has(currentStageIndex) ? "已记为卡壳" : "标记卡壳 (B)"}</span>
              </button>
            </div>

            <p className="text-xl sm:text-2xl font-classical font-semibold text-zinc-900 dark:text-zinc-100 leading-relaxed tracking-wide">
              {currentStage.newlyAddedUnit.text}
            </p>
          </div>

          {/* Chained Accumulation List */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs transition-colors">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/60">
              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                滚雪球串联累积（共 {currentStage.chainUnits.length} 联）
              </h3>
              <button
                onClick={() => setMaskHistory(!maskHistory)}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                title="快捷键: M"
              >
                {maskHistory ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{maskHistory ? "前文盲诵中" : "前文全览"} (M)</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {currentStage.chainUnits.map((unit, idx) => {
                const isNewest = idx === currentStage.chainUnits.length - 1;
                const isUnitBottleneck = bottleneckIndices.has(idx);
                const isMasked = maskHistory && !isNewest && !revealedUnitIndices.has(idx);

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (!isNewest) toggleRevealUnit(idx);
                    }}
                    className={`p-3 rounded-xl border transition-all ${
                      isNewest
                        ? "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-300 dark:border-zinc-700"
                        : isUnitBottleneck
                        ? "bg-red-50/20 dark:bg-red-950/10 border-red-200 dark:border-red-900/40"
                        : "bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800"
                    } ${!isNewest ? "cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600" : ""}`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-mono text-zinc-400 dark:text-zinc-500">
                        {isNewest ? "★ 本次新联" : `第 ${idx + 1} 联`}
                        {isUnitBottleneck && " · 卡壳点"}
                      </span>
                      {isMasked && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          轻触显露对照
                        </span>
                      )}
                    </div>

                    <p
                      className={`text-base sm:text-lg font-classical leading-relaxed ${
                        isMasked
                          ? "frosted-mask text-zinc-800 dark:text-zinc-200"
                          : isNewest
                          ? "font-semibold text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {unit.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <p className="text-xs text-zinc-400">暂无篇章数据</p>
        </div>
      )}

      {/* Floating Bottom Action Dock (Sticky Ergonomic Control) */}
      <div className="fixed bottom-14 lg:bottom-4 left-0 right-0 z-30 pointer-events-none px-4">
        <div className="max-w-xl mx-auto pointer-events-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2.5 shadow-lg flex items-center gap-2">
          {currentStageIndex > 0 && (
            <button
              onClick={handlePrevStage}
              className="px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1 transition-colors"
              title="快捷键: ←"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">上一步</span>
            </button>
          )}

          <button
            onClick={handleNextStage}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
              isCompleted
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-xs"
                : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white shadow-xs"
            }`}
          >
            {isCompleted ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>通篇结业 · 沉淀 FSRS (Space)</span>
              </>
            ) : (
              <>
                <span>背熟了 · 滚雪球下一段 (Space)</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Settlement Modal */}
      {showSettlementModal && settlementStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-xl relative animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center mx-auto mb-3">
              <Trophy className="w-6 h-6" />
            </div>

            <h2 className="text-lg font-semibold text-center text-zinc-900 dark:text-zinc-100">
              《{currentArticle.title}》全篇贯通结业
            </h2>
            <p className="text-xs text-center text-zinc-500 dark:text-zinc-400 mt-1 mb-5">
              已将全篇各句联记忆指标自动结算至本地 FSRS-5 算法记忆库。
            </p>

            <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-4 border border-zinc-100 dark:border-zinc-800 space-y-2.5 mb-5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 dark:text-zinc-400">通背总联数</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {settlementStats.totalUnits} 联全篇贯通
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 dark:text-zinc-400">顺畅连诵率</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {Math.round((settlementStats.smoothCount / settlementStats.totalUnits) * 100)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 dark:text-zinc-400">顺畅 / 卡壳标注</span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  {settlementStats.smoothCount} 联顺畅 ｜ {settlementStats.bottleneckCount} 联易卡壳
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700">
                <span className="text-zinc-500 dark:text-zinc-400">建议下次串联复习</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  约 {settlementStats.avgNextInterval.toFixed(1)} 天后
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCurrentStageIndex(0);
                  setShowSettlementModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>再来一遍</span>
              </button>
              <button
                onClick={() => {
                  setCurrentStageIndex(0);
                  setShowSettlementModal(false);
                }}
                className="flex-[1.5] py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-white"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Categorized Article Switcher Modal */}
      {showArticlePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">选择滚雪球篇目</h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">按朝代或关键字快速定位</p>
              </div>
              <button
                onClick={() => setShowArticlePicker(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="px-5 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索篇目名或作者（如：劝学、赤壁赋、苏轼）..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400 dark:focus:border-zinc-600"
                />
              </div>
            </div>

            {/* Dynasty Filter Chips */}
            <div className="px-5 py-2 flex items-center gap-1 overflow-x-auto border-b border-zinc-100 dark:border-zinc-800/50 text-[11px]">
              {DYNASTY_GROUPS.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDynastyFilter(d.id)}
                  className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                    selectedDynastyFilter === d.id
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {searchedArticles.map(article => (
                <button
                  key={article.id}
                  onClick={() => {
                    setSelectedArticleId(article.id);
                    setShowArticlePicker(false);
                    setSearchQuery("");
                  }}
                  className={`w-full text-left p-2.5 rounded-xl border transition-colors flex items-center justify-between ${
                    selectedArticleId === article.id
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                      : "bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold font-classical">《{article.title}》</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        selectedArticleId === article.id
                          ? "text-zinc-300 dark:text-zinc-600"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {article.dynasty} · {article.author} · {article.genre}
                    </div>
                  </div>
                  {article.isGaoKao72 && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                        selectedArticleId === article.id
                          ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      高考72篇
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
