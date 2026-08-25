import React from 'react';
import { FileCheck, Clock, AlertCircle, PieChart } from 'lucide-react';

interface PeriodSummaryProps {
  stats: {
    completed: number;
    inProgress: number;
    notStarted: number;
    total: number;
    percent: number;
  };
  gradeDistribution: { grade: string; count: number; color: string }[];
  totalEvaluationsCount: number;
}

export function PeriodSummary({ stats, gradeDistribution, totalEvaluationsCount }: PeriodSummaryProps) {
  const maxGradeCount = Math.max(...gradeDistribution.map(d => d.count), 1);

  return (
    <div className="bg-surface-raised rounded-2xl shadow-sm border border-outline-soft overflow-hidden">
      <div className="p-6 border-b border-outline-soft bg-surface-muted">
        <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
          <PieChart size={20} className="text-brand" />
          Thống kê kỳ đánh giá
        </h3>
      </div>
      
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Progress Stats */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink-muted">Tiến độ hoàn thành</span>
            <span className="text-2xl font-bold text-brand">{stats.percent}%</span>
          </div>
          
          <div className="h-4 w-full bg-surface-muted rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-brand-mid transition-all duration-1000"
              style={{ width: `${stats.percent}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center text-emerald-600 shadow-sm">
                <FileCheck size={20} />
              </div>
              <div>
                <p className="text-xs text-emerald-600 font-medium">Đã xong</p>
                <p className="text-xl font-bold text-emerald-700">{stats.completed}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center text-amber-600 shadow-sm">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-xs text-amber-600 font-medium">Đang làm</p>
                <p className="text-xl font-bold text-amber-700">{stats.inProgress}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-muted border border-outline-soft flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center text-ink-muted shadow-sm">
                <AlertCircle size={20} />
              </div>
              <div>
                <p className="text-xs text-ink-muted font-medium">Chưa bắt đầu</p>
                <p className="text-xl font-bold text-ink">{stats.notStarted}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-brand-soft border border-outline-soft flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center text-brand shadow-sm">
                <PieChart size={20} />
              </div>
              <div>
                <p className="text-xs text-brand font-medium">Tổng NV</p>
                <p className="text-xl font-bold text-brand-strong">{stats.total}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Grade Distribution */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-ink mb-2">Phân bổ xếp loại</h4>
          <div className="space-y-3">
            {gradeDistribution.map((item) => {
              const width = (item.count / maxGradeCount) * 100;
              const percent = stats.completed > 0 ? Math.round((item.count / totalEvaluationsCount) * 100) : 0;
              
              return (
                <div key={item.grade} className="flex items-center gap-3 group">
                  <div className="w-8 text-sm font-bold text-ink-muted">{item.grade}</div>
                  <div className="flex-1 h-8 bg-surface-muted rounded-lg overflow-hidden relative">
                    <div 
                      className={`absolute top-0 left-0 h-full rounded-r-lg transition-all duration-1000 ease-out group-hover:brightness-110 ${item.color || 'bg-surface-muted'}`}
                      style={{ width: `${width}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-3 justify-between">
                      <span className="text-xs font-bold text-white drop-shadow-sm">
                        {item.count > 0 ? item.count : ''}
                      </span>
                      <span className="text-[11px] text-ink-muted group-hover:text-ink transition-colors">
                        {item.count > 0 ? `${percent}%` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
