import React, { useState, useEffect, useMemo, useRef } from "react";
import { ARTICLE_INDEX, ARTICLE_INDEX_MAP } from "../data/curriculumIndex";
import type { Article } from "../data/curriculumTypes";
import { getCachedArticleById, loadArticleById } from "../data/curriculumLoader";
import { ArticleScenarioLink } from "../components/ArticleScenarioLink";
import {
  SnowballChainingEngine,
  SnowballStage,
  SnowballBridgeCard,
  buildParagraphStages,
  buildBridgeCards,
  buildSnowballCompletionPlan,
  collectSnowballPrimaryCardIds
} from "../domain/cloze/snowballEngine";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { getFsrsSettings, createFsrsEngine } from "../domain/fsrs/fsrsEngine";
import { CardFsrsState } from "../domain/fsrs/fsrsTypes";
import {
  getCardState,
  recordSnowballCompletionLogs
} from "../storage/db";
import { studyStore, useStudyStore } from "../storage/studyStore";
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
  Layers,
  ArrowDown,
  Link2
} from "lucide-react";
import { StudyWorkspaceShell } from "../components/StudyWorkspaceShell";
import { ArticlePickerModal } from "../components/ArticlePickerModal";
import { useOptionalStudyApp, useRegisterModalOpen } from "../state/StudyAppContext";

interface SnowballViewProps {
  initialArticleId?: string;
  selectedScope?: string;
  resumeExtra?: SessionExtra;
}

type SnowballPracticeMode = "full" | "paragraph" | "bridge";

