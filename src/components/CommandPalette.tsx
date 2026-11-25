/**
 * CommandPalette — Phase 2.3 Part B Notion 式全局命令面板 (Cmd/Ctrl + K)
 *
 * 支持在全站任意页面一键呼出，完成：
 *   1. 秒搜全部 100 篇古诗文（按篇名、作者、朝代、所属教材分册、体裁检索）
 *   2. 直达 5 种学习模式与全部 8 个视图（概览、滚雪球、闪卡、渐进遮挡、抱佛脚、高考默写、典库、设置）
 *   3. 快速切换教材范围（selectedScope：高考 72 篇、全 11 册、必修、选必、分册等）
 *   4. 快速切换主题（浅色 / 深色）与编钟音效
 *
 * 完整键盘导航：ArrowUp / ArrowDown / Enter / Esc（含输入法合成态 isComposing 防误触）。
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  X,
  BarChart2,
  Layers,
  Sparkles,
  Eye,
  Flame,
  HelpCircle,
  BookOpen,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Check,
  CornerDownLeft,
  Compass,
} from "lucide-react";
import { ALL_ARTICLES, MODULES, type Article } from "../data/curriculumData";
import { getCurricularTiers } from "../data/articleTaxonomy";
import type { NavView } from "../storage/sessionTracker";
import type { AppTheme } from "../utils/theme";

// ─── Types ──────────────────────────────────────────────────────────────────────

export type CommandItemCategory = "view" | "article" | "scope" | "action";

export interface CommandPaletteItem {
  id: string;
  category: CommandItemCategory;
  title: string;
  subtitle?: string;
  badge?: string;
  shortcut?: string;
  isActive?: boolean;
  onExecute: () => void;
}

export interface CommandPaletteProps {
  /** 是否打开命令面板 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 当前活跃视图 */
  currentView: NavView;
  /** 当前教材范围 ID */
  selectedScope: string;
  /** 当前主题 */
  theme: AppTheme;
  /** 当前是否开启音效 */
  soundEnabled?: boolean;
  /** 当前活跃篇目 ID（用于高亮当前篇目） */
  activeArticleId?: string;
  /** 切换视图回调 */
  onSelectView: (view: NavView) => void;
  /** 打开指定篇目（可选指定目标视图，不传则沿用合适模式） */
  onSelectArticle: (articleId: string, view: NavView) => void;
  /** 切换教材范围回调 */
  onSelectScope: (scope: string) => void;
  /** 切换主题回调 */
  onThemeChange: (theme: AppTheme) => void;
  /** 可选：切换音效回调 */
  onToggleSound?: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

interface ViewMeta {
  view: NavView;
  label: string;
  description: string;
  shortcut: string;
  keywords: string;
  isStudyMode?: boolean;
}

const VIEW_DEFINITIONS: ViewMeta[] = [
  {
    view: "dashboard",
    label: "研习概览",
    description: "学习统计、每日配额与上次进度卡片",
    shortcut: "Alt + 1",
    keywords: "dashboard 首页 概览 统计",
  },
  {
    view: "snowball",
    label: "长卷滚雪球",
    description: "新联叠加前文串联，攻克长篇名作",
    shortcut: "Alt + 2",
    keywords: "snowball 滚雪球 背诵 模式",
    isStudyMode: true,
  },
  {
    view: "flipcard",
    label: "牌组闪卡",
    description: "FSRS-5 间隔重复与正反双向挖空记忆",
    shortcut: "Alt + 3",
    keywords: "flipcard 闪卡 anki 复习 模式",
    isStudyMode: true,
  },
  {
    view: "cloze",
    label: "渐进遮挡",
    description: "L0-L4 分级刻漏字遮挡自测",
    shortcut: "Alt + 4",
    keywords: "cloze 渐进遮挡 刻漏字 填空 模式",
    isStudyMode: true,
  },
  {
    view: "cram",
    label: "考前抱佛脚",
    description: "72 篇名句高频考点速刷与卡壳标记",
    shortcut: "Alt + 5",
    keywords: "cram 考前抱佛脚 名句 金句 突击 模式",
    isStudyMode: true,
  },
  {
    view: "scenario",
    label: "高考默写",
    description: "理解性情境默写真题与逐字批改",
    shortcut: "Alt + 6",
    keywords: "scenario 高考默写 情境 真题 模式",
    isStudyMode: true,
  },
  {
    view: "catalog",
    label: "诗文典库",
    description: "全 100 篇古诗文精读、注释、译文与注音",
    shortcut: "Alt + 7",
    keywords: "catalog 典库 目录 精读 原文",
  },
  {
    view: "settings",
    label: "系统设置",
    description: "FSRS 参数、每日配额、主题与备份导入导出",
    shortcut: "Alt + 8",
    keywords: "settings 设置 参数 备份",
  },
];

