import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { Flashcard } from "../data/flashcardGenerator";
import { flashcardCache } from "../data/flashcardCache";
import { filterArticlesByScope } from "../data/articleTaxonomy";
import {
  VOLUME_DECKS,
  SPECIAL_DECKS,
  getArticlesForDeck,
  getVolumeForArticle
} from "../data/ankiDecks";
import {
  FSRSEngine,
  FsrsSettings,
  DEFAULT_FSRS_SETTINGS,
  getFsrsSettings,
  createFsrsEngine
} from "../domain/fsrs/fsrsEngine";
import { CardFsrsState, Rating, CardState } from "../domain/fsrs/fsrsTypes";
import {
  ankiScheduler,
  SchedulerSettings,
  DEFAULT_SCHEDULER_SETTINGS,
  DailySchedulePlan,
  shuffleArray
} from "../domain/fsrs/ankiScheduler";
import { getLocalDateString } from "../utils/date";
import { getCardState, saveCardState, recordReviewLog, getAllCardStates, getDailyRecords } from "../storage/db";
import { saveLastSession, SessionExtra } from "../storage/sessionTracker";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { AnkiDeckHub } from "../components/AnkiDeckHub";
import { StudySidebar } from "../components/StudySidebar";
import { NavView } from "../components/Navbar";
import {
  RotateCw,
  CheckCircle,
  Sparkles,
  BookOpen,
  Trophy,
  Clock,
  Zap,
  Shuffle,
  RotateCcw,
  X,
  ChevronLeft,
  Flame,
  ArrowLeft,
  Layers,
  Sliders,
  HelpCircle
} from "lucide-react";

type QueueMode = "due" | "new" | "article" | "random" | "deck";
type ViewMode = "deck_hub" | "study";

interface FlipCardViewProps {
  initialArticleId?: string;
  selectedScope: string;
  resumeExtra?: SessionExtra;
  onOpenArticleInView?: (articleId: string, view: NavView) => void;
}

