import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { Flashcard } from "../data/flashcardGenerator";
import { flashcardCache } from "../data/flashcardCache";
import { filterArticlesByScope } from "../data/articleTaxonomy";
import { FSRSEngine } from "../domain/fsrs/fsrsEngine";
import { CardFsrsState, Rating, CardState } from "../domain/fsrs/fsrsTypes";
import { getCardState, saveCardState, recordReviewLog, getAllCardStates } from "../storage/db";
import { saveLastSession, SessionExtra } from "../storage/sessionTracker";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
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
  X
} from "lucide-react";

type QueueMode = "due" | "new" | "article" | "random";

interface FlipCardViewProps {
  initialArticleId?: string;
  selectedScope: string;
  resumeExtra?: SessionExtra;
}

export const FlipCardView: React.FC<FlipCardViewProps> = ({ initialArticleId, selectedScope, resumeExtra }) => {
  const fsrs = useMemo(() => new FSRSEngine(), []);

  // Filter articles based on selected scope
  const targetArticles = useMemo(() => {
    return filterArticlesByScope(ALL_ARTICLES, selectedScope);
  }, [selectedScope]);

  // Use FlashcardCache to avoid 350ms synchronous parsing lock!
  const allCards = useMemo(() => {
    return flashcardCache.getCardsForArticles(targetArticles);
  }, [targetArticles]);

  const [queueMode, setQueueMode] = useState<QueueMode>(() => {
    if (resumeExtra?.queueMode && ["due", "new", "article", "random"].includes(resumeExtra.queueMode)) {
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
    }
  }, [initialArticleId]);

  const [cardStatesMap, setCardStatesMap] = useState<Map<string, CardFsrsState>>(new Map());
  const [isLoadingStates, setIsLoadingStates] = useState(true);

  // Load all card states from IndexedDB once
  const refreshCardStates = useCallback(async () => {
    try {
      const states = await getAllCardStates();
      const map = new Map<string, CardFsrsState>();
      states.forEach(s => map.set(s.cardId, s));
      setCardStatesMap(map);
    } finally {
      setIsLoadingStates(false);
    }
  }, []);

  useEffect(() => {
    refreshCardStates();
  }, [refreshCardStates]);

  const now = Date.now();

  // Optimized O(N) due cards calculation
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

  // Selected session cards based on queue mode
  const sessionCards = useMemo(() => {
    if (queueMode === "due") {
      return dueCardsAll.slice(0, 30);
    }
    if (queueMode === "new") {
      return newCardsAll.slice(0, 25);
    }
    if (queueMode === "article") {
      const art = ALL_ARTICLES.find(a => a.id === selectedArticleId);
      return art ? flashcardCache.getCardsForArticle(art) : [];
    }
    if (queueMode === "random") {
      const shuffled = [...allCards].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, 25);
    }
    return [];
  }, [queueMode, dueCardsAll, newCardsAll, selectedArticleId, allCards]);

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (resumeExtra?.cardIndex !== undefined && resumeExtra.cardIndex > 0) {
      return resumeExtra.cardIndex;
    }
    return 0;
  });

  const [hasRestoredNotice, setHasRestoredNotice] = useState(() => {
    return resumeExtra?.cardIndex !== undefined && resumeExtra.cardIndex > 0;
  });

  useEffect(() => {
    if (resumeExtra?.queueMode && ["due", "new", "article", "random"].includes(resumeExtra.queueMode)) {
      setQueueMode(resumeExtra.queueMode as QueueMode);
    }
    if (resumeExtra?.cardIndex !== undefined && resumeExtra.cardIndex >= 0) {
      setCurrentIndex(resumeExtra.cardIndex);
      setHasRestoredNotice(resumeExtra.cardIndex > 0);
    }
  }, [resumeExtra]);

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
  };

  // Synchronize session tracker
  useEffect(() => {
    if (sessionCards.length === 0 || !currentFlashcard) return;
    const cardArticle = ALL_ARTICLES.find(a => a.id === currentFlashcard.articleId) || ALL_ARTICLES.find(a => a.id === selectedArticleId);
    const modeLabels: Record<QueueMode, string> = {
      due: "遗忘复习",
      new: "新学启程",
      article: "单篇专攻",
      random: "乱序抽背"
    };
    saveLastSession({
      view: "flipcard",
      articleId: queueMode === "article" ? selectedArticleId : currentFlashcard.articleId,
      articleTitle: cardArticle?.title || currentFlashcard.frontTitle.replace(/[《》]/g, ""),
      articleAuthor: cardArticle?.author,
      articleDynasty: cardArticle?.dynasty,
      modeName: "翻转闪卡",
      progressText: `${modeLabels[queueMode]} · 卡片 ${currentIndex + 1} / ${sessionCards.length}`,
      progressPercent: Math.min(100, Math.round(((currentIndex + 1) / Math.max(1, sessionCards.length)) * 100)),
      updatedAt: Date.now(),
      extra: {
        queueMode,
        cardIndex: currentIndex,
        totalCards: sessionCards.length
      }
    });
  }, [currentIndex, queueMode, selectedArticleId, currentFlashcard, sessionCards.length]);

  // Load state for current flashcard instantly from cache or DB
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

  // O(1) in-memory rating evaluation with async DB persistence
  const handleRate = async (rating: Rating) => {
    if (!currentFlashcard || !currentCardState) return;

    if (rating === Rating.AGAIN) {
      sound.playWrong();
    } else {
      sound.playCorrect();
    }

    const result = fsrs.evaluateReview(currentCardState, rating);

    // Instant local memory update (zero-lag UI)
    const nextMap = new Map(cardStatesMap);
    nextMap.set(currentFlashcard.id, result.updatedCard);
    setCardStatesMap(nextMap);

    // Asynchronous non-blocking persistence
    saveCardState(result.updatedCard).catch(() => {});
    recordReviewLog(result.reviewLog).catch(() => {});

    setCompletedCount(prev => prev + 1);

    if (currentIndex + 1 >= sessionCards.length) {
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
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
  }, [isFlipped, currentFlashcard, currentCardState]);

  return (
    <div className="max-w-xl mx-auto px-4 py-5 pb-24">
      {/* 4 Mode Switching Tabs */}
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
                ? "bg-red-500 text-white font-bold"
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
        <div className="mb-4 bg-red-50/50 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>已接续闪卡进度至<strong>第 {currentIndex + 1} 张</strong>（共 {sessionCards.length} 张）</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCurrentIndex(0);
                setIsFlipped(false);
                setHasRestoredNotice(false);
              }}
              className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline underline-offset-2 flex items-center gap-1"
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
            {queueMode === "due" ? "今日暂无待复习闪卡" : "当前范围暂无可用闪卡"}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-5">
            {queueMode === "due"
              ? "名句记忆稳定性良好，已完全消化。可以学习新卡或自选特定篇目。"
              : "请尝试切换教材范围或选择其他篇目。"}
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => handleSwitchMode("new")}
              className="py-2 px-4 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-medium text-xs"
            >
              学习新词句 ({Math.min(25, newCardsAll.length)})
            </button>
          </div>
        </div>
      ) : sessionFinished ? (
        <div className="py-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-xs animate-in zoom-in-95 duration-150">
          <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center mx-auto mb-3">
            <Trophy className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">本次闪卡温习完成</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-5">
            已成功温习 <strong>{completedCount}</strong> 张闪卡，FSRS 间隔重复算法已计算下次复习时机。
          </p>
          <button
            onClick={() => {
              setCurrentIndex(0);
              setCompletedCount(0);
              setSessionFinished(false);
              refreshCardStates();
            }}
            className="w-full py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-medium text-xs"
          >
            开启下一组
          </button>
        </div>
      ) : (
        <>
          {/* Progress Header */}
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">
              第 <strong>{currentIndex + 1}</strong> / {sessionCards.length} 张
            </span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono hidden sm:inline">
              空格翻卡 ｜ 1-4 评分
            </span>
          </div>

          <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-200"
              style={{ width: `${((currentIndex + 1) / sessionCards.length) * 100}%` }}
            />
          </div>

          {/* 3D Flip Card Container with GPU Acceleration */}
          <div
            className="w-full min-h-[340px] cursor-pointer perspective-1000 mb-5 select-none"
            onClick={handleFlip}
          >
            <div
              className={`relative w-full min-h-[340px] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs transition-transform duration-500 transform-style-3d gpu-accelerate ${
                isFlipped ? "rotate-y-180" : ""
              }`}
            >
              {/* Card Front */}
              <div className="absolute inset-0 w-full h-full bg-white dark:bg-zinc-900 rounded-2xl p-6 flex flex-col justify-between backface-hidden">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">
                    {currentFlashcard?.frontTitle}
                  </span>
                  <span>轻触核对</span>
                </div>

                <div className="my-auto py-4 text-center">
                  <p className="text-xl sm:text-2xl font-classical font-semibold text-zinc-900 dark:text-zinc-100 leading-relaxed">
                    {currentFlashcard?.frontPrompt}
                  </p>
                  {currentFlashcard?.frontHint && (
                    <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                      {currentFlashcard.frontHint}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center gap-1 text-[11px] text-zinc-400 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <RotateCw className="w-3 h-3 text-zinc-400" />
                  <span>点击卡片或按空格翻转</span>
                </div>
              </div>

              {/* Card Back */}
              <div className="absolute inset-0 w-full h-full bg-zinc-50 dark:bg-zinc-900/90 rounded-2xl p-6 flex flex-col justify-between rotate-y-180 backface-hidden border border-zinc-300 dark:border-zinc-700">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    名句正解
                  </span>
                  <span>{currentFlashcard?.frontTitle}</span>
                </div>

                <div className="my-auto py-2 space-y-3">
                  <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <p className="text-lg sm:text-xl font-classical font-semibold text-zinc-900 dark:text-zinc-100 leading-relaxed text-center">
                      {currentFlashcard?.fullVerseContext || currentFlashcard?.backAnswer}
                    </p>
                  </div>

                  {currentFlashcard?.backTranslation && (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400 bg-white/60 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 leading-relaxed">
                      <strong className="text-zinc-800 dark:text-zinc-200 font-medium">白话释义：</strong>
                      {currentFlashcard.backTranslation}
                    </div>
                  )}
                </div>

                <div className="text-center text-[10px] text-zinc-400 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  选择记忆反馈（快捷键 1-4）
                </div>
              </div>
            </div>
          </div>

          {/* FSRS 4 Rating Buttons */}
          {isFlipped ? (
            <div className="grid grid-cols-4 gap-2 animate-in fade-in duration-100">
              <button
                onClick={() => handleRate(Rating.AGAIN)}
                className="flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400 hover:bg-red-100/50 transition-colors"
                title="快捷键: 1"
              >
                <span className="text-xs font-semibold">1. 重来</span>
                <span className="text-[10px] opacity-80 mt-0.5">{intervalBadges[Rating.AGAIN]}</span>
              </button>

              <button
                onClick={() => handleRate(Rating.HARD)}
                className="flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100/50 transition-colors"
                title="快捷键: 2"
              >
                <span className="text-xs font-semibold">2. 困难</span>
                <span className="text-[10px] opacity-80 mt-0.5">{intervalBadges[Rating.HARD]}</span>
              </button>

              <button
                onClick={() => handleRate(Rating.GOOD)}
                className="flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                title="快捷键: 3"
              >
                <span className="text-xs font-semibold">3. 良好</span>
                <span className="text-[10px] opacity-80 mt-0.5">{intervalBadges[Rating.GOOD]}</span>
              </button>

              <button
                onClick={() => handleRate(Rating.EASY)}
                className="flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100/50 transition-colors"
                title="快捷键: 4"
              >
                <span className="text-xs font-semibold">4. 简单</span>
                <span className="text-[10px] opacity-80 mt-0.5">{intervalBadges[Rating.EASY]}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleFlip}
              className="w-full py-3 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>核对正解 (Space)</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};
