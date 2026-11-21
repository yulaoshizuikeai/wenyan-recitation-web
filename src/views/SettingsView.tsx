import React, { useState } from "react";
import { sound } from "../sound/audioSynthesizer";
import { resetAllProgress, getAllCardStates, getDailyRecords, getSetting, setSetting } from "../storage/db";
import { Settings as SettingsIcon, Sliders, Download, Upload, Trash2, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";

export const SettingsView: React.FC = () => {
  const [retention, setRetention] = useState<number>(0.93);
  const [factor, setFactor] = useState<number>(0.72);
  const [dailyNewLimit, setDailyNewLimit] = useState<number>(20);
  const [dailyReviewLimit, setDailyReviewLimit] = useState<number>(100);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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
      version: "1.0.0",
      exportTime: new Date().toISOString(),
      cards,
      records
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wenyan_recitation_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = async () => {
    sound.playWrong();
    await resetAllProgress();
    setShowResetConfirm(false);
    window.location.reload();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-3xl p-6 shadow-sm">
        <h1 className="text-2xl font-bold font-serif text-[#232120] flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-[#9E2A2B]" />
          系统与算法设置
        </h1>
        <p className="text-xs text-[#5C5855] mt-1">
          文言背诵运行在纯前端离线环境中，所有 FSRS 记忆指标均保存在本地 IndexedDB 中。
        </p>
      </div>

      {/* FSRS Settings */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-3xl p-6 shadow-sm space-y-5">
        <h2 className="text-base font-bold text-[#232120] flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#2B5C8F]" />
          FSRS-5 间隔重复算法参数
        </h2>

        <div className="space-y-4 text-xs">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-semibold text-[#232120]">期望记忆保留率 (Request Retention)</label>
              <span className="font-bold text-[#2B5C8F]">{Math.round(retention * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.70}
              max={0.98}
              step={0.01}
              value={retention}
              onChange={e => setRetention(parseFloat(e.target.value))}
              className="w-full accent-[#2B5C8F]"
            />
            <p className="text-[11px] text-[#8C8884] mt-0.5">推荐 90%~93%，值越高复习频次越密集。</p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-semibold text-[#232120]">古文长篇背诵稳定性因子 (Stability Factor)</label>
              <span className="font-bold text-[#2B5C8F]">{factor.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.4}
              max={1.2}
              step={0.02}
              value={factor}
              onChange={e => setFactor(parseFloat(e.target.value))}
              className="w-full accent-[#2B5C8F]"
            />
            <p className="text-[11px] text-[#8C8884] mt-0.5">针对中国古诗文字句连贯特点优化，推荐 0.72。</p>
          </div>
        </div>

        <div className="pt-2 border-t border-[#F0EDE1] flex justify-end">
          <button
            onClick={handleSaveSettings}
            className="px-5 py-2.5 rounded-xl bg-[#2B5C8F] hover:bg-[#1E3F63] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
          >
            {savedSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-300" /> : <ShieldCheck className="w-4 h-4" />}
            {savedSuccess ? "参数已保存" : "保存算法配置"}
          </button>
        </div>
      </div>

      {/* Daily Goals */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-3xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-[#232120]">每日学习目标与配额</h2>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-[#232120] mb-1">每日新卡学习上限</label>
            <input
              type="number"
              value={dailyNewLimit}
              onChange={e => setDailyNewLimit(parseInt(e.target.value) || 20)}
              className="w-full px-3 py-2 rounded-xl border border-[#D5CFBD] bg-[#FAF7F0] focus:bg-white text-sm font-bold text-[#232120]"
            />
          </div>
          <div>
            <label className="block font-semibold text-[#232120] mb-1">每日到期复习上限</label>
            <input
              type="number"
              value={dailyReviewLimit}
              onChange={e => setDailyReviewLimit(parseInt(e.target.value) || 100)}
              className="w-full px-3 py-2 rounded-xl border border-[#D5CFBD] bg-[#FAF7F0] focus:bg-white text-sm font-bold text-[#232120]"
            />
          </div>
        </div>
      </div>

      {/* Backup and Data Maintenance */}
      <div className="bg-white/90 backdrop-blur border border-[#E3DEC3] rounded-3xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-[#232120]">离线数据备份与维护</h2>
        <p className="text-xs text-[#5C5855]">
          您可以随时将学习足迹和记忆库导出为 JSON 备份文件，或在更换设备时导入。
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportData}
            className="flex-1 py-2.5 px-4 rounded-xl border border-[#D5CFBD] bg-[#FAF7F0] hover:bg-[#F0EDE1] text-xs font-bold text-[#232120] flex items-center justify-center gap-1.5 transition-all"
          >
            <Download className="w-4 h-4 text-[#2C4F3D]" />
            导出学习记忆备份 (.json)
          </button>

          <button
            onClick={() => {
              setShowResetConfirm(true);
            }}
            className="py-2.5 px-4 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-bold text-red-600 flex items-center gap-1.5 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            重置记忆库
          </button>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border-2 border-red-500 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-center text-[#232120]">确认重置所有背诵记录？</h3>
            <p className="text-xs text-center text-[#5C5855] mt-1 mb-5">
              此操作将清除本地所有的 FSRS 卡片记忆状态、复习日志和打卡天数，且不可撤销！
            </p>
            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#D5CFBD] font-bold text-[#5C5855]"
              >
                取消
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
