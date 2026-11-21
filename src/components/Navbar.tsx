import React, { useState, useMemo } from "react";
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
  ChevronRight
} from "lucide-react";
import { getCurricularTiers, CurricularTier, ScopeCategoryOption } from "../data/articleTaxonomy";
import { AppTheme, toggleTheme } from "../utils/theme";
import { LastSessionState, NavView } from "../storage/sessionTracker";

export type { NavView };

interface NavbarProps {
  currentView: NavView;
  onSelectView: (view: NavView) => void;
  selectedScope: string;
  onSelectScope: (scope: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  lastSession?: LastSessionState | null;
  onResumeSession?: (session: LastSessionState) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onSelectView,
  selectedScope,
  onSelectScope,
  soundEnabled,
  onToggleSound,
  theme,
  onThemeChange,
  lastSession,
  onResumeSession
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScopeModalOpen, setIsScopeModalOpen] = useState(false);
  const [activeTierId, setActiveTierId] = useState<string>("CORE");
  const [scopeSearchQuery, setScopeSearchQuery] = useState<string>("");

  const curricularTiers = useMemo(() => getCurricularTiers(), []);

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

  const navItems: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "概览", icon: <BarChart2 className="w-4 h-4" /> },
    { id: "cram", label: "考前抱佛脚", icon: <Flame className="w-4 h-4 text-red-500" /> },
    { id: "snowball", label: "长卷滚雪球", icon: <Layers className="w-4 h-4" /> },
    { id: "flipcard", label: "翻转闪卡", icon: <Sparkles className="w-4 h-4" /> },
    { id: "cloze", label: "渐进遮挡", icon: <Eye className="w-4 h-4" /> },
    { id: "scenario", label: "高考默写", icon: <HelpCircle className="w-4 h-4" /> },
    { id: "catalog", label: "诗文典库", icon: <BookOpen className="w-4 h-4" /> },
    { id: "settings", label: "设置", icon: <SettingsIcon className="w-4 h-4" /> }
  ];

  // Mobile Bottom Bar has 5 core items
  const mobileDockItems: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "概览", icon: <BarChart2 className="w-5 h-5" /> },
    { id: "cram", label: "抱佛脚", icon: <Flame className="w-5 h-5 text-red-500" /> },
    { id: "snowball", label: "滚雪球", icon: <Layers className="w-5 h-5" /> },
    { id: "flipcard", label: "闪卡", icon: <Sparkles className="w-5 h-5" /> },
    { id: "catalog", label: "典库", icon: <BookOpen className="w-5 h-5" /> }
  ];

  const handleNavClick = (view: NavView) => {
    onSelectView(view);
    setIsMobileMenuOpen(false);
  };

  const handleThemeToggle = () => {
    const next = toggleTheme(theme);
    onThemeChange(next);
  };

  return (
    <>
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Brand Logo */}
            <div
              className="flex items-center gap-2.5 cursor-pointer select-none"
              onClick={() => handleNavClick("dashboard")}
            >
              <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center font-bold text-sm">
                诵
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base text-zinc-900 dark:text-zinc-100 tracking-tight">
                  文言背诵
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                  FSRS-5
                </span>
              </div>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map(item => {
                const active = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-semibold"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Right Controls: Scope, Theme, Sound, Menu */}
            <div className="flex items-center gap-2">
              {/* Quick Resume Button in Desktop Bar */}
              {lastSession && currentView !== lastSession.view && (
                <button
                  onClick={() => onResumeSession && onResumeSession(lastSession)}
                  className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200/80 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30 hover:bg-red-100/80 dark:hover:bg-red-900/40 text-xs font-medium text-red-700 dark:text-red-400 transition-colors shadow-2xs"
                  title={`继续上次研习：${lastSession.articleTitle ? `《${lastSession.articleTitle}》` : lastSession.modeName}`}
                >
                  <RotateCcw className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
                  <span className="truncate max-w-[120px]">
                    {lastSession.articleTitle ? `接续《${lastSession.articleTitle}》` : `接续${lastSession.modeName}`}
                  </span>
                </button>
              )}

              {/* Hierarchical Scope Selector Trigger */}
              <button
                onClick={() => setIsScopeModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-colors max-w-[150px] sm:max-w-[210px] truncate"
                title="选择背诵教材范围"
              >
                <BookOpen className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">{currentScopeLabel}</span>
              </button>

              {/* Theme Toggle Button */}
              <button
                onClick={handleThemeToggle}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title={theme === "dark" ? "切换至浅色模式" : "切换至深色模式"}
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Audio Toggle Button */}
              <button
                onClick={onToggleSound}
                title={soundEnabled ? "编钟音效已开启（点击静音）" : "音效已静音（点击开启）"}
                className={`p-1.5 rounded-lg border transition-colors ${
                  soundEnabled
                    ? "border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Mobile Secondary Menu Toggle */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="菜单"
              >
                {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
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

      {/* Mobile Fixed Bottom Dock (Human-ergonomic Thumb Zone, >= 48px hit area) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 pb-[env(safe-area-inset-bottom)] transition-colors">
        <div className="grid grid-cols-5 h-14">
          {mobileDockItems.map(item => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-colors select-none ${
                  active
                    ? "text-zinc-900 dark:text-zinc-100 font-semibold"
                    : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                <div
                  className={`p-1 rounded-md transition-colors ${
                    active ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" : ""
                  }`}
                >
                  {item.icon}
                </div>
                <span className="text-[10px] mt-0.5 leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
