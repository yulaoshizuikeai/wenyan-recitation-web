import React, { Suspense } from "react";
import { Navbar } from "./components/Navbar";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { CommandPalette } from "./components/CommandPalette";
import { PwaUpdateToast } from "./components/PwaUpdateToast";
import { DashboardView } from "./views/DashboardView";
import { StudyAppProvider, useStudyApp } from "./state/StudyAppContext";
import { useWorkspaceShortcuts } from "./hooks/useWorkspaceShortcuts";

const SnowballView = React.lazy(() => import("./views/SnowballView").then(m => ({ default: m.SnowballView })));
const FlipCardView = React.lazy(() => import("./views/FlipCardView").then(m => ({ default: m.FlipCardView })));
const ClozeView = React.lazy(() => import("./views/ClozeView").then(m => ({ default: m.ClozeView })));
const ScenarioView = React.lazy(() => import("./views/ScenarioView").then(m => ({ default: m.ScenarioView })));
const CramModeView = React.lazy(() => import("./views/CramModeView").then(m => ({ default: m.CramModeView })));
const CatalogView = React.lazy(() => import("./views/CatalogView").then(m => ({ default: m.CatalogView })));
const SettingsView = React.lazy(() => import("./views/SettingsView").then(m => ({ default: m.SettingsView })));

class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode; resetKey?: string }) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || "页面资源加载失败",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ViewErrorBoundary]", error, info);
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: "" });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-lg mx-auto my-16 px-6 py-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center space-y-4 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            视图加载遇到问题
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            可能是版本更新后旧缓存未刷新，或网络暂时中断所致。请重新加载页面恢复使用。
          </p>
          {this.state.errorMessage && (
            <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 break-all">
              {this.state.errorMessage}
            </p>
          )}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity cursor-pointer"
            >
              重新加载页面
            </button>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: "" })}
              className="px-4 py-2 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              重试当前视图
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function ViewLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-xs text-zinc-400 dark:text-zinc-500">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse" />
        <span>正在加载学习视图…</span>
      </div>
    </div>
  );
}

function AppShell() {
  const {
    currentView,
    selectedScope,
    activeArticleId,
    theme,
    soundEnabled,
    showShortcuts,
    showCommandPalette,
    localModalCount,
    setCurrentView,
    setSelectedScope,
    setTheme,
    toggleSound,
    toggleShortcuts,
    setShowShortcuts,
    toggleCommandPalette,
    setShowCommandPalette,
    navigateToArticle,
  } = useStudyApp();

  // 全局统一快捷键调度：? 快捷键帮助、Cmd/Ctrl + K 命令面板、Alt + 1~8 视图切换
  useWorkspaceShortcuts({
    onToggleShortcuts: toggleShortcuts,
    onToggleCommandPalette: toggleCommandPalette,
    onSwitchView: setCurrentView,
    isModalOpen: showShortcuts || showCommandPalette || localModalCount > 0,
    canToggleCommandPalette: showCommandPalette || (!showShortcuts && localModalCount === 0),
  });

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1 pb-10">
        {currentView === "dashboard" && <DashboardView />}

        <ViewErrorBoundary resetKey={currentView}>
          <Suspense fallback={<ViewLoadingFallback />}>
            {currentView === "cram" && <CramModeView />}
            {currentView === "snowball" && <SnowballView />}
            {currentView === "flipcard" && <FlipCardView />}
            {currentView === "cloze" && <ClozeView />}
            {currentView === "scenario" && <ScenarioView />}
            {currentView === "catalog" && <CatalogView />}
            {currentView === "settings" && <SettingsView />}
          </Suspense>
        </ViewErrorBoundary>
      </main>

      {/* Minimal Footer (hidden on mobile to make room for bottom dock) */}
      <footer className="hidden lg:block border-t border-zinc-200 dark:border-zinc-800 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500 transition-colors">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-medium text-zinc-600 dark:text-zinc-400">
            文言背诵 · 现代高中语文古诗文 FSRS-5 间隔重复与长篇滚动式背诵系统
          </p>
          <p className="text-[11px]">
            100% 纯前端离线应用 ｜ 数据完全保存在本地浏览器 IndexedDB ｜ 适合部署于 Cloudflare Pages / Workers
          </p>
        </div>
      </footer>

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        currentView={currentView}
        selectedScope={selectedScope}
        theme={theme}
        soundEnabled={soundEnabled}
        activeArticleId={activeArticleId}
        onSelectView={setCurrentView}
        onSelectArticle={navigateToArticle}
        onSelectScope={setSelectedScope}
        onThemeChange={setTheme}
        onToggleSound={toggleSound}
      />

      <ShortcutHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <PwaUpdateToast />
    </div>
  );
}

export function App() {
  return (
    <StudyAppProvider>
      <AppShell />
    </StudyAppProvider>
  );
}

export default App;