export const FlipCardView: React.FC<FlipCardViewProps> = ({
  initialArticleId,
  selectedScope,
  resumeExtra,
  onOpenArticleInView
}) => {
  const [fsrsSettings, setFsrsSettings] = useState<FsrsSettings>(DEFAULT_FSRS_SETTINGS);

  useEffect(() => {
    Promise.resolve(getFsrsSettings()).then(setFsrsSettings);
  }, []);

  const fsrs = useMemo<FSRSEngine>(() => createFsrsEngine(fsrsSettings), [fsrsSettings]);

  // Scheduler settings state
  const [schedulerSettings, setSchedulerSettings] = useState<SchedulerSettings>(DEFAULT_SCHEDULER_SETTINGS);

  useEffect(() => {
    ankiScheduler.getSettings().then(setSchedulerSettings);
  }, []);

  const handleUpdateSettings = async (newSettings: SchedulerSettings) => {
    setSchedulerSettings(newSettings);
    await ankiScheduler.saveSettings(newSettings);
  };

  // View mode: 'deck_hub' (Anki 牌组总览) or 'study' (正在背诵)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (resumeExtra?.cardIndex !== undefined && resumeExtra.cardIndex > 0) {
      return "study";
    }
    return "deck_hub";
  });

  // Active Deck context
  const [activeDeckId, setActiveDeckId] = useState<string>("DECK_ALL");
  const [activeArticleId, setActiveArticleId] = useState<string | undefined>(initialArticleId);

  // Filter articles based on selected scope
  const targetArticles = useMemo(() => {
    return filterArticlesByScope(ALL_ARTICLES, selectedScope);
  }, [selectedScope]);

  // Use FlashcardCache
  const allCards = useMemo(() => {
    return flashcardCache.getCardsForArticles(targetArticles);
  }, [targetArticles]);

  const [queueMode, setQueueMode] = useState<QueueMode>(() => {
    if (resumeExtra?.queueMode && ["due", "new", "article", "random", "deck"].includes(resumeExtra.queueMode)) {
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

  const [cardStatesMap, setCardStatesMap] = useState<Map<string, CardFsrsState>>(new Map());
  const [dailyRecords, setDailyRecords] = useState<{ date: string; count: number; newLearned: number }[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(true);

  // Load all card states & daily records from IndexedDB
  const refreshCardStates = useCallback(async () => {
    try {
      const [states, records] = await Promise.all([
        getAllCardStates(),
        getDailyRecords()
      ]);
      const map = new Map<string, CardFsrsState>();
      states.forEach(s => map.set(s.cardId, s));
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
    return dailyRecords.find(r => r.date === todayStr) || { date: todayStr, count: 0, newLearned: 0 };
  }, [dailyRecords, todayStr]);

  // Today's schedule plan computed via ankiScheduler
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

  // Optimized due and new cards
  const dueCardsAll = useMemo(() => {
    return allCards.filter(card => {
      const state = cardStatesMap.get(card.id);
      return state && state.state !== CardState.NEW && state.dueTime <= now;
    }).sort((a, b) => {
      const stateA = cardStatesMap.get(a.id);
      const stateB = cardStatesMap.get(b.id);
      return (stateA?.dueTime || 0) - (stateB?.dueTime || 0);
    });
  }, [allCards, cardStatesMap, now]);

  const newCardsAll = useMemo(() => {
    return allCards.filter(card => {
      const state = cardStatesMap.get(card.id);
      return !state || state.state === CardState.NEW;
    });
  }, [allCards, cardStatesMap]);

  // Internal session queue that supports in-session re-queueing of failed cards
  const [sessionCards, setSessionCards] = useState<Flashcard[]>([]);

  // Setup session queue whenever active deck/article or mode changes
  const initSessionCards = useCallback((deckId: string, articleId?: string) => {
    let targetArtList: Article[] = [];
    if (articleId) {
      const a = ALL_ARTICLES.find(x => x.id === articleId);
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
    // If plan resulted in 0 cards (e.g. today's quota met, but user wants to study this specific deck), load new cards from this deck
    if (queue.length === 0) {
      const deckCards = flashcardCache.getCardsForArticles(targetArtList);
      queue = deckCards.slice(0, 20);
    }

    setSessionCards(queue);
    setCurrentIndex(0);
    setIsFlipped(false);
    setCompletedCount(0);
    setSessionFinished(false);
  }, [cardStatesMap, schedulerSettings, todayRecord]);

  // Start studying a specific volume or article deck
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
    if (resumeExtra?.queueMode && ["due", "new", "article", "random", "deck"].includes(resumeExtra.queueMode)) {
      setQueueMode(resumeExtra.queueMode as QueueMode);
    }
    if (resumeExtra?.cardIndex !== undefined && resumeExtra.cardIndex >= 0) {
      const clamped = sessionCards.length > 0 ? Math.min(resumeExtra.cardIndex, sessionCards.length - 1) : resumeExtra.cardIndex;
      setCurrentIndex(clamped);
      setHasRestoredNotice(clamped > 0);
    }
  }, [resumeExtra, sessionCards.length]);

  // Initialize session cards on cold start in study mode
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

  const handleSwitchMode = (mode: QueueMode) => {
    setQueueMode(mode);
    setCurrentIndex(0);
    setIsFlipped(false);
    setCompletedCount(0);
    setSessionFinished(false);
    setHasRestoredNotice(false);

    if (mode === "due") {
      setSessionCards(dueCardsAll.slice(0, 30));
    } else if (mode === "new") {
      setSessionCards(newCardsAll.slice(0, schedulerSettings.dailyNewLimit || 20));
    } else if (mode === "article") {
      const art = ALL_ARTICLES.find(a => a.id === selectedArticleId);
      setSessionCards(art ? flashcardCache.getCardsForArticle(art) : []);
    } else if (mode === "random") {
      const shuffled = shuffleArray(allCards);
      setSessionCards(shuffled.slice(0, 25));
    }
  };

  // Synchronize session tracker
  useEffect(() => {
    if (viewMode !== "study" || sessionCards.length === 0 || !currentFlashcard) return;
    const cardArticle = ALL_ARTICLES.find(a => a.id === currentFlashcard.articleId) || ALL_ARTICLES.find(a => a.id === selectedArticleId);
    const modeLabels: Record<QueueMode, string> = {
      due: "遗忘复习",
      new: "新学启程",
      article: "单篇专攻",
      random: "乱序抽背",
      deck: "选册排程"
    };

    saveLastSession({
      view: "flipcard",
      articleId: queueMode === "article" ? selectedArticleId : currentFlashcard.articleId,
      articleTitle: cardArticle?.title || currentFlashcard.frontTitle.replace(/[《》]/g, ""),
      articleAuthor: cardArticle?.author,
      articleDynasty: cardArticle?.dynasty,
      modeName: "翻转闪卡",
      progressText: `${modeLabels[queueMode] || "牌组背诵"} · 卡片 ${currentIndex + 1} / ${sessionCards.length}`,
      progressPercent: Math.min(100, Math.round(((currentIndex + 1) / Math.max(1, sessionCards.length)) * 100)),
      updatedAt: Date.now(),
      extra: {
        queueMode,
        cardIndex: currentIndex,
        totalCards: sessionCards.length
      }
    });
  }, [viewMode, currentIndex, queueMode, selectedArticleId, currentFlashcard, sessionCards.length]);

  // Load state for current flashcard
  useEffect(() => {
    if (!currentFlashcard) return;
    const existing = cardStatesMap.get(currentFlashcard.id);
    if (existing) {
      setCurrentCardState(existing);
      setIsFlipped(false);
    } else {
      getCardState(currentFlashcard.id).then(state => {
        setCurrentCardState(state || fsrs.createInitialCard(currentFlashcard.id));
        setIsFlipped(false);
      });
    }
  }, [currentFlashcard, cardStatesMap, fsrs]);

  // Interval previews for 4 ratings
  const intervalBadges = useMemo(() => {
    if (!currentCardState) {
      return { [Rating.AGAIN]: "<10分", [Rating.HARD]: "1天", [Rating.GOOD]: "4天", [Rating.EASY]: "16天" };
    }
    return fsrs.previewIntervals(currentCardState);
  }, [currentCardState, fsrs]);

  const handleFlip = () => {
    sound.playFlip();
    setIsFlipped(prev => !prev);
  };

  // O(1) in-memory rating evaluation with async DB persistence and in-session repetition
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

    // Asynchronous DB persistence
    saveCardState(result.updatedCard).catch(() => {});
    recordReviewLog(result.reviewLog).catch(() => {});

    setCompletedCount(prev => prev + 1);

    const willRequeue = rating === Rating.AGAIN && schedulerSettings.enableSessionLoop;

    // Anki Same-Session Loop: If user rated AGAIN and session loop is enabled, reinsert card
    if (willRequeue) {
      setSessionCards(prevQueue => {
        return ankiScheduler.requeueFailedCard(prevQueue, currentIndex, currentFlashcard, 4);
      });
    }

    if (!willRequeue && currentIndex + 1 >= sessionCards.length) {
      sound.playCelebration();
      fireConfetti();
      setSessionFinished(true);
    } else {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  };

  // Keyboard shortcut listener for space (flip) and 1-4 (ratings)
  useEffect(() => {
    if (viewMode !== "study") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.code === "Space" || ((e.code === "Enter" || e.code === "NumpadEnter") && !isFlipped)) {
        e.preventDefault();
        handleFlip();
      } else if (isFlipped) {
        if (e.key === "1") handleRate(Rating.AGAIN);
        else if (e.key === "2") handleRate(Rating.HARD);
        else if (e.key === "3") handleRate(Rating.GOOD);
        else if (e.key === "4") handleRate(Rating.EASY);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewMode, isFlipped, currentFlashcard, currentCardState]);

  // Get active article or volume title for breadcrumbs
  const activeArticleObj = useMemo(() => {
    if (currentFlashcard) {
      return ALL_ARTICLES.find(a => a.id === currentFlashcard.articleId);
    }
    return activeArticleId ? ALL_ARTICLES.find(a => a.id === activeArticleId) : undefined;
  }, [currentFlashcard, activeArticleId]);

  const activeVolumeObj = useMemo(() => {
    if (activeArticleObj) {
      return getVolumeForArticle(activeArticleObj.id);
    }
    return VOLUME_DECKS.find(v => v.id === activeDeckId) || SPECIAL_DECKS.find(s => s.id === activeDeckId);
  }, [activeArticleObj, activeDeckId]);

  // Compute live session stats
  const remainingInSession = Math.max(0, sessionCards.length - currentIndex);

  return (
    <div className="max-w-4xl xl:max-w-6xl mx-auto px-4 py-5 pb-24">
      {/* View Mode 1: Anki Deck Hub (选册牌组列表与智能排程总览) */}
      {viewMode === "deck_hub" && (
        <AnkiDeckHub
          cardStatesMap={cardStatesMap}
          schedulerSettings={schedulerSettings}
          onUpdateSettings={handleUpdateSettings}
          dailyPlan={dailyPlan}
          onStartStudyDeck={handleStartStudyDeck}
          onOpenArticleInView={onOpenArticleInView}
          activeArticleId={activeArticleId}
          activeDeckId={activeDeckId}
        />
      )}

      {/* View Mode 2: Anki Study Session (卡片背诵模式) */}
      {viewMode === "study" && (
        <div className="max-w-xl xl:max-w-none xl:grid xl:grid-cols-[minmax(0,1fr)_288px] xl:gap-6 xl:items-start">
          <div className="min-w-0">
          {/* Top Breadcrumb & Deck Return Header */}
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-xs">
            <button
              onClick={() => {
                setViewMode("deck_hub");
                refreshCardStates();
              }}
              className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-medium shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回选册牌组</span>
            </button>

            {/* Breadcrumb path */}
            <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[220px] sm:max-w-none">
              <span>{activeVolumeObj?.name || "牌组"}</span>
              <span>/</span>
              <span className="text-zinc-900 dark:text-zinc-100 font-classical font-semibold truncate">
                {activeArticleObj ? `《${activeArticleObj.title}》` : "全册联背"}
              </span>
            </div>

            {/* Anki Live Session Queue Indicators */}
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold">
              <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
                新卡 {newCardsAll.length}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                待复习 {dueCardsAll.length}
              </span>
            </div>
          </div>

          {/* Quick Queue Mode Switching Pill */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl mb-4 text-xs font-medium">
            <button
              onClick={() => handleSwitchMode("due")}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-colors ${
                queueMode === "due"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>待复习</span>
              <span
                className={`font-mono text-[10px] px-1 rounded ${
                  dueCardsAll.length > 0
                    ? "bg-emerald-500 text-white font-bold"
                    : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {dueCardsAll.length}
              </span>
            </button>

            <button
              onClick={() => handleSwitchMode("new")}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-colors ${
                queueMode === "new"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>新卡</span>
              <span className="font-mono text-[10px] px-1 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                {newCardsAll.length}
              </span>
            </button>

            <button
              onClick={() => handleSwitchMode("article")}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-colors ${
                queueMode === "article"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>选篇</span>
            </button>

            <button
              onClick={() => handleSwitchMode("random")}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-colors ${
                queueMode === "random"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>随机抽</span>
            </button>
          </div>

          {/* Article Selector Dropdown for 'article' Mode */}
          {queueMode === "article" && (
            <div className="mb-4">
              <select
                value={selectedArticleId}
                onChange={e => {
                  setSelectedArticleId(e.target.value);
                  const art = ALL_ARTICLES.find(a => a.id === e.target.value);
                  setSessionCards(art ? flashcardCache.getCardsForArticle(art) : []);
                  setCurrentIndex(0);
                  setIsFlipped(false);
                  setCompletedCount(0);
                  setSessionFinished(false);
                  setHasRestoredNotice(false);
                }}
                className="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-400"
              >
                {targetArticles.map(a => (
                  <option key={a.id} value={a.id}>
                    《{a.title}》· {a.author} ({a.dynasty})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Progress Restored Toast */}
          {hasRestoredNotice && currentIndex > 0 && sessionCards.length > 0 && (
            <div className="mb-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-700 dark:text-zinc-300">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>已接续闪卡进度至<strong>第 {currentIndex + 1} 张</strong>（共 {sessionCards.length} 张）</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setCurrentIndex(0);
                    setIsFlipped(false);
                    setHasRestoredNotice(false);
                  }}
                  className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 underline underline-offset-2 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>从第 1 张开始</span>
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

          {/* Empty State */}
          {sessionCards.length === 0 ? (
            <div className="py-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-xs">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {queueMode === "due" ? "今日暂无待复习闪卡" : "当前选册暂无可学闪卡"}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-5">
                {queueMode === "due"
                  ? "当前名句记忆留存良好，FSRS 遗忘曲线排程尚未到期。可学习新卡或返回牌组自选特定篇目。"
                  : "建议切换其他选册或选择全套教材继续背诵。"}
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => handleSwitchMode("new")}
                  className="py-2 px-4 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-medium text-xs shadow-2xs"
                >
                  学习新词句 ({Math.min(25, newCardsAll.length)})
                </button>
                <button
                  onClick={() => setViewMode("deck_hub")}
                  className="py-2 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  返回选册牌组
                </button>
              </div>
            </div>
          ) : sessionFinished ? (
            <div className="py-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-xs animate-in zoom-in-95 duration-150">
              <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center mx-auto mb-3">
                <Trophy className="w-6 h-6 text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">本组背诵圆满完成！</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-5 max-w-sm mx-auto">
                已成功温习 <strong>{completedCount}</strong> 张闪卡。
                {schedulerSettings.enableSessionLoop && " 错题已在会话内自动反复巩固过关。"}
                FSRS 间隔重复算法已计算下次最佳复习时机。
              </p>

              <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
                <button
                  onClick={() => {
                    handleStartStudyDeck(activeDeckId, activeArticleId);
                  }}
                  className="py-2.5 px-5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-medium text-xs shadow-sm hover:bg-zinc-800 dark:hover:bg-white"
                >
                  开启下一组 (+{schedulerSettings.dailyNewLimit || 20} 句)
                </button>
                <button
                  onClick={() => {
                    setViewMode("deck_hub");
                    refreshCardStates();
                  }}
                  className="py-2.5 px-5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  返回选册牌组列表
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Progress Header */}
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">
                  第 <strong>{currentIndex + 1}</strong> / {sessionCards.length} 张
                  {remainingInSession > 0 && (
                    <span className="text-[11px] text-zinc-400 ml-1.5 font-mono">
                      (剩余 {remainingInSession} 张)
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono hidden sm:inline">
                  空格翻卡 ｜ 1-4 评分
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-300 ease-out"
                  style={{ width: `${Math.round(((currentIndex + 1) / Math.max(1, sessionCards.length)) * 100)}%` }}
                />
              </div>

              {/* 3D Flip Card Container */}
              <div
                onClick={handleFlip}
                className="perspective-1000 min-h-[300px] sm:min-h-[340px] cursor-pointer mb-5 select-none"
              >
                <div
                  className={`relative w-full h-full min-h-[300px] sm:min-h-[340px] rounded-2xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm transition-all duration-300 transform-style-3d flex flex-col justify-between ${
                    isFlipped ? "rotate-y-180" : ""
                  }`}
                >
                  {/* Front Face */}
                  {!isFlipped ? (
                    <div className="flex flex-col justify-between h-full space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
                          <span className="font-medium">
                            {currentFlashcard?.frontTitle}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 font-mono text-[10px]">
                            {currentFlashcard?.frontHint}
                          </span>
                        </div>

                        <div className="my-8 text-center space-y-3">
                          <p className="text-xl sm:text-2xl font-classical font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed tracking-wide">
                            {currentFlashcard?.frontPrompt}
                          </p>
                        </div>
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
                            {currentFlashcard?.frontTitle}
                          </span>
                        </div>

                        <div className="my-4 text-center">
                          <p className="text-xl sm:text-2xl font-classical font-semibold text-emerald-700 dark:text-emerald-400 leading-relaxed tracking-wide bg-emerald-50/50 dark:bg-emerald-950/20 py-4 px-3 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                            {currentFlashcard?.backAnswer.replace(/【填空正解】/g, "")}
                          </p>
                        </div>

                        {currentFlashcard?.backTranslation && (
                          <div className="mt-4 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/60 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-classical">
                            <span className="font-sans font-medium text-zinc-400 mr-1.5">【大意】</span>
                            {currentFlashcard.backTranslation}
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
                    onClick={() => handleRate(Rating.AGAIN)}
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
                    onClick={() => handleRate(Rating.HARD)}
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
                    onClick={() => handleRate(Rating.GOOD)}
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
                    onClick={() => handleRate(Rating.EASY)}
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
                  onClick={handleFlip}
                  className="w-full py-3 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.99] transition-all shadow-xs"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>显示对句答案 (Space / Enter)</span>
                </button>
              )}
            </>
          )}
          </div>

          <StudySidebar
            article={
              activeArticleObj
                ? {
                    title: activeArticleObj.title,
                    author: activeArticleObj.author,
                    dynasty: activeArticleObj.dynasty,
                    genre: activeArticleObj.genre,
                    isGaoKao72: activeArticleObj.isGaoKao72
                  }
                : undefined
            }
            progressLabel={`第 ${currentIndex + 1} / ${Math.max(1, sessionCards.length)} 张`}
            progressPercent={
              sessionCards.length > 0 ? ((currentIndex + 1) / sessionCards.length) * 100 : 0
            }
            shortcuts={[
              { keys: "Space", label: "翻开卡片" },
              { keys: "1", label: "重来（完全忘了）" },
              { keys: "2", label: "困难" },
              { keys: "3", label: "良好" },
              { keys: "4", label: "简单（一眼就会）" }
            ]}
            hint="凭第一反应评分，不要凭「刚才看过」的感觉。评低一点，明天才会真的再见到它。"
          />
        </div>
      )}
    </div>
  );
};
