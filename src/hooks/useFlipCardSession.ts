/**
 * useFlipCardSession
 *
 * Encapsulates all queue-building, FSRS state-machine, in-session undo/re-queue
 * of missed cards, and session-level stats for FlipCardView.
 * The view layer only needs to call the returned handlers and read the returned state.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ARTICLE_INDEX, ARTICLE_INDEX_MAP, type ArticleMeta } from "../data/curriculumIndex";
import type { Article } from "../data/curriculumTypes";
import {
  loadAllArticles,
  loadArticleById,
  loadArticlesByIds,
  loadArticlesForScope,
} from "../data/curriculumLoader";
import { Flashcard } from "../data/flashcardGenerator";
import { flashcardCache } from "../data/flashcardCache";
import { filterArticlesByScope } from "../data/articleTaxonomy";
import { getArticlesForDeck } from "../data/ankiDecks";
import {
  FSRSEngine,
  FsrsSettings,
  DEFAULT_FSRS_SETTINGS,
  getFsrsSettings,
  createFsrsEngine,
} from "../domain/fsrs/fsrsEngine";
import { CardFsrsState, Rating, CardState } from "../domain/fsrs/fsrsTypes";
import {
  ankiScheduler,
  SchedulerSettings,
  DEFAULT_SCHEDULER_SETTINGS,
  DailySchedulePlan,
  burySiblingCards,
  shuffleArray,
} from "../domain/fsrs/ankiScheduler";
import { buildRescueFlashcardQueue } from "../domain/fsrs/rescueQueue";
import { getLocalDateString } from "../utils/date";
import {
  getCardState,
  recordReviewLog,
} from "../storage/db";
import { useStudyStore, studyStore, hydrateStudyStore } from "../storage/studyStore";
import { saveLastSession, SessionExtra } from "../storage/sessionTracker";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";

export type QueueMode = "due" | "new" | "article" | "random" | "deck" | "rescue";
export type ViewMode = "deck_hub" | "study";

export function sortCardsSequentially(cards: Flashcard[]): Flashcard[] {
  return [...cards].sort((a, b) => {
    if (a.articleId !== b.articleId) {
      return a.articleId.localeCompare(b.articleId);
    }
    const pDiff = (a.paragraphIndex ?? 0) - (b.paragraphIndex ?? 0);
    if (pDiff !== 0) return pDiff;
    if (a.unitIndex !== b.unitIndex) return a.unitIndex - b.unitIndex;
    return a.clozeIndex - b.clozeIndex;
  });
}

interface UseFlipCardSessionOptions {
  initialArticleId?: string;
  selectedScope: string;
  resumeExtra?: SessionExtra;
}

export interface FlipCardSessionState {
  // Settings
  fsrsSettings: FsrsSettings;
  schedulerSettings: SchedulerSettings;
  // View mode
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  // Deck / article context
  activeDeckId: string;
  activeArticleId: string | undefined;
  setActiveArticleId: (id: string | undefined) => void;
  // Queue & navigation
  queueMode: QueueMode;
  selectedArticleId: string;
  setSelectedArticleId: (id: string) => void;
  sessionCards: Flashcard[];
  currentIndex: number;
  currentFlashcard: Flashcard | undefined;
  isFlipped: boolean;
  // Per-card FSRS state
  currentCardState: CardFsrsState | null;
  intervalBadges: Record<Rating, string>;
  // Session stats
  completedCount: number;
  sessionFinished: boolean;
  hasRestoredNotice: boolean;
  setHasRestoredNotice: (v: boolean) => void;
  remainingInSession: number;
  // Cards counts for display
  newCardsAll: Flashcard[];
  dueCardsAll: Flashcard[];
  rescueCards: Flashcard[];
  // DB data
  cardStatesMap: Map<string, CardFsrsState>;
  dailyPlan: DailySchedulePlan;
  isLoadingStates: boolean;
  // Filtered article list (for article-mode selector)
  targetArticles: ArticleMeta[];
  // L2.2 / L2.3 modes & hints
  sequentialMode: boolean;
  toggleSequentialMode: () => void;
  showPrecedingHint: boolean;
  togglePrecedingHint: () => void;
  typingMode: boolean;
  toggleTypingMode: () => void;
  // Undo
  canUndo: boolean;
  // Handlers
  handleFlip: () => void;
  handleRate: (rating: Rating) => Promise<void>;
  handleUndo: () => void;
  handleSwitchMode: (mode: QueueMode) => void;
  handleSelectArticle: (articleId: string) => void;
  handleResetIndex: () => void;
  handleStartStudyDeck: (deckId: string, articleId?: string) => void;
  handleUpdateSettings: (settings: SchedulerSettings) => Promise<void>;
  refreshCardStates: () => Promise<void>;
}

export function useFlipCardSession({
  initialArticleId,
  selectedScope,
  resumeExtra,
}: UseFlipCardSessionOptions): FlipCardSessionState {
  // ── FSRS Engine ────────────────────────────────────────────────────────────
  const [fsrsSettings, setFsrsSettings] = useState<FsrsSettings>(DEFAULT_FSRS_SETTINGS);
  useEffect(() => {
    Promise.resolve(getFsrsSettings()).then(setFsrsSettings);
  }, []);
  const fsrs = useMemo<FSRSEngine>(() => createFsrsEngine(fsrsSettings), [fsrsSettings]);

  // ── Scheduler Settings ─────────────────────────────────────────────────────
  const [schedulerSettings, setSchedulerSettings] = useState<SchedulerSettings>(
    DEFAULT_SCHEDULER_SETTINGS
  );
  useEffect(() => {
    ankiScheduler.getSettings().then(setSchedulerSettings);
  }, []);

  const handleUpdateSettings = async (newSettings: SchedulerSettings) => {
    setSchedulerSettings(newSettings);
    await ankiScheduler.saveSettings(newSettings);
  };

  // ── View Mode ─────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (
      resumeExtra?.autoStart ||
      resumeExtra?.deckId ||
      resumeExtra?.cardIndex !== undefined ||
      resumeExtra?.queueMode === "rescue" ||
      (resumeExtra?.queueMode && ["due", "new", "article", "random", "deck"].includes(resumeExtra.queueMode))
    ) {
      return "study";
    }
    return "deck_hub";
  });

  // ── Active Deck / Article Context ─────────────────────────────────────────
  const [activeDeckId, setActiveDeckId] = useState<string>(() => {
    if (resumeExtra?.queueMode === "rescue") return "DECK_RESCUE";
    if (resumeExtra?.deckId) return resumeExtra.deckId;
    return "DECK_ALL";
  });
  const [activeArticleId, setActiveArticleId] = useState<string | undefined>(() => {
    if (resumeExtra?.queueMode === "rescue" || resumeExtra?.deckId) return undefined;
    return initialArticleId;
  });

  // ── Article List filtered by scope ────────────────────────────────────────
  const targetArticles: ArticleMeta[] = useMemo(
    () => filterArticlesByScope(ARTICLE_INDEX, selectedScope),
    [selectedScope]
  );

  const [loadedScopeArticles, setLoadedScopeArticles] = useState<Article[]>([]);
  const [loadedAllArticles, setLoadedAllArticles] = useState<Article[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadArticlesForScope(selectedScope).then((arts) => {
      if (!cancelled) setLoadedScopeArticles(arts);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedScope]);

  useEffect(() => {
    let cancelled = false;
    loadAllArticles().then((arts) => {
      if (!cancelled) setLoadedAllArticles(arts);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const allCards = useMemo(
    () => flashcardCache.getCardsForArticles(loadedScopeArticles),
    [loadedScopeArticles]
  );

  // ── Queue Mode ────────────────────────────────────────────────────────────
  const [queueMode, setQueueMode] = useState<QueueMode>(() => {
    if (
      resumeExtra?.queueMode &&
      ["due", "new", "article", "random", "deck", "rescue"].includes(resumeExtra.queueMode)
    ) {
      return resumeExtra.queueMode as QueueMode;
    }
    return "due";
  });

  const [selectedArticleId, setSelectedArticleId] = useState<string>(() => {
    return initialArticleId || targetArticles[0]?.id || "art_bx1_12";
  });

  // Sync initialArticleId if passed
  useEffect(() => {
    if (initialArticleId) {
      setSelectedArticleId(initialArticleId);
      setActiveArticleId(initialArticleId);
    }
  }, [initialArticleId]);

  // ── Card States from StudyStore (0ms reactive cache) ───────────────────────
  const {
    cards: cardStatesMap,
    dailyRecords: dailyRecordsMap,
    bottlenecks: bottlenecksMap,
    settings: storeSettings,
    hydrated,
  } = useStudyStore();
  const isLoadingStates = !hydrated;

  const rescueCards = useMemo(() => {
    return buildRescueFlashcardQueue({
      bottlenecks: bottlenecksMap,
      cramRatings: studyStore.getCramRatings(),
      scenarioWrongItems: studyStore.getScenarioWrongItems(),
      cardStatesMap,
    });
  }, [bottlenecksMap, storeSettings, cardStatesMap]);

  const refreshCardStates = useCallback(async () => {
    await hydrateStudyStore();
  }, []);

  const now = useMemo(() => Date.now(), [cardStatesMap, dailyRecordsMap, schedulerSettings]);
  const todayStr = getLocalDateString();
  const todayRecord = useMemo(() => {
    return (
      dailyRecordsMap.get(todayStr) || {
        date: todayStr,
        count: 0,
        newLearned: 0,
      }
    );
  }, [dailyRecordsMap, todayStr]);

  // Exclude new cards & snowball sessions from today's review quota count
  const todayReviewedCount = Math.max(
    0,
    todayRecord.count - todayRecord.newLearned - (todayRecord.snowballCount ?? 0)
  );

  // ── Daily Plan ────────────────────────────────────────────────────────────
  const dailyPlan = useMemo(() => {
    return ankiScheduler.buildDailyPlan(
      loadedAllArticles,
      cardStatesMap,
      schedulerSettings,
      todayRecord.newLearned,
      todayReviewedCount,
      now
    );
  }, [loadedAllArticles, cardStatesMap, schedulerSettings, todayRecord.newLearned, todayReviewedCount, now]);

  // ── Due / New card lists ───────────────────────────────────────────────────
  const dueCardsAll = useMemo(() => {
    return allCards
      .filter((card) => {
        const state = cardStatesMap.get(card.id);
        return state && state.state !== CardState.NEW && state.dueTime <= now;
      })
      .sort((a, b) => {
        const stateA = cardStatesMap.get(a.id);
        const stateB = cardStatesMap.get(b.id);
        return (stateA?.dueTime || 0) - (stateB?.dueTime || 0);
      });
  }, [allCards, cardStatesMap, now]);

  const newCardsAll = useMemo(() => {
    return allCards.filter((card) => {
      const state = cardStatesMap.get(card.id);
      return !state || state.state === CardState.NEW;
    });
  }, [allCards, cardStatesMap]);

  // ── L2.2 / L2.3 Modes & Hints ─────────────────────────────────────────────
  const [sequentialMode, setSequentialMode] = useState(false);
  const [showPrecedingHint, setShowPrecedingHint] = useState(false);
  const [typingMode, setTypingMode] = useState(false);

  // ── Session Queue ─────────────────────────────────────────────────────────
  const [sessionCards, setSessionCards] = useState<Flashcard[]>([]);
  const queueRequestIdRef = useRef(0);
  const appliedResumeExtraRef = useRef<SessionExtra | undefined>(undefined);
  const hasInitializedColdStartRef = useRef(false);
  const lastCardIdRef = useRef<string | undefined>(undefined);
  const initialArticleIdRef = useRef(initialArticleId);
  initialArticleIdRef.current = initialArticleId;
  const selectedArticleIdRef = useRef(selectedArticleId);
  selectedArticleIdRef.current = selectedArticleId;
  const activeDeckIdRef = useRef(activeDeckId);
  activeDeckIdRef.current = activeDeckId;
  const activeArticleIdRef = useRef(activeArticleId);
  activeArticleIdRef.current = activeArticleId;
  const sequentialModeRef = useRef(sequentialMode);
  sequentialModeRef.current = sequentialMode;

  const initSessionCards = useCallback(
    async (
      deckId: string,
      articleId?: string,
      restoreIndex?: number | null,
      explicitMode?: QueueMode
    ) => {
      const reqId = ++queueRequestIdRef.current;
      const shouldBury = schedulerSettings.burySiblings !== false;

      if (deckId === "DECK_RESCUE" || explicitMode === "rescue") {
        const rescueQueue = sequentialMode ? sortCardsSequentially(rescueCards) : [...rescueCards];
        const targetIdx =
          restoreIndex !== undefined && restoreIndex !== null && rescueQueue.length > 0
            ? Math.min(Math.max(0, restoreIndex), rescueQueue.length - 1)
            : 0;
        setSessionCards(rescueQueue);
        setCurrentIndex(targetIdx);
        setHasRestoredNotice(targetIdx > 0);
        setIsFlipped(false);
        setShowPrecedingHint(false);
        setCompletedCount(0);
        setSessionFinished(false);
        setUndoStack([]);
        return;
      }

      let queue: Flashcard[] = [];

      if (explicitMode === "due" || explicitMode === "new" || explicitMode === "random") {
        const scopeArts = await loadArticlesForScope(selectedScope);
        if (queueRequestIdRef.current !== reqId) return;
        const scopeCards = flashcardCache.getCardsForArticles(scopeArts);
        const nowMs = Date.now();
        if (explicitMode === "due") {
          const duePool = scopeCards
            .filter((card) => {
              const st = cardStatesMap.get(card.id);
              return st && st.state !== CardState.NEW && st.dueTime <= nowMs;
            })
            .sort((a, b) => (cardStatesMap.get(a.id)?.dueTime || 0) - (cardStatesMap.get(b.id)?.dueTime || 0));
          queue = (shouldBury ? burySiblingCards(duePool).selected : duePool).slice(0, 30);
        } else if (explicitMode === "new") {
          const newPool = scopeCards.filter((card) => {
            const st = cardStatesMap.get(card.id);
            return !st || st.state === CardState.NEW;
          });
          queue = (shouldBury ? burySiblingCards(newPool).selected : newPool).slice(
            0,
            schedulerSettings.dailyNewLimit || 20
          );
        } else {
          const shuffled = shuffleArray(scopeCards);
          queue = (shouldBury ? burySiblingCards(shuffled).selected : shuffled).slice(0, 25);
        }
      } else {
        let targetArtList: Article[] = [];
        if (articleId) {
          const a = await loadArticleById(articleId);
          if (queueRequestIdRef.current !== reqId) return;
          targetArtList = a ? [a] : [];
        } else {
          const metas = getArticlesForDeck(deckId);
          targetArtList = await loadArticlesByIds(metas.map((m) => m.id));
          if (queueRequestIdRef.current !== reqId) return;
        }

        const plan = ankiScheduler.buildDailyPlan(
          targetArtList,
          cardStatesMap,
          schedulerSettings,
          todayRecord.newLearned,
          todayReviewedCount,
          Date.now()
        );

        queue = ankiScheduler.createSessionQueue(plan);
      }

      if (sequentialMode) {
        queue = sortCardsSequentially(queue);
      }

      const targetIdx =
        restoreIndex !== undefined && restoreIndex !== null && queue.length > 0
          ? Math.min(Math.max(0, restoreIndex), queue.length - 1)
          : 0;

      setSessionCards(queue);
      setCurrentIndex(targetIdx);
      setHasRestoredNotice(targetIdx > 0);
      setIsFlipped(false);
      setShowPrecedingHint(false);
      setCompletedCount(0);
      setSessionFinished(false);
      setUndoStack([]);
    },
    [cardStatesMap, schedulerSettings, todayRecord.newLearned, todayReviewedCount, sequentialMode, rescueCards, selectedScope]
  );

  const initSessionCardsRef = useRef(initSessionCards);
  initSessionCardsRef.current = initSessionCards;

  const handleStartStudyDeck = (deckId: string, articleId?: string) => {
    hasInitializedColdStartRef.current = true;
    setActiveDeckId(deckId);
    setActiveArticleId(articleId);
    if (deckId === "DECK_RESCUE") {
      setQueueMode("rescue");
    } else if (articleId) {
      setSelectedArticleId(articleId);
      setQueueMode("article");
    } else {
      setQueueMode("deck");
    }
    void initSessionCards(deckId, articleId);
    setViewMode("study");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Navigation & Card State ────────────────────────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (resumeExtra?.cardIndex !== undefined && resumeExtra.cardIndex > 0) {
      return resumeExtra.cardIndex;
    }
    return 0;
  });

  const [hasRestoredNotice, setHasRestoredNotice] = useState(() => {
    return resumeExtra?.cardIndex !== undefined && resumeExtra.cardIndex > 0;
  });

  // Restore session extra ONCE per new resumeExtra object (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    if (!resumeExtra || appliedResumeExtraRef.current === resumeExtra) return;
    appliedResumeExtraRef.current = resumeExtra;

    const rawMode = resumeExtra.queueMode;
    const validMode: QueueMode | undefined =
      rawMode && ["due", "new", "article", "random", "deck", "rescue"].includes(rawMode)
        ? (rawMode as QueueMode)
        : undefined;

    if (validMode) {
      setQueueMode(validMode);
    }

    const restoreIdx =
      resumeExtra.cardIndex !== undefined && resumeExtra.cardIndex >= 0
        ? resumeExtra.cardIndex
        : null;

    if (validMode === "rescue") {
      setActiveDeckId("DECK_RESCUE");
      setActiveArticleId(undefined);
      setViewMode("study");
      hasInitializedColdStartRef.current = true;
      void initSessionCardsRef.current("DECK_RESCUE", undefined, restoreIdx);
      return;
    }

    if (
      resumeExtra.autoStart ||
      resumeExtra.deckId ||
      resumeExtra.cardIndex !== undefined ||
      validMode !== undefined
    ) {
      const isTabMode = validMode === "due" || validMode === "new" || validMode === "random";
      const nextArtId =
        validMode === "article"
          ? initialArticleIdRef.current || selectedArticleIdRef.current
          : resumeExtra.deckId || isTabMode
            ? undefined
            : activeArticleIdRef.current;
      const nextDeckId =
        resumeExtra.deckId ||
        (validMode === "article" ? nextArtId || "DECK_ALL" : "DECK_ALL");

      setActiveDeckId(nextDeckId);
      if (nextArtId) {
        setActiveArticleId(nextArtId);
        setSelectedArticleId(nextArtId);
      } else if (resumeExtra.deckId || isTabMode) {
        setActiveArticleId(undefined);
      }
      setViewMode("study");
      hasInitializedColdStartRef.current = true;
      void initSessionCardsRef.current(nextDeckId, nextArtId, restoreIdx, validMode);
      return;
    }

    if (restoreIdx !== null) {
      const clamped =
        sessionCards.length > 0 ? Math.min(restoreIdx, sessionCards.length - 1) : restoreIdx;
      setCurrentIndex(clamped);
      setHasRestoredNotice(clamped > 0);
    }
  }, [hydrated, resumeExtra, sessionCards.length]);

  // Cold-start: initialize cards ONCE when entering study mode after hydration
  // Never overwrite intentionally empty due/new/random/rescue tabs once initialized.
  useEffect(() => {
    if (viewMode === "deck_hub") {
      hasInitializedColdStartRef.current = false;
      return;
    }
    if (!hydrated || viewMode !== "study" || hasInitializedColdStartRef.current) return;
    hasInitializedColdStartRef.current = true;
    if (sessionCards.length === 0) {
      void initSessionCardsRef.current(
        queueMode === "rescue" ? "DECK_RESCUE" : activeDeckIdRef.current,
        activeArticleIdRef.current
      );
    }
  }, [hydrated, viewMode, queueMode, sessionCards.length]);

  // Keep currentIndex clamped within bounds
  useEffect(() => {
    if (sessionCards.length > 0 && currentIndex >= sessionCards.length) {
      setCurrentIndex(Math.max(0, sessionCards.length - 1));
    }
  }, [sessionCards.length, currentIndex]);

  const [isFlipped, setIsFlipped] = useState(false);
  const [currentCardState, setCurrentCardState] = useState<CardFsrsState | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);

  const currentFlashcard: Flashcard | undefined = sessionCards[currentIndex];

  // ── Session Tracker Sync ───────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== "study" || sessionCards.length === 0 || !currentFlashcard) return;
    const cardArticle =
      ARTICLE_INDEX_MAP[currentFlashcard.articleId] ||
      ARTICLE_INDEX_MAP[selectedArticleId];
    const modeLabels: Record<QueueMode, string> = {
      due: "遗忘复习",
      new: "新学启程",
      article: "单篇专攻",
      random: "乱序抽背",
      deck: "选册排程",
      rescue: "高频卡壳急救",
    };

    saveLastSession({
      view: "flipcard",
      articleId: queueMode === "article" ? selectedArticleId : currentFlashcard.articleId,
      articleTitle: cardArticle?.title || currentFlashcard.frontTitle.replace(/[《》]/g, ""),
      articleAuthor: cardArticle?.author,
      articleDynasty: cardArticle?.dynasty,
      modeName: "翻转闪卡",
      progressText: `${modeLabels[queueMode] || "牌组背诵"} · 卡片 ${currentIndex + 1} / ${sessionCards.length}`,
      progressPercent: Math.min(
        100,
        Math.round(((currentIndex + 1) / Math.max(1, sessionCards.length)) * 100)
      ),
      updatedAt: Date.now(),
      extra: {
        queueMode,
        deckId: queueMode === "deck" || queueMode === "rescue" ? activeDeckId : undefined,
        autoStart: true,
        cardIndex: currentIndex,
        totalCards: sessionCards.length,
      },
    });
  }, [viewMode, currentIndex, queueMode, activeDeckId, selectedArticleId, currentFlashcard, sessionCards.length]);

  // ── Load State for Current Card ────────────────────────────────────────────
  useEffect(() => {
    if (!currentFlashcard) {
      lastCardIdRef.current = undefined;
      setCurrentCardState(null);
      return;
    }

    let cancelled = false;
    const cardChanged = lastCardIdRef.current !== currentFlashcard.id;
    if (cardChanged) {
      lastCardIdRef.current = currentFlashcard.id;
      setIsFlipped(false);
    }

    const existing = cardStatesMap.get(currentFlashcard.id);
    if (existing) {
      setCurrentCardState(existing);
    } else {
      if (cardChanged) {
        setCurrentCardState(null);
      }
      getCardState(currentFlashcard.id).then((state) => {
        if (cancelled) return;
        setCurrentCardState(state || fsrs.createInitialCard(currentFlashcard.id));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [currentFlashcard, cardStatesMap, fsrs]);

  // ── Interval Badges ───────────────────────────────────────────────────────
  const intervalBadges = useMemo(() => {
    if (!currentCardState) {
      return {
        [Rating.AGAIN]: "<10分",
        [Rating.HARD]: "1天",
        [Rating.GOOD]: "4天",
        [Rating.EASY]: "16天",
      };
    }
    return fsrs.previewIntervals(currentCardState);
  }, [currentCardState, fsrs]);

  interface UndoEntry {
    cardId: string;
    previousState: CardFsrsState;
    previousIndex: number;
    previousQueue: Flashcard[];
    previousCompletedCount: number;
    wasNewCard: boolean;
  }
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const canUndo = undoStack.length > 0;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFlip = useCallback(() => {
    sound.playFlip();
    setIsFlipped((prev) => !prev);
  }, []);

  const handleRate = async (rating: Rating) => {
    if (
      sessionFinished ||
      !currentFlashcard ||
      !currentCardState ||
      currentCardState.cardId !== currentFlashcard.id
    ) {
      return;
    }

    if (rating === Rating.AGAIN) {
      sound.playWrong();
    } else {
      sound.playCorrect();
    }

    const previousStateSnapshot: CardFsrsState = { ...currentCardState };
    const result = fsrs.evaluateReview(currentCardState, rating);
    const wasNewCard = result.reviewLog.previousState === CardState.NEW;

    setUndoStack((prev) => [
      ...prev.slice(-19),
      {
        cardId: currentFlashcard.id,
        previousState: previousStateSnapshot,
        previousIndex: currentIndex,
        previousQueue: sessionCards,
        previousCompletedCount: completedCount,
        wasNewCard,
      },
    ]);

    // Optimistic 0ms update in StudyStore + background IndexedDB persistence
    studyStore.upsertCard(result.updatedCard);
    studyStore.recordDailyActivity({
      countDelta: 1,
      newLearnedDelta: wasNewCard ? 1 : 0,
    });
    recordReviewLog(result.reviewLog, { updateDailyRecord: false }).catch(() => {});

    setCompletedCount((prev) => prev + 1);

    // Requeue cards that remain in intraday LEARNING / RELEARNING steps (not only AGAIN)
    // so new/relearning cards can graduate cleanly to REVIEW within a single session.
    const staysInIntradayStep =
      result.updatedCard.state === CardState.LEARNING ||
      result.updatedCard.state === CardState.RELEARNING;
    const willRequeue =
      schedulerSettings.enableSessionLoop &&
      (rating === Rating.AGAIN || staysInIntradayStep);

    if (willRequeue) {
      const offset = rating === Rating.AGAIN ? 4 : rating === Rating.HARD ? 5 : 6;
      setSessionCards((prevQueue) =>
        ankiScheduler.requeueFailedCard(prevQueue, currentIndex, currentFlashcard, offset)
      );
    }

    if (!willRequeue && currentIndex + 1 >= sessionCards.length) {
      sound.playCelebration();
      fireConfetti();
      setIsFlipped(false);
      setSessionFinished(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      setShowPrecedingHint(false);
    }
  };

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      studyStore.upsertCard(last.previousState);
      studyStore.recordDailyActivity({
        countDelta: -1,
        newLearnedDelta: last.wasNewCard ? -1 : 0,
      });
      setSessionCards(last.previousQueue);
      setCurrentIndex(last.previousIndex);
      setCompletedCount(last.previousCompletedCount);
      setSessionFinished(false);
      setIsFlipped(true);
      setShowPrecedingHint(false);
      sound.playFlip();
      return prev.slice(0, -1);
    });
  }, []);

  const toggleSequentialMode = useCallback(() => {
    const next = !sequentialModeRef.current;
    sequentialModeRef.current = next;
    setSequentialMode(next);
    if (next) {
      setSessionCards((q) => sortCardsSequentially(q));
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowPrecedingHint(false);
    }
  }, []);

  const togglePrecedingHint = useCallback(() => {
    setShowPrecedingHint((prev) => !prev);
  }, []);

  const toggleTypingMode = useCallback(() => {
    setTypingMode((prev) => !prev);
  }, []);

  const handleSwitchMode = async (mode: QueueMode) => {
    const reqId = ++queueRequestIdRef.current;
    hasInitializedColdStartRef.current = true;
    setQueueMode(mode);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowPrecedingHint(false);
    setCompletedCount(0);
    setSessionFinished(false);
    setHasRestoredNotice(false);

    const shouldBury = schedulerSettings.burySiblings !== false;
    let nextQueue: Flashcard[] = [];
    if (mode === "due") {
      const pool = shouldBury ? burySiblingCards(dueCardsAll).selected : dueCardsAll;
      nextQueue = pool.slice(0, 30);
    } else if (mode === "new") {
      const pool = shouldBury ? burySiblingCards(newCardsAll).selected : newCardsAll;
      nextQueue = pool.slice(0, schedulerSettings.dailyNewLimit || 20);
    } else if (mode === "article") {
      const art = await loadArticleById(selectedArticleId);
      if (queueRequestIdRef.current !== reqId) return;
      const raw = art ? flashcardCache.getCardsForArticle(art) : [];
      nextQueue = shouldBury ? burySiblingCards(raw).selected : raw;
    } else if (mode === "random") {
      const shuffled = shuffleArray(allCards);
      const pool = shouldBury ? burySiblingCards(shuffled).selected : shuffled;
      nextQueue = pool.slice(0, 25);
    } else if (mode === "rescue") {
      nextQueue = [...rescueCards];
    }
    setSessionCards(sequentialModeRef.current ? sortCardsSequentially(nextQueue) : nextQueue);
  };

  const handleSelectArticle = async (articleId: string) => {
    const reqId = ++queueRequestIdRef.current;
    hasInitializedColdStartRef.current = true;
    setSelectedArticleId(articleId);
    const art = await loadArticleById(articleId);
    if (queueRequestIdRef.current !== reqId) return;
    const rawQueue = art ? flashcardCache.getCardsForArticle(art) : [];
    const nextQueue =
      schedulerSettings.burySiblings !== false
        ? burySiblingCards(rawQueue).selected
        : rawQueue;
    setSessionCards(sequentialModeRef.current ? sortCardsSequentially(nextQueue) : nextQueue);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowPrecedingHint(false);
    setCompletedCount(0);
    setSessionFinished(false);
    setHasRestoredNotice(false);
  };

  const handleResetIndex = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowPrecedingHint(false);
    setHasRestoredNotice(false);
  };

  return {
    fsrsSettings,
    schedulerSettings,
    viewMode,
    setViewMode,
    activeDeckId,
    activeArticleId,
    setActiveArticleId,
    queueMode,
    selectedArticleId,
    setSelectedArticleId,
    sessionCards,
    currentIndex,
    currentFlashcard,
    isFlipped,
    currentCardState,
    intervalBadges,
    completedCount,
    sessionFinished,
    hasRestoredNotice,
    setHasRestoredNotice,
    remainingInSession: Math.max(0, sessionCards.length - currentIndex),
    newCardsAll,
    dueCardsAll,
    rescueCards,
    cardStatesMap,
    dailyPlan,
    isLoadingStates,
    targetArticles,
    sequentialMode,
    toggleSequentialMode,
    showPrecedingHint,
    togglePrecedingHint,
    typingMode,
    toggleTypingMode,
    canUndo,
    handleFlip,
    handleRate,
    handleUndo,
    handleSwitchMode,
    handleSelectArticle,
    handleResetIndex,
    handleStartStudyDeck,
    handleUpdateSettings,
    refreshCardStates,
  };
}
