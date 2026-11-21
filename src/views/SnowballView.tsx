import React, { useState, useEffect, useMemo, useRef } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { SnowballChainingEngine, SnowballStage } from "../domain/cloze/snowballEngine";
import { sound } from "../sound/audioSynthesizer";
import { fireConfetti } from "../components/Confetti";
import { FSRSEngine } from "../domain/fsrs/fsrsEngine";
import { Rating } from "../domain/fsrs/fsrsTypes";
import { getCardState, saveCardStatesBatch, recordReviewLog, getBottlenecks, saveBottlenecks } from "../storage/db";
import { Link2, Eye, EyeOff, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft, RotateCcw, Trophy, Search } from "lucide-react";

interface SnowballViewProps {
  initialArticleId?: string;
  selectedScope: string;
}

export const SnowballView: React.FC<SnowballViewProps> = ({ initialArticleId, selectedScope }) => {
  // Filtered articles list based on scope
  const filteredArticles = useMemo(() => {
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

  const [selectedArticleId, setSelectedArticleId] = useState<string>(() => {
    if (initialArticleId) return initialArticleId;
    return "art_bx1_12"; // 劝学
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [showArticlePicker, setShowArticlePicker] = useState(false);

  const currentArticle: Article = useMemo(() => {
    return ALL_ARTICLES.find(a => a.id === selectedArticleId) || ALL_ARTICLES[0];
  }, [selectedArticleId]);

  const stages: SnowballStage[] = useMemo(() => {
    return SnowballChainingEngine.buildStages(currentArticle);
  }, [currentArticle]);

  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [maskHistory, setMaskHistory] = useState(true);
  const [bottleneckIndices, setBottleneckIndices] = useState<Set<number>>(new Set());
  const [revealedUnitIndices, setRevealedUnitIndices] = useState<Set<number>>(new Set());
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementStats, setSettlementStats] = useState<{
    totalUnits: number;
    smoothCount: number;
    bottleneckCount: number;
    avgNextInterval: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load existing bottlenecks for article
  useEffect(() => {
    getBottlenecks(currentArticle.id).then(indices => {
      setBottleneckIndices(new Set(indices));
    });
    setCurrentStageIndex(0);
    setRevealedUnitIndices(new Set());
  }, [currentArticle.id]);

  // Scroll to top on stage change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStageIndex]);

  const currentStage = stages[currentStageIndex];
  const isCompleted = currentStageIndex >= stages.length - 1;

  const toggleBottleneck = (index: number) => {
    sound.playClick();
    const next = new Set(bottleneckIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setBottleneckIndices(next);
    saveBottlenecks(currentArticle.id, Array.from(next));
  };

  const handleNextStage = async () => {
    if (isCompleted) {
      // Execute FSRS batch credit settlement
      sound.playCelebration();
      fireConfetti();

      const fsrs = new FSRSEngine();
      const updatedCards = [];
      let totalNextDays = 0;
      let ratedCardsCount = 0;

      for (const stg of stages) {
        const rating = bottleneckIndices.has(stg.stageIndex) ? Rating.HARD : Rating.GOOD;
        for (const cid of stg.newlyAddedUnit.cardIds) {
          const card = (await getCardState(cid)) || fsrs.createInitialCard(cid);
          const result = fsrs.evaluateReview(card, rating);
          updatedCards.push(result.updatedCard);
          await recordReviewLog(result.reviewLog);
          totalNextDays += result.nextIntervalDays;
          ratedCardsCount++;
        }
      }

      if (updatedCards.length > 0) {
        await saveCardStatesBatch(updatedCards);
      }

      setSettlementStats({
        totalUnits: stages.length,
        smoothCount: stages.length - bottleneckIndices.size,
        bottleneckCount: bottleneckIndices.size,
        avgNextInterval: ratedCardsCount > 0 ? totalNextDays / ratedCardsCount : 3.0
      });

      setShowSettlementModal(true);
    } else {
      sound.playCorrect();
      setCurrentStageIndex(prev => prev + 1);
    }
  };

  const handlePrevStage = () => {
    sound.playClick();
    if (currentStageIndex > 0) {
      setCurrentStageIndex(prev => prev - 1);
    }
  };

  const toggleRevealUnit = (index: number) => {
    sound.playReveal();
    const next = new Set(revealedUnitIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setRevealedUnitIndices(next);
  };

  const searchedArticles = useMemo(() => {
    if (!searchQuery.trim()) return filteredArticles;
    const q = searchQuery.toLowerCase();
    return filteredArticles.filter(
      a => a.title.toLowerCase().includes(q) || a.author.toLowerCase().includes(q)
    );
  }, [filteredArticles, searchQuery]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6" ref={scrollRef}>
      {/* Article Header & Selector */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-2xl p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#9E2A2B]/10 text-[#9E2A2B] text-xs font-bold border border-[#9E2A2B]/20">
                长卷滚雪球串联背诵
              </span>
              <span className="text-xs text-[#8C8884]">
                {currentArticle.dynasty} · {currentArticle.author} · {currentArticle.genre}
              </span>
            </div>
            <h1 className="text-2xl font-bold font-serif text-[#232120] mt-1 flex flex-wrap items-center gap-2">
              《{currentArticle.title}》
              {currentArticle.isGaoKao72 && (
                <span className="text-xs font-sans font-normal px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  高考 72 篇
                </span>
              )}
              {currentArticle.recitationScope && currentArticle.recitationScope !== "FULL_TEXT" && (
                <span className="text-xs font-sans font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-[#2B5C8F] border border-blue-300">
                  必背范围：{currentArticle.recitationScope}
                </span>
              )}
            </h1>
          </div>

          <button
            onClick={() => {
              sound.playClick();
              setShowArticlePicker(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D5CFBD] bg-[#FAF7F0] hover:bg-[#F0EDE1] text-xs font-bold text-[#232120] transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-[#9E2A2B]" />
            换一篇背诵 ({filteredArticles.length} 篇可选)
          </button>
        </div>

        {/* Progress Bar & Stage Indicator */}
        {currentStage && (
          <div className="mt-5 pt-4 border-t border-[#F0EDE1]">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-[#5C5855] flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-[#2B5C8F]" />
                串联第 {currentStageIndex + 1} 联 / 共 {stages.length} 联
              </span>
              <span className="font-bold text-[#2B5C8F] text-sm">
                {Math.round(((currentStageIndex + 1) / stages.length) * 100)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-[#EAE5D4] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#2B5C8F] to-[#2C4F3D] transition-all duration-300"
                style={{ width: `${((currentStageIndex + 1) / stages.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Chaining Workspace */}
      {currentStage ? (
        <div className="space-y-5">
          {/* Rule Explanatory Banner */}
          <div className="bg-[#FAF7F0] border border-[#E3DEC3] rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-[#5C5855]">
            <div className="flex items-center gap-2">
              <span className="text-base">❄️</span>
              <span>
                <strong>滚雪球串联法则：</strong>先温习前文盲诵，再连贯攻坚最新句联！全部背通后将一键智能结算至 FSRS 记忆库。
              </span>
            </div>
            <button
              onClick={() => {
                sound.playClick();
                setMaskHistory(!maskHistory);
              }}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                maskHistory
                  ? "bg-[#9E2A2B]/10 border-[#9E2A2B]/30 text-[#9E2A2B]"
                  : "bg-white border-[#D5CFBD] text-[#232120]"
              }`}
            >
              {maskHistory ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {maskHistory ? "前文盲背中" : "前文全览"}
            </button>
          </div>

          {/* Current Spotlight Card */}
          <div
            className={`border-2 rounded-2xl p-5 shadow-sm transition-all ${
              bottleneckIndices.has(currentStageIndex)
                ? "bg-red-50/70 border-[#9E2A2B]"
                : "bg-blue-50/60 border-[#2B5C8F]"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className={`text-xs font-bold flex items-center gap-1.5 ${
                  bottleneckIndices.has(currentStageIndex) ? "text-[#9E2A2B]" : "text-[#2B5C8F]"
                }`}
              >
                ★ 本阶段攻坚目标（第 {currentStageIndex + 1} 联）
              </span>
              <button
                onClick={() => toggleBottleneck(currentStageIndex)}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg border text-xs font-bold transition-all ${
                  bottleneckIndices.has(currentStageIndex)
                    ? "bg-[#9E2A2B] text-white border-[#7A1E1F]"
                    : "bg-white border-[#D5CFBD] text-[#5C5855] hover:border-[#9E2A2B]"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {bottleneckIndices.has(currentStageIndex) ? "已记为转折卡壳" : "此处起承转合卡壳？"}
              </button>
            </div>
            <p className="text-xl md:text-2xl font-serif font-bold text-[#232120] leading-relaxed tracking-wide">
              {currentStage.newlyAddedUnit.text}
            </p>
          </div>

          {/* Chained Accumulation List */}
          <div className="bg-white/80 backdrop-blur border border-[#E3DEC3] rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-[#232120] mb-3 flex items-center justify-between">
              <span>滚雪球累加文本（共 {currentStage.chainUnits.length} 联连诵）</span>
              <span className="text-xs font-normal text-[#8C8884]">
                {maskHistory ? "点击盲文块可单句显露对照" : "全文显现中"}
              </span>
            </h3>

            <div className="space-y-3">
              {currentStage.chainUnits.map((unit, idx) => {
                const isNewest = idx === currentStage.chainUnits.length - 1;
                const isUnitBottleneck = bottleneckIndices.has(idx);
                const isMasked = maskHistory && !isNewest && !revealedUnitIndices.has(idx);

                // Convert text to masked blocks
                const displayText = isMasked
                  ? unit.text.replace(/[\u4e00-\u9fa5]/g, "■")
                  : unit.text;

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (isMasked || revealedUnitIndices.has(idx)) {
                        toggleRevealUnit(idx);
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isNewest
                        ? "bg-blue-50/40 border-[#2B5C8F]/50 ring-1 ring-[#2B5C8F]/20"
                        : isUnitBottleneck
                        ? "bg-red-50/30 border-[#9E2A2B]/40"
                        : "bg-[#FAF7F0] border-[#E3DEC3]"
                    } ${isMasked ? "cursor-pointer hover:border-[#9E2A2B]/60" : ""}`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                          isNewest
                            ? "bg-[#2B5C8F] text-white"
                            : isUnitBottleneck
                            ? "bg-[#9E2A2B] text-white"
                            : "bg-[#EAE5D4] text-[#5C5855]"
                        }`}
                      >
                        {isNewest ? "★ 本次新加" : `第 ${idx + 1} 联`}
                        {isUnitBottleneck && " · 易卡壳"}
                      </span>
                      {isMasked && (
                        <span className="text-[11px] text-[#9E2A2B] font-semibold">
                          （盲背中 · 点击刮开对照）
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-lg font-serif leading-relaxed ${
                        isMasked
                          ? "text-[#8C8884] tracking-widest select-none"
                          : isNewest
                          ? "font-bold text-[#232120]"
                          : "text-[#3D3A39]"
                      }`}
                    >
                      {displayText}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Action Controls */}
          <div className="flex items-center gap-3 pt-2">
            {currentStageIndex > 0 && (
              <button
                onClick={handlePrevStage}
                className="flex-1 py-3 px-4 rounded-xl border border-[#D5CFBD] bg-white hover:bg-[#FAF7F0] text-sm font-bold text-[#232120] flex items-center justify-center gap-1.5 transition-all shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                返回上一步
              </button>
            )}

            <button
              onClick={handleNextStage}
              className={`flex-[1.5] py-3.5 px-6 rounded-xl text-white text-base font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] ${
                isCompleted
                  ? "bg-gradient-to-r from-[#2C4F3D] to-[#1E432F] hover:from-[#1E432F] hover:to-[#132E1F]"
                  : "bg-gradient-to-r from-[#2B5C8F] to-[#1E3F63] hover:from-[#1E3F63] hover:to-[#122A42]"
              }`}
            >
              {isCompleted ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-amber-300" />
                  通篇贯通 · 智能同步 FSRS
                </>
              ) : (
                <>
                  <span>背熟了 · 滚雪球下一段</span>
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-white border border-[#E3DEC3] rounded-2xl">
          <p className="text-[#8C8884]">暂无长文篇章数据</p>
        </div>
      )}

      {/* Completion & FSRS Settlement Modal */}
      {showSettlementModal && settlementStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-[#F7F4EB] border-2 border-[#D4AF37] rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Trophy className="w-8 h-8" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold font-serif text-center text-[#232120]">
              《{currentArticle.title}》通篇串联结业！
            </h2>
            <p className="text-xs text-center text-[#5C5855] mt-1 mb-6">
              恭喜你完成了全篇滚雪球串联背诵！系统已自动对全篇卡片完成 FSRS 间隔重复计算与信用分配。
            </p>

            <div className="bg-white rounded-2xl p-4 border border-[#E3DEC3] space-y-3 mb-6 text-xs sm:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-[#5C5855]">串联总联数</span>
                <span className="font-bold text-[#232120]">{settlementStats.totalUnits} 联全篇贯通</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#5C5855]">顺畅连诵率</span>
                <span className="font-bold text-[#2C4F3D] text-base">
                  {Math.round((settlementStats.smoothCount / settlementStats.totalUnits) * 100)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#5C5855]">顺畅 vs 突破</span>
                <span className="font-medium text-[#232120]">
                  {settlementStats.smoothCount} 联顺畅 · {settlementStats.bottleneckCount} 联卡壳
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#F0EDE1]">
                <span className="text-[#5C5855]">预计下次串联复习</span>
                <span className="font-bold text-[#2B5C8F] text-base">
                  约 {settlementStats.avgNextInterval.toFixed(1)} 天后
                </span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-[#8C8884] mb-6">
              <div>✓ 记忆库稳定性（Stability）已自动跃升</div>
              <div>✓ 今日学习进度与研墨打卡足迹已实时记录</div>
              <div>✓ 锁定了文言转折起承转合弱项标记</div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  sound.playClick();
                  setCurrentStageIndex(0);
                  setShowSettlementModal(false);
                }}
                className="flex-1 py-3 rounded-xl border border-[#D5CFBD] bg-white hover:bg-[#FAF7F0] text-xs sm:text-sm font-bold text-[#232120] flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                再巩固一遍
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  setShowSettlementModal(false);
                }}
                className="flex-[1.5] py-3 rounded-xl bg-[#9E2A2B] hover:bg-[#7A1E1F] text-white text-xs sm:text-sm font-bold shadow-md"
              >
                完成结业
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Article Switcher Drawer / Modal */}
      {showArticlePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-[#F7F4EB] border border-[#E3DEC3] rounded-3xl p-6 max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif font-bold text-lg text-[#232120]">选择背诵篇目</h3>
              <button
                onClick={() => setShowArticlePicker(false)}
                className="text-[#8C8884] hover:text-[#232120] text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <input
              type="text"
              placeholder="搜索篇目名或作者（如：劝学、赤壁赋、苏轼）"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#D5CFBD] bg-white text-sm text-[#232120] mb-4 focus:outline-none focus:border-[#9E2A2B]"
            />

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {searchedArticles.map(article => (
                <button
                  key={article.id}
                  onClick={() => {
                    sound.playClick();
                    setSelectedArticleId(article.id);
                    setShowArticlePicker(false);
                    setSearchQuery("");
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                    selectedArticleId === article.id
                      ? "bg-[#9E2A2B]/10 border-[#9E2A2B] text-[#9E2A2B] font-bold"
                      : "bg-white border-[#E3DEC3] hover:border-[#9E2A2B]/40 text-[#232120]"
                  }`}
                >
                  <div>
                    <div className="text-sm font-serif font-bold">《{article.title}》</div>
                    <div className="text-xs text-[#8C8884] mt-0.5">
                      {article.dynasty} · {article.author} · {article.genre}
                    </div>
                  </div>
                  {article.isGaoKao72 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                      高考72篇
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
