import React, { useState, useMemo } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { ClozeEngine, ClozeToken } from "../domain/cloze/clozeEngine";
import { sound } from "../sound/audioSynthesizer";
import { Eye, EyeOff, Search, Layers, RotateCcw } from "lucide-react";

interface ClozeViewProps {
  initialArticleId?: string;
  selectedScope: string;
}

export const ClozeView: React.FC<ClozeViewProps> = ({ initialArticleId, selectedScope }) => {
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
    return initialArticleId || "art_bx1_12"; // 劝学
  });

  const [level, setLevel] = useState<number>(1);
  const [revealAll, setRevealAll] = useState<boolean>(false);
  const [revealedTokenIds, setRevealedTokenIds] = useState<Set<number>>(new Set());
  const [showArticlePicker, setShowArticlePicker] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

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
    sound.playClick();
    setLevel(lvl);
    setRevealedTokenIds(new Set());
    setRevealAll(false);
  };

  const searchedArticles = useMemo(() => {
    if (!searchQuery.trim()) return filteredArticles;
    const q = searchQuery.toLowerCase();
    return filteredArticles.filter(
      a => a.title.toLowerCase().includes(q) || a.author.toLowerCase().includes(q)
    );
  }, [filteredArticles, searchQuery]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-2xl p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#2C4F3D]/10 text-[#2C4F3D] text-xs font-bold border border-[#2C4F3D]/20">
                5 级渐进遮挡背诵
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
                <span className="text-xs font-sans font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#2C4F3D] border border-emerald-300">
                  必背范围：{currentArticle.recitationScope}
                </span>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                sound.playClick();
                setRevealAll(!revealAll);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                revealAll
                  ? "bg-[#9E2A2B] text-white border-[#7A1E1F]"
                  : "bg-white border-[#D5CFBD] text-[#232120] hover:bg-[#FAF7F0]"
              }`}
            >
              {revealAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {revealAll ? "恢复遮挡" : "一键全览对照"}
            </button>

            <button
              onClick={() => {
                sound.playClick();
                setShowArticlePicker(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#D5CFBD] bg-[#FAF7F0] hover:bg-[#F0EDE1] text-xs font-bold text-[#232120]"
            >
              <Search className="w-3.5 h-3.5 text-[#9E2A2B]" />
              换篇目
            </button>
          </div>
        </div>

        {/* 5 Levels Selector Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-5 pt-4 border-t border-[#F0EDE1]">
          {levelsConfig.map(cfg => (
            <button
              key={cfg.lvl}
              onClick={() => handleLevelChange(cfg.lvl)}
              className={`py-2 px-2.5 rounded-xl border text-left transition-all ${
                level === cfg.lvl
                  ? "bg-[#2C4F3D] text-white border-[#1E432F] shadow-xs"
                  : "bg-[#FAF7F0] border-[#E3DEC3] text-[#5C5855] hover:border-[#2C4F3D]/40"
              }`}
            >
              <div className="text-xs font-bold">{cfg.name}</div>
              <div className={`text-[10px] truncate ${level === cfg.lvl ? "text-emerald-200" : "text-[#8C8884]"}`}>
                {cfg.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Recitation Reading Canvas */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-3xl p-6 sm:p-10 shadow-sm space-y-6">
        <div className="text-center pb-4 border-b border-[#F0EDE1]">
          <h2 className="text-2xl font-serif font-bold text-[#232120]">《{currentArticle.title}》</h2>
          <p className="text-xs text-[#8C8884] mt-1">
            〔{currentArticle.dynasty}〕{currentArticle.author}
          </p>
          <p className="text-[11px] text-[#5C5855] mt-2">
            提示：轻触有底色的虚线方框即可单个刮开核验，再次轻触可重新遮挡。
          </p>
        </div>

        <div className="space-y-6">
          {paragraphs.map((paraTokens, pIdx) => (
            <p key={pIdx} className="text-lg sm:text-xl font-serif leading-loose tracking-wide indent-8 text-[#232120]">
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
                      className="inline-block mx-1 px-1.5 py-0.5 rounded border-b-2 border-dashed border-[#9E2A2B] bg-[#9E2A2B]/10 text-transparent hover:bg-[#9E2A2B]/20 cursor-pointer select-none transition-colors"
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
                    className="inline-block mx-1 px-1.5 py-0.5 rounded bg-emerald-50 text-[#2C4F3D] font-bold border-b-2 border-emerald-500 cursor-pointer transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-[#F7F4EB] border border-[#E3DEC3] rounded-3xl p-6 max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif font-bold text-lg text-[#232120]">选择遮挡背诵篇目</h3>
              <button
                onClick={() => setShowArticlePicker(false)}
                className="text-[#8C8884] hover:text-[#232120] text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <input
              type="text"
              placeholder="搜索篇目名或作者..."
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
                    setRevealedTokenIds(new Set());
                    setRevealAll(false);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                    selectedArticleId === article.id
                      ? "bg-[#2C4F3D]/10 border-[#2C4F3D] text-[#2C4F3D] font-bold"
                      : "bg-white border-[#E3DEC3] hover:border-[#2C4F3D]/40 text-[#232120]"
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
