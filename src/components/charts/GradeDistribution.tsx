import React from 'react';

interface GradeData {
  grade: string;
  count: number;
  color: string;
}

interface GradeDistributionProps {
  data?: GradeData[];
}

export function GradeDistribution({ data = [] }: GradeDistributionProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div data-load-layer="light" className="bg-surface-raised px-5 py-4 rounded-2xl shadow-sm border border-outline-soft/60">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-ink">Phân bổ Xếp loại</h3>
        <span className="text-xs text-ink-muted font-medium">Tổng: {total} nhân sự</span>
      </div>
      
      <div className="space-y-2.5">
        {data.map((item) => {
          const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
          const widthPercent = (item.count / maxCount) * 100;
          
          return (
            <div key={item.grade} className="flex items-center group">
              <div className="w-10 text-xs font-bold text-ink">{item.grade}</div>
              <div className="flex-1 flex items-center gap-3">
                <div className="flex-1 h-2.5 bg-surface-muted rounded-full overflow-hidden relative">
                  <div 
                    className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out group-hover:opacity-80 ${item.color}`}
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
                <div className="w-8 text-right text-xs font-semibold text-ink">
                  {item.count}
                </div>
                <div className="w-10 text-right text-[11px] text-ink-muted">
                  {percentage}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
