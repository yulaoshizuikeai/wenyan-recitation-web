import React, { useEffect, useMemo, useState } from "react";
import { ALL_ARTICLES } from "../data/curriculumData";
import { VOLUME_DECKS, SPECIAL_DECKS, getVolumeForArticle } from "../data/ankiDecks";
import { Rating } from "../domain/fsrs/fsrsTypes";
import { SessionExtra } from "../storage/sessionTracker";
import { AnkiDeckHub } from "../components/AnkiDeckHub";
import { StudyWorkspaceShell } from "../components/StudyWorkspaceShell";
import { NavView } from "../components/Navbar";
import { useFlipCardSession } from "../hooks/useFlipCardSession";
import { FlipCardSettlement } from "../components/flipcard/FlipCardSettlement";
import { FlipCardBody } from "../components/flipcard/FlipCardBody";
import { useOptionalStudyApp } from "../state/StudyAppContext";
import {
  CheckCircle,
  BookOpen,
  Clock,
  Zap,
  Shuffle,
  ArrowLeft,
  Volume2,
} from "lucide-react";

interface FlipCardViewProps {
  initialArticleId?: string;
  selectedScope?: string;
  resumeExtra?: SessionExtra;
  onOpenArticleInView?: (articleId: string, view: NavView) => void;
}

