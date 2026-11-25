import React, { useState, useMemo, useEffect } from "react";
import { ALL_ARTICLES, Article } from "../data/curriculumData";
import { ClozeToken } from "../domain/cloze/clozeEngine";
import {
  extractClozeKeywords,
  tokenizeArticleParagraphs,
  isTokenEffectiveMasked
} from "../domain/cloze/keywordExtractor";
import { sound } from "../sound/audioSynthesizer";
import { filterArticlesByScope } from "../data/articleTaxonomy";
import { saveLastSession, SessionExtra } from "../storage/sessionTracker";
import { getRecommendedMode } from "../domain/recommend/modeRecommender";
import { StudyWorkspaceShell } from "../components/StudyWorkspaceShell";
import { ArticlePickerModal } from "../components/ArticlePickerModal";
import { TypingRecallInput } from "../components/TypingRecallInput";
import { useOptionalStudyApp } from "../state/StudyAppContext";
import { Eye, EyeOff, Search, X, RotateCcw, Layers, Keyboard } from "lucide-react";

interface ClozeViewProps {
  initialArticleId?: string;
  selectedScope?: string;
  resumeExtra?: SessionExtra;
  onOpenArticleInView?: (articleId: string, view: NavViewName) => void;
}

type NavViewName = "snowball" | "cloze" | "flipcard" | "catalog";

