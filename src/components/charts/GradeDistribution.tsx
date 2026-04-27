import React from 'react';

interface GradeData {
  grade: string;
  count: number;
  color: string;
}

interface GradeDistributionProps {
  data: GradeData[];
}

export function GradeDistribution({ data }: GradeDistributionProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-slate-800">Phân bổ Xếp loại</h3>
        <span className="text-sm text-slate-500 font-medium">Tổng: {total}</span>
      </div>
      
      <div className="space-y-4">
        {data.map((item) => {
          const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
          const widthPercent = (item.count / maxCount) * 100;
          
          return (
            <div key={item.grade} className="flex items-center group">
              <div className="w-12 text-sm font-bold text-slate-700">{item.grade}</div>
              <div className="flex-1 flex items-center gap-3">
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden relative">
                  <div 
                    className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out group-hover:opacity-80 ${item.color}`}
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
                <div className="w-10 text-right text-sm font-medium text-slate-600">
                  {item.count}
                </div>
                <div className="w-12 text-right text-xs text-slate-400">
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
