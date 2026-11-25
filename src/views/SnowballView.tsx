import React, { useState, useEffect, useMemo, useRef } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import {
  SnowballChainingEngine,
  SnowballStage,
  buildSnowballCompletionPlan,
  collectSnowballPrimaryCardIds
} from "../domain/cloze/snowballEngine";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { getFsrsSettings, createFsrsEngine } from "../domain/fsrs/fsrsEngine";
import { CardFsrsState } from "../domain/fsrs/fsrsTypes";
import {
  getCardState,
  saveCardStatesBatch,
  recordSnowballCompletionLogs,
  getBottlenecks,
  saveBottlenecks
} from "../storage/db";
import { saveLastSession, SessionExtra } from "../storage/sessionTracker";
import { filterArticlesByScope } from "../data/articleTaxonomy";
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
  Layers
} from "lucide-react";
import { StudyWorkspaceShell } from "../components/StudyWorkspaceShell";
import { ArticlePickerModal } from "../components/ArticlePickerModal";
import { useOptionalStudyApp } from "../state/StudyAppContext";

interface SnowballViewProps {
  initialArticleId?: string;
  selectedScope?: string;
  resumeExtra?: SessionExtra;
}

export const SnowballView: React.FC<SnowballViewProps> = ({
  initialArticleId: propInitialArticleId,
  selectedScope: propSelectedScope,
  resumeExtra: propResumeExtra
}) => {
  const appCtx = useOptionalStudyApp();
  const initialArticleId = propInitialArticleId ?? appCtx?.activeArticleId;
  const selectedScope = propSelectedScope ?? appCtx?.selectedScope ?? "ALL";
  const resumeExtra = propResumeExtra ?? appCtx?.resumeExtra;

  const filteredArticles = useMemo(() => {
    return filterArticlesByScope(ALL_ARTICLES, selectedScope);
  }, [selectedScope]);

  const [selectedArticleId, setSelectedArticleId] = useState<string>(() => {
    if (initialArticleId) return initialArticleId;
    return filteredArticles[0]?.id || "art_bx1_12"; // 劝学
  });

  // Keep selectedArticleId in sync when initialArticleId prop / context changes
  useEffect(() => {
    if (initialArticleId) {
      setSelectedArticleId(initialArticleId);
    }
  }, [initialArticleId]);

  const [showArticlePicker, setShowArticlePicker] = useState(false);
  const [showPhonetics, setShowPhonetics] = useState(false);
  const [showUnderstanding, setShowUnderstanding] = useState(false);

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
    syncedCardsCount?: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastResumedStageRef = useRef<number | undefined>(resumeExtra?.stageIndex);
  const isSettlingRef = useRef(false);

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
      if (isSettlingRef.current) return;
      isSettlingRef.current = true;
      try {
        sound.playCelebration();
        fireConfetti();
        localStorage.removeItem(`snowball_stage_${currentArticle.id}`);

        const fsrsSettings = await Promise.resolve(getFsrsSettings());
        const fsrs = createFsrsEngine(fsrsSettings);

        const primaryCardIds = collectSnowballPrimaryCardIds(stages, currentArticle);
        const existingStates = await Promise.all(primaryCardIds.map(id => getCardState(id)));
        const existingCardStates = new Map<string, CardFsrsState>();
        for (let i = 0; i < primaryCardIds.length; i++) {
          const state = existingStates[i];
          if (state) {
            existingCardStates.set(primaryCardIds[i], state);
          }
        }

        const plan = buildSnowballCompletionPlan({
          article: currentArticle,
          stages,
          bottleneckIndices,
          existingCardStates,
          fsrs
        });

        if (plan.updatedCards.length > 0) {
          await saveCardStatesBatch(plan.updatedCards);
        }
        await recordSnowballCompletionLogs(plan.reviewLogs, true);

        setSettlementStats({
          totalUnits: stages.length,
          smoothCount: plan.smoothCount,
          bottleneckCount: plan.bottleneckCount,
          avgNextInterval: plan.avgNextInterval,
          syncedCardsCount: plan.updatedCards.length
        });

        setShowSettlementModal(true);
      } finally {
        isSettlingRef.current = false;
      }
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

  const isGlobalModalOpen = Boolean(appCtx?.showCommandPalette || appCtx?.showShortcuts);

  // Keyboard shortcut listener (mode-specific only; global shortcuts handled by useWorkspaceShortcuts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        isGlobalModalOpen ||
        showArticlePicker ||
        showSettlementModal ||
        showPhonetics ||
        showUnderstanding
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      // 让 Alt/Ctrl/Cmd 组合键留给全局导航
      if (e.altKey || e.ctrlKey || e.metaKey) return;

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
  }, [
    currentStageIndex,
    isCompleted,
    isGlobalModalOpen,
    showArticlePicker,
    showSettlementModal,
    showPhonetics,
    showUnderstanding,
    stages,
    bottleneckIndices
  ]);

  const handleSelectArticleFromPicker = (articleId: string) => {
    setSelectedArticleId(articleId);
    appCtx?.setActiveArticleId(articleId);
    setShowArticlePicker(false);
  };

  return (
    <StudyWorkspaceShell
      toolbarConfig={{
        modeLabel: "长卷滚雪球",
        modeIcon: <Layers className="w-3.5 h-3.5" />,
        title: `《${currentArticle.title}》`,
        subtitle: `${currentArticle.dynasty} · ${currentArticle.author}`,
        onSelectTitle: () => setShowArticlePicker(true),
        progressText: currentStage ? `第 ${currentStageIndex + 1} / ${stages.length} 联` : undefined,
        progressPercent: currentStage ? ((currentStageIndex + 1) / stages.length) * 100 : undefined,
        actions: (
          <button
            onClick={() => setShowArticlePicker(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-zinc-400" />
            <span>换一篇 ({filteredArticles.length})</span>
          </button>
        )
      }}
      topBanner={
        currentStage && hasRestoredProgress ? (
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
        ) : undefined
      }
      article={currentArticle}
      sidebarProgressLabel={`第 ${currentStageIndex + 1} / ${stages.length} 联`}
      sidebarProgressPercent={currentStage ? ((currentStageIndex + 1) / Math.max(1, stages.length)) * 100 : 0}
      sidebarShortcuts={[
        { keys: "Space", label: "背熟，下一联" },
        { keys: "←", label: "回到上一联" },
        { keys: "B", label: "标记卡壳" },
        { keys: "M", label: "前文遮挡/全览" }
      ]}
      sidebarHint="滚雪球按「新联 + 前文串联」推进。前文被遮住时先盲诵，卡住了再点开对照。"
      onChangeArticle={() => setShowArticlePicker(true)}
      showPhonetics={showPhonetics}
      onShowPhonetics={() => setShowPhonetics(true)}
      onClosePhonetics={() => setShowPhonetics(false)}
      showUnderstanding={showUnderstanding}
      onShowUnderstanding={() => setShowUnderstanding(true)}
      onCloseUnderstanding={() => setShowUnderstanding(false)}
      understandingHighlightText={currentStage ? currentStage.newlyAddedUnit.text : undefined}
    >
      {/* Main Workspace */}
      {currentStage ? (
        <div className="space-y-4" ref={scrollRef}>

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

      {/* ChatGPT-style Sticky Bottom Action Bar — aligned to main reading column, never overlaps text */}
      <div className="sticky bottom-5 z-30 mt-5">
        <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-2 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex items-center gap-2">
          {currentStageIndex > 0 && (
            <button
              onClick={handlePrevStage}
              className="px-3.5 py-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1 transition-colors"
              title="快捷键: ←"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">上一步</span>
            </button>
          )}

          <button
            onClick={handleNextStage}
            className="flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white shadow-2xs"
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
              已按句联主卡结算 {settlementStats.syncedCardsCount ?? settlementStats.totalUnits} 张至本地 FSRS-5 记忆库，不挤占今日闪卡新学配额。
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
                  {settlementStats.avgNextInterval <= 0
                    ? "< 1 天（学习步进中）"
                    : `约 ${settlementStats.avgNextInterval.toFixed(1)} 天后`}
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

      <ArticlePickerModal
        isOpen={showArticlePicker}
        onClose={() => setShowArticlePicker(false)}
        articles={filteredArticles}
        activeArticleId={selectedArticleId}
        onSelectArticle={handleSelectArticleFromPicker}
        selectedScope={selectedScope}
        title="选择滚雪球篇目"
      />
    </StudyWorkspaceShell>
  );
};
