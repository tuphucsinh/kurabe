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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-50 bg-slate-50/50">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <PieChart size={20} className="text-indigo-600" />
          Thống kê kỳ đánh giá
        </h3>
      </div>
      
      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Progress Stats */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500">Tiến độ hoàn thành</span>
            <span className="text-2xl font-bold text-indigo-600">{stats.percent}%</span>
          </div>
          
          <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-indigo-500 transition-all duration-1000" 
              style={{ width: `${stats.percent}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-emerald-600 shadow-sm">
                <FileCheck size={20} />
              </div>
              <div>
                <p className="text-xs text-emerald-600 font-medium">Đã xong</p>
                <p className="text-xl font-bold text-emerald-700">{stats.completed}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-amber-600 shadow-sm">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-xs text-amber-600 font-medium">Đang làm</p>
                <p className="text-xl font-bold text-amber-700">{stats.inProgress}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-500 shadow-sm">
                <AlertCircle size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Chưa bắt đầu</p>
                <p className="text-xl font-bold text-slate-700">{stats.notStarted}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm">
                <PieChart size={20} />
              </div>
              <div>
                <p className="text-xs text-indigo-600 font-medium">Tổng NV</p>
                <p className="text-xl font-bold text-indigo-700">{stats.total}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Grade Distribution */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Phân bổ xếp loại</h4>
          <div className="space-y-3">
            {gradeDistribution.map((item) => {
              const width = (item.count / maxGradeCount) * 100;
              const percent = stats.completed > 0 ? Math.round((item.count / totalEvaluationsCount) * 100) : 0;
              
              return (
                <div key={item.grade} className="flex items-center gap-3 group">
                  <div className="w-8 text-sm font-bold text-slate-600">{item.grade}</div>
                  <div className="flex-1 h-8 bg-slate-50 rounded-lg overflow-hidden relative">
                    <div 
                      className={`absolute top-0 left-0 h-full rounded-r-lg transition-all duration-1000 ease-out group-hover:brightness-110 ${item.color || 'bg-slate-300'}`}
                      style={{ width: `${width}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-3 justify-between">
                      <span className="text-xs font-bold text-white drop-shadow-sm">
                        {item.count > 0 ? item.count : ''}
                      </span>
                      <span className="text-[11px] text-slate-400 group-hover:text-slate-600 transition-colors">
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
