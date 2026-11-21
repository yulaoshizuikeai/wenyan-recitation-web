import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  CORE_GOLDEN_VERSES,
  GoldenVerse,
  getGoldenVerseModules,
  filterGoldenVerses
} from "../data/goldenVersesData";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import {
  Sparkles,
  Flame,
  BookOpen,
  Eye,
  EyeOff,
  Volume2,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  List,
  CreditCard,
  Search,
  AlertTriangle,
  Shuffle,
  HelpCircle,
  BookmarkCheck,
  XCircle,
  Clock
} from "lucide-react";

export type CramRating = "stuck" | "doubt" | "mastered";

interface CramModeViewProps {
  onOpenArticleInView?: (articleId: string, view: any) => void;
}

const STORAGE_KEY_RATINGS = "wenyan_cram_ratings";

export const CramModeView: React.FC<CramModeViewProps> = ({ onOpenArticleInView }) => {
  const [activeModule, setActiveModule] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewStyle, setViewStyle] = useState<"card" | "list">("card");
  const [onlyWeak, setOnlyWeak] = useState<boolean>(false);
  const [ratings, setRatings] = useState<Record<string, CramRating>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RATINGS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Card view specific state
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [isShuffled, setIsShuffled] = useState<boolean>(false);
  const [shuffledSeed, setShuffledSeed] = useState<number>(0);

  // List view specific state: whether verses are masked (blurred) for self-testing
  const [isListMasked, setIsListMasked] = useState<boolean>(true);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  // Modules metadata
  const moduleOptions = useMemo(() => getGoldenVerseModules(), []);

  // Filtered verses based on activeModule, search, and weak filter
  const filteredVerses = useMemo(() => {
    let list = filterGoldenVerses(activeModule, searchQuery);
    if (onlyWeak) {
      list = list.filter(v => {
        const r = ratings[v.id];
        return r === "stuck" || r === "doubt";
      });
    }
    if (isShuffled) {
      // Deterministic pseudorandom shuffle based on shuffledSeed
      const arr = [...list];
      let m = arr.length;
      let seed = shuffledSeed || 42;
      while (m) {
        seed = (seed * 9301 + 49297) % 233280;
        const i = Math.floor((seed / 233280) * m--);
        const t = arr[m];
        arr[m] = arr[i];
        arr[i] = t;
      }
      return arr;
    }
    return list;
  }, [activeModule, searchQuery, onlyWeak, isShuffled, shuffledSeed, ratings]);

  // Ensure currentIndex stays within bounds when list shrinks
  useEffect(() => {
    if (currentIndex >= filteredVerses.length && filteredVerses.length > 0) {
      setCurrentIndex(filteredVerses.length - 1);
    }
    setIsFlipped(false);
  }, [filteredVerses.length, currentIndex]);

  const currentVerse = filteredVerses[currentIndex] || null;

  // Persist ratings to localStorage
  const handleRate = useCallback((verseId: string, rating: CramRating) => {
    setRatings(prev => {
      const next = { ...prev, [verseId]: rating };
      try {
        localStorage.setItem(STORAGE_KEY_RATINGS, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });

    if (rating === "mastered") {
      sound.playCorrect();
    } else if (rating === "stuck") {
      sound.playWrong();
    } else {
      sound.playHard();
    }
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < filteredVerses.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      sound.playFlip();
    } else {
      sound.playCelebration();
      fireConfetti();
    }
  }, [currentIndex, filteredVerses.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
      sound.playFlip();
    }
  }, [currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped(prev => !prev);
    sound.playFlip();
  }, []);

  const handleToggleShuffle = () => {
    setIsShuffled(prev => !prev);
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

  // Keyboard shortcut handler for card view
  useEffect(() => {
    if (viewStyle !== "card") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        handleFlip();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "1" && currentVerse) {
        e.preventDefault();
        handleRate(currentVerse.id, "stuck");
        setTimeout(handleNext, 180);
      } else if (e.key === "2" && currentVerse) {
        e.preventDefault();
        handleRate(currentVerse.id, "doubt");
        setTimeout(handleNext, 180);
      } else if (e.key === "3" && currentVerse) {
        e.preventDefault();
        handleRate(currentVerse.id, "mastered");
        setTimeout(handleNext, 180);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewStyle, currentVerse, handleFlip, handleNext, handlePrev, handleRate]);

  // Count stats
  const totalVersesCount = CORE_GOLDEN_VERSES.length;
  const masteredCount = useMemo(() => {
    return Object.values(ratings).filter(r => r === "mastered").length;
  }, [ratings]);
  const weakCount = useMemo(() => {
    return Object.values(ratings).filter(r => r === "stuck" || r === "doubt").length;
  }, [ratings]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
      {/* Top Banner / Header Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xs transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-600 dark:text-red-400">
              <Flame className="w-3.5 h-3.5" />
              <span>考前抱佛脚 · 高频名句情境默写</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              核心金句速查与理解性默写
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              收录高考新课标高频必考核心句，紧扣情境导引、采分下联与字形排雷，考前 15 分钟快速过关。
            </p>
          </div>

          {/* Mode Switcher & Statistics */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs font-medium">
              <button
                onClick={() => setViewStyle("card")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewStyle === "card"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>极速刷句卡片</span>
              </button>
              <button
                onClick={() => setViewStyle("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewStyle === "list"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>急救速查清单</span>
              </button>
            </div>

            {/* Mastery Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs">
              <span className="text-zinc-400">已过关:</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {masteredCount}
              </span>
              <span className="text-zinc-300 dark:text-zinc-700">/</span>
              <span className="font-mono text-zinc-600 dark:text-zinc-300">{totalVersesCount}</span>
            </div>
          </div>
        </div>

        {/* Volume / Semester Filter Tabs */}
        <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {moduleOptions.map(mod => {
              const isActive = activeModule === mod.id;
              return (
                <button
                  key={mod.id}
                  onClick={() => {
                    setActiveModule(mod.id);
                    setCurrentIndex(0);
                    setIsFlipped(false);
                  }}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-2xs"
                      : "bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700/80"
                  }`}
                >
                  <span>{mod.name}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900 font-bold"
                        : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {mod.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Bottleneck Filter Row */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentIndex(0);
              }}
              placeholder="搜索金句、作者、篇目或情境关键词..."
              className="w-full pl-8.5 pr-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setOnlyWeak(prev => !prev);
                setCurrentIndex(0);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                onlyWeak
                  ? "bg-amber-500 text-white shadow-2xs"
                  : "border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/60"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>仅看考前卡壳/存疑</span>
              {weakCount > 0 && (
                <span className="font-mono text-[10px] px-1 rounded-full bg-white/20 text-white">
                  {weakCount}
                </span>
              )}
            </button>

            {viewStyle === "card" && (
              <button
                onClick={handleToggleShuffle}
                title="随机乱序"
                className={`p-1.5 rounded-xl border text-xs transition-colors ${
                  isShuffled
                    ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>
            )}

            {viewStyle === "list" && (
              <button
                onClick={() => {
                  setIsListMasked(prev => !prev);
                  setRevealedIds(new Set());
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {isListMasked ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-zinc-500" />
                    <span>揭开金句全文</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                    <span>一键遮挡 (考前眼动自测)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Card View vs List View */}
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
        /* ==================== 视图 A: 极速刷句卡片模式 ==================== */
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Card Top Progress */}
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {currentVerse.articleTitle}
              </span>
              <span>·</span>
              <span>{currentVerse.author}</span>
              <span className="text-[11px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                {currentVerse.moduleName}
              </span>
              {currentVerse.isGaoKao72 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-bold">
                  72篇
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 font-mono">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {currentIndex + 1}
              </span>
              <span>/</span>
              <span>{filteredVerses.length}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-200"
              style={{ width: `${((currentIndex + 1) / filteredVerses.length) * 100}%` }}
            />
          </div>

          {/* 3D Flip Card */}
          <div
            className="w-full min-h-[380px] cursor-pointer perspective-1000 select-none"
            onClick={handleFlip}
          >
            <div
              className={`relative w-full min-h-[380px] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-transform duration-500 transform-style-3d gpu-accelerate ${
                isFlipped ? "rotate-y-180" : ""
              }`}
            >
              {/* Card Front: Context Clue */}
              <div className="absolute inset-0 w-full h-full bg-white dark:bg-zinc-900 rounded-2xl p-6 sm:p-8 flex flex-col justify-between backface-hidden">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                    <HelpCircle className="w-3.5 h-3.5" />
                    理解性默写 · 情境导引
                  </span>
                  <span className="text-[11px] text-zinc-400">轻触翻转看金句</span>
                </div>

                <div className="my-auto py-4 text-center space-y-4">
                  <p className="text-lg sm:text-2xl font-sans font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed max-w-xl mx-auto">
                    {currentVerse.contextClue}
                  </p>

                  {/* Scenario Tags */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                    {currentVerse.scenarioTags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-mono"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="text-center text-xs text-zinc-400 dark:text-zinc-500 flex items-center justify-center gap-2">
                  <span>点击卡片或按空格揭晓金句与字形警示</span>
                </div>
              </div>

              {/* Card Back: Verse & Key Points */}
              <div className="absolute inset-0 w-full h-full bg-white dark:bg-zinc-900 rounded-2xl p-6 sm:p-8 flex flex-col justify-between rotate-y-180 backface-hidden">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-red-600 dark:text-red-400">
                    <Sparkles className="w-3.5 h-3.5" />
                    高考核心金句
                  </span>

                  <button
                    onClick={e => handleSpeak(currentVerse.verse, e)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
                    title="朗读发音"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="my-auto py-3 space-y-5 text-center">
                  {/* Classical Sentence */}
                  <div className="text-xl sm:text-2xl font-classical font-semibold text-zinc-950 dark:text-zinc-50 leading-relaxed tracking-wide px-2">
                    {currentVerse.verse}
                  </div>

                  {/* Highlight Part Pill if exists */}
                  {currentVerse.highlightPart && (
                    <div className="inline-block px-3 py-1 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 font-medium">
                      <span>核心采分点：</span>
                      <strong className="underline underline-offset-4 decoration-red-500">
                        {currentVerse.highlightPart}
                      </strong>
                    </div>
                  )}

                  {/* Exam Key Points / Typos */}
                  {currentVerse.examKeyPoints.length > 0 && (
                    <div className="max-w-md mx-auto p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 text-left space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        <span>字形排雷与考点提示</span>
                      </div>
                      <ul className="text-xs text-amber-900 dark:text-amber-200/90 space-y-1 pl-4 list-disc">
                        {currentVerse.examKeyPoints.map((pt, idx) => (
                          <li key={idx} className="leading-snug">{pt}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Rating State Pill */}
                <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="text-[11px]">
                    当前状态:{" "}
                    {ratings[currentVerse.id] === "mastered" ? (
                      <strong className="text-emerald-600">已牢固</strong>
                    ) : ratings[currentVerse.id] === "doubt" ? (
                      <strong className="text-amber-600">存疑</strong>
                    ) : ratings[currentVerse.id] === "stuck" ? (
                      <strong className="text-red-600">卡壳</strong>
                    ) : (
                      <span className="text-zinc-400">未标记</span>
                    )}
                  </span>
                  <span className="text-[11px] text-zinc-400">1/2/3 快捷打标并切下一句</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Dock: Rating Buttons + Prev/Next */}
          <div className="grid grid-cols-5 gap-2 pt-1">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs font-medium flex items-center justify-center gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">上一句</span>
            </button>

            <button
              onClick={() => {
                handleRate(currentVerse.id, "stuck");
                setTimeout(handleNext, 180);
              }}
              className="py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors active:scale-95"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>卡壳 (1)</span>
            </button>

            <button
              onClick={() => {
                handleRate(currentVerse.id, "doubt");
                setTimeout(handleNext, 180);
              }}
              className="py-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors active:scale-95"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>存疑 (2)</span>
            </button>

            <button
              onClick={() => {
                handleRate(currentVerse.id, "mastered");
                setTimeout(handleNext, 180);
              }}
              className="py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>牢固 (3)</span>
            </button>

            <button
              onClick={handleNext}
              className="py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-xs font-medium flex items-center justify-center gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <span className="hidden sm:inline">下一句</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* ==================== 视图 B: 考前急救清单模式 ==================== */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-zinc-400">
            <span>共收录 <strong>{filteredVerses.length}</strong> 句核心金句</span>
            {isListMasked && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                提示：自测模式已开启，悬浮或点击金句区域即可揭晓
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {filteredVerses.map((item, index) => {
              const currentRating = ratings[item.id];
              const isRevealed = !isListMasked || revealedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Left: Article info & Scenario Clue */}
                    <div className="space-y-2 lg:max-w-md">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.articleTitle}
                        </span>
                        <span className="text-zinc-400">· {item.author}</span>
                        <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono text-[10px]">
                          {item.moduleName}
                        </span>
                        {item.isGaoKao72 && (
                          <span className="px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-bold text-[10px]">
                            72篇
                          </span>
                        )}
                      </div>

                      {/* Scenario Clue */}
                      <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed">
                        {item.contextClue}
                      </p>

                      {/* Scenario Tags */}
                      <div className="flex flex-wrap items-center gap-1">
                        {item.scenarioTags.map(tag => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.2 rounded bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60 text-[10px] text-zinc-500 font-mono"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Right: Golden Verse & Key Points */}
                    <div className="flex-1 space-y-2">
                      <div
                        onClick={() => {
                          if (isListMasked) {
                            setRevealedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                          }
                        }}
                        className={`p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 cursor-pointer transition-all ${
                          !isRevealed ? "select-none group" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1 text-[11px] text-zinc-400">
                          <span>核心金句</span>
                          <button
                            onClick={e => handleSpeak(item.verse, e)}
                            className="hover:text-zinc-700 dark:hover:text-zinc-200"
                            title="朗读"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div
                          className={`font-classical text-base sm:text-lg font-semibold text-zinc-950 dark:text-zinc-50 leading-relaxed tracking-wide transition-all ${
                            !isRevealed
                              ? "filter blur-sm group-hover:blur-none opacity-40 group-hover:opacity-100"
                              : ""
                          }`}
                        >
                          {item.verse}
                        </div>

                        {!isRevealed && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-sans">
                            (遮挡自测中 · 点击或悬浮即可显露)
                          </div>
                        )}
                      </div>

                      {/* Exam Key Points */}
                      {item.examKeyPoints.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                          {item.examKeyPoints.map((pt, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40"
                            >
                              {pt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick Rating Selector */}
                    <div className="flex lg:flex-col items-center gap-1 shrink-0 pt-1 lg:pt-0">
                      <button
                        onClick={() => handleRate(item.id, "stuck")}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                          currentRating === "stuck"
                            ? "bg-red-500 text-white shadow-2xs"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        }`}
                        title="标记为卡壳"
                      >
                        <XCircle className="w-3 h-3" />
                        <span>卡壳</span>
                      </button>

                      <button
                        onClick={() => handleRate(item.id, "doubt")}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                          currentRating === "doubt"
                            ? "bg-amber-500 text-white shadow-2xs"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40"
                        }`}
                        title="标记为存疑"
                      >
                        <HelpCircle className="w-3 h-3" />
                        <span>存疑</span>
                      </button>

                      <button
                        onClick={() => handleRate(item.id, "mastered")}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                          currentRating === "mastered"
                            ? "bg-emerald-500 text-white shadow-2xs"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40"
                        }`}
                        title="标记为牢固"
                      >
                        <Check className="w-3 h-3" />
                        <span>牢固</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CramModeView;
