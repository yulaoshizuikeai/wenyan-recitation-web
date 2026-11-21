import React, { useState, useEffect, useMemo } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { Heatmap } from "../components/Heatmap";
import { getAllCardStates, getDailyRecords } from "../storage/db";
import { CardFsrsState } from "../domain/fsrs/fsrsTypes";
import { NavView } from "../components/Navbar";
import { Layers, Sparkles, HelpCircle, BookOpen, ChevronRight, Award, Zap } from "lucide-react";

interface DashboardViewProps {
  onNavigate: (view: NavView) => void;
  onOpenArticleInView: (articleId: string, view: NavView) => void;
  selectedScope: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenArticleInView,
  selectedScope
}) => {
  const [cardStates, setCardStates] = useState<CardFsrsState[]>([]);
  const [dailyRecords, setDailyRecords] = useState<{ date: string; count: number }[]>([]);

  useEffect(() => {
    getAllCardStates().then(setCardStates);
    getDailyRecords().then(setDailyRecords);
  }, []);

  // Compute stats
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#9E2A2B] via-[#852324] to-[#2C4F3D] rounded-3xl p-6 sm:p-8 text-white shadow-md">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-bold text-amber-200 border border-white/20">
            <Award className="w-3.5 h-3.5" />
            高中语文 11 册教材 · 100 篇经典古诗文
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-wide">
            文言背诵 · 滚雪球串联与 FSRS-5 记忆系统
          </h1>
          <p className="text-xs sm:text-sm text-white/80 leading-relaxed font-serif">
            学不可以已。循序渐进，以滚雪球逐联递推攻坚长篇文赋，依托科学记忆算法锁定长久保留率。
          </p>

          <div className="pt-4 flex flex-wrap gap-3">
            <button
              onClick={() => {
                onNavigate("snowball");
              }}
              className="py-2.5 px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Layers className="w-4 h-4" />
              开启长篇滚雪球背诵
            </button>

            <button
              onClick={() => {
                onNavigate("flipcard");
              }}
              className="py-2.5 px-4 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 border border-white/30 backdrop-blur transition-all"
            >
              <Sparkles className="w-4 h-4" />
              今日闪卡复习
              {dueCardsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px]">
                  {dueCardsCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Classical decorative background motif */}
        <div className="absolute -right-8 -bottom-8 w-64 h-64 rounded-full border-8 border-white/5 pointer-events-none select-none flex items-center justify-center font-serif text-9xl text-white/10 font-black">
          诵
        </div>
      </div>

      {/* Top 4 Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#5C5855] mb-2">
            <span>连续坚持</span>
            <span className="text-lg">🔥</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-[#9E2A2B]">
            {streak} <span className="text-xs font-sans text-[#8C8884]">天</span>
          </div>
          <p className="text-[11px] text-[#8C8884] mt-1">保持每日连贯温习</p>
        </div>

        <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#5C5855] mb-2">
            <span>今日到期待复习</span>
            <span className="text-lg">📜</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-[#2B5C8F]">
            {dueCardsCount} <span className="text-xs font-sans text-[#8C8884]">句</span>
          </div>
          <p className="text-[11px] text-[#8C8884] mt-1">FSRS 遗忘曲线到期句</p>
        </div>

        <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#5C5855] mb-2">
            <span>熟读成诵率</span>
            <span className="text-lg">🌿</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-[#2C4F3D]">
            {masteryPercent}%
          </div>
          <p className="text-[11px] text-[#8C8884] mt-1">{matureCardsCount} 句已牢固熟记</p>
        </div>

        <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#5C5855] mb-2">
            <span>累计复习词句</span>
            <span className="text-lg">🏆</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-serif text-[#232120]">
            {totalReviews} <span className="text-xs font-sans text-[#8C8884]">次</span>
          </div>
          <p className="text-[11px] text-[#8C8884] mt-1">研墨累积诵读次数</p>
        </div>
      </div>

      {/* Recitation Heatmap */}
      <Heatmap records={dailyRecords} streak={streak} totalReviews={totalReviews} />

      {/* Recommended Core Articles for Snowball Recitation */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-serif font-bold text-[#232120] flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              高考必背长篇核心攻坚推荐（滚雪球首选）
            </h2>
            <p className="text-xs text-[#5C5855] mt-0.5">
              全国高考命题超高频文赋，建议使用滚雪球串联逐联突破
            </p>
          </div>
          <button
            onClick={() => {
              onNavigate("catalog");
            }}
            className="text-xs text-[#9E2A2B] hover:underline font-bold flex items-center gap-1"
          >
            查看全部 100 篇
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {recommendedArticles.map(article => (
            <div
              key={article.id}
              className="p-4 rounded-2xl border border-[#E3DEC3] bg-[#FAF7F0] hover:bg-white hover:border-[#9E2A2B]/40 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#8C8884] mb-1">
                  <span>〔{article.dynasty}〕{article.author}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                    高考72篇
                  </span>
                </div>
                <h3 className="text-base font-serif font-bold text-[#232120] mb-1.5">
                  《{article.title}》
                </h3>
                <p className="text-xs text-[#5C5855] line-clamp-2 leading-relaxed mb-3 font-serif">
                  {article.fullContent}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#F0EDE1]">
                <button
                  onClick={() => {
                    onOpenArticleInView(article.id, "snowball");
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-[#2B5C8F] hover:bg-[#1E3F63] text-white text-xs font-bold flex items-center justify-center gap-1 shadow-2xs transition-all"
                >
                  <Layers className="w-3.5 h-3.5" />
                  滚雪球背诵
                </button>
                <button
                  onClick={() => {
                    onOpenArticleInView(article.id, "cloze");
                  }}
                  className="py-1.5 px-2.5 rounded-lg bg-white border border-[#D5CFBD] hover:bg-[#F0EDE1] text-xs font-semibold text-[#232120] transition-all"
                >
                  渐进遮挡
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
