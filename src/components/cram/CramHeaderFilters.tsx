/**
 * CramHeaderFilters — top banner, mode switcher, mastery counter,
 * volume/module filter tabs, search input, weak-only toggle, shuffle/mask controls.
 */
import React from "react";
import {
  Flame,
  Eye,
  EyeOff,
  List,
  CreditCard,
  Search,
  AlertTriangle,
  Shuffle,
  XCircle,
} from "lucide-react";

interface ModuleOption {
  id: string;
  name: string;
  count: number;
}

interface CramHeaderFiltersProps {
  viewStyle: "card" | "list";
  onChangeViewStyle: (style: "card" | "list") => void;
  masteredCount: number;
  totalVersesCount: number;
  moduleOptions: ModuleOption[];
  activeModule: string;
  onSelectModule: (moduleId: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onlyWeak: boolean;
  onToggleOnlyWeak: () => void;
  weakCount: number;
  isShuffled: boolean;
  onToggleShuffle: () => void;
  isListMasked: boolean;
  onToggleListMasked: () => void;
}

export const CramHeaderFilters: React.FC<CramHeaderFiltersProps> = ({
  viewStyle,
  onChangeViewStyle,
  masteredCount,
  totalVersesCount,
  moduleOptions,
  activeModule,
  onSelectModule,
  searchQuery,
  onSearchChange,
  onlyWeak,
  onToggleOnlyWeak,
  weakCount,
  isShuffled,
  onToggleShuffle,
  isListMasked,
  onToggleListMasked,
}) => {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xs transition-colors">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-600 dark:text-red-400">
            <Flame className="w-3.5 h-3.5" />
            <span>考前抱佛脚 · 高频名句情境默写</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            核心金句速查与理解性默写
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            收录高考新课标高频必考核心句，紧扣情境导引、采分下联与字形排雷，考前 15 分钟快速过关。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs font-medium">
            <button
              onClick={() => onChangeViewStyle("card")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                viewStyle === "card"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>极速刷句卡片</span>
            </button>
            <button
              onClick={() => onChangeViewStyle("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                viewStyle === "list"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>急救速查清单</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs">
            <span className="text-zinc-400">已过关:</span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              {masteredCount}
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="font-mono text-zinc-600 dark:text-zinc-300">{totalVersesCount}</span>
          </div>
        </div>
      </div>

      {/* Volume / Semester Filter Tabs */}
      <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {moduleOptions.map((mod) => {
            const isActive = activeModule === mod.id;
            return (
              <button
                key={mod.id}
                onClick={() => onSelectModule(mod.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors ${
                  isActive
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-2xs"
                    : "bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700/80"
                }`}
              >
                <span>{mod.name}</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900 font-bold"
                      : "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {mod.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search & Bottleneck Filter Row */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索金句、作者、篇目或情境关键词..."
            className="w-full pl-8.5 pr-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleOnlyWeak}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              onlyWeak
                ? "bg-amber-500 text-white shadow-2xs"
                : "border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/60"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>仅看考前卡壳/存疑</span>
            {weakCount > 0 && (
              <span className="font-mono text-[10px] px-1 rounded-full bg-white/20 text-white">
                {weakCount}
              </span>
            )}
          </button>

          {viewStyle === "card" && (
            <button
              onClick={onToggleShuffle}
              title="随机乱序"
              className={`p-1.5 rounded-xl border text-xs transition-colors ${
                isShuffled
                  ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>
          )}

          {viewStyle === "list" && (
            <button
              onClick={onToggleListMasked}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {isListMasked ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-zinc-500" />
                  <span>揭开金句全文</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                  <span>一键遮挡 (考前眼动自测)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
