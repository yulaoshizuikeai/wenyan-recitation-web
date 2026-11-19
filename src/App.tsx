import React, { useState, useEffect } from "react";
import { Navbar, NavView } from "./components/Navbar";
import { DashboardView } from "./views/DashboardView";
import { SnowballView } from "./views/SnowballView";
import { FlipCardView } from "./views/FlipCardView";
import { ClozeView } from "./views/ClozeView";
import { ScenarioView } from "./views/ScenarioView";
import { CatalogView } from "./views/CatalogView";
import { SettingsView } from "./views/SettingsView";
import { sound } from "./sound/audioSynthesizer";
import { getSetting, setSetting } from "./storage/db";

export function App() {
  const [currentView, setCurrentView] = useState<NavView>("dashboard");
  const [selectedScope, setSelectedScope] = useState<string>("ALL");
  const [activeArticleId, setActiveArticleId] = useState<string>("art_bx1_12"); // 劝学
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  useEffect(() => {
    getSetting<string>("selected_scope", "ALL").then(setSelectedScope);
    getSetting<boolean>("sound_enabled", true).then(val => {
      setSoundEnabled(val);
      sound.enabled = val;
    });
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
    setCurrentView(view);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F4EB] text-[#232120] font-serif">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        onSelectView={setCurrentView}
        selectedScope={selectedScope}
        onSelectScope={handleSelectScope}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {currentView === "dashboard" && (
          <DashboardView
            onNavigate={setCurrentView}
            onOpenArticleInView={handleOpenArticleInView}
            selectedScope={selectedScope}
          />
        )}

        {currentView === "snowball" && (
          <SnowballView
            initialArticleId={activeArticleId}
            selectedScope={selectedScope}
          />
        )}

        {currentView === "flipcard" && (
          <FlipCardView selectedScope={selectedScope} />
        )}

        {currentView === "cloze" && (
          <ClozeView
            initialArticleId={activeArticleId}
            selectedScope={selectedScope}
          />
        )}

        {currentView === "scenario" && (
          <ScenarioView />
        )}

        {currentView === "catalog" && (
          <CatalogView
            onOpenArticleInView={handleOpenArticleInView}
            selectedScope={selectedScope}
          />
        )}

        {currentView === "settings" && (
          <SettingsView />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E3DEC3] bg-[#FAF7F0] py-6 text-center text-xs text-[#8C8884]">
        <div className="max-w-7xl mx-auto px-4 space-y-1">
          <p className="font-semibold text-[#5C5855]">
            文言背诵 · 现代高中语文古诗文 FSRS-5 间隔重复与长篇滚雪球串联背诵系统
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
