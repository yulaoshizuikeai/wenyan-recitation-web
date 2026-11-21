import React, { useState } from "react";
import { Volume2, VolumeX, BookOpen, Layers, Sparkles, HelpCircle, Settings as SettingsIcon, Menu, X, Award, Eye } from "lucide-react";
import { MODULES } from "../data/curriculumData";

export type NavView = "dashboard" | "snowball" | "flipcard" | "cloze" | "scenario" | "catalog" | "settings";

interface NavbarProps {
  currentView: NavView;
  onSelectView: (view: NavView) => void;
  selectedScope: string; // 'ALL' | 'GAOKAO72' | 'BX_ALL' | 'XB_ALL' | moduleId
  onSelectScope: (scope: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onSelectView,
  selectedScope,
  onSelectScope,
  soundEnabled,
  onToggleSound
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScopeMenuOpen, setIsScopeMenuOpen] = useState(false);

  const navItems: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "研墨看板", icon: <Award className="w-4 h-4" /> },
    { id: "snowball", label: "长卷滚雪球", icon: <Layers className="w-4 h-4" /> },
    { id: "flipcard", label: "翻转闪卡", icon: <Sparkles className="w-4 h-4" /> },
    { id: "cloze", label: "渐进遮挡", icon: <Eye className="w-4 h-4" /> },
    { id: "scenario", label: "高考默写", icon: <HelpCircle className="w-4 h-4" /> },
    { id: "catalog", label: "诗文典库", icon: <BookOpen className="w-4 h-4" /> },
    { id: "settings", label: "设置", icon: <SettingsIcon className="w-4 h-4" /> }
  ];

  const scopeOptions = [
    { id: "ALL", label: "全部 11 册教材 (100篇)" },
    { id: "GAOKAO72", label: "★ 高考 72 篇必背" },
    { id: "BX_ALL", label: "必修全套 (36篇)" },
    { id: "XB_ALL", label: "选择性必修全套 (35篇)" },
    ...MODULES.map(m => ({ id: m.id, label: `${m.name} (${m.totalArticles}篇)` }))
  ];

  const currentScopeLabel = scopeOptions.find(o => o.id === selectedScope)?.label || "自选教材范围";

  const handleNavClick = (view: NavView) => {
    onSelectView(view);
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-[#F7F4EB]/95 backdrop-blur border-b border-[#E3DEC3] transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Seal */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleNavClick("dashboard")}>
            <div className="w-9 h-9 rounded-lg bg-[#9E2A2B] text-[#F7F4EB] flex items-center justify-center font-serif font-black text-xl shadow-sm border border-[#7A1E1F]">
              诵
            </div>
            <div>
              <div className="font-serif font-bold text-lg text-[#232120] tracking-wide flex items-center gap-2">
                文言背诵
                <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-[#9E2A2B]/10 text-[#9E2A2B] font-semibold border border-[#9E2A2B]/20">
                  FSRS-5
                </span>
              </div>
              <div className="text-[10px] text-[#5C5855] hidden sm:block -mt-0.5">
                高中课标古诗文 · 滚雪球串联记忆
              </div>
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
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? "bg-[#9E2A2B] text-white shadow-sm font-bold"
                      : "text-[#5C5855] hover:text-[#232120] hover:bg-[#EAE5D4]/70"
                  }`}
                >
                  {item.icon}
                  {item.label}
                  {item.id === "snowball" && (
                    <span className="text-[10px] px-1 py-0.2 rounded bg-amber-400 text-amber-950 font-bold ml-0.5">
                      推荐
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Scope Selector & Controls */}
          <div className="flex items-center gap-2">
            {/* Book Scope Selector dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsScopeMenuOpen(!isScopeMenuOpen);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D5CFBD] bg-white/70 hover:bg-white text-xs font-semibold text-[#232120] shadow-2xs transition-all max-w-[140px] sm:max-w-[200px] truncate"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#9E2A2B] shrink-0" />
                <span className="truncate">{currentScopeLabel}</span>
              </button>

              {isScopeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsScopeMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-64 max-h-80 overflow-y-auto bg-white rounded-xl shadow-xl border border-[#E3DEC3] z-40 py-1.5 text-xs">
                    <div className="px-3 py-1 font-bold text-[#8C8884] border-b border-[#F0EDE1]">
                      自选背诵教材范围
                    </div>
                    {scopeOptions.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => {
                          onSelectScope(opt.id);
                          setIsScopeMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-[#F7F4EB] transition-colors ${
                          selectedScope === opt.id ? "font-bold text-[#9E2A2B] bg-[#9E2A2B]/5" : "text-[#232120]"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {selectedScope === opt.id && <span className="text-[#9E2A2B]">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Audio Toggle */}
            <button
              onClick={onToggleSound}
              title={soundEnabled ? "音效已开启（点击静音）" : "音效已静音（点击开启）"}
              className={`p-2 rounded-lg border transition-all ${
                soundEnabled
                  ? "border-[#D5CFBD] bg-white/70 text-[#2C4F3D] hover:bg-white"
                  : "border-red-200 bg-red-50 text-red-500 hover:bg-red-100"
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(!isMobileMenuOpen);
              }}
              className="lg:hidden p-2 rounded-lg border border-[#D5CFBD] bg-white/70 text-[#232120]"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-[#E3DEC3] bg-[#F7F4EB] px-4 pt-2 pb-4 space-y-1">
          {navItems.map(item => {
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? "bg-[#9E2A2B] text-white font-bold"
                    : "text-[#5C5855] hover:text-[#232120] hover:bg-[#EAE5D4]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {item.icon}
                  {item.label}
                </div>
                {item.id === "snowball" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 font-bold">
                    核心推荐
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