export const SnowballView: React.FC<SnowballViewProps> = ({
  initialArticleId: propInitialArticleId,
  selectedScope: propSelectedScope,
  resumeExtra: propResumeExtra
}) => {
  const appCtx = useOptionalStudyApp();
  const storeSnapshot = useStudyStore();
  const initialArticleId = propInitialArticleId ?? appCtx?.activeArticleId;
  const selectedScope = propSelectedScope ?? appCtx?.selectedScope ?? "ALL";
  const resumeExtra = propResumeExtra ?? appCtx?.resumeExtra;

  const filteredArticles = useMemo(() => {
    return filterArticlesByScope(ARTICLE_INDEX, selectedScope);
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

  const [currentArticle, setCurrentArticle] = useState<Article | null>(
    () => getCachedArticleById(selectedArticleId) ?? null
  );

  useEffect(() => {
    const cached = getCachedArticleById(selectedArticleId);
    if (cached) {
      setCurrentArticle(cached);
      return;
    }
    let cancelled = false;
    loadArticleById(selectedArticleId).then(art => {
      if (!cancelled && art) setCurrentArticle(art);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedArticleId]);

  const isLongArticle = (currentArticle?.paragraphs.length ?? 0) >= 3;
  const [practiceMode, setPracticeMode] = useState<SnowballPracticeMode>(() => {
    const savedMode = resumeExtra?.practiceMode;
    return savedMode === "paragraph" || savedMode === "full" ? savedMode : "full";
  });
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number>(() => {
    const savedPara = resumeExtra?.activeParagraphIndex;
    return typeof savedPara === "number" && savedPara >= 0 ? savedPara : 0;
  });
  const [readyArticleId, setReadyArticleId] = useState<string | null>(null);
  const [settledParagraphs, setSettledParagraphs] = useState<Set<number>>(new Set());
  const [bridgeIndex, setBridgeIndex] = useState<number>(0);
  const [bridgeRevealed, setBridgeRevealed] = useState<boolean>(false);

  const effectiveMode: SnowballPracticeMode = isLongArticle ? practiceMode : "full";

  const stages: SnowballStage[] = useMemo(() => {
    if (!currentArticle) return [];
    if (effectiveMode === "paragraph") {
      return buildParagraphStages(currentArticle, activeParagraphIndex);
    }
    return SnowballChainingEngine.buildStages(currentArticle);
  }, [currentArticle, effectiveMode, activeParagraphIndex]);

  const bridgeCards: SnowballBridgeCard[] = useMemo(() => {
    return currentArticle ? buildBridgeCards(currentArticle) : [];
  }, [currentArticle]);

  const [currentStageIndex, setCurrentStageIndex] = useState<number>(() => {
    const artId = (initialArticleId && ARTICLE_INDEX_MAP[initialArticleId])
      ? initialArticleId
      : (filteredArticles[0]?.id || "art_bx1_12");
    if (resumeExtra?.stageIndex !== undefined && resumeExtra.stageIndex >= 0) {
      return resumeExtra.stageIndex;
    }
    return studyStore.getSnowballStage(artId);
  });

  const [maskHistory, setMaskHistory] = useState(true);
  const bottleneckIndices = useMemo(() => {
    return new Set<number>(currentArticle ? (storeSnapshot.bottlenecks.get(currentArticle.id) ?? []) : []);
  }, [storeSnapshot.bottlenecks, currentArticle]);
  const [revealedUnitIndices, setRevealedUnitIndices] = useState<Set<number>>(new Set());
  const [hasRestoredProgress, setHasRestoredProgress] = useState<boolean>(() => {
    if (resumeExtra?.stageIndex !== undefined && resumeExtra.stageIndex > 0) return true;
    const artId = (initialArticleId && ARTICLE_INDEX_MAP[initialArticleId])
      ? initialArticleId
      : (filteredArticles[0]?.id || "art_bx1_12");
    return studyStore.getSnowballStage(artId) > 0;
  });
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementStats, setSettlementStats] = useState<{
    totalUnits: number;
    smoothCount: number;
    bottleneckCount: number;
    avgNextInterval: number;
    syncedCardsCount?: number;
    paragraphIndex?: number;
    isBridge?: boolean;
  } | null>(null);

  useRegisterModalOpen(showSettlementModal);

  const scrollRef = useRef<HTMLDivElement>(null);
  const consumedResumeExtraRef = useRef<SessionExtra | undefined>(undefined);
  const appliedResumeArticleRef = useRef<string | undefined>(undefined);
  const isSettlingRef = useRef(false);

  // Close overlays/modals when selectedArticleId changes externally or via picker
  useEffect(() => {
    setShowSettlementModal(false);
    setSettlementStats(null);
    setShowArticlePicker(false);
    setShowPhonetics(false);
    setShowUnderstanding(false);
  }, [selectedArticleId]);

  // Reset sub-mode state when switching articles (preserving resumed paragraph mode on initial load)
  const prevArticleIdRef = useRef<string | undefined>(currentArticle?.id);
  useEffect(() => {
    if (!currentArticle) return;
    if (prevArticleIdRef.current !== currentArticle.id) {
      prevArticleIdRef.current = currentArticle.id;
      setPracticeMode("full");
      setActiveParagraphIndex(0);
      setSettledParagraphs(new Set());
      setBridgeIndex(0);
      setBridgeRevealed(false);
      setReadyArticleId(null);
    } else if (
      resumeExtra &&
      resumeExtra !== consumedResumeExtraRef.current &&
      resumeExtra.practiceMode === "paragraph" &&
      isLongArticle
    ) {
      setPracticeMode("paragraph");
      if (
        typeof resumeExtra.activeParagraphIndex === "number" &&
        resumeExtra.activeParagraphIndex >= 0 &&
        resumeExtra.activeParagraphIndex < currentArticle.paragraphs.length
      ) {
        setActiveParagraphIndex(resumeExtra.activeParagraphIndex);
      }
    }
  }, [currentArticle?.id, isLongArticle, resumeExtra]);

  // Load saved progress when article, mode, or store hydration changes
  useEffect(() => {
    if (!currentArticle || stages.length === 0) return;

    const canApplyResume =
      resumeExtra &&
      resumeExtra.stageIndex !== undefined &&
      resumeExtra.stageIndex >= 0 &&
      resumeExtra.stageIndex < stages.length &&
      (resumeExtra !== consumedResumeExtraRef.current ||
        appliedResumeArticleRef.current === currentArticle.id);

    if (effectiveMode !== "full") {
      const targetIdx = canApplyResume ? resumeExtra.stageIndex! : 0;
      if (canApplyResume) {
        consumedResumeExtraRef.current = resumeExtra;
        appliedResumeArticleRef.current = currentArticle.id;
      }
      setCurrentStageIndex(targetIdx);
      setHasRestoredProgress(targetIdx > 0);
      setRevealedUnitIndices(new Set());
      setReadyArticleId(currentArticle.id);
      return;
    }

    let targetIdx = 0;
    if (canApplyResume) {
      targetIdx = resumeExtra.stageIndex!;
      consumedResumeExtraRef.current = resumeExtra;
      appliedResumeArticleRef.current = currentArticle.id;
    } else {
      targetIdx = studyStore.getSnowballStage(currentArticle.id);
    }

    if (targetIdx > 0 && targetIdx < stages.length) {
      setCurrentStageIndex(targetIdx);
      setHasRestoredProgress(true);
    } else {
      setCurrentStageIndex(0);
      setHasRestoredProgress(false);
    }
    setRevealedUnitIndices(new Set());
    setReadyArticleId(currentArticle.id);
  }, [currentArticle?.id, effectiveMode, activeParagraphIndex, stages.length, resumeExtra, storeSnapshot.hydrated]);

  // Synchronize session tracker only after stageIndex is synced for currentArticle
  useEffect(() => {
    if (
      !currentArticle ||
      readyArticleId !== currentArticle.id ||
      effectiveMode === "bridge" ||
      stages.length === 0 ||
      currentStageIndex >= stages.length
    ) {
      return;
    }
    const modeLabel =
      effectiveMode === "paragraph"
        ? `分段滚雪球 · 第${activeParagraphIndex + 1}段`
        : "长卷滚雪球";
    saveLastSession({
      view: "snowball",
      articleId: currentArticle.id,
      articleTitle: currentArticle.title,
      articleAuthor: currentArticle.author,
      articleDynasty: currentArticle.dynasty,
      modeName: modeLabel,
      progressText: `第 ${currentStageIndex + 1} / ${stages.length} 联`,
      progressPercent: Math.min(100, Math.round(((currentStageIndex + 1) / Math.max(1, stages.length)) * 100)),
      updatedAt: Date.now(),
      extra: {
        stageIndex: currentStageIndex,
        totalStages: stages.length,
        practiceMode: effectiveMode,
        ...(effectiveMode === "paragraph" ? { activeParagraphIndex } : {})
      }
    });
  }, [currentArticle, readyArticleId, effectiveMode, activeParagraphIndex, currentStageIndex, stages.length]);

  const currentStage = stages[currentStageIndex];
  const isCompleted = stages.length > 0 && currentStageIndex >= stages.length - 1;
  const currentBridgeCard = bridgeCards[bridgeIndex];
  const isBridgeCompleted = bridgeCards.length > 0 && bridgeIndex >= bridgeCards.length - 1;

  const handleSelectMode = (nextMode: SnowballPracticeMode) => {
    setPracticeMode(nextMode);
    setCurrentStageIndex(0);
    setRevealedUnitIndices(new Set());
    setHasRestoredProgress(false);
    setBridgeIndex(0);
    setBridgeRevealed(false);
  };

  const handleSelectParagraph = (pIdx: number) => {
    setActiveParagraphIndex(pIdx);
    setCurrentStageIndex(0);
    setRevealedUnitIndices(new Set());
    setHasRestoredProgress(false);
  };

  const handleResetToFirstStage = () => {
    if (!currentArticle) return;
    setCurrentStageIndex(0);
    setRevealedUnitIndices(new Set());
    setHasRestoredProgress(false);
    if (effectiveMode === "full") {
      studyStore.setSnowballStage(currentArticle.id, 0);
    }
    if (currentArticle && stages.length > 0) {
      saveLastSession({
        view: "snowball",
        articleId: currentArticle.id,
        articleTitle: currentArticle.title,
        articleAuthor: currentArticle.author,
        articleDynasty: currentArticle.dynasty,
        modeName: effectiveMode === "paragraph" ? `分段滚雪球 · 第${activeParagraphIndex + 1}段` : "长卷滚雪球",
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

  const toggleBottleneck = (unitIndex: number) => {
    if (!currentArticle) return;
    const next = new Set(bottleneckIndices);
    if (next.has(unitIndex)) {
      next.delete(unitIndex);
    } else {
      next.add(unitIndex);
    }
    studyStore.setBottlenecks(currentArticle.id, Array.from(next));
  };

  const handleNextStage = async () => {
    if (!currentArticle) return;
    if (effectiveMode === "bridge") {
      if (bridgeCards.length === 0) return;
      if (isBridgeCompleted) {
        sound.playCelebration();
        fireConfetti();
        setSettlementStats({
          totalUnits: bridgeCards.length,
          smoothCount: bridgeCards.length,
          bottleneckCount: 0,
          avgNextInterval: 0,
          isBridge: true
        });
        setShowSettlementModal(true);
      } else {
        sound.playCorrect();
        setBridgeIndex(prev => prev + 1);
        setBridgeRevealed(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    if (isCompleted) {
      if (isSettlingRef.current) return;
      isSettlingRef.current = true;
      try {
        sound.playCelebration();
        fireConfetti();
        if (effectiveMode === "full") {
          studyStore.setSnowballStage(currentArticle.id, 0);
          saveLastSession({
            view: "snowball",
            articleId: currentArticle.id,
            articleTitle: currentArticle.title,
            articleAuthor: currentArticle.author,
            articleDynasty: currentArticle.dynasty,
            modeName: "长卷滚雪球",
            progressText: "全篇已完成",
            progressPercent: 100,
            updatedAt: Date.now(),
            extra: {
              stageIndex: 0,
              totalStages: stages.length,
              practiceMode: "full"
            }
          });
        } else {
          setSettledParagraphs(prev => new Set(prev).add(activeParagraphIndex));
        }

        const fsrsSettings = await Promise.resolve(getFsrsSettings());
        const fsrs = createFsrsEngine(fsrsSettings);

        const primaryCardIds = collectSnowballPrimaryCardIds(stages, currentArticle);
        const existingStates = await Promise.all(
          primaryCardIds.map(id => storeSnapshot.cards.get(id) ?? getCardState(id))
        );
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
          studyStore.upsertCardsBatch(plan.updatedCards);
        }
        await recordSnowballCompletionLogs(plan.reviewLogs, true);

        setSettlementStats({
          totalUnits: stages.length,
          smoothCount: plan.smoothCount,
          bottleneckCount: plan.bottleneckCount,
          avgNextInterval: plan.avgNextInterval,
          syncedCardsCount: plan.updatedCards.length,
          paragraphIndex: effectiveMode === "paragraph" ? activeParagraphIndex : undefined
        });

        setShowSettlementModal(true);
      } finally {
        isSettlingRef.current = false;
      }
    } else {
      sound.playCorrect();
      const nextIdx = currentStageIndex + 1;
      setCurrentStageIndex(nextIdx);
      setRevealedUnitIndices(new Set());
      if (effectiveMode === "full") {
        studyStore.setSnowballStage(currentArticle.id, nextIdx);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrevStage = () => {
    if (!currentArticle) return;
    if (effectiveMode === "bridge") {
      if (bridgeIndex > 0) {
        setBridgeIndex(prev => prev - 1);
        setBridgeRevealed(false);
      }
      return;
    }
    if (currentStageIndex > 0) {
      const prevIdx = currentStageIndex - 1;
      setCurrentStageIndex(prevIdx);
      setRevealedUnitIndices(new Set());
      if (effectiveMode === "full") {
        studyStore.setSnowballStage(currentArticle.id, prevIdx);
      }
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

  const keyActionRef = useRef({ handleNextStage, handlePrevStage, toggleBottleneck });
  keyActionRef.current = { handleNextStage, handlePrevStage, toggleBottleneck };

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
        keyActionRef.current.handleNextStage();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        keyActionRef.current.handlePrevStage();
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        if (effectiveMode === "bridge") {
          if (currentBridgeCard) keyActionRef.current.toggleBottleneck(currentBridgeCard.targetUnitIndex);
        } else if (currentStage) {
          keyActionRef.current.toggleBottleneck(currentStage.newlyAddedUnit.index);
        }
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        if (effectiveMode === "bridge") {
          setBridgeRevealed(prev => !prev);
        } else {
          setMaskHistory(prev => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentStageIndex,
    isCompleted,
    effectiveMode,
    bridgeIndex,
    isBridgeCompleted,
    bridgeCards,
    currentBridgeCard,
    currentStage,
    currentArticle,
    storeSnapshot.cards,
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
    appCtx?.setResumeExtra(undefined);
    setShowArticlePicker(false);
  };

  const progressText =
    effectiveMode === "bridge"
      ? bridgeCards.length > 0
        ? `段间衔接 ${bridgeIndex + 1} / ${bridgeCards.length}`
        : undefined
      : currentStage
      ? effectiveMode === "paragraph"
        ? `第${activeParagraphIndex + 1}段 · ${currentStageIndex + 1} / ${stages.length} 联`
        : `第 ${currentStageIndex + 1} / ${stages.length} 联`
      : undefined;

  const progressPercent =
    effectiveMode === "bridge"
      ? bridgeCards.length > 0
        ? ((bridgeIndex + 1) / bridgeCards.length) * 100
        : 0
      : currentStage
      ? ((currentStageIndex + 1) / Math.max(1, stages.length)) * 100
      : 0;

  if (!currentArticle) {
    return (
      <div className="py-24 text-center text-xs text-zinc-400 dark:text-zinc-500">
        正在加载篇目正文…
      </div>
    );
  }

  return (
    <StudyWorkspaceShell
      toolbarConfig={{
        modeLabel: "长卷滚雪球",
        modeIcon: <Layers className="w-3.5 h-3.5" />,
        title: `《${currentArticle.title}》`,
        subtitle: `${currentArticle.dynasty} · ${currentArticle.author}`,
        onSelectTitle: () => setShowArticlePicker(true),
        progressText,
        progressPercent,
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
        effectiveMode === "full" && currentStage && hasRestoredProgress ? (
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
      sidebarProgressLabel={progressText || "0 / 0"}
      sidebarProgressPercent={progressPercent}
      sidebarShortcuts={
        effectiveMode === "bridge"
          ? [
              { keys: "Space", label: "下一处衔接" },
              { keys: "←", label: "上一处衔接" },
              { keys: "B", label: "标记下段首句卡壳" },
              { keys: "M", label: "显露/遮挡下段首句" }
            ]
          : [
              { keys: "Space", label: "背熟，下一联" },
              { keys: "←", label: "回到上一联" },
              { keys: "B", label: "标记卡壳" },
              { keys: "M", label: "前文遮挡/全览" }
            ]
      }
      sidebarHint={
        effectiveMode === "bridge"
          ? "段间衔接专练「上段末句 → 默写下段首句」，消除长文跨段跳段、记串痛点。"
          : effectiveMode === "paragraph"
          ? "分段攻坚可逐段独立滚雪球并单独结算 FSRS，适合长篇分次消化。"
          : "滚雪球按「新联 + 前文串联」推进。前文被遮住时先盲诵，卡住了再点开对照。"
      }
      onChangeArticle={() => setShowArticlePicker(true)}
      showPhonetics={showPhonetics}
      onShowPhonetics={() => setShowPhonetics(true)}
      onClosePhonetics={() => setShowPhonetics(false)}
      showUnderstanding={showUnderstanding}
      onShowUnderstanding={() => setShowUnderstanding(true)}
      onCloseUnderstanding={() => setShowUnderstanding(false)}
      understandingHighlightText={
        effectiveMode === "bridge"
          ? currentBridgeCard?.targetSentence
          : currentStage
          ? currentStage.newlyAddedUnit.text
          : undefined
      }
    >
      {/* Long-article Sub-mode Toggle & Paragraph Selector (paragraphs.length >= 3) */}
      {isLongArticle && (
        <div className="mb-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSelectMode("full")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  effectiveMode === "full"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                全篇通滚
              </button>
              <button
                onClick={() => handleSelectMode("paragraph")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  effectiveMode === "paragraph"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                分段攻坚 ({currentArticle.paragraphs.length} 段)
              </button>
              <button
                onClick={() => handleSelectMode("bridge")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                  effectiveMode === "bridge"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Link2 className="w-3 h-3" />
                <span>段间衔接 ({bridgeCards.length})</span>
              </button>
            </div>
            {effectiveMode === "paragraph" && (
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 px-2">
                支持单段独立结算 FSRS
              </span>
            )}
          </div>

          {effectiveMode === "paragraph" && (
            <div className="flex flex-wrap items-center gap-1.5">
              {currentArticle.paragraphs.map((_, pIdx) => {
                const isActive = pIdx === activeParagraphIndex;
                const isSettled = settledParagraphs.has(pIdx);
                return (
                  <button
                    key={pIdx}
                    onClick={() => handleSelectParagraph(pIdx)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                      isActive
                        ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-950 dark:border-zinc-100"
                        : isSettled
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50"
                        : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    <span>第{pIdx + 1}段</span>
                    {isSettled && <CheckCircle2 className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* Main Workspace */}
      {effectiveMode === "bridge" ? (
        currentBridgeCard ? (
          <div className="space-y-4" ref={scrollRef}>
            {/* Upper-paragraph-end cue */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  第 {currentBridgeCard.fromParagraphIndex + 1} 段末句（引子）
                </span>
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                  衔接 {bridgeIndex + 1} / {bridgeCards.length}
                </span>
              </div>
              <p className="text-lg sm:text-xl font-classical text-zinc-800 dark:text-zinc-200 leading-relaxed">
                {currentBridgeCard.promptSentence}
              </p>
            </div>

            <div className="flex justify-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
                <ArrowDown className="w-3.5 h-3.5" />
                <span>默写第 {currentBridgeCard.toParagraphIndex + 1} 段首句</span>
              </div>
            </div>

            {/* Lower-paragraph-start target */}
            <div
              onClick={() => {
                sound.playReveal();
                setBridgeRevealed(prev => !prev);
              }}
              className={`border rounded-2xl p-5 shadow-xs cursor-pointer transition-colors ${
                bottleneckIndices.has(currentBridgeCard.targetUnitIndex)
                  ? "bg-red-50/40 dark:bg-red-950/20 border-red-300 dark:border-red-900/60"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    第 {currentBridgeCard.toParagraphIndex + 1} 段首句
                  </span>
                  {!bridgeRevealed && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                      轻触或按 M 显露对照
                    </span>
                  )}
                </div>

                <button
                  onClick={e => {
                    e.stopPropagation();
                    toggleBottleneck(currentBridgeCard.targetUnitIndex);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                    bottleneckIndices.has(currentBridgeCard.targetUnitIndex)
                      ? "bg-red-600 text-white border-red-700 dark:bg-red-500"
                      : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                  title="快捷键: B"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>
                    {bottleneckIndices.has(currentBridgeCard.targetUnitIndex)
                      ? "已记为卡壳"
                      : "标记卡壳 (B)"}
                  </span>
                </button>
              </div>

              <p
                className={`text-xl sm:text-2xl font-classical font-semibold leading-relaxed tracking-wide ${
                  !bridgeRevealed
                    ? "frosted-mask text-zinc-800 dark:text-zinc-200"
                    : "text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {currentBridgeCard.targetSentence}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <p className="text-xs text-zinc-400">暂无段间衔接卡片</p>
          </div>
        )
      ) : currentStage ? (
        <div className="space-y-4" ref={scrollRef}>

          {/* Current Spotlight Unit Card */}
          <div
            className={`border rounded-2xl p-5 shadow-xs transition-colors ${
              bottleneckIndices.has(currentStage.newlyAddedUnit.index)
                ? "bg-red-50/40 dark:bg-red-950/20 border-red-300 dark:border-red-900/60"
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {effectiveMode === "paragraph"
                    ? `第 ${activeParagraphIndex + 1} 段 · 第 ${currentStageIndex + 1} 联`
                    : `当前攻坚（第 ${currentStageIndex + 1} 联）`}
                </span>
                {bottleneckIndices.has(currentStage.newlyAddedUnit.index) && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-medium">
                    转折卡壳标记
                  </span>
                )}
              </div>

              <button
                onClick={() => toggleBottleneck(currentStage.newlyAddedUnit.index)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                  bottleneckIndices.has(currentStage.newlyAddedUnit.index)
                    ? "bg-red-600 text-white border-red-700 dark:bg-red-500"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
                title="快捷键: B"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{bottleneckIndices.has(currentStage.newlyAddedUnit.index) ? "已记为卡壳" : "标记卡壳 (B)"}</span>
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
                const isUnitBottleneck = bottleneckIndices.has(unit.index);
                const isMasked = maskHistory && !isNewest && !revealedUnitIndices.has(idx);

                return (
                  <div
                    key={unit.index}
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
          {(effectiveMode === "bridge" ? bridgeIndex > 0 : currentStageIndex > 0) && (
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
            {effectiveMode === "bridge" ? (
              isBridgeCompleted ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>完成段间衔接训练 (Space)</span>
                </>
              ) : (
                <>
                  <span>已记住 · 下一处衔接 (Space)</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )
            ) : isCompleted ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  {effectiveMode === "paragraph"
                    ? `第 ${activeParagraphIndex + 1} 段结业 · 沉淀 FSRS (Space)`
                    : "通篇结业 · 沉淀 FSRS (Space)"}
                </span>
              </>
            ) : (
              <>
                <span>背熟了 · 滚雪球下一联 (Space)</span>
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
              {settlementStats.isBridge
                ? `《${currentArticle.title}》段间衔接过关`
                : settlementStats.paragraphIndex !== undefined
                ? `《${currentArticle.title}》第 ${settlementStats.paragraphIndex + 1} 段结业`
                : `《${currentArticle.title}》全篇贯通结业`}
            </h2>
            <p className="text-xs text-center text-zinc-500 dark:text-zinc-400 mt-1 mb-5">
              {settlementStats.isBridge
                ? `已完成全篇 ${settlementStats.totalUnits} 处跨段接口衔接训练，顺畅消除跳段断点。`
                : `已按句联主卡结算 ${settlementStats.syncedCardsCount ?? settlementStats.totalUnits} 张至本地 FSRS-5 记忆库，不挤占今日闪卡新学配额。`}
            </p>

            {!settlementStats.isBridge && (
              <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-4 border border-zinc-100 dark:border-zinc-800 space-y-2.5 mb-5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {settlementStats.paragraphIndex !== undefined ? "本段联数" : "通背总联数"}
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {settlementStats.totalUnits} 联{settlementStats.paragraphIndex !== undefined ? "贯通" : "全篇贯通"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 dark:text-zinc-400">顺畅连诵率</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {Math.round((settlementStats.smoothCount / Math.max(1, settlementStats.totalUnits)) * 100)}%
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
            )}

            <ArticleScenarioLink articleId={currentArticle.id} className="mb-4" />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (settlementStats.isBridge) {
                    setBridgeIndex(0);
                    setBridgeRevealed(false);
                  } else {
                    setCurrentStageIndex(0);
                    setRevealedUnitIndices(new Set());
                  }
                  setShowSettlementModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>再来一遍</span>
              </button>
              {settlementStats.paragraphIndex !== undefined &&
              settlementStats.paragraphIndex + 1 < currentArticle.paragraphs.length ? (
                <button
                  onClick={() => {
                    handleSelectParagraph(settlementStats.paragraphIndex! + 1);
                    setShowSettlementModal(false);
                  }}
                  className="flex-[1.5] py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-white"
                >
                  继续第 {settlementStats.paragraphIndex + 2} 段
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (settlementStats.isBridge) {
                      setBridgeIndex(0);
                      setBridgeRevealed(false);
                    } else {
                      setCurrentStageIndex(0);
                      setRevealedUnitIndices(new Set());
                    }
                    setShowSettlementModal(false);
                  }}
                  className="flex-[1.5] py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-white"
                >
                  完成
                </button>
              )}
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
