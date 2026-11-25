/**
 * useFlipCardSession
 *
 * Encapsulates all queue-building, FSRS state-machine, in-session undo/re-queue
 * of missed cards, and session-level stats for FlipCardView.
 * The view layer only needs to call the returned handlers and read the returned state.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
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
  shuffleArray,
} from "../domain/fsrs/ankiScheduler";
import { getLocalDateString } from "../utils/date";
import {
  getCardState,
  saveCardState,
  recordReviewLog,
  getAllCardStates,
  getDailyRecords,
} from "../storage/db";
import { saveLastSession, SessionExtra } from "../storage/sessionTracker";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";

export type QueueMode = "due" | "new" | "article" | "random" | "deck";
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
  // DB data
  cardStatesMap: Map<string, CardFsrsState>;
  dailyPlan: DailySchedulePlan;
  isLoadingStates: boolean;
  // Filtered article list (for article-mode selector)
  targetArticles: Article[];
  // L2.2 / L2.3 modes & hints
  sequentialMode: boolean;
  toggleSequentialMode: () => void;
  showPrecedingHint: boolean;
  togglePrecedingHint: () => void;
  typingMode: boolean;
  toggleTypingMode: () => void;
  // Handlers
  handleFlip: () => void;
  handleRate: (rating: Rating) => Promise<void>;
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
    if (resumeExtra?.cardIndex !== undefined && resumeExtra.cardIndex > 0) {
      return "study";
    }
    return "deck_hub";
  });

  // ── Active Deck / Article Context ─────────────────────────────────────────
  const [activeDeckId, setActiveDeckId] = useState<string>("DECK_ALL");
  const [activeArticleId, setActiveArticleId] = useState<string | undefined>(initialArticleId);

  // ── Article List filtered by scope ────────────────────────────────────────
  const targetArticles = useMemo(
    () => filterArticlesByScope(ALL_ARTICLES, selectedScope),
    [selectedScope]
  );

  const allCards = useMemo(
    () => flashcardCache.getCardsForArticles(targetArticles),
    [targetArticles]
  );

  // ── Queue Mode ────────────────────────────────────────────────────────────
  const [queueMode, setQueueMode] = useState<QueueMode>(() => {
    if (
      resumeExtra?.queueMode &&
      ["due", "new", "article", "random", "deck"].includes(resumeExtra.queueMode)
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

  // ── Card States from IndexedDB ─────────────────────────────────────────────
  const [cardStatesMap, setCardStatesMap] = useState<Map<string, CardFsrsState>>(new Map());
  const [dailyRecords, setDailyRecords] = useState<
    { date: string; count: number; newLearned: number }[]
  >([]);
  const [isLoadingStates, setIsLoadingStates] = useState(true);

  const refreshCardStates = useCallback(async () => {
    try {
      const [states, records] = await Promise.all([getAllCardStates(), getDailyRecords()]);
      const map = new Map<string, CardFsrsState>();
      states.forEach((s) => map.set(s.cardId, s));
      setCardStatesMap(map);
      setDailyRecords(records);
    } finally {
      setIsLoadingStates(false);
    }
  }, []);

  useEffect(() => {
    refreshCardStates();
  }, [refreshCardStates]);

  const now = Date.now();
  const todayStr = getLocalDateString();
  const todayRecord = useMemo(() => {
    return (
      dailyRecords.find((r) => r.date === todayStr) || {
        date: todayStr,
        count: 0,
        newLearned: 0,
      }
    );
  }, [dailyRecords, todayStr]);

  // ── Daily Plan ────────────────────────────────────────────────────────────
  const dailyPlan = useMemo(() => {
    return ankiScheduler.buildDailyPlan(
      ALL_ARTICLES,
      cardStatesMap,
      schedulerSettings,
      todayRecord.newLearned,
      todayRecord.count,
      now
    );
  }, [cardStatesMap, schedulerSettings, todayRecord, now]);

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

  const initSessionCards = useCallback(
    (deckId: string, articleId?: string) => {
      let targetArtList: Article[] = [];
      if (articleId) {
        const a = ALL_ARTICLES.find((x) => x.id === articleId);
        targetArtList = a ? [a] : [];
      } else {
        targetArtList = getArticlesForDeck(deckId);
      }

      const plan = ankiScheduler.buildDailyPlan(
        targetArtList,
        cardStatesMap,
        schedulerSettings,
        todayRecord.newLearned,
        todayRecord.count,
        Date.now()
      );

      let queue = ankiScheduler.createSessionQueue(plan);
      if (queue.length === 0) {
        const deckCards = flashcardCache.getCardsForArticles(targetArtList);
        queue = deckCards.slice(0, 20);
      }

      if (sequentialMode) {
        queue = sortCardsSequentially(queue);
      }

      setSessionCards(queue);
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowPrecedingHint(false);
      setCompletedCount(0);
      setSessionFinished(false);
    },
    [cardStatesMap, schedulerSettings, todayRecord, sequentialMode]
  );

  const handleStartStudyDeck = (deckId: string, articleId?: string) => {
    setActiveDeckId(deckId);
    setActiveArticleId(articleId);
    if (articleId) {
      setSelectedArticleId(articleId);
      setQueueMode("article");
    } else {
      setQueueMode("deck");
    }
    initSessionCards(deckId, articleId);
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

  // Restore session extra if passed
  useEffect(() => {
    if (
      resumeExtra?.queueMode &&
      ["due", "new", "article", "random", "deck"].includes(resumeExtra.queueMode)
    ) {
      setQueueMode(resumeExtra.queueMode as QueueMode);
    }
    if (resumeExtra?.cardIndex !== undefined && resumeExtra.cardIndex >= 0) {
      const clamped =
        sessionCards.length > 0
          ? Math.min(resumeExtra.cardIndex, sessionCards.length - 1)
          : resumeExtra.cardIndex;
      setCurrentIndex(clamped);
      setHasRestoredNotice(clamped > 0);
    }
  }, [resumeExtra, sessionCards.length]);

  // Cold-start: initialize cards when entering study mode with empty queue
  useEffect(() => {
    if (viewMode === "study" && sessionCards.length === 0) {
      initSessionCards(activeDeckId, activeArticleId);
    }
  }, [viewMode, sessionCards.length, activeDeckId, activeArticleId, initSessionCards]);

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
      ALL_ARTICLES.find((a) => a.id === currentFlashcard.articleId) ||
      ALL_ARTICLES.find((a) => a.id === selectedArticleId);
    const modeLabels: Record<QueueMode, string> = {
      due: "遗忘复习",
      new: "新学启程",
      article: "单篇专攻",
      random: "乱序抽背",
      deck: "选册排程",
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
        cardIndex: currentIndex,
        totalCards: sessionCards.length,
      },
    });
  }, [viewMode, currentIndex, queueMode, selectedArticleId, currentFlashcard, sessionCards.length]);

  // ── Load State for Current Card ────────────────────────────────────────────
  useEffect(() => {
    if (!currentFlashcard) return;
    const existing = cardStatesMap.get(currentFlashcard.id);
    if (existing) {
      setCurrentCardState(existing);
      setIsFlipped(false);
    } else {
      getCardState(currentFlashcard.id).then((state) => {
        setCurrentCardState(state || fsrs.createInitialCard(currentFlashcard.id));
        setIsFlipped(false);
      });
    }
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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFlip = useCallback(() => {
    sound.playFlip();
    setIsFlipped((prev) => !prev);
  }, []);

  const handleRate = async (rating: Rating) => {
    if (!currentFlashcard || !currentCardState) return;

    if (rating === Rating.AGAIN) {
      sound.playWrong();
    } else {
      sound.playCorrect();
    }

    const result = fsrs.evaluateReview(currentCardState, rating);

    // Update in-memory state map
    const nextMap = new Map(cardStatesMap);
    nextMap.set(currentFlashcard.id, result.updatedCard);
    setCardStatesMap(nextMap);

    // Async DB persistence
    saveCardState(result.updatedCard).catch(() => {});
    recordReviewLog(result.reviewLog).catch(() => {});

    setCompletedCount((prev) => prev + 1);

    const willRequeue = rating === Rating.AGAIN && schedulerSettings.enableSessionLoop;

    if (willRequeue) {
      setSessionCards((prevQueue) =>
        ankiScheduler.requeueFailedCard(prevQueue, currentIndex, currentFlashcard, 4)
      );
    }

    if (!willRequeue && currentIndex + 1 >= sessionCards.length) {
      sound.playCelebration();
      fireConfetti();
      setSessionFinished(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      setShowPrecedingHint(false);
    }
  };

  const toggleSequentialMode = useCallback(() => {
    setSequentialMode((prev) => {
      const next = !prev;
      if (next) {
        setSessionCards((q) => sortCardsSequentially(q));
        setCurrentIndex(0);
        setIsFlipped(false);
        setShowPrecedingHint(false);
      }
      return next;
    });
  }, []);

  const togglePrecedingHint = useCallback(() => {
    setShowPrecedingHint((prev) => !prev);
  }, []);

  const toggleTypingMode = useCallback(() => {
    setTypingMode((prev) => !prev);
  }, []);

  const handleSwitchMode = (mode: QueueMode) => {
    setQueueMode(mode);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowPrecedingHint(false);
    setCompletedCount(0);
    setSessionFinished(false);
    setHasRestoredNotice(false);

    let nextQueue: Flashcard[] = [];
    if (mode === "due") {
      nextQueue = dueCardsAll.slice(0, 30);
    } else if (mode === "new") {
      nextQueue = newCardsAll.slice(0, schedulerSettings.dailyNewLimit || 20);
    } else if (mode === "article") {
      const art = ALL_ARTICLES.find((a) => a.id === selectedArticleId);
      nextQueue = art ? flashcardCache.getCardsForArticle(art) : [];
    } else if (mode === "random") {
      const shuffled = shuffleArray(allCards);
      nextQueue = shuffled.slice(0, 25);
    }
    setSessionCards(sequentialMode ? sortCardsSequentially(nextQueue) : nextQueue);
  };

  const handleSelectArticle = (articleId: string) => {
    setSelectedArticleId(articleId);
    const art = ALL_ARTICLES.find((a) => a.id === articleId);
    const nextQueue = art ? flashcardCache.getCardsForArticle(art) : [];
    setSessionCards(sequentialMode ? sortCardsSequentially(nextQueue) : nextQueue);
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
    handleFlip,
    handleRate,
    handleSwitchMode,
    handleSelectArticle,
    handleResetIndex,
    handleStartStudyDeck,
    handleUpdateSettings,
    refreshCardStates,
  };
}
