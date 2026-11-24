import React, { useState, useEffect, useMemo } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { VOLUME_DECKS, VolumeDeck, computeDeckStats } from "../data/ankiDecks";
import { Heatmap } from "../components/Heatmap";
import { getAllCardStates, getDailyRecords } from "../storage/db";
import { CardFsrsState } from "../domain/fsrs/fsrsTypes";
import { NavView } from "../components/Navbar";
import { useLastSession, LastSessionState } from "../storage/sessionTracker";
import { PickUpCard } from "../components/PickUpCard";
import {
  Layers,
  Sparkles,
  BookOpen,
  ChevronRight,
  Flame,
  Clock,
  CheckCircle,
  BarChart,
  ArrowUpRight,
  RotateCcw,
  Play
} from "lucide-react";

interface DashboardViewProps {
  onNavigate: (view: NavView) => void;
  onOpenArticleInView: (articleId: string, view: NavView) => void;
  onResumeSession?: (session: LastSessionState) => void;
  selectedScope: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenArticleInView,
  onResumeSession,
  selectedScope
}) => {
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
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yestStr = yesterday.toISOString().slice(0, 10);

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
      const dStr = checkDate.toISOString().slice(0, 10);
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
    <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">
      {/* Hero Welcome Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-7 shadow-xs transition-colors">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-mono text-zinc-600 dark:text-zinc-400">
            <span>普通高中语文课标 11 册 · 100 篇经典收录</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            文言背诵 · 现代间隔重复系统
          </h1>

          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed font-classical">
            学不可以已。循序渐进，以滚雪球串联递推长篇文赋，依托科学 FSRS-5 算法锁定永久记忆留存。
          </p>

          <div className="pt-3 flex flex-wrap gap-2.5">
            {lastSession && (
              <button
                onClick={() => handleResume(lastSession)}
                className="py-2 px-4 rounded-xl bg-red-600 text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all hover:bg-red-700 active:scale-[0.98] shadow-2xs"
              >
                <RotateCcw className="w-4 h-4" />
                <span>
                  {lastSession.articleTitle
                    ? `接续《${lastSession.articleTitle}》`
                    : `接续${lastSession.modeName}`}
                  ({lastSession.progressPercent}%)
                </span>
              </button>
            )}

            <button
              onClick={() => onNavigate("cram")}
              className={`py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-2xs ${
                lastSession
                  ? "border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              <Flame className="w-4 h-4 text-red-500" />
              <span>考前抱佛脚 · 核心金句</span>
            </button>

            <button
              onClick={() => onNavigate("snowball")}
              className="py-2 px-4 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.98]"
            >
              <Layers className="w-4 h-4" />
              <span>长卷滚雪球</span>
            </button>

            <button
              onClick={() => onNavigate("flipcard")}
              className="py-2 px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs sm:text-sm font-medium flex items-center gap-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-zinc-500" />
              <span>温习闪卡</span>
              {dueCardsCount > 0 && (
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-red-500 text-white font-bold">
                  {dueCardsCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Prominent "Pick up where I left off" Resume Station */}
      {lastSession && (
        <PickUpCard
          variant="hero"
          session={lastSession}
          onResume={handleResume}
          onRestart={handleRestart}
          onDismiss={handleDismiss}
        />
      )}

      {/* Top 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
            <span>连续坚持</span>
            <Flame className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {streak} <span className="text-xs font-sans font-normal text-zinc-400">天</span>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">保持每日连贯温习</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
            <span>到期待复习</span>
            <Clock className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {dueCardsCount} <span className="text-xs font-sans font-normal text-zinc-400">句</span>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">FSRS 遗忘曲线到期</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
            <span>熟读成诵率</span>
            <CheckCircle className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {masteryPercent}%
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">{matureCardsCount} 句已牢固熟记</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-2xs transition-colors">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
            <span>累计复习词句</span>
            <BarChart className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
            {totalReviews} <span className="text-xs font-sans font-normal text-zinc-400">次</span>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">累计研墨诵读次数</p>
        </div>
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
                onClick={() => onOpenArticleInView(articles[0]?.id || "art_bx1_12", "flipcard")}
                className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/30 hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer transition-all flex flex-col justify-between group"
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
              className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex flex-col justify-between"
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
