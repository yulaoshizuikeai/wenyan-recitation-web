import React, { useState, useEffect } from "react";
import { sound } from "../sound/audioSynthesizer";
import { resetAllProgress, getAllCardStates, getDailyRecords, setSetting, getSetting } from "../storage/db";
import { AppTheme, toggleTheme } from "../utils/theme";
import { useLastSession, formatRelativeTime } from "../storage/sessionTracker";
import {
  Settings as SettingsIcon,
  Sliders,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sun,
  Moon,
  Volume2,
  History,
  RotateCcw
} from "lucide-react";

interface SettingsViewProps {
  theme?: AppTheme;
  onThemeChange?: (theme: AppTheme) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ theme = "light", onThemeChange }) => {
  const [retention, setRetention] = useState<number>(0.93);
  const [factor, setFactor] = useState<number>(0.72);
  const [dailyNewLimit, setDailyNewLimit] = useState<number>(20);
  const [dailyReviewLimit, setDailyReviewLimit] = useState<number>(100);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [autoResume, setAutoResume] = useState<boolean>(false);
  const { lastSession, clearSession } = useLastSession();

  useEffect(() => {
    getSetting<boolean>("auto_resume_on_startup", false).then(setAutoResume);
  }, []);

  const handleToggleAutoResume = (val: boolean) => {
    setAutoResume(val);
    setSetting("auto_resume_on_startup", val);
  };

  const handleSaveSettings = () => {
    setSetting("fsrs_retention", retention);
    setSetting("fsrs_factor", factor);
    setSetting("daily_new_limit", dailyNewLimit);
    setSetting("daily_review_limit", dailyReviewLimit);

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleExportData = async () => {
    const cards = await getAllCardStates();
    const records = await getDailyRecords();
    const exportObj = {
      version: "2.0.0",
      exportTime: new Date().toISOString(),
      cards,
      records
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wenyan_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = async () => {
    sound.playWrong();
    await resetAllProgress();
    setShowResetConfirm(false);
    window.location.reload();
  };

  const handleTestSound = () => {
    sound.enabled = true;
    sound.playCorrect();
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-5 space-y-4 pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs transition-colors">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
          <span>系统与算法设置</span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          纯前端离线运行，所有 FSRS 记忆模型与进度均保存在本地浏览器 IndexedDB
        </p>
      </div>

      {/* Theme & Display Settings */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4 transition-colors">
        <h2 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
          视觉与声音偏好
        </h2>

        <div className="flex items-center justify-between text-xs py-1">
          <div>
            <div className="font-medium text-zinc-900 dark:text-zinc-100">界面色彩主题</div>
            <div className="text-[11px] text-zinc-400">现代极简 Zinc 浅色或深暗夜模式</div>
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800">
            <button
              onClick={() => onThemeChange && onThemeChange("light")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                theme === "light"
                  ? "bg-white text-zinc-900 shadow-2xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>浅色冷灰</span>
            </button>
            <button
              onClick={() => onThemeChange && onThemeChange("dark")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                theme === "dark"
                  ? "bg-zinc-900 text-zinc-100 shadow-2xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-100"
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>暗夜深灰</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs py-1 border-t border-zinc-100 dark:border-zinc-800">
          <div>
            <div className="font-medium text-zinc-900 dark:text-zinc-100">Web Audio 原生合成编钟音效</div>
            <div className="text-[11px] text-zinc-400">纯代码数学合成，无需下载外部音频资源</div>
          </div>
          <button
            onClick={handleTestSound}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>试听和弦</span>
          </button>
        </div>
      </div>

      {/* Session & Pick Up Where I Left Off Preferences */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4 transition-colors">
        <h2 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-zinc-500" />
          <span>断点续学与进度记忆</span>
        </h2>

        <div className="flex items-center justify-between text-xs py-1">
          <div>
            <div className="font-medium text-zinc-900 dark:text-zinc-100">启动时直接恢复上次进度</div>
            <div className="text-[11px] text-zinc-400">重新打开应用时直接跳过概览，恢复离开时的背诵模式</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoResume}
              onChange={e => handleToggleAutoResume(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-hidden rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
          </label>
        </div>

        <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between gap-3 text-xs">
          <div className="min-w-0">
            <div className="text-[11px] text-zinc-400">当前记录的最近进度</div>
            {lastSession ? (
              <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate mt-0.5">
                {lastSession.articleTitle ? `《${lastSession.articleTitle}》· ` : ""}{lastSession.modeName} ({lastSession.progressText})
                <span className="text-[10px] text-zinc-400 ml-1.5 font-mono">
                  {formatRelativeTime(lastSession.updatedAt)}
                </span>
              </div>
            ) : (
              <div className="text-zinc-400 mt-0.5">暂无断点记录</div>
            )}
          </div>

          {lastSession && (
            <button
              onClick={() => clearSession()}
              className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shrink-0"
            >
              清除记录
            </button>
          )}
        </div>
      </div>

      {/* FSRS Algorithm Settings */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4 transition-colors">
        <h2 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-zinc-500" />
          <span>FSRS-5 算法调优参数</span>
        </h2>

        <div className="space-y-4 text-xs">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">期望记忆保留率 (Request Retention)</span>
              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{Math.round(retention * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.70}
              max={0.98}
              step={0.01}
              value={retention}
              onChange={e => setRetention(parseFloat(e.target.value))}
              className="w-full accent-zinc-900 dark:accent-zinc-100"
            />
            <p className="text-[11px] text-zinc-400 mt-0.5">
              推荐 90%~93%。设定值越高，算法安排的复习频次越密集。
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">文言长篇稳定性因子 (Stability Factor)</span>
              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{factor.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.4}
              max={1.2}
              step={0.02}
              value={factor}
              onChange={e => setFactor(parseFloat(e.target.value))}
              className="w-full accent-zinc-900 dark:accent-zinc-100"
            />
            <p className="text-[11px] text-zinc-400 mt-0.5">
              推荐 0.72。针对古文起承转合长篇背诵特征的衰减曲线补偿参数。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="font-medium text-zinc-800 dark:text-zinc-200 block mb-1">每日新学句数上限</label>
              <input
                type="number"
                min={5}
                max={100}
                value={dailyNewLimit}
                onChange={e => setDailyNewLimit(parseInt(e.target.value, 10))}
                className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="font-medium text-zinc-800 dark:text-zinc-200 block mb-1">每日温习上限</label>
              <input
                type="number"
                min={20}
                max={500}
                value={dailyReviewLimit}
                onChange={e => setDailyReviewLimit(parseInt(e.target.value, 10))}
                className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            className="w-full py-2.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold text-xs flex items-center justify-center gap-1 transition-all active:scale-[0.98]"
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>配置已保存</span>
              </>
            ) : (
              <span>保存算法参数</span>
            )}
          </button>
        </div>
      </div>

      {/* Local Storage Data Management */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs space-y-3 transition-colors">
        <h2 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
          本地数据管理
        </h2>

        <div className="flex gap-2">
          <button
            onClick={handleExportData}
            className="flex-1 py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出备份 JSON</span>
          </button>

          <button
            onClick={() => setShowResetConfirm(true)}
            className="py-2 px-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 hover:bg-red-100/50 text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>重置数据</span>
          </button>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <h3 className="text-base font-semibold text-center text-zinc-900 dark:text-zinc-100">
              确认清空所有背诵记忆数据？
            </h3>
            <p className="text-xs text-center text-zinc-500 dark:text-zinc-400 mt-1 mb-5">
              此操作将完全抹去本地 IndexedDB 中的所有卡片稳定性、学习打卡日志与卡壳标记，不可逆。
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                取消
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs"
              >
                确认彻底清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
