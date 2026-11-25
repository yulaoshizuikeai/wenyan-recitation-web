import React, { useState, useEffect, useRef, Suspense } from "react";
import { Navbar, NavView, NAV_SHORTCUT_ORDER } from "./components/Navbar";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { DashboardView } from "./views/DashboardView";
import { sound } from "./sound/audioSynthesizer";
import { getSetting, setSetting } from "./storage/db";
import { getStoredTheme, applyTheme, AppTheme } from "./utils/theme";
import { useLastSession, LastSessionState, SessionExtra, VALID_NAV_VIEWS, getLastSession } from "./storage/sessionTracker";
import { ALL_ARTICLES } from "./data/curriculumData";

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
  const [showShortcuts, setShowShortcuts] = useState(false);
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

  // Global keyboard shortcuts: Alt + 1~8 switches views, ? opens the shortcut sheet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const digit = e.code.startsWith("Digit") ? e.code.slice(5) : "";
        const matched = NAV_SHORTCUT_ORDER.find(s => s.key === digit);
        if (matched) {
          e.preventDefault();
          setResumeExtra(undefined);
          setCurrentView(matched.view);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
        onShowShortcuts={() => setShowShortcuts(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-10">
        {currentView === "dashboard" && (
          <DashboardView
            onNavigate={setCurrentView}
            onOpenArticleInView={handleOpenArticleInView}
            onResumeSession={handleResumeLastSession}
            selectedScope={selectedScope}
          />
        )}

        <Suspense fallback={<ViewLoadingFallback />}>
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
              onOpenArticleInView={handleOpenArticleInView}
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

      <ShortcutHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

export default App;
