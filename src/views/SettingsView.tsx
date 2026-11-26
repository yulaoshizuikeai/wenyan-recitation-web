import React, { useState, useEffect, useRef } from "react";
import { sound } from "../sound/audioSynthesizer";
import { resetAllProgress, getSetting, exportAllProgress, importAllProgress, BackupData } from "../storage/db";
import { studyStore } from "../storage/studyStore";
import { getFsrsSettings, saveFsrsSettings } from "../domain/fsrs/fsrsEngine";
import { ankiScheduler } from "../domain/fsrs/ankiScheduler";
import { getLocalDateString } from "../utils/date";
import { AppTheme, toggleTheme } from "../utils/theme";
import { useLastSession, formatRelativeTime } from "../storage/sessionTracker";
import { useOptionalStudyApp, useRegisterModalOpen } from "../state/StudyAppContext";
import {
  Settings as SettingsIcon,
  Sliders,
  Download,
  Upload,
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

export const SettingsView: React.FC<SettingsViewProps> = ({
  theme: propTheme,
  onThemeChange: propOnThemeChange
}) => {
  const appCtx = useOptionalStudyApp();
  const theme = propTheme ?? appCtx?.theme ?? "light";
  const onThemeChange = propOnThemeChange ?? appCtx?.setTheme;
  const [retention, setRetention] = useState<number>(0.93);
  const [factor, setFactor] = useState<number>(0.72);
  const [dailyNewLimitInput, setDailyNewLimitInput] = useState<string>("20");
  const [dailyReviewLimitInput, setDailyReviewLimitInput] = useState<string>("100");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [autoResume, setAutoResume] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { lastSession, clearSession } = useLastSession();

  useRegisterModalOpen(showResetConfirm);

  const parseAndClampInt = (raw: string, fallback: number, min: number, max: number): number => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;
    getSetting<boolean>("auto_resume_on_startup", false).then(val => {
      if (!cancelled) setAutoResume(val);
    });
    getFsrsSettings().then(s => {
      if (!cancelled) {
        setRetention(s.requestRetention);
        setFactor(s.recitationStabilityFactor);
      }
    });
    ankiScheduler.getSettings().then(s => {
      if (!cancelled) {
        setDailyNewLimitInput(String(s.dailyNewLimit));
        setDailyReviewLimitInput(String(s.dailyReviewLimit));
      }
    });
    return () => {
      cancelled = true;
      isMountedRef.current = false;
      if (savedTimerRef.current !== null) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showResetConfirm) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowResetConfirm(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showResetConfirm]);

  const handleToggleAutoResume = (val: boolean) => {
    setAutoResume(val);
    studyStore.setSettingValue("auto_resume_on_startup", val);
  };

  const handleSaveSettings = async () => {
    const clampedNewLimit = parseAndClampInt(dailyNewLimitInput, 20, 5, 100);
    const clampedReviewLimit = parseAndClampInt(dailyReviewLimitInput, 100, 20, 500);
    setDailyNewLimitInput(String(clampedNewLimit));
    setDailyReviewLimitInput(String(clampedReviewLimit));

    await saveFsrsSettings({
      requestRetention: retention,
      recitationStabilityFactor: factor
    });
    const existing = await ankiScheduler.getSettings();
    await ankiScheduler.saveSettings({
      ...existing,
      dailyNewLimit: clampedNewLimit,
      dailyReviewLimit: clampedReviewLimit
    });

    if (!isMountedRef.current) return;
    setSavedSuccess(true);
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = setTimeout(() => {
      savedTimerRef.current = null;
      setSavedSuccess(false);
    }, 2000);
  };

  const handleExportData = async () => {
    await studyStore.flush();
    const exportObj = await exportAllProgress();

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wenyan_backup_${getLocalDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupData;
      const result = await importAllProgress(parsed);
      await studyStore.refreshFromDB();
      if (!isMountedRef.current) return;

      // Reload settings displayed in SettingsView immediately after restore
      getSetting<boolean>("auto_resume_on_startup", false).then(val => {
        if (isMountedRef.current) setAutoResume(val);
      });
      getFsrsSettings().then(s => {
        if (isMountedRef.current) {
          setRetention(s.requestRetention);
          setFactor(s.recitationStabilityFactor);
        }
      });
      ankiScheduler.getSettings().then(s => {
        if (isMountedRef.current) {
          setDailyNewLimitInput(String(s.dailyNewLimit));
          setDailyReviewLimitInput(String(s.dailyReviewLimit));
        }
      });

      const parts = [
        `${result.cardsImported} 张卡片进度`,
        `${result.recordsImported} 条打卡记录`
      ];
      if (result.logsImported > 0) parts.push(`${result.logsImported} 条复习日志`);
      if (result.bottlenecksImported > 0) parts.push(`${result.bottlenecksImported} 篇卡壳标记`);
      if (result.settingsImported > 0) parts.push(`${result.settingsImported} 项参数设置`);
      if (result.preferencesRestored > 0) parts.push(`${result.preferencesRestored} 项学习偏好`);

      setImportStatus({
        type: "success",
        message: `恢复成功 (v${result.version})：已导入 ${parts.join("、")}`
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      setImportStatus({
        type: "error",
        message: err instanceof Error ? `导入失败：${err.message}` : "导入失败：JSON 文件格式无效"
      });
    }
  };

  const handleReset = async () => {
    sound.playWrong();
    await resetAllProgress();
    await studyStore.refreshFromDB();
    setShowResetConfirm(false);
    window.location.reload();
  };

  const handleTestSound = () => {
    const wasEnabled = sound.enabled;
    sound.enabled = true;
    sound.playCorrect();
    sound.enabled = wasEnabled;
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
                value={dailyNewLimitInput}
                onChange={e => setDailyNewLimitInput(e.target.value)}
                onBlur={() =>
                  setDailyNewLimitInput(String(parseAndClampInt(dailyNewLimitInput, 20, 5, 100)))
                }
                className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 text-xs font-mono text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="font-medium text-zinc-800 dark:text-zinc-200 block mb-1">每日温习上限</label>
              <input
                type="number"
                min={20}
                max={500}
                value={dailyReviewLimitInput}
                onChange={e => setDailyReviewLimitInput(e.target.value)}
                onBlur={() =>
                  setDailyReviewLimitInput(String(parseAndClampInt(dailyReviewLimitInput, 100, 20, 500)))
                }
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

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportData}
            className="flex-1 min-w-[130px] py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出备份 JSON</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 min-w-[130px] py-2 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>导入恢复 JSON</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportData}
            className="hidden"
          />

          <button
            onClick={() => setShowResetConfirm(true)}
            className="py-2 px-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 hover:bg-red-100/50 text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>重置数据</span>
          </button>
        </div>

        {importStatus && (
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center gap-1.5 ${
              importStatus.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900"
                : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900"
            }`}
          >
            {importStatus.type === "success" ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{importStatus.message}</span>
          </div>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowResetConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="确认清空所有背诵记忆数据"
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
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
