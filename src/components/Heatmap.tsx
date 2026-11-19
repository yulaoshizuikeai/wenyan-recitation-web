import React from "react";

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
    const dateStr = d.toISOString().slice(0, 10);
    const count = recordMap.get(dateStr) || 0;
    days.push({
      dateStr,
      count,
      dayOfWeek: d.getDay() // 0 = Sun, 1 = Mon ...
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
    if (count === 0) return "bg-[#EAE5D4] hover:border-[#9E2A2B]/40";
    if (count < 5) return "bg-[#8CA897] hover:border-[#2C4F3D]";
    if (count < 15) return "bg-[#558269] hover:border-[#2C4F3D]";
    if (count < 30) return "bg-[#336148] hover:border-[#2C4F3D]";
    return "bg-[#1E432F] hover:border-[#2C4F3D]"; // deep ink bamboo
  };

  return (
    <div className="bg-white/80 backdrop-blur border border-[#E3DEC3] rounded-2xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-bold text-[#232120] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#9E2A2B]"></span>
            研墨足迹 · 近百日背诵热力图
          </h3>
          <p className="text-xs text-[#5C5855] mt-0.5">坚持每日诵读，积跬步以致千里</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 bg-[#FAF7F0] px-3 py-1.5 rounded-lg border border-[#E3DEC3]">
            <span className="text-base">🔥</span>
            <span className="text-[#5C5855]">连续打卡</span>
            <span className="font-bold text-[#9E2A2B] text-sm">{streak} 天</span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#FAF7F0] px-3 py-1.5 rounded-lg border border-[#E3DEC3]">
            <span className="text-base">📜</span>
            <span className="text-[#5C5855]">累计复习</span>
            <span className="font-bold text-[#232120] text-sm">{totalReviews} 次</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="inline-flex gap-1.5">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1.5">
              {week.map((d, dIdx) => (
                <div
                  key={dIdx}
                  title={`${d.dateStr}: 背诵 ${d.count} 次`}
                  className={`w-3.5 h-3.5 rounded-[3px] border border-transparent transition-all cursor-pointer ${getColorClass(
                    d.count
                  )}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#8C8884] mt-2 pt-2 border-t border-[#F0EDE1]">
        <span>14 周前</span>
        <div className="flex items-center gap-1.5">
          <span>少</span>
          <div className="w-2.5 h-2.5 rounded-[2px] bg-[#EAE5D4]"></div>
          <div className="w-2.5 h-2.5 rounded-[2px] bg-[#8CA897]"></div>
          <div className="w-2.5 h-2.5 rounded-[2px] bg-[#558269]"></div>
          <div className="w-2.5 h-2.5 rounded-[2px] bg-[#336148]"></div>
          <div className="w-2.5 h-2.5 rounded-[2px] bg-[#1E432F]"></div>
          <span>多</span>
        </div>
        <span>今日</span>
      </div>
    </div>
  );
};
