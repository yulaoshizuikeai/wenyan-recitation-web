import React, { useState, useEffect, useRef } from "react";
import { Navbar, NavView } from "./components/Navbar";
import { DashboardView } from "./views/DashboardView";
import { SnowballView } from "./views/SnowballView";
import { FlipCardView } from "./views/FlipCardView";
import { ClozeView } from "./views/ClozeView";
import { ScenarioView } from "./views/ScenarioView";
import { CramModeView } from "./views/CramModeView";
import { CatalogView } from "./views/CatalogView";
import { SettingsView } from "./views/SettingsView";
import { sound } from "./sound/audioSynthesizer";
import { getSetting, setSetting } from "./storage/db";
import { getStoredTheme, applyTheme, AppTheme } from "./utils/theme";
import { useLastSession, LastSessionState, SessionExtra, VALID_NAV_VIEWS, getLastSession } from "./storage/sessionTracker";
import { ALL_ARTICLES } from "./data/curriculumData";

export function App() {
  const { lastSession } = useLastSession();
  const [currentView, setCurrentView] = useState<NavView>("dashboard");
  const [selectedScope, setSelectedScope] = useState<string>("ALL");
  const [activeArticleId, setActiveArticleId] = useState<string>(() => {
    if (lastSession?.articleId && ALL_ARTICLES.some(a => a.id === lastSession.articleId)) {
      return lastSession.articleId;
    }
    return "art_bx1_12"; // 劝学
  });
  const [resumeExtra, setResumeExtra] = useState<SessionExtra | undefined>(undefined);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const hasAutoResumedRef = useRef<boolean>(false);

  // Apply theme changes to document
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Initial application startup settings (run once on mount)
  useEffect(() => {
    getSetting<string>("selected_scope", "ALL").then(setSelectedScope);
    getSetting<boolean>("sound_enabled", false).then(val => {
      setSoundEnabled(val);
      sound.enabled = val;
    });

    // Check if auto resume on launch is enabled (only once on startup)
    if (!hasAutoResumedRef.current) {
      hasAutoResumedRef.current = true;
      getSetting<boolean>("auto_resume_on_startup", false).then(autoResume => {
        if (autoResume) {
          const session = getLastSession();
          if (session && session.view !== "dashboard") {
            handleResumeLastSession(session);
          }
        }
      });
    }
  }, []);

  const handleSelectScope = (scope: string) => {
    setSelectedScope(scope);
    setSetting("selected_scope", scope);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sound.enabled = next;
    setSetting("sound_enabled", next);
  };

  const handleOpenArticleInView = (articleId: string, view: NavView) => {
    setActiveArticleId(articleId);
    setResumeExtra(undefined);
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleResumeLastSession = (session: LastSessionState) => {
    if (!VALID_NAV_VIEWS.has(session.view)) {
      setCurrentView("dashboard");
      return;
    }
    if (session.articleId && ALL_ARTICLES.some(a => a.id === session.articleId)) {
      setActiveArticleId(session.articleId);
    }
    setResumeExtra(session.extra);
    setCurrentView(session.view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        onSelectView={setCurrentView}
        selectedScope={selectedScope}
        onSelectScope={handleSelectScope}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        theme={theme}
        onThemeChange={setTheme}
        lastSession={lastSession}
        onResumeSession={handleResumeLastSession}
      />

      {/* Main Content Area (padding-bottom accounts for mobile bottom dock) */}
      <main className="flex-1 pb-20 lg:pb-10">
        {currentView === "dashboard" && (
          <DashboardView
            onNavigate={setCurrentView}
            onOpenArticleInView={handleOpenArticleInView}
            onResumeSession={handleResumeLastSession}
            selectedScope={selectedScope}
          />
        )}

        {currentView === "cram" && (
          <CramModeView
            onOpenArticleInView={handleOpenArticleInView}
            resumeExtra={resumeExtra}
          />
        )}

        {currentView === "snowball" && (
          <SnowballView
            initialArticleId={activeArticleId}
            selectedScope={selectedScope}
            resumeExtra={resumeExtra}
          />
        )}

        {currentView === "flipcard" && (
          <FlipCardView
            initialArticleId={activeArticleId}
            selectedScope={selectedScope}
            resumeExtra={resumeExtra}
            onOpenArticleInView={handleOpenArticleInView}
          />
        )}

        {currentView === "cloze" && (
          <ClozeView
            initialArticleId={activeArticleId}
            selectedScope={selectedScope}
            resumeExtra={resumeExtra}
          />
        )}

        {currentView === "scenario" && (
          <ScenarioView
            resumeExtra={resumeExtra}
          />
        )}

        {currentView === "catalog" && (
          <CatalogView
            initialArticleId={activeArticleId}
            resumeExtra={resumeExtra}
            onOpenArticleInView={handleOpenArticleInView}
            onResumeSession={handleResumeLastSession}
            selectedScope={selectedScope}
          />
        )}

        {currentView === "settings" && (
          <SettingsView
            theme={theme}
            onThemeChange={setTheme}
          />
        )}
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
    </div>
  );
}

export default App;
