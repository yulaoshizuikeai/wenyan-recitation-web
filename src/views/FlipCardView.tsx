import React, { useState, useEffect, useMemo } from "react";
import { ALL_ARTICLES } from "../data/curriculumData";
import { generateFlashcardsForArticle, Flashcard } from "../data/flashcardGenerator";
import { FSRSEngine } from "../domain/fsrs/fsrsEngine";
import { CardFsrsState, Rating } from "../domain/fsrs/fsrsTypes";
import { getCardState, saveCardState, recordReviewLog } from "../storage/db";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { RotateCw, CheckCircle, Sparkles, BookOpen, Volume2, Trophy, ArrowRight } from "lucide-react";

interface FlipCardViewProps {
  selectedScope: string;
}

export const FlipCardView: React.FC<FlipCardViewProps> = ({ selectedScope }) => {
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

  // Generate flashcards pool
  const allCards = useMemo(() => {
    return targetArticles.flatMap(a => generateFlashcardsForArticle(a));
  }, [targetArticles]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentCardState, setCurrentCardState] = useState<CardFsrsState | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);

  // Take a working batch of up to 30 cards
  const sessionCards = useMemo(() => {
    return allCards.slice(0, 30);
  }, [allCards]);

  const currentFlashcard: Flashcard | undefined = sessionCards[currentIndex];

  // Load FSRS state for current card
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
    if (!currentCardState) return { [Rating.AGAIN]: "<10分", [Rating.HARD]: "1天", [Rating.GOOD]: "3天", [Rating.EASY]: "15天" };
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
  }, [isFlipped, currentCardState, sessionFinished]);

  if (sessionCards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-[#E3DEC3] rounded-3xl p-8 shadow-sm">
          <BookOpen className="w-12 h-12 text-[#8C8884] mx-auto mb-3" />
          <h2 className="text-lg font-bold text-[#232120]">当前选定范围无可用闪卡</h2>
          <p className="text-xs text-[#5C5855] mt-1">请尝试在顶部切换为“全部 11 册教材”或“高考 72 篇必背”</p>
        </div>
      </div>
    );
  }

  if (sessionFinished) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-white border-2 border-[#D4AF37] rounded-3xl p-8 shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-4 border border-amber-300">
            <Trophy className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#232120]">本次闪卡复习大捷！</h2>
          <p className="text-xs text-[#5C5855] mt-2 mb-6">
            已成功温习 <strong>{completedCount}</strong> 张名句闪卡。FSRS-5 算法已为每张卡片安排最佳复习间隔。
          </p>
          <button
            onClick={() => {
              sound.playClick();
              setCurrentIndex(0);
              setCompletedCount(0);
              setSessionFinished(false);
            }}
            className="w-full py-3.5 rounded-xl bg-[#9E2A2B] hover:bg-[#7A1E1F] text-white font-bold text-sm shadow-md"
          >
            开启新一轮复习
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Session Progress Header */}
      <div className="flex items-center justify-between mb-4 text-xs">
        <span className="font-bold text-[#5C5855] flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#9E2A2B]" />
          第 {currentIndex + 1} 张 / 本轮共 {sessionCards.length} 张
        </span>
        <span className="text-[#8C8884]">
          空格键翻转 · 数字键 1-4 评分
        </span>
      </div>

      <div className="w-full h-2 bg-[#EAE5D4] rounded-full overflow-hidden mb-6">
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
                  {currentFlashcard.frontTitle}
                </span>
                <span>轻触翻转看对句</span>
              </div>
              <div className="text-xs text-[#9E2A2B] font-semibold mb-4">
                {currentFlashcard.frontHint}
              </div>
            </div>

            <div className="my-auto py-4">
              <p className="text-xl sm:text-2xl font-serif font-bold text-[#232120] leading-relaxed text-center tracking-wide">
                {currentFlashcard.frontPrompt}
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
                <span className="text-[#8C8884]">{currentFlashcard.frontTitle}</span>
              </div>
            </div>

            <div className="my-auto py-2 space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-[#E3DEC3] shadow-2xs">
                <p className="text-lg sm:text-xl font-serif font-bold text-[#9E2A2B] leading-relaxed text-center">
                  {currentFlashcard.fullVerseContext || currentFlashcard.backAnswer}
                </p>
              </div>

              {currentFlashcard.backTranslation && (
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
    </div>
  );
};
