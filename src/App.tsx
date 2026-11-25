import React, { Suspense } from "react";
import { Navbar } from "./components/Navbar";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { CommandPalette } from "./components/CommandPalette";
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
    isModalOpen: showShortcuts || showCommandPalette,
  });

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Content Area */}
      <main className="flex-1 pb-10">
        {currentView === "dashboard" && <DashboardView />}

        <Suspense fallback={<ViewLoadingFallback />}>
          {currentView === "cram" && <CramModeView />}
          {currentView === "snowball" && <SnowballView />}
          {currentView === "flipcard" && <FlipCardView />}
          {currentView === "cloze" && <ClozeView />}
          {currentView === "scenario" && <ScenarioView />}
          {currentView === "catalog" && <CatalogView />}
          {currentView === "settings" && <SettingsView />}
        </Suspense>
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
