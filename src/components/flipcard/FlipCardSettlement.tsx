/**
 * FlipCardSettlement — completion/settlement screen shown after a session finishes.
 */
import React from "react";
import { Trophy } from "lucide-react";

interface FlipCardSettlementProps {
  completedCount: number;
  enableSessionLoop: boolean;
  dailyNewLimit: number;
  onStartNextGroup: () => void;
  onReturnToDeckHub: () => void;
}

export const FlipCardSettlement: React.FC<FlipCardSettlementProps> = ({
  completedCount,
  enableSessionLoop,
  dailyNewLimit,
  onStartNextGroup,
  onReturnToDeckHub,
}) => {
  return (
    <div className="py-12 text-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-xs animate-in zoom-in-95 duration-150">
      <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center mx-auto mb-3">
        <Trophy className="w-6 h-6 text-amber-500" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">本组背诵圆满完成！</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-5 max-w-sm mx-auto">
        已成功温习 <strong>{completedCount}</strong> 张闪卡。
        {enableSessionLoop && " 错题已在会话内自动反复巩固过关。"}
        FSRS 间隔重复算法已计算下次最佳复习时机。
      </p>

      <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
        <button
          onClick={onStartNextGroup}
          className="py-2.5 px-5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-medium text-xs shadow-sm hover:bg-zinc-800 dark:hover:bg-white"
        >
          开启下一组 (+{dailyNewLimit || 20} 句)
        </button>
        <button
          onClick={onReturnToDeckHub}
          className="py-2.5 px-5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          返回选册牌组列表
        </button>
      </div>
    </div>
  );
};
