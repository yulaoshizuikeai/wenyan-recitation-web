import React, { useState, useMemo } from "react";
import { Article, ALL_ARTICLES } from "../data/curriculumData";
import {
  VOLUME_DECKS,
  SPECIAL_DECKS,
  VolumeDeck,
  computeDeckStats,
  DeckCardStats,
  getArticlesForDeck
} from "../data/ankiDecks";
import { CardFsrsState } from "../domain/fsrs/fsrsTypes";
import { SchedulerSettings, DailySchedulePlan } from "../domain/fsrs/ankiScheduler";
import { NavView } from "./Navbar";
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  Clock,
  Zap,
  Sparkles,
  Settings,
  Layers,
  Eye,
  CheckCircle,
  Play,
  RotateCcw,
  Sliders,
  X,
  Check,
  Flame,
  ArrowRight
} from "lucide-react";

interface AnkiDeckHubProps {
  cardStatesMap: Map<string, CardFsrsState>;
  schedulerSettings: SchedulerSettings;
  onUpdateSettings: (newSettings: SchedulerSettings) => void;
  dailyPlan: DailySchedulePlan;
  onStartStudyDeck: (deckId: string, articleId?: string) => void;
  onOpenArticleInView?: (articleId: string, view: NavView) => void;
}

export const AnkiDeckHub: React.FC<AnkiDeckHubProps> = ({
  cardStatesMap,
  schedulerSettings,
  onUpdateSettings,
  dailyPlan,
  onStartStudyDeck,
  onOpenArticleInView
}) => {
  // Expanded volume deck IDs
  const [expandedDecks, setExpandedDecks] = useState<Set<string>>(() => new Set(["VOL_BX1"]));
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState<SchedulerSettings>(schedulerSettings);

  const now = Date.now();

  const toggleDeckExpand = (deckId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDecks(prev => {
      const next = new Set(prev);
      if (next.has(deckId)) {
        next.delete(deckId);
      } else {
        next.add(deckId);
      }
      return next;
    });
  };

  const handleOpenSettings = () => {
    setTempSettings(schedulerSettings);
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = () => {
    onUpdateSettings(tempSettings);
    setIsSettingsOpen(false);
  };

  // Compute stats for all 6 volume decks
  const volumeStatsList = useMemo(() => {
    return VOLUME_DECKS.map(vol => {
      const arts = ALL_ARTICLES.filter(a => vol.moduleIds.includes(a.moduleId));
      return {
        volume: vol,
        articles: arts,
        stats: computeDeckStats(vol.id, vol.name, arts, cardStatesMap, now)
      };
    });
  }, [cardStatesMap, now]);

  // Compute stats for special decks
  const gaokaoStats = useMemo(() => {
    const arts = ALL_ARTICLES.filter(a => a.isGaoKao72);
    return computeDeckStats("DECK_GAOKAO72", "★ 高考必背 72 篇专项", arts, cardStatesMap, now);
  }, [cardStatesMap, now]);

  const allDeckStats = useMemo(() => {
    return computeDeckStats("DECK_ALL", "全套 11 册教材全部名篇", ALL_ARTICLES, cardStatesMap, now);
  }, [cardStatesMap, now]);

  // Filtered volumes based on top segment tabs
  const displayedVolumeStats = useMemo(() => {
    if (selectedFilter === "REQUIRED") {
      return volumeStatsList.filter(v => v.volume.category === "REQUIRED");
    }
    if (selectedFilter === "SELECTIVE") {
      return volumeStatsList.filter(v => v.volume.category === "SELECTIVE");
    }
    if (selectedFilter === "ELECTIVE") {
      return volumeStatsList.filter(v => v.volume.category === "ELECTIVE");
    }
    return volumeStatsList;
  }, [selectedFilter, volumeStatsList]);

  // Summary counts across all active volumes
  const grandTotal = useMemo(() => {
    let newSum = 0;
    let learnSum = 0;
    let dueSum = 0;
    let matureSum = 0;
    let totalSum = 0;

    for (const v of volumeStatsList) {
      newSum += v.stats.newCount;
      learnSum += v.stats.learningCount;
      dueSum += v.stats.dueCount;
      matureSum += v.stats.matureCount;
      totalSum += v.stats.totalCards;
    }

    return {
      newCount: newSum,
      learningCount: learnSum,
      dueCount: dueSum,
      matureCount: matureSum,
      totalCards: totalSum
    };
  }, [volumeStatsList]);

  return (
    <div className="space-y-4">
      {/* 1. Intelligent Daily Schedule Card (Anki Header) */}
      <div className="bg-gradient-to-br from-white via-zinc-50 to-zinc-100 dark:from-zinc-900 dark:via-zinc-900/90 dark:to-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>今日智能背诵排程</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-normal">
                FSRS-5 算法自动排定
              </span>
            </h2>
          </div>

          <button
            onClick={handleOpenSettings}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 transition-colors shadow-2xs"
          >
            <Sliders className="w-3.5 h-3.5 text-zinc-400" />
            <span>排程配额设置</span>
          </button>
        </div>

        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
          {dailyPlan.statusMessage}
        </p>

        {/* 3 Anki Counters + Action Button */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-3 text-center">
            <div className="text-[11px] text-zinc-400 mb-0.5 font-medium">待复习到期</div>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {dailyPlan.dueCards.length}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">遗忘优先</div>
          </div>

          <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-3 text-center">
            <div className="text-[11px] text-zinc-400 mb-0.5 font-medium">学习中重学</div>
            <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-400">
              {dailyPlan.learningCards.length}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">即时巩固</div>
          </div>

          <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-3 text-center">
            <div className="text-[11px] text-zinc-400 mb-0.5 font-medium">今日新学名句</div>
            <div className="text-2xl font-bold font-mono text-sky-600 dark:text-sky-400">
              {dailyPlan.newCards.length}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              限额 {schedulerSettings.dailyNewLimit > 0 ? `${schedulerSettings.dailyNewLimit}句/天` : "无限制"}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-3 text-center flex flex-col justify-center">
            <div className="text-[11px] text-zinc-400 mb-0.5 font-medium">预估背诵耗时</div>
            <div className="text-xl font-bold font-mono text-zinc-800 dark:text-zinc-200">
              ~{dailyPlan.estimatedMinutes} <span className="text-xs font-sans font-normal text-zinc-400">分钟</span>
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">科学防疲劳</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-zinc-200/70 dark:border-zinc-800/70">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>
              已为您自动调度：今日共需背诵 <strong>{dailyPlan.totalTargetCards}</strong> 句词句，无需费脑规划。
            </span>
          </div>

          <button
            onClick={() => onStartStudyDeck("DECK_ALL")}
            className="w-full sm:w-auto py-2 px-5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 hover:bg-zinc-800 dark:hover:bg-white active:scale-[0.98] transition-all shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>开始今日背诵 ({dailyPlan.totalTargetCards} 句)</span>
          </button>
        </div>
      </div>

      {/* 2. Volume & Curricular Filter Chips */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-900/80 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
          {[
            { id: "ALL", label: "全部分册 (6册)" },
            { id: "REQUIRED", label: "必修分册 (2册)" },
            { id: "SELECTIVE", label: "选择性必修 (3册)" },
            { id: "ELECTIVE", label: "选修拓展 (1册)" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedFilter(tab.id)}
              className={`px-3 py-1 rounded-lg transition-colors font-medium ${
                selectedFilter === tab.id
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => onStartStudyDeck("DECK_GAOKAO72")}
          className="px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200 font-medium flex items-center gap-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span>高考必背 72 篇专项牌组</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-amber-200/60 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-bold">
            {gaokaoStats.totalCards} 句
          </span>
        </button>
      </div>

      {/* 3. Classic Anki Deck Tree Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        {/* Table Header */}
        <div className="grid grid-cols-12 items-center px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-400">
          <div className="col-span-6 sm:col-span-7 flex items-center gap-1.5">
            <span>选册与名篇牌组</span>
            <span className="text-[10px] text-zinc-400">(点击展开篇目)</span>
          </div>
          <div className="col-span-2 sm:col-span-1 text-center font-mono text-sky-600 dark:text-sky-400">
            新卡
          </div>
          <div className="col-span-2 sm:col-span-1 text-center font-mono text-red-600 dark:text-red-400">
            学习
          </div>
          <div className="col-span-2 sm:col-span-1 text-center font-mono text-emerald-600 dark:text-emerald-400">
            复习
          </div>
          <div className="hidden sm:block sm:col-span-2 text-right pr-2">
            操作
          </div>
        </div>

        {/* Volume Rows */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {displayedVolumeStats.map(({ volume, articles, stats }) => {
            const isExpanded = expandedDecks.has(volume.id);
            const maturePercent = stats.totalCards > 0 ? Math.round((stats.matureCount / stats.totalCards) * 100) : 0;

            return (
              <div key={volume.id} className="group transition-colors">
                {/* Volume Level Row */}
                <div
                  onClick={() => onStartStudyDeck(volume.id)}
                  className="grid grid-cols-12 items-center px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer select-none transition-colors"
                >
                  {/* Deck Title + Chevron */}
                  <div className="col-span-6 sm:col-span-7 flex items-center gap-2 pr-2">
                    <button
                      onClick={(e) => toggleDeckExpand(volume.id, e)}
                      className="p-1 -ml-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition-colors"
                      title={isExpanded ? "折叠篇目" : "展开篇目"}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                          {volume.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">
                          {articles.length} 篇
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono hidden md:inline">
                          熟记 {maturePercent}%
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate hidden sm:block">
                        {volume.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Anki Triple Numbers: New (Blue), Learn (Red), Due (Green) */}
                  <div className="col-span-2 sm:col-span-1 text-center font-mono text-xs sm:text-sm font-semibold">
                    <span className={stats.newCount > 0 ? "text-sky-600 dark:text-sky-400" : "text-zinc-300 dark:text-zinc-600 font-normal"}>
                      {stats.newCount}
                    </span>
                  </div>

                  <div className="col-span-2 sm:col-span-1 text-center font-mono text-xs sm:text-sm font-semibold">
                    <span className={stats.learningCount > 0 ? "text-red-600 dark:text-red-400" : "text-zinc-300 dark:text-zinc-600 font-normal"}>
                      {stats.learningCount}
                    </span>
                  </div>

                  <div className="col-span-2 sm:col-span-1 text-center font-mono text-xs sm:text-sm font-semibold">
                    <span className={stats.dueCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-300 dark:text-zinc-600 font-normal"}>
                      {stats.dueCount}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="hidden sm:flex sm:col-span-2 items-center justify-end gap-1.5 pr-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartStudyDeck(volume.id);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium hover:bg-zinc-800 dark:hover:bg-white transition-colors flex items-center gap-1 shadow-2xs"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>背诵本册</span>
                    </button>
                  </div>
                </div>

                {/* Nested Articles Sub-List */}
                {isExpanded && (
                  <div className="bg-zinc-50/60 dark:bg-zinc-950/40 border-t border-zinc-100 dark:border-zinc-800/60 divide-y divide-zinc-100/80 dark:divide-zinc-800/40">
                    {articles.map((art) => {
                      const artStats = computeDeckStats(art.id, art.title, [art], cardStatesMap, now);
                      return (
                        <div
                          key={art.id}
                          onClick={() => onStartStudyDeck(volume.id, art.id)}
                          className="grid grid-cols-12 items-center px-4 py-2 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 cursor-pointer text-xs transition-colors"
                        >
                          {/* Article Title & Author */}
                          <div className="col-span-6 sm:col-span-7 flex items-center gap-2 pl-6">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                            <span className="font-classical font-medium text-zinc-900 dark:text-zinc-200">
                              《{art.title}》
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              {art.author}
                            </span>
                            {art.isGaoKao72 && (
                              <span className="text-[9px] font-mono px-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-semibold">
                                高考
                              </span>
                            )}
                          </div>

                          {/* Sub-deck numbers */}
                          <div className="col-span-2 sm:col-span-1 text-center font-mono text-xs">
                            <span className={artStats.newCount > 0 ? "text-sky-600 dark:text-sky-400 font-medium" : "text-zinc-300 dark:text-zinc-600"}>
                              {artStats.newCount}
                            </span>
                          </div>

                          <div className="col-span-2 sm:col-span-1 text-center font-mono text-xs">
                            <span className={artStats.learningCount > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-zinc-300 dark:text-zinc-600"}>
                              {artStats.learningCount}
                            </span>
                          </div>

                          <div className="col-span-2 sm:col-span-1 text-center font-mono text-xs">
                            <span className={artStats.dueCount > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-zinc-300 dark:text-zinc-600"}>
                              {artStats.dueCount}
                            </span>
                          </div>

                          {/* Sub-deck Actions */}
                          <div className="hidden sm:flex sm:col-span-2 items-center justify-end gap-1 text-[11px]">
                            {onOpenArticleInView && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenArticleInView(art.id, "snowball");
                                  }}
                                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60"
                                  title="长卷滚雪球背诵"
                                >
                                  <Layers className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenArticleInView(art.id, "cloze");
                                  }}
                                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60"
                                  title="渐进遮挡背诵"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartStudyDeck(volume.id, art.id);
                              }}
                              className="px-2 py-0.5 rounded text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium"
                            >
                              背诵
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Anki Table Bottom Summary */}
        <div className="grid grid-cols-12 items-center px-4 py-3 bg-zinc-50 dark:bg-zinc-800/80 border-t border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          <div className="col-span-6 sm:col-span-7 flex items-center gap-2">
            <span>总计待学卡片</span>
            <span className="text-[11px] font-normal text-zinc-400 font-mono">
              (总收录 {grandTotal.totalCards} 句词句 · 牢固掌握 {grandTotal.matureCount} 句)
            </span>
          </div>
          <div className="col-span-2 sm:col-span-1 text-center font-mono text-sky-600 dark:text-sky-400">
            {grandTotal.newCount}
          </div>
          <div className="col-span-2 sm:col-span-1 text-center font-mono text-red-600 dark:text-red-400">
            {grandTotal.learningCount}
          </div>
          <div className="col-span-2 sm:col-span-1 text-center font-mono text-emerald-600 dark:text-emerald-400">
            {grandTotal.dueCount}
          </div>
          <div className="hidden sm:block sm:col-span-2 text-right pr-2">
            <span className="text-zinc-400 font-normal">FSRS-5 调度</span>
          </div>
        </div>
      </div>

      {/* 4. Quick Scheduler Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-zinc-500" />
                <span>Anki 智能排程配额设置</span>
              </h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Daily New Limit */}
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1.5">
                  每日新学名句上限 (New cards/day)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 15, 20, 30].map(val => (
                    <button
                      key={val}
                      onClick={() => setTempSettings(s => ({ ...s, dailyNewLimit: val }))}
                      className={`py-1.5 rounded-lg border text-center font-mono font-medium transition-colors ${
                        tempSettings.dailyNewLimit === val
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {val} 句 {val === 20 && "(推荐)"}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  定量新学，可防止第 3~7 天复习洪峰积压造成记忆崩溃。
                </p>
              </div>

              {/* Daily Review Limit */}
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1.5">
                  每日最大复习上限 (Max reviews/day)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[50, 100, 0].map(val => (
                    <button
                      key={val}
                      onClick={() => setTempSettings(s => ({ ...s, dailyReviewLimit: val }))}
                      className={`py-1.5 rounded-lg border text-center font-mono font-medium transition-colors ${
                        tempSettings.dailyReviewLimit === val
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {val === 0 ? "全部到期" : `${val} 句`} {val === 100 && "(推荐)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order */}
              <div>
                <label className="block text-zinc-700 dark:text-zinc-300 font-medium mb-1.5">
                  新卡提取顺序 (Card Order)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "sequential", label: "按教材循序渐进 (推荐)" },
                    { id: "random", label: "乱序随机混合抽背" }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setTempSettings(s => ({ ...s, cardOrder: opt.id as any }))}
                      className={`py-1.5 rounded-lg border text-center text-xs font-medium transition-colors ${
                        tempSettings.cardOrder === opt.id
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                          : "border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Session Loop */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div>
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">
                    错题当场循环 (Anki Learning Steps)
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    评为“重来”时，卡片自动插回本次背诵队尾反复巩固
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tempSettings.enableSessionLoop}
                  onChange={(e) => setTempSettings(s => ({ ...s, enableSessionLoop: e.target.checked }))}
                  className="w-4 h-4 rounded text-zinc-900 accent-zinc-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-5 py-2 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-white transition-colors"
              >
                保存排程配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
