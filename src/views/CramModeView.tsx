import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  CORE_GOLDEN_VERSES,
  getGoldenVerseModules,
  filterGoldenVerses,
} from "../data/goldenVersesData";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { saveLastSession, SessionExtra } from "../storage/sessionTracker";
import { CramCardPractice, CramRating } from "../components/cram/CramCardPractice";
import { CramReferenceList } from "../components/cram/CramReferenceList";
import { CramHeaderFilters } from "../components/cram/CramHeaderFilters";
import { BookOpen, RotateCcw, X } from "lucide-react";
import { useOptionalStudyApp } from "../state/StudyAppContext";

export type { CramRating };

interface CramModeViewProps {
  onOpenArticleInView?: (articleId: string, view: any) => void;
  resumeExtra?: SessionExtra;
}

const STORAGE_KEY_RATINGS = "wenyan_cram_ratings";

export const CramModeView: React.FC<CramModeViewProps> = ({
  onOpenArticleInView: _onOpenArticleInView,
  resumeExtra: propResumeExtra,
}) => {
  const appCtx = useOptionalStudyApp();
  const resumeExtra = propResumeExtra ?? appCtx?.resumeExtra;
  const [activeModule, setActiveModule] = useState<string>(
    () => resumeExtra?.activeModule || "ALL"
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewStyle, setViewStyle] = useState<"card" | "list">(
    () => resumeExtra?.viewStyle || "card"
  );
  const [onlyWeak, setOnlyWeak] = useState<boolean>(false);
  const [ratings, setRatings] = useState<Record<string, CramRating>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RATINGS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Card view state
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (resumeExtra?.goldenVerseIndex !== undefined && resumeExtra.goldenVerseIndex > 0) {
      return resumeExtra.goldenVerseIndex;
    }
    return 0;
  });
  const [hasRestoredNotice, setHasRestoredNotice] = useState<boolean>(() => {
    return resumeExtra?.goldenVerseIndex !== undefined && resumeExtra.goldenVerseIndex > 0;
  });

  useEffect(() => {
    if (resumeExtra?.goldenVerseIndex !== undefined && resumeExtra.goldenVerseIndex >= 0) {
      setCurrentIndex(resumeExtra.goldenVerseIndex);
      setHasRestoredNotice(resumeExtra.goldenVerseIndex > 0);
    }
    if (resumeExtra?.activeModule) {
      setActiveModule(resumeExtra.activeModule);
    }
    if (resumeExtra?.viewStyle) {
      setViewStyle(resumeExtra.viewStyle);
    }
  }, [resumeExtra]);

  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [isShuffled, setIsShuffled] = useState<boolean>(false);
  const [shuffledSeed, setShuffledSeed] = useState<number>(0);
  const [isListMasked, setIsListMasked] = useState<boolean>(true);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const moduleOptions = useMemo(() => getGoldenVerseModules(), []);

  const filteredVerses = useMemo(() => {
    let list = filterGoldenVerses(activeModule, searchQuery);
    if (onlyWeak) {
      list = list.filter((v) => ratings[v.id] === "stuck" || ratings[v.id] === "doubt");
    }
    if (isShuffled) {
      const arr = [...list];
      let m = arr.length;
      let seed = shuffledSeed || 42;
      while (m) {
        seed = (seed * 9301 + 49297) % 233280;
        const i = Math.floor((seed / 233280) * m--);
        [arr[m], arr[i]] = [arr[i], arr[m]];
      }
      return arr;
    }
    return list;
  }, [activeModule, searchQuery, onlyWeak, isShuffled, shuffledSeed, ratings]);

  // Keep currentIndex in bounds when list shrinks
  useEffect(() => {
    if (currentIndex >= filteredVerses.length && filteredVerses.length > 0) {
      setCurrentIndex(filteredVerses.length - 1);
    }
    setIsFlipped(false);
  }, [filteredVerses.length, currentIndex]);

  const currentVerse = filteredVerses[currentIndex] || null;

  // Synchronize session tracker
  useEffect(() => {
    if (filteredVerses.length === 0 || !currentVerse) return;
    saveLastSession({
      view: "cram",
      articleId: currentVerse.articleId,
      articleTitle: currentVerse.articleTitle || "考前核心金句",
      articleAuthor: currentVerse.author,
      articleDynasty: currentVerse.dynasty,
      modeName: "考前抱佛脚",
      progressText: `金句 ${currentIndex + 1} / ${filteredVerses.length}`,
      progressPercent: Math.min(
        100,
        Math.round(((currentIndex + 1) / Math.max(1, filteredVerses.length)) * 100)
      ),
      updatedAt: Date.now(),
      extra: {
        goldenVerseIndex: currentIndex,
        activeModule,
        viewStyle,
        totalCards: filteredVerses.length,
      },
    });
  }, [currentIndex, activeModule, viewStyle, filteredVerses, currentVerse]);

  // Persist ratings to localStorage
  const handleRate = useCallback((verseId: string, rating: CramRating) => {
    setRatings((prev) => {
      const next = { ...prev, [verseId]: rating };
      try {
        localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });

    if (rating === "mastered") sound.playCorrect();
    else if (rating === "stuck") sound.playWrong();
    else sound.playHard();
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < filteredVerses.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
      sound.playFlip();
    } else {
      sound.playCelebration();
      fireConfetti();
    }
  }, [currentIndex, filteredVerses.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
      sound.playFlip();
    }
  }, [currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
    sound.playFlip();
  }, []);

  const handleRateAndAdvance = useCallback(
    (verseId: string, rating: CramRating) => {
      handleRate(verseId, rating);
      setTimeout(handleNext, 180);
    },
    [handleRate, handleNext]
  );

  const handleToggleShuffle = () => {
    setIsShuffled((prev) => !prev);
    setShuffledSeed(Date.now());
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleSpeak = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleToggleReveal = (verseId: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(verseId)) next.delete(verseId);
      else next.add(verseId);
      return next;
    });
  };

  // Keyboard shortcut handler for card view
  const isGlobalModalOpen = Boolean(appCtx?.showCommandPalette || appCtx?.showShortcuts);
  useEffect(() => {
    if (viewStyle !== "card" || isGlobalModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.code === "Space") { e.preventDefault(); handleFlip(); }
      else if (e.code === "ArrowRight") { e.preventDefault(); handleNext(); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); handlePrev(); }
      else if (e.key === "1" && currentVerse) { e.preventDefault(); handleRateAndAdvance(currentVerse.id, "stuck"); }
      else if (e.key === "2" && currentVerse) { e.preventDefault(); handleRateAndAdvance(currentVerse.id, "doubt"); }
      else if (e.key === "3" && currentVerse) { e.preventDefault(); handleRateAndAdvance(currentVerse.id, "mastered"); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewStyle, isGlobalModalOpen, currentVerse, handleFlip, handleNext, handlePrev, handleRateAndAdvance]);

  const totalVersesCount = CORE_GOLDEN_VERSES.length;
  const masteredCount = useMemo(
    () => Object.values(ratings).filter((r) => r === "mastered").length,
    [ratings]
  );
  const weakCount = useMemo(
    () => Object.values(ratings).filter((r) => r === "stuck" || r === "doubt").length,
    [ratings]
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
      <CramHeaderFilters
        viewStyle={viewStyle}
        onChangeViewStyle={setViewStyle}
        masteredCount={masteredCount}
        totalVersesCount={totalVersesCount}
        moduleOptions={moduleOptions}
        activeModule={activeModule}
        onSelectModule={(modId) => {
          setActiveModule(modId);
          setCurrentIndex(0);
          setIsFlipped(false);
        }}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          setCurrentIndex(0);
        }}
        onlyWeak={onlyWeak}
        onToggleOnlyWeak={() => {
          setOnlyWeak((prev) => !prev);
          setCurrentIndex(0);
        }}
        weakCount={weakCount}
        isShuffled={isShuffled}
        onToggleShuffle={handleToggleShuffle}
        isListMasked={isListMasked}
        onToggleListMasked={() => {
          setIsListMasked((prev) => !prev);
          setRevealedIds(new Set());
        }}
      />

      {/* Progress Restored Toast */}
      {hasRestoredNotice && currentIndex > 0 && filteredVerses.length > 0 && (
        <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span>
              已接续抱佛脚进度至<strong>第 {currentIndex + 1} 句</strong>（共{" "}
              {filteredVerses.length} 句）
            </span>
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
              <span>从第 1 句开始</span>
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

      {/* Main Content: Empty / Card View / List View */}
      {filteredVerses.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-3">
          <BookOpen className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
            未找到符合条件的金句条目
          </p>
          <button
            onClick={() => {
              setActiveModule("ALL");
              setSearchQuery("");
              setOnlyWeak(false);
            }}
            className="text-xs text-red-600 dark:text-red-400 hover:underline"
          >
            清除筛选条件
          </button>
        </div>
      ) : viewStyle === "card" && currentVerse ? (
        <CramCardPractice
          currentVerse={currentVerse}
          currentIndex={currentIndex}
          totalCount={filteredVerses.length}
          isFlipped={isFlipped}
          currentRating={ratings[currentVerse.id]}
          onFlip={handleFlip}
          onPrev={handlePrev}
          onNext={handleNext}
          onRateAndAdvance={handleRateAndAdvance}
          onSpeak={handleSpeak}
        />
      ) : (
        <CramReferenceList
          verses={filteredVerses}
          ratings={ratings}
          isListMasked={isListMasked}
          revealedIds={revealedIds}
          onToggleReveal={handleToggleReveal}
          onRate={handleRate}
          onSpeak={handleSpeak}
        />
      )}
    </div>
  );
};

export default CramModeView;