export const FlipCardView: React.FC<FlipCardViewProps> = ({
  initialArticleId: propInitialArticleId,
  selectedScope: propSelectedScope,
  resumeExtra: propResumeExtra,
  onOpenArticleInView: propOnOpenArticleInView,
}) => {
  const appCtx = useOptionalStudyApp();
  const initialArticleId = propInitialArticleId ?? appCtx?.activeArticleId;
  const selectedScope = propSelectedScope ?? appCtx?.selectedScope ?? "ALL";
  const resumeExtra = propResumeExtra ?? appCtx?.resumeExtra;
  const onOpenArticleInView = propOnOpenArticleInView ?? appCtx?.navigateToArticle;

  const [showPhonetics, setShowPhonetics] = useState(false);
  const [showUnderstanding, setShowUnderstanding] = useState(false);

  const {
    schedulerSettings, viewMode, setViewMode, activeDeckId, activeArticleId,
    queueMode, selectedArticleId, sessionCards, currentIndex, currentFlashcard,
    isFlipped, currentCardState, intervalBadges, completedCount, sessionFinished,
    hasRestoredNotice, setHasRestoredNotice, remainingInSession, newCardsAll,
    dueCardsAll, cardStatesMap, dailyPlan, targetArticles, sequentialMode,
    toggleSequentialMode, showPrecedingHint, togglePrecedingHint, typingMode,
    toggleTypingMode, handleFlip, handleRate, handleSwitchMode, handleSelectArticle,
    handleResetIndex, handleStartStudyDeck, handleUpdateSettings, refreshCardStates,
  } = useFlipCardSession({ initialArticleId, selectedScope, resumeExtra });

  const isGlobalModalOpen = Boolean(appCtx?.showCommandPalette || appCtx?.showShortcuts);

  // Keyboard shortcut listener for space/enter (flip) and 1-4 (ratings)
  useEffect(() => {
    if (viewMode !== "study" || isGlobalModalOpen || showPhonetics || showUnderstanding) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.code === "Space" || ((e.code === "Enter" || e.code === "NumpadEnter") && !isFlipped)) {
        e.preventDefault();
        handleFlip();
      } else if (!isFlipped && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        togglePrecedingHint();
      } else if (isFlipped) {
        if (e.key === "1") handleRate(Rating.AGAIN);
        else if (e.key === "2") handleRate(Rating.HARD);
        else if (e.key === "3") handleRate(Rating.GOOD);
        else if (e.key === "4") handleRate(Rating.EASY);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    viewMode,
    isGlobalModalOpen,
    showPhonetics,
    showUnderstanding,
    isFlipped,
    currentFlashcard,
    currentCardState,
    handleFlip,
    handleRate,
    togglePrecedingHint,
  ]);

  // Active article / volume for breadcrumbs and sidebar
  const activeArticleObj = useMemo(() => {
    if (currentFlashcard) {
      return ALL_ARTICLES.find((a) => a.id === currentFlashcard.articleId);
    }
    return activeArticleId ? ALL_ARTICLES.find((a) => a.id === activeArticleId) : undefined;
  }, [currentFlashcard, activeArticleId]);

  const activeVolumeObj = useMemo(() => {
    if (activeArticleObj) {
      return getVolumeForArticle(activeArticleObj.id);
    }
    return (
      VOLUME_DECKS.find((v) => v.id === activeDeckId) ||
      SPECIAL_DECKS.find((s) => s.id === activeDeckId)
    );
  }, [activeArticleObj, activeDeckId]);

  const returnToDeckHub = () => {
    setShowPhonetics(false);
    setShowUnderstanding(false);
    setViewMode("deck_hub");
    refreshCardStates();
  };

  const studyToolbar = viewMode === "study" ? (
    <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800 text-xs gap-2">
      <button
        onClick={returnToDeckHub}
        className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-medium shadow-2xs shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>返回选册牌组</span>
      </button>

      <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[200px] sm:max-w-none">
        <span>{activeVolumeObj?.name || "牌组"}</span>
        <span>/</span>
        <span className="text-zinc-900 dark:text-zinc-100 font-classical font-semibold truncate">
          {activeArticleObj ? `《${activeArticleObj.title}》` : "全册联背"}
        </span>
      </div>

      <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold shrink-0">
        {activeArticleObj && (
          <div className="hidden sm:flex items-center gap-0.5 mr-1">
            <button
              onClick={() => setShowPhonetics(true)}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="查看难词注音"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowUnderstanding(true)}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="查看理解大意"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">
          新卡 {newCardsAll.length}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
          待复习 {dueCardsAll.length}
        </span>
      </div>
    </div>
  ) : undefined;

  return (
    <StudyWorkspaceShell
      containerClassName="max-w-4xl xl:max-w-6xl mx-auto px-4 py-5 pb-24"
      mainClassName={viewMode === "study" ? "max-w-xl xl:max-w-none min-w-0 space-y-4 mx-auto xl:mx-0" : "min-w-0"}
      hideSidebar={viewMode !== "study"}
      toolbar={studyToolbar}
      article={activeArticleObj}
      sidebarProgressLabel={`第 ${currentIndex + 1} / ${Math.max(1, sessionCards.length)} 张`}
      sidebarProgressPercent={
        sessionCards.length > 0 ? ((currentIndex + 1) / sessionCards.length) * 100 : 0
      }
      sidebarShortcuts={[
        { keys: "Space", label: "翻开卡片" },
        { keys: "H", label: "提示上一句" },
        { keys: "1 / 2 / 3 / 4", label: "重来 / 困难 / 良好 / 简单" },
      ]}
      sidebarHint="凭第一反应评分，不要凭「刚才看过」的感觉。评低一点，明天才会真的再见到它。"
      showPhonetics={showPhonetics}
      onShowPhonetics={activeArticleObj ? () => setShowPhonetics(true) : undefined}
      onClosePhonetics={() => setShowPhonetics(false)}
      showUnderstanding={showUnderstanding}
      onShowUnderstanding={activeArticleObj ? () => setShowUnderstanding(true) : undefined}
      onCloseUnderstanding={() => setShowUnderstanding(false)}
      understandingHighlightText={currentFlashcard?.fullVerseContext || currentFlashcard?.backAnswer}
    >
      {/* View Mode 1: Anki Deck Hub */}
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

      {/* View Mode 2: Anki Study Session */}
      {viewMode === "study" && (
        <div>
            {/* Quick Queue Mode Switching Pill */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl mb-4 text-xs font-medium">
              {([
                { id: "due" as const, label: "待复习", icon: <Clock className="w-3.5 h-3.5" />, count: dueCardsAll.length, highlight: dueCardsAll.length > 0 },
                { id: "new" as const, label: "新卡", icon: <Zap className="w-3.5 h-3.5" />, count: newCardsAll.length, highlight: false },
                { id: "article" as const, label: "选篇", icon: <BookOpen className="w-3.5 h-3.5" /> },
                { id: "random" as const, label: "随机抽", icon: <Shuffle className="w-3.5 h-3.5" /> },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleSwitchMode(tab.id)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-colors ${
                    queueMode === tab.id
                      ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`font-mono text-[10px] px-1 rounded ${
                        tab.highlight
                          ? "bg-emerald-500 text-white font-bold"
                          : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Article Selector Dropdown for 'article' Mode */}
            {queueMode === "article" && (
              <div className="mb-4">
                <select
                  value={selectedArticleId}
                  onChange={(e) => {
                    const id = e.target.value;
                    handleSelectArticle(id);
                    appCtx?.setActiveArticleId(id);
                  }}
                  className="w-full text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:border-zinc-400"
                >
                  {targetArticles.map((a) => (
                    <option key={a.id} value={a.id}>
                      《{a.title}》· {a.author} ({a.dynasty})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Empty State / Settlement / Active Card */}
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
              <FlipCardSettlement
                completedCount={completedCount}
                enableSessionLoop={schedulerSettings.enableSessionLoop}
                dailyNewLimit={schedulerSettings.dailyNewLimit || 20}
                onStartNextGroup={() => handleStartStudyDeck(activeDeckId, activeArticleId)}
                onReturnToDeckHub={returnToDeckHub}
              />
            ) : (
              currentFlashcard && (
                <FlipCardBody
                  currentFlashcard={currentFlashcard}
                  currentIndex={currentIndex}
                  totalCards={sessionCards.length}
                  remainingInSession={remainingInSession}
                  isFlipped={isFlipped}
                  intervalBadges={intervalBadges}
                  hasRestoredNotice={hasRestoredNotice}
                  onFlip={handleFlip}
                  onRate={handleRate}
                  onResetIndex={handleResetIndex}
                  onDismissRestoredNotice={() => setHasRestoredNotice(false)}
                  showPrecedingHint={showPrecedingHint}
                  onTogglePrecedingHint={togglePrecedingHint}
                  typingMode={typingMode}
                  onToggleTypingMode={toggleTypingMode}
                  sequentialMode={sequentialMode}
                  onToggleSequentialMode={toggleSequentialMode}
                />
              )
            )}
        </div>
      )}
    </StudyWorkspaceShell>
  );
};
