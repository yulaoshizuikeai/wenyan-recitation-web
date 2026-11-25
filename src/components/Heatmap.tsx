import React from "react";
import { Zap, Clock } from "lucide-react";
import { getLocalDateString } from "../utils/date";

interface HeatmapProps {
  records: { date: string; count: number }[];
  streak: number;
  totalReviews: number;
}

export const Heatmap: React.FC<HeatmapProps> = ({ records, streak, totalReviews }) => {
  // Generate last 14 weeks (98 days)
  const days: { dateStr: string; count: number; dayOfWeek: number }[] = [];
  const recordMap = new Map<string, number>();
  for (const r of records) {
    recordMap.set(r.date, r.count);
  }

  const today = new Date();
  const numDays = 98; // 14 weeks * 7 days

  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    const count = recordMap.get(dateStr) || 0;
    days.push({
      dateStr,
      count,
      dayOfWeek: d.getDay()
    });
  }

  // Group into columns of 7 days (weeks)
  const weeks: (typeof days)[] = [];
  let currentWeek: typeof days = [];

  for (const day of days) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  const getColorClass = (count: number) => {
    if (count === 0) return "bg-zinc-100 dark:bg-zinc-800/80 hover:ring-1 hover:ring-zinc-400";
    if (count < 5) return "bg-emerald-200 dark:bg-emerald-900/60 hover:ring-1 hover:ring-emerald-400";
    if (count < 15) return "bg-emerald-400 dark:bg-emerald-700 hover:ring-1 hover:ring-emerald-300";
    if (count < 30) return "bg-emerald-600 dark:bg-emerald-500 hover:ring-1 hover:ring-emerald-200";
    return "bg-emerald-800 dark:bg-emerald-400 hover:ring-1 hover:ring-emerald-200";
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-100"></span>
            <span>研墨足迹 · 近百日背诵强度</span>
          </h3>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">每日保持温习，积跬步以致千里</p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <Zap className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
            <span className="text-zinc-500 dark:text-zinc-400">连续坚持</span>
            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{streak} 天</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <Clock className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
            <span className="text-zinc-500 dark:text-zinc-400">累计复习</span>
            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{totalReviews} 次</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-1">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1">
              {week.map((d, dIdx) => (
                <div
                  key={dIdx}
                  title={`${d.dateStr}: 背诵 ${d.count} 次`}
                  className={`w-3 h-3 rounded-xs transition-colors cursor-pointer ${getColorClass(
                    d.count
                  )}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
        <span>14 周前</span>
        <div className="flex items-center gap-1">
          <span>少</span>
          <div className="w-2.5 h-2.5 rounded-xs bg-zinc-100 dark:bg-zinc-800"></div>
          <div className="w-2.5 h-2.5 rounded-xs bg-emerald-200 dark:bg-emerald-900/60"></div>
          <div className="w-2.5 h-2.5 rounded-xs bg-emerald-400 dark:bg-emerald-700"></div>
          <div className="w-2.5 h-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-500"></div>
          <div className="w-2.5 h-2.5 rounded-xs bg-emerald-800 dark:bg-emerald-400"></div>
          <span>多</span>
        </div>
        <span>今日</span>
      </div>
    </div>
  );
};
