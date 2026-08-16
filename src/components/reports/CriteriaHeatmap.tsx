import React from 'react';

interface CriteriaStat {
  group: string;
  avgScore: number;
  percentage: number;
}

interface CriteriaHeatmapProps {
  data: CriteriaStat[];
}

export default function CriteriaHeatmap({ data }: CriteriaHeatmapProps) {
  const getStatusColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600 bg-green-50 border-green-100 ring-green-500/20';
    if (percentage >= 50) return 'text-amber-600 bg-amber-50 border-amber-100 ring-amber-500/20';
    return 'text-red-600 bg-red-50 border-red-100 ring-red-500/20';
  };

  const getProgressBg = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const groupNames: Record<string, string> = {
    'A': 'Kỷ luật',
    'B': 'Hợp tác',
    'C': 'Tích cực',
    'D': 'Trách nhiệm',
    'E': 'Năng lực',
    'F': 'Thành tích'
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-on-surface">Phân tích nhóm tiêu chuẩn</h3>
        <div className="flex gap-4 text-[11px] font-bold uppercase tracking-wider text-outline">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>≥80%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span>50-79%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span>{'<'}50%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {data.map((item) => (
          <div 
            key={item.group}
            className={`relative p-4 rounded-2xl border transition-all hover:shadow-md hover:-translate-y-0.5 group overflow-hidden ${getStatusColor(item.percentage)}`}
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold opacity-70">Nhóm {item.group}</span>
                <span className="text-xs font-bold">{item.percentage.toFixed(0)}%</span>
              </div>
              <h4 className="text-sm font-bold mb-3 truncate">{groupNames[item.group] || 'Khác'}</h4>
              <div className="text-2xl font-black">{item.avgScore.toFixed(1)}</div>
            </div>

            {/* Background progress indicator */}
            <div 
              className={`absolute bottom-0 left-0 h-1 transition-all duration-1000 ${getProgressBg(item.percentage)} opacity-30`}
              style={{ width: `${item.percentage}%` }}
            />
            
            {/* Subtle glass effect on hover */}
            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors pointer-events-none" />
          </div>
        ))}
      </div>
      
      <div className="mt-6 p-4 bg-surface-container rounded-2xl border border-outline-variant">
        <p className="text-xs text-outline leading-relaxed">
          <span className="font-bold text-on-surface">Mẹo:</span> Nhóm tiêu chuẩn có tỉ lệ dưới 50% cần được chú trọng đào tạo hoặc điều chỉnh quy trình vận hành thực tế.
        </p>
      </div>
    </div>
  );
}
