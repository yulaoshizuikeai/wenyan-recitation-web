import React, { useState, useMemo, useEffect } from "react";
import {
  Volume2,
  VolumeX,
  BookOpen,
  Layers,
  Sparkles,
  HelpCircle,
  Settings as SettingsIcon,
  Menu,
  X,
  Eye,
  BarChart2,
  Sun,
  Moon,
  Check,
  Search,
  Flame,
  RotateCcw,
  ChevronRight,
  Keyboard
} from "lucide-react";
import { getCurricularTiers } from "../data/articleTaxonomy";
import { AppTheme, toggleTheme } from "../utils/theme";
import { LastSessionState, NavView, useLastSession } from "../storage/sessionTracker";
import { useOptionalStudyApp } from "../state/StudyAppContext";

export type { NavView };

/** 全局导航快捷键映射（Alt + 数字），App 与帮助面板共用同一份定义 */
export const NAV_SHORTCUT_ORDER: { view: NavView; key: string; label: string }[] = [
  { view: "dashboard", key: "1", label: "概览" },
  { view: "snowball", key: "2", label: "长卷滚雪球" },
  { view: "flipcard", key: "3", label: "牌组闪卡" },
  { view: "cloze", key: "4", label: "渐进遮挡" },
  { view: "cram", key: "5", label: "考前抱佛脚" },
  { view: "scenario", key: "6", label: "高考默写" },
  { view: "catalog", key: "7", label: "诗文典库" },
  { view: "settings", key: "8", label: "设置" }
];