const ARTICLE_TARGET_VIEWS = new Set<NavView>(["snowball", "flipcard", "cloze", "catalog"]);

function getViewIcon(view: NavView) {
  switch (view) {
    case "dashboard":
      return <BarChart2 className="w-4 h-4" />;
    case "snowball":
      return <Layers className="w-4 h-4" />;
    case "flipcard":
      return <Sparkles className="w-4 h-4" />;
    case "cloze":
      return <Eye className="w-4 h-4" />;
    case "cram":
      return <Flame className="w-4 h-4 text-red-500" />;
    case "scenario":
      return <HelpCircle className="w-4 h-4" />;
    case "catalog":
      return <BookOpen className="w-4 h-4" />;
    case "settings":
      return <SettingsIcon className="w-4 h-4" />;
  }
}

const CATEGORY_LABEL: Record<CommandItemCategory, string> = {
  article: "古诗文篇目",
  view: "学习模式与页面",
  scope: "切换教材范围",
  action: "快捷设置",
};

// ─── Component ──────────────────────────────────────────────────────────────────

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  currentView,
  selectedScope,
  theme,
  soundEnabled = false,
  activeArticleId,
  onSelectView,
  onSelectArticle,
  onSelectScope,
  onThemeChange,
  onToggleSound,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 教材 ID → 名称映射（供篇目按分册名搜索与副标题展示）
  const moduleNameMap = useMemo(() => {
    const map = new Map<string, { name: string; shortName: string }>();
    for (const m of MODULES) {
      map.set(m.id, { name: m.name, shortName: m.shortName });
    }
    return map;
  }, []);

  // 所有可选教材范围（扁平化）
  const scopeOptions = useMemo(() => {
    return getCurricularTiers().flatMap(t => t.options);
  }, []);

  // 如果当前在支持指定篇目的学习视图，跳转到新篇目时沿用当前视图；否则默认进滚雪球
  const targetArticleView: NavView = ARTICLE_TARGET_VIEWS.has(currentView)
    ? currentView
    : "snowball";

  const targetArticleViewLabel = useMemo(() => {
    return VIEW_DEFINITIONS.find(v => v.view === targetArticleView)?.label ?? "滚雪球";
  }, [targetArticleView]);

  // 打开时清空查询并聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // 生成过滤后的命令列表
  const items = useMemo<CommandPaletteItem[]>(() => {
    const q = query.trim().toLowerCase();

    const executeAndClose = (fn: () => void) => () => {
      fn();
      onClose();
    };

    // 1. 视图跳转项
    const viewItems: CommandPaletteItem[] = VIEW_DEFINITIONS.filter(v => {
      if (!q) return true;
      return (
        v.label.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.keywords.toLowerCase().includes(q)
      );
    }).map(v => ({
      id: `view:${v.view}`,
      category: "view",
      title: v.label,
      subtitle: v.description,
      badge: v.isStudyMode ? "学习模式" : undefined,
      shortcut: v.shortcut,
      isActive: currentView === v.view,
      onExecute: executeAndClose(() => onSelectView(v.view)),
    }));

    // 2. 快捷主题与音效切换项
    const actionItems: CommandPaletteItem[] = [];
    const nextTheme: AppTheme = theme === "dark" ? "light" : "dark";
    const themeTitle = nextTheme === "dark" ? "切换为深色主题" : "切换为浅色主题";
    if (!q || "主题 深色 浅色 dark light theme 夜间 日间".includes(q) || themeTitle.includes(q)) {
      actionItems.push({
        id: "action:toggle-theme",
        category: "action",
        title: themeTitle,
        subtitle: `当前：${theme === "dark" ? "深色模式" : "浅色模式"}`,
        onExecute: executeAndClose(() => onThemeChange(nextTheme)),
      });
    }

    if (onToggleSound) {
      const soundTitle = soundEnabled ? "关闭编钟音效（静音）" : "开启编钟音效";
      if (!q || "音效 声音 静音 编钟 sound audio".includes(q) || soundTitle.includes(q)) {
        actionItems.push({
          id: "action:toggle-sound",
          category: "action",
          title: soundTitle,
          subtitle: soundEnabled ? "当前状态：已开启" : "当前状态：已静音",
          onExecute: executeAndClose(() => onToggleSound()),
        });
      }
    }

    // 3. 教材范围切换项
    const matchedScopes = scopeOptions.filter(opt => {
      if (!q) return opt.id === "GAOKAO72" || opt.id === "ALL" || opt.id === "BX_ALL" || opt.id === "XB_ALL";
      return (
        opt.name.toLowerCase().includes(q) ||
        opt.description.toLowerCase().includes(q) ||
        opt.id.toLowerCase().includes(q) ||
        "范围 教材 选册".includes(q)
      );
    });

    const scopeItems: CommandPaletteItem[] = matchedScopes.map(opt => ({
      id: `scope:${opt.id}`,
      category: "scope",
      title: `切换范围：${opt.name}`,
      subtitle: `${opt.count} 篇 · ${opt.description}`,
      badge: selectedScope === opt.id ? "当前" : undefined,
      isActive: selectedScope === opt.id,
      onExecute: executeAndClose(() => onSelectScope(opt.id)),
    }));

    // 4. 古诗文篇目搜索（支持篇名、作者、朝代、教材书名/简称、体裁）
    const matchedArticles: Article[] = q
      ? ALL_ARTICLES.filter(a => {
          const mod = moduleNameMap.get(a.moduleId);
          const bookText = mod ? `${mod.name} ${mod.shortName}`.toLowerCase() : "";
          return (
            a.title.toLowerCase().includes(q) ||
            a.author.toLowerCase().includes(q) ||
            a.dynasty.toLowerCase().includes(q) ||
            a.genre.toLowerCase().includes(q) ||
            bookText.includes(q) ||
            (q === "72" || q === "高考" || q === "高考72篇" ? a.isGaoKao72 : false)
          );
        }).slice(0, 24)
      : ALL_ARTICLES.slice(0, 8);

    const articleItems: CommandPaletteItem[] = matchedArticles.map(a => {
      const mod = moduleNameMap.get(a.moduleId);
      const bookLabel = mod?.shortName ?? mod?.name ?? "";
      return {
        id: `article:${a.id}`,
        category: "article",
        title: `《${a.title}》`,
        subtitle: `${a.dynasty} · ${a.author}${bookLabel ? ` · ${bookLabel}` : ""} · 在「${targetArticleViewLabel}」打开`,
        badge: a.isGaoKao72 ? "高考72篇" : undefined,
        isActive: a.id === activeArticleId,
        onExecute: executeAndClose(() => onSelectArticle(a.id, targetArticleView)),
      };
    });

    // 无搜索词时优先展示「视图 + 常用篇目 + 范围 + 动作」；有搜索词时「篇目优先」便于秒搜古诗文
    return q
      ? [...articleItems, ...viewItems, ...scopeItems, ...actionItems]
      : [...viewItems, ...articleItems, ...actionItems, ...scopeItems];
  }, [
    query,
    currentView,
    selectedScope,
    theme,
    soundEnabled,
    activeArticleId,
    moduleNameMap,
    scopeOptions,
    targetArticleView,
    targetArticleViewLabel,
    onClose,
    onSelectView,
    onSelectArticle,
    onSelectScope,
    onThemeChange,
    onToggleSound,
  ]);

  // 保证 selectedIndex 始终在合法范围内
  useEffect(() => {
    setSelectedIndex(prev => (items.length === 0 ? 0 : Math.min(prev, items.length - 1)));
  }, [items.length]);

  // 键盘高亮项自动滚动到可见区
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [isOpen, selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 防止中文输入法候选回车误触选中
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (items.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        items[selectedIndex]?.onExecute();
      }
    },
    [items, selectedIndex, onClose]
  );

  if (!isOpen) return null;

  // 按当前顺序对连续同分类项目做分组标题渲染
  const renderedSections: { category: CommandItemCategory; entries: { item: CommandPaletteItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = renderedSections[renderedSections.length - 1];
    if (last && last.category === item.category) {
      last.entries.push({ item, index });
    } else {
      renderedSections.push({ category: item.category, entries: [{ item, index }] });
    }
  });

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="全局命令面板"
        className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[72vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* 搜索输入框 */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="搜索 100 篇古诗文（篇名/作者/朝代/分册）、学习模式或教材范围…"
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-hidden"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              aria-label="清空搜索"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="kbd text-[10px] hidden sm:inline-block">Esc</kbd>
        </div>

        {/* 命令结果列表 */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-3">
          {items.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400 dark:text-zinc-500">
              未找到与「{query}」匹配的篇目或指令
            </div>
          ) : (
            renderedSections.map((section, secIdx) => (
              <div key={`${section.category}_${secIdx}`} className="space-y-0.5">
                <div className="px-2.5 py-1 text-[10px] font-medium tracking-wide text-zinc-400 dark:text-zinc-500">
                  {CATEGORY_LABEL[section.category]}
                </div>
                {section.entries.map(({ item, index }) => {
                  const isHighlighted = index === selectedIndex;
                  const viewId = item.id.startsWith("view:")
                    ? (item.id.slice(5) as NavView)
                    : null;

                  return (
                    <button
                      key={item.id}
                      data-cmd-index={index}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={item.onExecute}
                      className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors ${
                        isHighlighted
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`shrink-0 ${
                            isHighlighted
                              ? "text-white dark:text-zinc-900"
                              : "text-zinc-400 dark:text-zinc-500"
                          }`}
                        >
                          {viewId ? (
                            getViewIcon(viewId)
                          ) : item.category === "article" ? (
                            <BookOpen className="w-4 h-4" />
                          ) : item.category === "scope" ? (
                            <Compass className="w-4 h-4" />
                          ) : item.id === "action:toggle-theme" ? (
                            theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />
                          ) : soundEnabled ? (
                            <VolumeX className="w-4 h-4" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-medium truncate ${
                                item.category === "article" ? "font-classical" : ""
                              }`}
                            >
                              {item.title}
                            </span>
                            {item.badge && (
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-mono shrink-0 ${
                                  isHighlighted
                                    ? "bg-white/20 text-white dark:bg-zinc-900/15 dark:text-zinc-900"
                                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </div>
                          {item.subtitle && (
                            <div
                              className={`text-[11px] truncate mt-0.5 ${
                                isHighlighted
                                  ? "text-zinc-300 dark:text-zinc-600"
                                  : "text-zinc-400 dark:text-zinc-500"
                              }`}
                            >
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.isActive && (
                          <Check
                            className={`w-3.5 h-3.5 ${
                              isHighlighted
                                ? "text-white dark:text-zinc-900"
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          />
                        )}
                        {item.shortcut && (
                          <kbd
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                              isHighlighted
                                ? "border-white/30 bg-white/10 text-white dark:border-zinc-900/30 dark:bg-zinc-900/10 dark:text-zinc-900"
                                : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                            }`}
                          >
                            {item.shortcut}
                          </kbd>
                        )}
                        {isHighlighted && (
                          <CornerDownLeft className="w-3.5 h-3.5 opacity-70" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部操作提示 */}
        <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/80 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="kbd text-[10px]">↑</kbd>
              <kbd className="kbd text-[10px]">↓</kbd>
              <span>选择</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd text-[10px]">Enter</kbd>
              <span>打开</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd text-[10px]">Esc</kbd>
              <span>关闭</span>
            </span>
          </div>
          <span>共收录 {ALL_ARTICLES.length} 篇古诗文</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
