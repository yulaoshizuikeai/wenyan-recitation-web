import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { generateFlashcardsForArticle, Flashcard } from "../data/flashcardGenerator";
import { FSRSEngine } from "../domain/fsrs/fsrsEngine";
import { CardFsrsState, Rating, CardState } from "../domain/fsrs/fsrsTypes";
import { getCardState, saveCardState, recordReviewLog, getAllCardStates } from "../storage/db";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { RotateCw, CheckCircle, Sparkles, BookOpen, Trophy, Clock, Zap, Shuffle, ListFilter } from "lucide-react";

type QueueMode = "due" | "new" | "article" | "random";

interface FlipCardViewProps {
  initialArticleId?: string;
  selectedScope: string;
}

export const FlipCardView: React.FC<FlipCardViewProps> = ({ initialArticleId, selectedScope }) => {
  const fsrs = useMemo(() => new FSRSEngine(), []);

  // Filter articles based on selected scope
  const targetArticles = useMemo(() => {
    let list = ALL_ARTICLES;
    if (selectedScope === "GAOKAO72") {
      list = list.filter(a => a.isGaoKao72);
    } else if (selectedScope === "BX_ALL") {
      list = list.filter(a => a.moduleId.startsWith("MODULE_BX"));
    } else if (selectedScope === "XB_ALL") {
      list = list.filter(a => a.moduleId.startsWith("MODULE_XB"));
    } else if (selectedScope !== "ALL") {
      list = list.filter(a => a.moduleId === selectedScope);
    }
    return list;
  }, [selectedScope]);

  // Generate all flashcards in current scope
  const allCards = useMemo(() => {
    return targetArticles.flatMap(a => generateFlashcardsForArticle(a));
  }, [targetArticles]);

  const [queueMode, setQueueMode] = useState<QueueMode>("due");
  const [selectedArticleId, setSelectedArticleId] = useState<string>(() => {
    return initialArticleId || targetArticles[0]?.id || "art_bx1_12";
  });

  const [cardStatesMap, setCardStatesMap] = useState<Map<string, CardFsrsState>>(new Map());
  const [isLoadingStates, setIsLoadingStates] = useState(true);

  // Load all card states from IndexedDB
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

  // Compute counts for queue badges
  const now = Date.now();
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
      return art ? generateFlashcardsForArticle(art) : [];
    }
    if (queueMode === "random") {
      // Shuffled sample of 25 cards
      const shuffled = [...allCards].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, 25);
    }
    return [];
  }, [queueMode, dueCardsAll, newCardsAll, selectedArticleId, allCards]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentCardState, setCurrentCardState] = useState<CardFsrsState | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);

  const currentFlashcard: Flashcard | undefined = sessionCards[currentIndex];

  // Whenever queue mode or article changes, reset session progress
  const handleSwitchMode = (mode: QueueMode) => {
    setQueueMode(mode);
    setCurrentIndex(0);
    setIsFlipped(false);
    setCompletedCount(0);
    setSessionFinished(false);
  };

  // Load state for current flashcard
  useEffect(() => {
    if (!currentFlashcard) return;
    let isMounted = true;
    getCardState(currentFlashcard.id).then(state => {
      if (isMounted) {
        setCurrentCardState(state || fsrs.createInitialCard(currentFlashcard.id));
        setIsFlipped(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [currentFlashcard, fsrs]);

  // Interval previews for 4 ratings
  const intervalBadges = useMemo(() => {
    if (!currentCardState) {
      return { [Rating.AGAIN]: "<10分", [Rating.HARD]: "1天", [Rating.GOOD]: "3天", [Rating.EASY]: "15天" };
    }
    return fsrs.previewIntervals(currentCardState);
  }, [currentCardState, fsrs]);

  const handleFlip = () => {
    sound.playFlip();
    setIsFlipped(prev => !prev);
  };

  const handleRate = async (rating: Rating) => {
    if (!currentCardState || !currentFlashcard) return;

    if (rating === Rating.AGAIN) sound.playWrong();
    else if (rating === Rating.HARD) sound.playHard();
    else if (rating === Rating.GOOD) sound.playCorrect();
    else sound.playEasy();

    const result = fsrs.evaluateReview(currentCardState, rating);
    await saveCardState(result.updatedCard);
    await recordReviewLog(result.reviewLog);

    // Update local card states map
    setCardStatesMap(prev => {
      const next = new Map(prev);
      next.set(result.updatedCard.cardId, result.updatedCard);
      return next;
    });

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

  // Keyboard shortcut support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sessionFinished) return;
      if (e.code === "Space" || e.code === "Enter") {
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
  }, [isFlipped, currentCardState, sessionFinished, sessionCards.length, currentIndex]);

  if (isLoadingStates) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-[#8C8884] text-xs">
        正在读取 FSRS 算法记忆档案...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-between gap-1 p-1 bg-[#EAE5D4]/70 rounded-2xl mb-5 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => handleSwitchMode("due")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap ${
            queueMode === "due"
              ? "bg-white text-[#9E2A2B] shadow-xs font-bold"
              : "text-[#5C5855] hover:text-[#232120]"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>待复习</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${dueCardsAll.length > 0 ? "bg-red-500 text-white" : "bg-neutral-200 text-neutral-600"}`}>
            {dueCardsAll.length}
          </span>
        </button>

        <button
          onClick={() => handleSwitchMode("new")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap ${
            queueMode === "new"
              ? "bg-white text-[#9E2A2B] shadow-xs font-bold"
              : "text-[#5C5855] hover:text-[#232120]"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>学新卡</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
            {newCardsAll.length}
          </span>
        </button>

        <button
          onClick={() => handleSwitchMode("article")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap ${
            queueMode === "article"
              ? "bg-white text-[#9E2A2B] shadow-xs font-bold"
              : "text-[#5C5855] hover:text-[#232120]"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>选篇背诵</span>
        </button>

        <button
          onClick={() => handleSwitchMode("random")}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap ${
            queueMode === "random"
              ? "bg-white text-[#9E2A2B] shadow-xs font-bold"
              : "text-[#5C5855] hover:text-[#232120]"
          }`}
        >
          <Shuffle className="w-3.5 h-3.5" />
          <span>随机抽查</span>
        </button>
      </div>

      {/* Article Selector Dropdown for 'article' Mode */}
      {queueMode === "article" && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-xs text-[#5C5855] font-semibold whitespace-nowrap">当前诗文：</label>
          <select
            value={selectedArticleId}
            onChange={e => {
              setSelectedArticleId(e.target.value);
              setCurrentIndex(0);
              setIsFlipped(false);
              setCompletedCount(0);
              setSessionFinished(false);
            }}
            className="w-full text-xs bg-white border border-[#D5CFBD] rounded-xl px-3 py-2 font-serif font-bold text-[#232120] focus:outline-hidden focus:border-[#9E2A2B]"
          >
            {targetArticles.map(a => (
              <option key={a.id} value={a.id}>
                《{a.title}》〔{a.dynasty}·{a.author}〕{a.isGaoKao72 ? "★" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Empty State Handler */}
      {sessionCards.length === 0 ? (
        <div className="max-w-md mx-auto py-12 text-center animate-in fade-in duration-200">
          <div className="bg-white border border-[#E3DEC3] rounded-3xl p-8 shadow-xs">
            <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-[#232120]">
              {queueMode === "due" ? "今日暂无待复习闪卡！" : "当前筛选暂无可用闪卡"}
            </h2>
            <p className="text-xs text-[#5C5855] mt-1.5 mb-6 leading-relaxed">
              {queueMode === "due"
                ? "FSRS 遗忘曲线状态优异，名句记忆巩固度高。可以开启新卡学习或自选篇目精背。"
                : "请尝试切换教材范围或选择其他篇目。"}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => handleSwitchMode("new")}
                className="py-2.5 px-4 rounded-xl bg-[#9E2A2B] hover:bg-[#7A1E1F] text-white font-bold text-xs shadow-xs"
              >
                开启新卡学习（{Math.min(25, newCardsAll.length)} 句）
              </button>
              <button
                onClick={() => handleSwitchMode("article")}
                className="py-2.5 px-4 rounded-xl bg-white border border-[#D5CFBD] hover:bg-[#F0EDE1] text-xs font-semibold text-[#232120]"
              >
                选择特定篇目
              </button>
            </div>
          </div>
        </div>
      ) : sessionFinished ? (
        <div className="max-w-md mx-auto py-12 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white border-2 border-[#D4AF37] rounded-3xl p-8 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4 border border-amber-300">
              <Trophy className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-[#232120]">本次闪卡温习大捷！</h2>
            <p className="text-xs text-[#5C5855] mt-2 mb-6 leading-relaxed">
              已成功温习 <strong>{completedCount}</strong> 张名句闪卡。FSRS-5 算法已为每张卡片安排最佳复习间隔。
            </p>
            <button
              onClick={() => {
                setCurrentIndex(0);
                setCompletedCount(0);
                setSessionFinished(false);
                refreshCardStates();
              }}
              className="w-full py-3.5 rounded-xl bg-[#9E2A2B] hover:bg-[#7A1E1F] text-white font-bold text-sm shadow-md"
            >
              开启下一组复习
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Progress Header */}
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-bold text-[#5C5855] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#9E2A2B]" />
              第 {currentIndex + 1} 张 / 本组共 {sessionCards.length} 张
            </span>
            <span className="text-[#8C8884] hidden sm:inline">
              空格键翻转 · 数字键 1-4 评分
            </span>
          </div>

          <div className="w-full h-1.5 bg-[#EAE5D4] rounded-full overflow-hidden mb-5">
            <div
              className="h-full bg-[#9E2A2B] transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / sessionCards.length) * 100}%` }}
            />
          </div>

          {/* 3D Flip Card Container */}
          <div
            className="w-full min-h-[380px] cursor-pointer perspective-1000 mb-6"
            onClick={handleFlip}
          >
            <div
              className={`relative w-full min-h-[380px] rounded-3xl border border-[#E3DEC3] shadow-md transition-transform duration-500 transform-style-3d ${
                isFlipped ? "rotate-y-180" : ""
              }`}
            >
              {/* Card Front */}
              <div className="absolute inset-0 w-full h-full bg-white rounded-3xl p-6 sm:p-8 flex flex-col justify-between backface-hidden">
                <div>
                  <div className="flex items-center justify-between text-xs text-[#8C8884] mb-3">
                    <span className="font-bold px-2 py-0.5 rounded bg-[#FAF7F0] border border-[#E3DEC3] text-[#5C5855]">
                      {currentFlashcard?.frontTitle}
                    </span>
                    <span>轻触翻转看对句</span>
                  </div>
                  {currentFlashcard?.frontHint && (
                    <div className="text-xs text-[#9E2A2B] font-semibold mb-4">
                      {currentFlashcard.frontHint}
                    </div>
                  )}
                </div>

                <div className="my-auto py-4">
                  <p className="text-xl sm:text-2xl font-serif font-bold text-[#232120] leading-relaxed text-center tracking-wide">
                    {currentFlashcard?.frontPrompt}
                  </p>
                </div>

                <div className="flex items-center justify-center gap-1 text-xs text-[#8C8884] pt-4 border-t border-[#F0EDE1]">
                  <RotateCw className="w-3.5 h-3.5 text-[#9E2A2B]" />
                  点击卡片或按空格翻转核验
                </div>
              </div>

              {/* Card Back */}
              <div className="absolute inset-0 w-full h-full bg-[#FAF7F0] rounded-3xl p-6 sm:p-8 flex flex-col justify-between rotate-y-180 backface-hidden border-2 border-[#9E2A2B]/20">
                <div>
                  <div className="flex items-center justify-between text-xs text-[#8C8884] mb-2">
                    <span className="font-bold text-[#2C4F3D] px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                      正解与考点
                    </span>
                    <span className="text-[#8C8884]">{currentFlashcard?.frontTitle}</span>
                  </div>
                </div>

                <div className="my-auto py-2 space-y-4">
                  <div className="p-4 rounded-2xl bg-white border border-[#E3DEC3] shadow-2xs">
                    <p className="text-lg sm:text-xl font-serif font-bold text-[#9E2A2B] leading-relaxed text-center">
                      {currentFlashcard?.fullVerseContext || currentFlashcard?.backAnswer}
                    </p>
                  </div>

                  {currentFlashcard?.backTranslation && (
                    <div className="text-xs text-[#5C5855] leading-relaxed bg-white/60 p-3 rounded-xl border border-[#F0EDE1]">
                      <strong className="text-[#232120]">白话义：</strong>
                      {currentFlashcard.backTranslation}
                    </div>
                  )}
                </div>

                <div className="text-center text-[11px] text-[#8C8884] pt-2 border-t border-[#E3DEC3]">
                  在下方选择记忆反馈，触发 FSRS 间隔重复计算
                </div>
              </div>
            </div>
          </div>

          {/* FSRS 4 Rating Buttons */}
          {isFlipped ? (
            <div className="grid grid-cols-4 gap-2.5 sm:gap-3 animate-in fade-in duration-200">
              <button
                onClick={() => handleRate(Rating.AGAIN)}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-2xl bg-red-50 hover:bg-red-100 border border-red-300 text-red-800 transition-all shadow-xs"
              >
                <span className="text-xs font-bold">1. 重来</span>
                <span className="text-[10px] text-red-600 mt-0.5">{intervalBadges[Rating.AGAIN]}</span>
              </button>

              <button
                onClick={() => handleRate(Rating.HARD)}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 transition-all shadow-xs"
              >
                <span className="text-xs font-bold">2. 困难</span>
                <span className="text-[10px] text-amber-600 mt-0.5">{intervalBadges[Rating.HARD]}</span>
              </button>

              <button
                onClick={() => handleRate(Rating.GOOD)}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 transition-all shadow-xs"
              >
                <span className="text-xs font-bold">3. 良好</span>
                <span className="text-[10px] text-blue-600 mt-0.5">{intervalBadges[Rating.GOOD]}</span>
              </button>

              <button
                onClick={() => handleRate(Rating.EASY)}
                className="flex flex-col items-center justify-center py-3 px-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 transition-all shadow-xs"
              >
                <span className="text-xs font-bold">4. 简单</span>
                <span className="text-[10px] text-emerald-600 mt-0.5">{intervalBadges[Rating.EASY]}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleFlip}
              className="w-full py-3.5 rounded-2xl bg-[#9E2A2B] hover:bg-[#7A1E1F] text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
            >
              <RotateCw className="w-4 h-4" />
              显示答案（核验对句）
            </button>
          )}
        </>
      )}
    </div>
  );
};