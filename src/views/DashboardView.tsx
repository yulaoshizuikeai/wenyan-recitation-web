import React, { useState, useEffect, useMemo } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { VOLUME_DECKS, VolumeDeck, computeDeckStats } from "../data/ankiDecks";
import { Heatmap } from "../components/Heatmap";
import { getAllCardStates, getDailyRecords } from "../storage/db";
import { CardFsrsState } from "../domain/fsrs/fsrsTypes";
import { NavView } from "../components/Navbar";
import { useLastSession, LastSessionState } from "../storage/sessionTracker";
import { PickUpCard } from "../components/PickUpCard";
import { getLocalDateString } from "../utils/date";
import { useOptionalStudyApp } from "../state/StudyAppContext";
import {
  Layers,
  Sparkles,
  BookOpen,
  ChevronRight,
  Flame,
  Clock,
  CheckCircle,
  BarChart,
  Play,
  Eye,
  HelpCircle
} from "lucide-react";

interface DashboardViewProps {
  onNavigate?: (view: NavView) => void;
  onOpenArticleInView?: (articleId: string, view: NavView) => void;
  onResumeSession?: (session: LastSessionState) => void;
  selectedScope?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate: propOnNavigate,
  onOpenArticleInView: propOnOpenArticleInView,
  onResumeSession: propOnResumeSession,
  selectedScope: propSelectedScope
}) => {
  const appCtx = useOptionalStudyApp();
  const onNavigate = propOnNavigate ?? appCtx?.setCurrentView ?? (() => {});
  const onOpenArticleInView = propOnOpenArticleInView ?? appCtx?.navigateToArticle ?? (() => {});
  const onResumeSession = propOnResumeSession ?? appCtx?.resumeSession;
  const selectedScope = propSelectedScope ?? appCtx?.selectedScope ?? "ALL";

  const [cardStates, setCardStates] = useState<CardFsrsState[]>([]);
  const [dailyRecords, setDailyRecords] = useState<{ date: string; count: number }[]>([]);
  const { lastSession, clearSession } = useLastSession();

  const handleResume = (session: LastSessionState) => {
    if (onResumeSession) {
      onResumeSession(session);
    } else {
      if (session.articleId) {
        onOpenArticleInView(session.articleId, session.view);
      } else {
        onNavigate(session.view);
      }
    }
  };

  const handleRestart = (session: LastSessionState) => {
    if (session.articleId) {
      localStorage.removeItem(`snowball_stage_${session.articleId}`);
    }
    handleResume({
      ...session,
      progressText: session.view === "snowball" ? "第 1 联攻坚" : "从头开始",
      progressPercent: 0,
      extra: {
        ...session.extra,
        stageIndex: 0,
        cardIndex: 0,
        goldenVerseIndex: 0,
        scenarioQuestionIndex: 0,
        clozeLevel: 0
      }
    });
  };

  const handleDismiss = () => {
    clearSession();
  };

  useEffect(() => {
    getAllCardStates().then(setCardStates);
    getDailyRecords().then(setDailyRecords);
  }, []);

  const totalReviews = useMemo(() => {
    return dailyRecords.reduce((acc, r) => acc + r.count, 0);
  }, [dailyRecords]);

  // Compute streak
  const streak = useMemo(() => {
    if (dailyRecords.length === 0) return 0;
    const sorted = [...dailyRecords].sort((a, b) => b.date.localeCompare(a.date));
    const todayStr = getLocalDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yestStr = getLocalDateString(yesterday);

    const hasToday = sorted.some(r => r.date === todayStr && r.count > 0);
    const hasYest = sorted.some(r => r.date === yestStr && r.count > 0);

    if (!hasToday && !hasYest) return 0;

    let count = 0;
    let checkDate = new Date();
    if (!hasToday) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    const set = new Set(sorted.filter(r => r.count > 0).map(r => r.date));
    while (true) {
      const dStr = getLocalDateString(checkDate);
      if (set.has(dStr)) {
        count++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  }, [dailyRecords]);

  // Due cards count
  const dueCardsCount = useMemo(() => {
    const now = Date.now();
    return cardStates.filter(c => c.dueTime <= now && c.state !== 0).length;
  }, [cardStates]);

  // Mature cards (stability >= 21 days)
  const matureCardsCount = useMemo(() => {
    return cardStates.filter(c => c.stability >= 21).length;
  }, [cardStates]);

  const masteryPercent = useMemo(() => {
    if (cardStates.length === 0) return 0;
    return Math.min(100, Math.round((matureCardsCount / cardStates.length) * 100));
  }, [cardStates.length, matureCardsCount]);

  // High-frequency classical articles recommended for today
  const recommendedArticles = useMemo(() => {
    return [
      ALL_ARTICLES.find(a => a.id === "art_bx1_12")!, // 劝学
      ALL_ARTICLES.find(a => a.id === "art_bx1_13")!, // 师说
      ALL_ARTICLES.find(a => a.id === "art_bx1_14")!, // 赤壁赋
      ALL_ARTICLES.find(a => a.id === "art_bx1_08")!, // 琵琶行并序
      ALL_ARTICLES.find(a => a.id === "art_xb1_07")!, // 离骚
      ALL_ARTICLES.find(a => a.id === "art_xb3_11")!  // 阿房宫赋
    ].filter(Boolean);
  }, []);

  const cardStatesMap = useMemo(() => {
    const map = new Map<string, CardFsrsState>();
    cardStates.forEach(s => map.set(s.cardId, s));
    return map;
  }, [cardStates]);

  const volumeDeckSummaries = useMemo(() => {
    const now = Date.now();
    return VOLUME_DECKS.map(vol => {
      const arts = ALL_ARTICLES.filter(a => vol.moduleIds.includes(a.moduleId));
      const stats = computeDeckStats(vol.id, vol.name, arts, cardStatesMap, now);
      return {
        volume: vol,
        articles: arts,
        stats
      };
    });
  }, [cardStatesMap]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5 animate-fade-slide-up">
      {/* Top Minimalist Launcher: Left = Primary Continue / Start, Right = 2x2 Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-7 flex flex-col">
          {lastSession ? (
            <PickUpCard
              variant="hero"
              session={lastSession}
              onResume={handleResume}
              onRestart={handleRestart}
              onDismiss={handleDismiss}
              className="flex-1 flex flex-col justify-between"
            />
          ) : (
            <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
                  <span>课标 11 册 · 100 篇 · FSRS-5</span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  开始今日文言研习
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-classical">
                  学不可以已。选定一篇长文滚雪球串联，或温习到期 FSRS 闪卡。
                </p>
              </div>
              <div className="pt-5 flex flex-wrap gap-2.5">
                <button
                  onClick={() => onNavigate("snowball")}
                  className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-2xs"
                >
                  <Layers className="w-4 h-4" />
                  <span>长卷滚雪球</span>
                </button>
                <button
                  onClick={() => onNavigate("flipcard")}
                  className="py-2.5 px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-semibold flex items-center gap-1.5 hover:bg-zinc-800 dark:hover:bg-white transition-all active:scale-[0.98]"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>牌组闪卡</span>
                  {dueCardsCount > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-red-500 text-white font-bold">
                      {dueCardsCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Compact 2x2 Metric Grid */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>连续坚持</span>
              <Flame className="w-4 h-4 text-red-500/80" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                {streak} <span className="text-xs font-sans font-normal text-zinc-400">天</span>
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">每日连贯温习</p>
            </div>
          </div>

          <div
            onClick={() => onNavigate("flipcard")}
            role="button"
            tabIndex={0}
            onKeyDown={e => (e.key === "Enter" || e.key === " ") && onNavigate("flipcard")}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-2xl p-4 shadow-2xs flex flex-col justify-between cursor-pointer transition-colors group"
          >
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>到期待复习</span>
              <Clock className="w-4 h-4 text-zinc-400 group-hover:text-red-500 transition-colors" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                {dueCardsCount} <span className="text-xs font-sans font-normal text-zinc-400">句</span>
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">点击直达闪卡</p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>熟读成诵率</span>
              <CheckCircle className="w-4 h-4 text-emerald-500/80" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                {masteryPercent}%
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{matureCardsCount} 句已牢固</p>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>累计复习</span>
              <BarChart className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                {totalReviews} <span className="text-xs font-sans font-normal text-zinc-400">次</span>
              </div>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">研墨诵读次数</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Mode Launcher Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { id: "snowball" as const, title: "长卷滚雪球", desc: "逐联递推串联长篇", icon: <Layers className="w-4 h-4" /> },
          { id: "flipcard" as const, title: "牌组闪卡", desc: "FSRS 间隔重复", icon: <Sparkles className="w-4 h-4" />, badge: dueCardsCount > 0 ? dueCardsCount : undefined },
          { id: "cloze" as const, title: "渐进遮挡", desc: "L0-L4 挖空自测", icon: <Eye className="w-4 h-4" /> },
          { id: "cram" as const, title: "考前抱佛脚", desc: "高频金句突击", icon: <Flame className="w-4 h-4 text-red-500" /> },
          { id: "scenario" as const, title: "高考默写", desc: "情境真题逐字比对", icon: <HelpCircle className="w-4 h-4" /> }
        ].map(mode => (
          <button
            key={mode.id}
            onClick={() => onNavigate(mode.id)}
            className="text-left p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-2xs active:scale-[0.99] transition-all group"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-950 transition-colors">
                {mode.icon}
              </span>
              {mode.badge !== undefined && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-red-600 text-white font-semibold">
                  {mode.badge}
                </span>
              )}
            </div>
            <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
              <span>{mode.title}</span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">{mode.desc}</p>
          </button>
        ))}
      </div>

      {/* Recitation Heatmap */}
      <Heatmap records={dailyRecords} streak={streak} totalReviews={totalReviews} />

      {/* Anki Volume Decks Progress Overview */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>高中语文 6 大选册背诵进度 (Anki 牌组概览)</span>
            </h2>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              按教材各册科学分配 FSRS 遗忘复习与新词句，点击任意选册直接开背
            </p>
          </div>
          <button
            onClick={() => onNavigate("flipcard")}
            className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
          >
            <span>进入牌组主控台</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {volumeDeckSummaries.map(({ volume, articles, stats }) => {
            const maturePct = stats.totalCards > 0 ? Math.round((stats.matureCount / stats.totalCards) * 100) : 0;
            return (
              <div
                key={volume.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenArticleInView(articles[0]?.id || "art_bx1_12", "flipcard")}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenArticleInView(articles[0]?.id || "art_bx1_12", "flipcard");
                  }
                }}
                className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/30 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800/60 hover:shadow-2xs active:scale-[0.995] cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      {volume.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      {volume.badge} · {articles.length}篇
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono my-2.5">
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-100/70 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">
                      新卡 {stats.newCount}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100/70 dark:bg-red-950/40 text-red-700 dark:text-red-300">
                      学习 {stats.learningCount}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                      复习 {stats.dueCount}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between text-[11px]">
                  <div className="text-zinc-400">
                    熟记度 <strong className="text-zinc-700 dark:text-zinc-300 font-mono">{maturePct}%</strong>
                  </div>
                  <span className="text-sky-600 dark:text-sky-400 font-medium flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                    <span>背诵</span>
                    <Play className="w-3 h-3 fill-current" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommended Core Articles for Snowball Recitation */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>高考必背长篇核心攻坚推荐（滚雪球首选）</span>
            </h2>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
              全国高考命题超高频文赋，建议使用滚雪球串联逐联突破
            </p>
          </div>
          <button
            onClick={() => onNavigate("catalog")}
            className="text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-0.5"
          >
            <span>全量 100 篇</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recommendedArticles.map(article => (
            <div
              key={article.id}
              className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800/60 hover:shadow-2xs focus-within:border-zinc-400 dark:focus-within:border-zinc-600 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                  <span>〔{article.dynasty}〕{article.author}</span>
                  <span className="text-[10px] font-mono px-1.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
                    高考72篇
                  </span>
                </div>
                <h3 className="text-sm font-classical font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                  《{article.title}》
                </h3>
                <p className="text-xs font-classical text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-3">
                  {article.fullContent}
                </p>
              </div>

              <div className="flex items-center gap-1.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 text-xs">
                <button
                  onClick={() => onOpenArticleInView(article.id, "snowball")}
                  className="flex-1 py-1 px-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium flex items-center justify-center gap-1 transition-colors"
                >
                  <Layers className="w-3 h-3" />
                  <span>滚雪球</span>
                </button>
                <button
                  onClick={() => onOpenArticleInView(article.id, "cloze")}
                  className="py-1 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  遮挡
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