export const ClozeView: React.FC<ClozeViewProps> = ({
  initialArticleId: propInitialArticleId,
  selectedScope: propSelectedScope,
  resumeExtra: propResumeExtra,
  onOpenArticleInView: propOnOpenArticleInView
}) => {
  const appCtx = useOptionalStudyApp();
  const initialArticleId = propInitialArticleId ?? appCtx?.activeArticleId;
  const selectedScope = propSelectedScope ?? appCtx?.selectedScope ?? "ALL";
  const resumeExtra = propResumeExtra ?? appCtx?.resumeExtra;
  const onOpenArticleInView = propOnOpenArticleInView ?? appCtx?.navigateToArticle;

  const filteredArticles = useMemo(() => {
    return filterArticlesByScope(ALL_ARTICLES, selectedScope);
  }, [selectedScope]);

  const [selectedArticleId, setSelectedArticleId] = useState<string>(() => {
    if (initialArticleId) return initialArticleId;
    return filteredArticles[0]?.id || "art_bx1_12"; // 劝学
  });

  // Keep selectedArticleId in sync when initialArticleId prop / context changes
  useEffect(() => {
    if (initialArticleId) {
      setSelectedArticleId(initialArticleId);
    }
  }, [initialArticleId]);

  const [level, setLevel] = useState<number>(() => {
    if (resumeExtra?.clozeLevel !== undefined && resumeExtra.clozeLevel >= 0 && resumeExtra.clozeLevel <= 4) {
      return resumeExtra.clozeLevel;
    }
    return 1;
  });

  const [hasRestoredNotice, setHasRestoredNotice] = useState<boolean>(() => {
    return resumeExtra?.clozeLevel !== undefined && resumeExtra.clozeLevel > 0;
  });

  useEffect(() => {
    if (resumeExtra?.clozeLevel !== undefined && resumeExtra.clozeLevel >= 0 && resumeExtra.clozeLevel <= 4) {
      setLevel(resumeExtra.clozeLevel);
      setHasRestoredNotice(resumeExtra.clozeLevel > 0);
    }
  }, [resumeExtra]);

  const [fontSizeIndex, setFontSizeIndex] = useState<number>(1); // 0: 16px, 1: 18px, 2: 20px, 3: 22px
  const [revealAll, setRevealAll] = useState<boolean>(false);
  const [revealedTokenIds, setRevealedTokenIds] = useState<Set<number>>(new Set());
  const [showArticlePicker, setShowArticlePicker] = useState<boolean>(false);
  const [showPhonetics, setShowPhonetics] = useState<boolean>(false);
  const [showUnderstanding, setShowUnderstanding] = useState<boolean>(false);
  const [typingRecallEnabled, setTypingRecallEnabled] = useState<boolean>(false);
  const [activeTypingTokenId, setActiveTypingTokenId] = useState<number | null>(null);

  const fontSizes = [
    { label: "小", className: "text-base sm:text-lg leading-relaxed" },
    { label: "标准", className: "text-lg sm:text-xl leading-loose" },
    { label: "大", className: "text-xl sm:text-2xl leading-loose" },
    { label: "特大", className: "text-2xl sm:text-3xl leading-loose" }
  ];

  const currentArticle: Article = useMemo(() => {
    return ALL_ARTICLES.find(a => a.id === selectedArticleId) || ALL_ARTICLES[0];
  }, [selectedArticleId]);

  // Extract cloze keywords: 难词注音表中的考点词优先，其次注释词；剔除纯虚词并控制密度
  const clozeKeywords = useMemo(() => {
    return extractClozeKeywords(currentArticle);
  }, [currentArticle]);

  // Tokenize text into paragraphs
  const paragraphs = useMemo(() => {
    return tokenizeArticleParagraphs(currentArticle.fullContent, level, clozeKeywords);
  }, [currentArticle.fullContent, level, clozeKeywords]);

  const maskedTokens = useMemo(
    () => paragraphs.flat().filter((t) => t.isMasked),
    [paragraphs]
  );

  // Keep activeTypingTokenId pointing to an unrevealed masked token when L1 typing mode is on
  useEffect(() => {
    if (level !== 1 || !typingRecallEnabled) {
      setActiveTypingTokenId(null);
      return;
    }
    const stillValid = maskedTokens.some(
      (t) => t.id === activeTypingTokenId && !revealedTokenIds.has(t.id)
    );
    if (!stillValid) {
      const firstUnrevealed = maskedTokens.find((t) => !revealedTokenIds.has(t.id));
      setActiveTypingTokenId(firstUnrevealed ? firstUnrevealed.id : null);
    }
  }, [level, typingRecallEnabled, maskedTokens, activeTypingTokenId, revealedTokenIds]);

  const activeTypingToken = useMemo(
    () => maskedTokens.find((t) => t.id === activeTypingTokenId) || null,
    [maskedTokens, activeTypingTokenId]
  );

  const levelsConfig = [
    { lvl: 0, name: "L0 原文", desc: "通读全览" },
    { lvl: 1, name: "L1 关键词", desc: "高频考点挖空" },
    { lvl: 2, name: "L2 半句", desc: "出句提示对句遮挡" },
    { lvl: 3, name: "L3 首字", desc: "保留首字与标点骨架" },
    { lvl: 4, name: "L4 全盲", desc: "全篇下划线盲测" }
  ];

  // 当前篇目更适合滚雪球串联时给出软提示
  const modeAdvice = useMemo(() => {
    const rec = getRecommendedMode(currentArticle);
    return rec.mode === "snowball" ? rec : null;
  }, [currentArticle]);

  // Sync to session tracker
  useEffect(() => {
    if (!currentArticle) return;
    saveLastSession({
      view: "cloze",
      articleId: currentArticle.id,
      articleTitle: currentArticle.title,
      articleAuthor: currentArticle.author,
      articleDynasty: currentArticle.dynasty,
      modeName: "渐进遮挡",
      progressText: `${levelsConfig[level].name} (${revealedTokenIds.size} 词已显)`,
      progressPercent: Math.min(100, Math.round(((level + 1) / 5) * 100)),
      updatedAt: Date.now(),
      extra: {
        clozeLevel: level
      }
    });
  }, [currentArticle, level, revealedTokenIds.size]);

  const handleToggleToken = (tokenId: number) => {
    if (level === 1 && typingRecallEnabled && !revealedTokenIds.has(tokenId) && !revealAll) {
      setActiveTypingTokenId(tokenId);
      return;
    }
    sound.playReveal();
    const next = new Set(revealedTokenIds);
    if (next.has(tokenId)) {
      next.delete(tokenId);
    } else {
      next.add(tokenId);
    }
    setRevealedTokenIds(next);
  };

  const handleTypingCorrect = () => {
    if (!activeTypingToken) return;
    const next = new Set(revealedTokenIds);
    next.add(activeTypingToken.id);
    setRevealedTokenIds(next);
    const nextUnrevealed = maskedTokens.find(
      (t) => t.id !== activeTypingToken.id && !next.has(t.id)
    );
    setActiveTypingTokenId(nextUnrevealed ? nextUnrevealed.id : null);
  };

  const handleLevelChange = (lvl: number) => {
    setLevel(lvl);
    setRevealedTokenIds(new Set());
    setRevealAll(false);
    setHasRestoredNotice(false);
  };

  const isGlobalModalOpen = Boolean(appCtx?.showCommandPalette || appCtx?.showShortcuts);

  // PC 键盘操作：←/→ 调整遮挡等级，R 全览切换
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGlobalModalOpen || showArticlePicker || showPhonetics || showUnderstanding) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleLevelChange(Math.max(0, level - 1));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleLevelChange(Math.min(levelsConfig.length - 1, level + 1));
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setRevealAll(prev => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [level, isGlobalModalOpen, showArticlePicker, showPhonetics, showUnderstanding]);

  const handleSelectArticleFromPicker = (articleId: string) => {
    setSelectedArticleId(articleId);
    appCtx?.setActiveArticleId(articleId);
    setShowArticlePicker(false);
    setRevealedTokenIds(new Set());
    setRevealAll(false);
  };

  return (
    <StudyWorkspaceShell
      toolbarConfig={{
        modeLabel: "渐进遮挡",
        modeIcon: <Eye className="w-3.5 h-3.5" />,
        title: `《${currentArticle.title}》`,
        subtitle: `${currentArticle.dynasty} · ${currentArticle.author}`,
        onSelectTitle: () => setShowArticlePicker(true),
        progressText: `L${level} · ${levelsConfig[level]?.name || ""}`,
        progressPercent: (level / 4) * 100,
        actions: (
          <>
            {/* Font Size Adjuster */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60">
              <button
                onClick={() => setFontSizeIndex(Math.max(0, fontSizeIndex - 1))}
                disabled={fontSizeIndex === 0}
                className="px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 disabled:opacity-40 hover:bg-white dark:hover:bg-zinc-700 rounded transition-colors"
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
                className="px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300 disabled:opacity-40 hover:bg-white dark:hover:bg-zinc-700 rounded transition-colors"
                title="放大字号"
              >
                A+
              </button>
            </div>

            {level === 1 && (
              <button
                onClick={() => setTypingRecallEnabled((prev) => !prev)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                  typingRecallEnabled
                    ? "bg-sky-600 text-white border-sky-600 dark:bg-sky-500 dark:border-sky-500"
                    : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
                title="开启 L1 关键词手打盲默"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>手打盲默</span>
              </button>
            )}

            <button
              onClick={() => setRevealAll(!revealAll)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                revealAll
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900"
                  : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              title="快捷键: R"
            >
              {revealAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{revealAll ? "恢复遮挡" : "全览"}</span>
            </button>

            <button
              onClick={() => setShowArticlePicker(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <span>换篇目</span>
            </button>
          </>
        )
      }}
      topBanner={
        hasRestoredNotice ? (
          <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-700 dark:text-zinc-300">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span>已恢复至上次遮挡梯度：<strong>{levelsConfig[level].name}</strong></span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleLevelChange(1)}
                className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline underline-offset-2 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>还原 L1</span>
              </button>
              <button
                onClick={() => setHasRestoredNotice(false)}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : undefined
      }
      article={currentArticle}
      sidebarProgressLabel={`遮挡等级 ${levelsConfig[level].name}`}
      sidebarProgressPercent={((level + 1) / levelsConfig.length) * 100}
      sidebarShortcuts={[
        { keys: "← / →", label: "降低 / 提高遮挡" },
        { keys: "R", label: "全览 / 恢复遮挡" }
      ]}
      sidebarHint="先按当前梯度整段默背，卡住再点虚线框刮开单字。连续两档都能顺畅背完，就可以升一档。"
      onChangeArticle={() => setShowArticlePicker(true)}
      showPhonetics={showPhonetics}
      onShowPhonetics={() => setShowPhonetics(true)}
      onClosePhonetics={() => setShowPhonetics(false)}
      showUnderstanding={showUnderstanding}
      onShowUnderstanding={() => setShowUnderstanding(true)}
      onCloseUnderstanding={() => setShowUnderstanding(false)}
    >

      {/* 5 Levels Modern Segmented Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-1.5 shadow-2xs">
        <div className="grid grid-cols-5 gap-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl p-1 text-xs font-medium">
          {levelsConfig.map(cfg => (
            <button
              key={cfg.lvl}
              onClick={() => handleLevelChange(cfg.lvl)}
              className={`py-1.5 px-1 rounded-lg text-center transition-all ${
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

      {/* Mode Suggestion */}
      {modeAdvice && onOpenArticleInView && (
        <div className="mb-4 bg-sky-50/60 dark:bg-sky-950/20 border border-sky-200/70 dark:border-sky-900/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-zinc-700 dark:text-zinc-300">
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span>
              这篇共 {modeAdvice.netLength} 字，<strong>更适合滚雪球串联</strong>：{modeAdvice.reason}
            </span>
          </div>
          <button
            onClick={() => onOpenArticleInView(currentArticle.id, "snowball")}
            className="shrink-0 text-[11px] font-medium text-sky-700 dark:text-sky-300 hover:underline underline-offset-2"
          >
            去串联
          </button>
        </div>
      )}

      {/* 5 Levels Modern Segmented Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-10 shadow-xs space-y-5 transition-colors">
        <div className="text-center pb-4 border-b border-zinc-100 dark:border-zinc-800/60">
          <h2 className="text-xl font-classical font-semibold text-zinc-900 dark:text-zinc-100">
            《{currentArticle.title}》
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            〔{currentArticle.dynasty}〕{currentArticle.author}
          </p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
            {level === 1 && typingRecallEnabled
              ? "点击任意虚线空缺选中，在下方输入关键词并按 Enter 核对"
              : "轻触虚线下划线框即可刮开核对，再次轻触可重新遮挡"}
          </p>
        </div>

        {/* L1 Typing Recall Bar (Track L2.3) */}
        {level === 1 && typingRecallEnabled && (
          <div className="p-3.5 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200/70 dark:border-sky-900/40 space-y-2">
            {activeTypingToken ? (
              <>
                <div className="flex items-center justify-between text-xs text-sky-800 dark:text-sky-300">
                  <span className="font-medium">
                    当前盲默空缺（{maskedTokens.findIndex((t) => t.id === activeTypingToken.id) + 1} /{" "}
                    {maskedTokens.length}，剩{" "}
                    {maskedTokens.filter((t) => !revealedTokenIds.has(t.id)).length} 处）
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(revealedTokenIds);
                      next.add(activeTypingToken.id);
                      setRevealedTokenIds(next);
                    }}
                    className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline"
                  >
                    直接揭晓此空
                  </button>
                </div>
                <TypingRecallInput
                  expectedAnswer={activeTypingToken.originalText}
                  autoFocus
                  compact
                  placeholder="输入高亮空缺处的关键词（Enter 核对并自动揭晓）..."
                  onSubmitCorrect={handleTypingCorrect}
                />
              </>
            ) : (
              <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium text-center py-1">
                本篇 L1 关键词已全部手打盲默过关！
              </div>
            )}
          </div>
        )}

        <div className="space-y-5">
          {paragraphs.map((paraTokens, pIdx) => (
            <p
              key={pIdx}
              className={`font-classical indent-8 text-zinc-900 dark:text-zinc-100 tracking-wide ${fontSizes[fontSizeIndex].className}`}
            >
              {paraTokens.map(token => {
                const isEffectiveMasked = isTokenEffectiveMasked(token, revealedTokenIds, revealAll);

                if (!token.isMasked) {
                  return <span key={token.id}>{token.originalText}</span>;
                }

                if (isEffectiveMasked) {
                  const isActiveTarget = level === 1 && typingRecallEnabled && activeTypingTokenId === token.id;
                  return (
                    <button
                      key={token.id}
                      onClick={() => handleToggleToken(token.id)}
                      className={`inline-block mx-0.5 px-1 py-0 rounded border-b border-dashed text-transparent select-none cursor-pointer transition-colors ${
                        isActiveTarget
                          ? "border-sky-500 bg-sky-100/90 dark:bg-sky-900/50 ring-2 ring-sky-400/70"
                          : "border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-500"
                      }`}
                      title={isActiveTarget ? "当前手打盲默目标空缺" : "点击刮开查看正解"}
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

      <ArticlePickerModal
        isOpen={showArticlePicker}
        onClose={() => setShowArticlePicker(false)}
        articles={filteredArticles}
        activeArticleId={selectedArticleId}
        onSelectArticle={handleSelectArticleFromPicker}
        selectedScope={selectedScope}
        title="选择遮挡背诵篇目"
      />
    </StudyWorkspaceShell>
  );
};