interface NavbarProps {
  currentView?: NavView;
  onSelectView?: (view: NavView) => void;
  selectedScope?: string;
  onSelectScope?: (scope: string) => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  theme?: AppTheme;
  onThemeChange?: (theme: AppTheme) => void;
  lastSession?: LastSessionState | null;
  onResumeSession?: (session: LastSessionState) => void;
  onShowShortcuts?: () => void;
  onOpenCommandPalette?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView: propCurrentView,
  onSelectView: propOnSelectView,
  selectedScope: propSelectedScope,
  onSelectScope: propOnSelectScope,
  soundEnabled: propSoundEnabled,
  onToggleSound: propOnToggleSound,
  theme: propTheme,
  onThemeChange: propOnThemeChange,
  lastSession: propLastSession,
  onResumeSession: propOnResumeSession,
  onShowShortcuts: propOnShowShortcuts,
  onOpenCommandPalette: propOnOpenCommandPalette
}) => {
  const appCtx = useOptionalStudyApp();
  const { lastSession: storedLastSession } = useLastSession();

  const currentView = propCurrentView ?? appCtx?.currentView ?? "dashboard";
  const onSelectView = propOnSelectView ?? appCtx?.setCurrentView ?? (() => {});
  const selectedScope = propSelectedScope ?? appCtx?.selectedScope ?? "ALL";
  const onSelectScope = propOnSelectScope ?? appCtx?.setSelectedScope ?? (() => {});
  const soundEnabled = propSoundEnabled ?? appCtx?.soundEnabled ?? false;
  const onToggleSound = propOnToggleSound ?? appCtx?.toggleSound ?? (() => {});
  const theme = propTheme ?? appCtx?.theme ?? "light";
  const onThemeChange = propOnThemeChange ?? appCtx?.setTheme ?? (() => {});
  const lastSession = propLastSession !== undefined ? propLastSession : storedLastSession;
  const onResumeSession = propOnResumeSession ?? appCtx?.resumeSession;
  const onShowShortcuts = propOnShowShortcuts ?? (appCtx ? () => appCtx.setShowShortcuts(true) : undefined);
  const onOpenCommandPalette =
    propOnOpenCommandPalette ?? (appCtx ? () => appCtx.setShowCommandPalette(true) : undefined);

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  const cmdShortcutLabel = isMac ? "⌘K" : "Ctrl K";
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [activeTierId, setActiveTierId] = useState<string>("CORE");
  const [scopeSearchQuery, setScopeSearchQuery] = useState<string>("");

  const curricularTiers = useMemo(() => getCurricularTiers(), []);

  // PC 侧：Esc 关闭教材范围弹层
  useEffect(() => {
    if (!isScopeModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsScopeModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isScopeModalOpen]);

  // Compute current scope label
  const currentScopeLabel = useMemo(() => {
    for (const tier of curricularTiers) {
      const match = tier.options.find(opt => opt.id === selectedScope);
      if (match) return match.name;
    }
    return "自选教材范围";
  }, [curricularTiers, selectedScope]);

  // Filter options in active tier by search
  const currentTierOptions = useMemo(() => {
    const tier = curricularTiers.find(t => t.id === activeTierId) || curricularTiers[0];
    if (!scopeSearchQuery.trim()) return tier.options;
    const q = scopeSearchQuery.toLowerCase();
    // If searching, search across all tiers
    return curricularTiers
      .flatMap(t => t.options)
      .filter(o => o.name.toLowerCase().includes(q) || o.description.toLowerCase().includes(q));
  }, [curricularTiers, activeTierId, scopeSearchQuery]);

  const shortcutOf = (view: NavView) =>
    NAV_SHORTCUT_ORDER.find(s => s.view === view)?.key;

  // PC 顶栏导航：4 个一级支柱（概览 / 背诵模式组 / 冲刺默写组 / 诗文典库）
  const isStudyView =
    currentView === "snowball" ||
    currentView === "flipcard" ||
    currentView === "cloze" ||
    currentView === "cram" ||
    currentView === "scenario";

  const studyItems: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: "snowball", label: "滚雪球", icon: <Layers className="w-3.5 h-3.5" /> },
    { id: "flipcard", label: "牌组闪卡", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: "cloze", label: "渐进遮挡", icon: <Eye className="w-3.5 h-3.5" /> }
  ];

  const examItems: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: "cram", label: "考前抱佛脚", icon: <Flame className="w-3.5 h-3.5 text-red-500" /> },
    { id: "scenario", label: "高考默写", icon: <HelpCircle className="w-3.5 h-3.5" /> }
  ];

  const handleNavClick = (view: NavView) => {
    onSelectView(view);
    setIsMobileMenuOpen(false);
  };

  const handleThemeToggle = () => {
    const next = toggleTheme(theme);
    onThemeChange(next);
  };

  const renderNavBtn = (item: { id: NavView; label: string; icon: React.ReactNode }, inPill = false) => {
    const active = currentView === item.id;
    const shortcut = shortcutOf(item.id);
    return (
      <button
        key={item.id}
        onClick={() => handleNavClick(item.id)}
        title={shortcut ? `${item.label}（Alt + ${shortcut}）` : item.label}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
          active
            ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs ring-1 ring-zinc-200/80 dark:ring-zinc-700/80"
            : inPill
              ? "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/70"
        }`}
      >
        {item.icon}
        <span className="hidden xl:inline">{item.label}</span>
      </button>
    );
  };

  return (
    <>
      {/* Top Navbar — enters low-profile immersive mode during study */}
      <header
        className={`sticky top-0 z-40 backdrop-blur-md border-b transition-all duration-200 ${
          isStudyView
            ? "bg-zinc-50/80 dark:bg-zinc-950/80 border-zinc-200/50 dark:border-zinc-800/50"
            : "bg-white/95 dark:bg-zinc-900/95 border-zinc-200/80 dark:border-zinc-800/80"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 h-12">
            {/* Brand Logo */}
            <div
              className="flex items-center gap-2 cursor-pointer select-none shrink-0 group"
              onClick={() => handleNavClick("dashboard")}
            >
              <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-red-600 dark:group-hover:bg-red-500 dark:group-hover:text-white transition-colors">
                诵
              </div>
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 tracking-tight hidden sm:block">
                文言背诵
              </span>
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px h-4 bg-zinc-200 dark:bg-zinc-800 shrink-0" />

            {/* Desktop Navigation — 4 Pillars (dimmed slightly during active study for focus) */}
            <nav
              className={`hidden lg:flex items-center gap-1.5 shrink-0 transition-opacity duration-200 ${
                isStudyView ? "opacity-80 hover:opacity-100" : "opacity-100"
              }`}
            >
              {/* 1. Overview */}
              {renderNavBtn({ id: "dashboard", label: "概览", icon: <BarChart2 className="w-3.5 h-3.5" /> })}

              {/* 2. Recitation Group */}
              <div className="flex items-center gap-0.5 bg-zinc-100/80 dark:bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-700/40">
                {studyItems.map(item => renderNavBtn(item, true))}
              </div>

              {/* 3. Exam / Sprint Group */}
              <div className="flex items-center gap-0.5 bg-zinc-100/80 dark:bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-700/40">
                {examItems.map(item => renderNavBtn(item, true))}
              </div>

              {/* 4. Catalog */}
              {renderNavBtn({ id: "catalog", label: "诗文典库", icon: <BookOpen className="w-3.5 h-3.5" /> })}
            </nav>

            {/* Right Controls */}
            <div className="flex items-center gap-1.5 ml-auto shrink-0 min-w-0">
              {/* Quick Search / Command Palette (Cmd/Ctrl + K) */}
              {onOpenCommandPalette && (
                <button
                  onClick={onOpenCommandPalette}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-zinc-200/80 dark:border-zinc-700/80 bg-zinc-50/90 dark:bg-zinc-800/70 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors shrink-0"
                  title={`全局快速搜索（${cmdShortcutLabel}）`}
                  aria-label="打开命令面板"
                >
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline text-[11px]">搜索</span>
                  <kbd className="hidden sm:inline-block text-[10px] font-mono px-1 py-0.2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500">
                    {cmdShortcutLabel}
                  </kbd>
                </button>
              )}

              {/* Quick Resume — subtle ghost pill, only on 2xl to avoid crowding */}
              {lastSession && currentView !== lastSession.view && (
                <button
                  onClick={() => onResumeSession && onResumeSession(lastSession)}
                  className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                  title={`继续上次研习：${lastSession.articleTitle ? `《${lastSession.articleTitle}》` : lastSession.modeName}`}
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[108px]">
                    {lastSession.articleTitle ? `接续《${lastSession.articleTitle}》` : `接续${lastSession.modeName}`}
                  </span>
                </button>
              )}

              {/* Scope Selector — fixed-width, icon + short label */}
              <button
                onClick={() => setIsScopeModalOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors max-w-[130px] md:max-w-[160px] shrink-0"
                title={`当前范围：${currentScopeLabel}`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                <span className="truncate">{currentScopeLabel}</span>
              </button>

              {/* Icon-only controls grouped with a hairline separator */}
              <div className="flex items-center gap-0.5 pl-1 border-l border-zinc-200 dark:border-zinc-700/80">
                {/* Settings (moved out of the tab row) */}
                <button
                  onClick={() => handleNavClick("settings")}
                  className={`hidden lg:inline-flex p-1.5 rounded-md transition-colors ${
                    currentView === "settings"
                      ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                  title="设置（Alt + 8）"
                  aria-label="设置"
                >
                  <SettingsIcon className="w-4 h-4" />
                </button>

                {/* Keyboard shortcut help */}
                {onShowShortcuts && (
                  <button
                    onClick={onShowShortcuts}
                    className="hidden lg:inline-flex p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    title="键盘快捷键（?）"
                    aria-label="键盘快捷键"
                  >
                    <Keyboard className="w-4 h-4" />
                  </button>
                )}

                {/* Theme Toggle */}
                <button
                  onClick={handleThemeToggle}
                  className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title={theme === "dark" ? "切换至浅色模式" : "切换至深色模式"}
                >
                  {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                {/* Audio Toggle */}
                <button
                  onClick={onToggleSound}
                  title={soundEnabled ? "编钟音效已开启（点击静音）" : "音效已静音（点击开启）"}
                  className={`p-1.5 rounded-md transition-colors ${
                    soundEnabled
                      ? "text-zinc-800 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                      : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                {/* Mobile Menu Toggle */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="lg:hidden p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  aria-label="菜单"
                >
                  {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Top Dropdown Drawer for Secondary Items */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 space-y-1 animate-in fade-in duration-150">
            {/* Mobile quick resume action if session exists */}
            {lastSession && (
              <div className="pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onResumeSession && onResumeSession(lastSession);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl border border-red-200/80 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-left transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                        接续上次背诵进度 ({lastSession.progressPercent}%)
                      </div>
                      <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {lastSession.articleTitle ? `《${lastSession.articleTitle}》` : lastSession.modeName} · {lastSession.modeName}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-red-500 shrink-0 ml-1" />
                </button>
              </div>
            )}

            <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 px-2 pb-1">
              专项模式与配置
            </div>
            <button
              onClick={() => handleNavClick("cloze")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                currentView === "cloze"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                <span>渐进遮挡背诵</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                L0-L4
              </span>
            </button>

            <button
              onClick={() => handleNavClick("scenario")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                currentView === "scenario"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4" />
                <span>高考情境默写真题</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-semibold">
                真题库
              </span>
            </button>

            <button
              onClick={() => handleNavClick("settings")}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                currentView === "settings"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>系统与 FSRS 算法设置</span>
            </button>
          </div>
        )}
      </header>

      {/* Two-Tier Hierarchical Curriculum Scope Modal */}
      {isScopeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsScopeModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden animate-fade-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base text-zinc-900 dark:text-zinc-100">
                  选择背诵教材范围
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  设定当前滚雪球、翻转闪卡与遮挡背诵的目标教材分册
                </p>
              </div>
              <button
                onClick={() => setIsScopeModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Search */}
            <div className="px-5 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索教材名称（如：高考72篇、必修上、选必下）..."
                  value={scopeSearchQuery}
                  onChange={e => setScopeSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400 dark:focus:border-zinc-600"
                />
              </div>
            </div>

            {/* Two-Tier Content */}
            <div className="flex-1 flex overflow-hidden min-h-[320px]">
              {/* Left Category Tabs (Hidden if searching) */}
              {!scopeSearchQuery.trim() && (
                <div className="w-36 sm:w-44 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-2 space-y-1 overflow-y-auto">
                  {curricularTiers.map(tier => (
                    <button
                      key={tier.id}
                      onClick={() => setActiveTierId(tier.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors ${
                        activeTierId === tier.id
                          ? "bg-white dark:bg-zinc-800 font-semibold text-zinc-900 dark:text-zinc-100 shadow-2xs border border-zinc-200/80 dark:border-zinc-700/80"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      }`}
                    >
                      <div>{tier.title}</div>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                        {tier.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Right Options List */}
              <div className="flex-1 p-3 overflow-y-auto space-y-1.5">
                {currentTierOptions.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-400">
                    未找到匹配的教材分册
                  </div>
                ) : (
                  currentTierOptions.map(opt => {
                    const isSelected = selectedScope === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => {
                          onSelectScope(opt.id);
                          setIsScopeModalOpen(false);
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                            : "bg-white dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-800 dark:text-zinc-200"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{opt.name}</span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                                isSelected
                                  ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                              }`}
                            >
                              {opt.count} 篇
                            </span>
                            {opt.isPopular && (
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                                  isSelected
                                    ? "bg-red-400/30 text-white dark:text-red-900"
                                    : "bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400"
                                }`}
                              >
                                推荐
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-[11px] mt-0.5 ${
                              isSelected
                                ? "text-zinc-300 dark:text-zinc-600"
                                : "text-zinc-400 dark:text-zinc-500"
                            }`}
                          >
                            {opt.description}
                          </p>
                        </div>

                        {isSelected && <Check className="w-4 h-4 shrink-0 text-current" />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
