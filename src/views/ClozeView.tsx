import React, { useState, useMemo } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { ClozeEngine, ClozeToken } from "../domain/cloze/clozeEngine";
import { sound } from "../sound/audioSynthesizer";
import { filterArticlesByScope, DYNASTY_GROUPS, DynastyEra } from "../data/articleTaxonomy";
import { Eye, EyeOff, Search, X, RotateCcw, Type } from "lucide-react";

interface ClozeViewProps {
  initialArticleId?: string;
  selectedScope: string;
}

export const ClozeView: React.FC<ClozeViewProps> = ({ initialArticleId, selectedScope }) => {
  const filteredArticles = useMemo(() => {
    return filterArticlesByScope(ALL_ARTICLES, selectedScope);
  }, [selectedScope]);

  const [selectedArticleId, setSelectedArticleId] = useState<string>(() => {
    return initialArticleId || filteredArticles[0]?.id || "art_bx1_12"; // 劝学
  });

  const [level, setLevel] = useState<number>(1);
  const [fontSizeIndex, setFontSizeIndex] = useState<number>(1); // 0: 16px, 1: 18px, 2: 20px, 3: 22px
  const [revealAll, setRevealAll] = useState<boolean>(false);
  const [revealedTokenIds, setRevealedTokenIds] = useState<Set<number>>(new Set());
  const [showArticlePicker, setShowArticlePicker] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedDynastyFilter, setSelectedDynastyFilter] = useState<DynastyEra>("ALL");

  const fontSizes = [
    { label: "小", className: "text-base sm:text-lg leading-relaxed" },
    { label: "标准", className: "text-lg sm:text-xl leading-loose" },
    { label: "大", className: "text-xl sm:text-2xl leading-loose" },
    { label: "特大", className: "text-2xl sm:text-3xl leading-loose" }
  ];

  const currentArticle: Article = useMemo(() => {
    return ALL_ARTICLES.find(a => a.id === selectedArticleId) || ALL_ARTICLES[0];
  }, [selectedArticleId]);

  // Extract cloze keywords from annotations
  const clozeKeywords = useMemo(() => {
    const kws = currentArticle.annotations
      .map(a => a.split(/[：（\s]/)[0])
      .filter(k => k.length >= 2 && k.length <= 6);
    return kws.length > 0 ? kws : ["天下", "君子", "故", "以", "夫", "何"];
  }, [currentArticle]);

  // Tokenize text into paragraphs
  const paragraphs = useMemo(() => {
    const text = currentArticle.fullContent;
    const tokens = ClozeEngine.tokenize(text, level, clozeKeywords);

    const list: ClozeToken[][] = [];
    let currentPara: ClozeToken[] = [];
    let subTokenId = 100000;

    for (const token of tokens) {
      if (token.originalText.includes("\n")) {
        const parts = token.originalText.split("\n");
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].length > 0) {
            const assignedId = i === 0 ? token.id : subTokenId++;
            currentPara.push({
              id: assignedId,
              originalText: parts[i],
              isMasked: token.isMasked
            });
          }
          if (i < parts.length - 1) {
            if (currentPara.length > 0) list.push(currentPara);
            currentPara = [];
          }
        }
      } else {
        currentPara.push(token);
      }
    }
    if (currentPara.length > 0) {
      list.push(currentPara);
    }
    return list;
  }, [currentArticle, level, clozeKeywords]);

  const levelsConfig = [
    { lvl: 0, name: "L0 原文", desc: "通读全览" },
    { lvl: 1, name: "L1 关键词", desc: "高频考点挖空" },
    { lvl: 2, name: "L2 半句", desc: "出句提示对句遮挡" },
    { lvl: 3, name: "L3 首字", desc: "保留首字与标点骨架" },
    { lvl: 4, name: "L4 全盲", desc: "全篇下划线盲测" }
  ];

  const handleToggleToken = (tokenId: number) => {
    sound.playReveal();
    const next = new Set(revealedTokenIds);
    if (next.has(tokenId)) {
      next.delete(tokenId);
    } else {
      next.add(tokenId);
    }
    setRevealedTokenIds(next);
  };

  const handleLevelChange = (lvl: number) => {
    setLevel(lvl);
    setRevealedTokenIds(new Set());
    setRevealAll(false);
  };

  const searchedArticles = useMemo(() => {
    let list = filteredArticles;
    if (selectedDynastyFilter !== "ALL") {
      const group = DYNASTY_GROUPS.find(g => g.id === selectedDynastyFilter);
      if (group && group.subDynasties.length > 0) {
        list = list.filter(a => group.subDynasties.includes(a.dynasty));
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        a => a.title.toLowerCase().includes(q) || a.author.toLowerCase().includes(q)
      );
    }
    return list;
  }, [filteredArticles, selectedDynastyFilter, searchQuery]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-24">
      {/* Header Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 mb-5 shadow-xs transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                {currentArticle.dynasty} · {currentArticle.author} · {currentArticle.genre}
              </span>
              {currentArticle.isGaoKao72 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium border border-zinc-200 dark:border-zinc-700">
                  高考72篇
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-classical font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              《{currentArticle.title}》
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Font Size Adjuster */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60">
              <button
                onClick={() => setFontSizeIndex(Math.max(0, fontSizeIndex - 1))}
                disabled={fontSizeIndex === 0}
                className="px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 disabled:opacity-40 hover:bg-white dark:hover:bg-zinc-700 rounded transition-colors"
                title="缩小字号"
              >
                A-
              </button>
              <span className="text-[10px] px-1 font-mono text-zinc-400 dark:text-zinc-500">
                {fontSizes[fontSizeIndex].label}
              </span>
              <button
                onClick={() => setFontSizeIndex(Math.min(fontSizes.length - 1, fontSizeIndex + 1))}
                disabled={fontSizeIndex === fontSizes.length - 1}
                className="px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 disabled:opacity-40 hover:bg-white dark:hover:bg-zinc-700 rounded transition-colors"
                title="放大字号"
              >
                A+
              </button>
            </div>

            <button
              onClick={() => setRevealAll(!revealAll)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                revealAll
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900"
                  : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {revealAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{revealAll ? "恢复遮挡" : "全览"}</span>
            </button>

            <button
              onClick={() => setShowArticlePicker(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-zinc-500" />
              <span>换篇目</span>
            </button>
          </div>
        </div>

        {/* 5 Levels Modern Segmented Bar */}
        <div className="grid grid-cols-5 gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl mt-4 text-xs font-medium">
          {levelsConfig.map(cfg => (
            <button
              key={cfg.lvl}
              onClick={() => handleLevelChange(cfg.lvl)}
              className={`py-1.5 px-1 rounded-lg text-center transition-colors ${
                level === cfg.lvl
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <div className="leading-tight truncate">{cfg.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Recitation Reading Canvas */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-10 shadow-xs space-y-5 transition-colors">
        <div className="text-center pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
          <h2 className="text-xl font-classical font-semibold text-zinc-900 dark:text-zinc-100">
            《{currentArticle.title}》
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            〔{currentArticle.dynasty}〕{currentArticle.author}
          </p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
            轻触虚线下划线框即可刮开核对，再次轻触可重新遮挡
          </p>
        </div>

        <div className="space-y-5">
          {paragraphs.map((paraTokens, pIdx) => (
            <p
              key={pIdx}
              className={`font-classical indent-8 text-zinc-900 dark:text-zinc-100 tracking-wide ${fontSizes[fontSizeIndex].className}`}
            >
              {paraTokens.map(token => {
                const isEffectiveMasked = token.isMasked && !revealAll && !revealedTokenIds.has(token.id);

                if (!token.isMasked) {
                  return <span key={token.id}>{token.originalText}</span>;
                }

                if (isEffectiveMasked) {
                  return (
                    <button
                      key={token.id}
                      onClick={() => handleToggleToken(token.id)}
                      className="inline-block mx-0.5 px-1 py-0 rounded border-b border-dashed border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-transparent select-none cursor-pointer transition-colors"
                      title="点击刮开查看正解"
                    >
                      {token.originalText}
                    </button>
                  );
                }

                return (
                  <button
                    key={token.id}
                    onClick={() => handleToggleToken(token.id)}
                    className="inline-block mx-0.5 px-1 py-0 rounded bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 font-semibold border-b border-zinc-300 dark:border-zinc-700 cursor-pointer transition-colors"
                    title="点击重新遮挡"
                  >
                    {token.originalText}
                  </button>
                );
              })}
            </p>
          ))}
        </div>
      </div>

      {/* Article Switcher Drawer / Modal */}
      {showArticlePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">选择遮挡背诵篇目</h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">按朝代或关键字快速定位</p>
              </div>
              <button
                onClick={() => setShowArticlePicker(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索篇目名或作者..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400"
                />
              </div>
            </div>

            {/* Dynasty Chips */}
            <div className="px-5 py-2 flex items-center gap-1 overflow-x-auto border-b border-zinc-100 dark:border-zinc-800/50 text-[11px]">
              {DYNASTY_GROUPS.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDynastyFilter(d.id)}
                  className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
                    selectedDynastyFilter === d.id
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {searchedArticles.map(article => (
                <button
                  key={article.id}
                  onClick={() => {
                    setSelectedArticleId(article.id);
                    setShowArticlePicker(false);
                    setRevealedTokenIds(new Set());
                    setRevealAll(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl border transition-colors flex items-center justify-between ${
                    selectedArticleId === article.id
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                      : "bg-white dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold font-classical">《{article.title}》</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        selectedArticleId === article.id
                          ? "text-zinc-300 dark:text-zinc-600"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {article.dynasty} · {article.author} · {article.genre}
                    </div>
                  </div>
                  {article.isGaoKao72 && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                        selectedArticleId === article.id
                          ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
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
