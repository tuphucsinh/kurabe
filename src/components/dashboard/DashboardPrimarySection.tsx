import React from 'react';
import { Users, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import { GradeDistribution } from '@/components/charts/GradeDistribution';
import type { DashboardPrimaryData } from '@/lib/db/dashboard-source';

interface DashboardPrimarySectionProps {
  primaryData: DashboardPrimaryData;
}

export default function DashboardPrimarySection({ primaryData }: DashboardPrimarySectionProps) {
  return (
    <>
      {/* KPI Compact */}
      <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-4 md:flex-wrap">
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
          <Users size={18} className="text-primary shrink-0" />
          <span className="text-lg font-black text-slate-900">{primaryData.stats.total}</span>
          <span className="text-sm text-slate-500">nhân sự</span>
        </div>
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
          <TrendingUp size={18} className="text-emerald-600 shrink-0" />
          <span className="text-lg font-black text-slate-900">{primaryData.stats.percent}%</span>
          <span className="text-sm text-slate-500">tiến độ</span>
        </div>
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-green-600 shrink-0" />
          <span className="text-lg font-black text-slate-900">
            {primaryData.stats.completed}/{primaryData.stats.total}
          </span>
          <span className="text-sm text-slate-500">đã đánh giá</span>
        </div>
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
          <Clock size={18} className="text-amber-600 shrink-0" />
          <span className="text-lg font-black text-slate-900">
            {primaryData.stats.total - primaryData.stats.completed}
          </span>
          <span className="text-sm text-slate-500">chưa xong</span>
        </div>
      </div>

      {/* Grid: TeamStatus | GradeDistribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Status */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:col-span-1">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Trạng thái theo nhóm</h3>
          <div className="space-y-6 flex-1">
            {primaryData.teamStatus.map((team) => (
              <div key={team.id} className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-medium text-slate-700">{team.name}</span>
                  <span className="text-slate-500">
                    {team.progress}% ({team.membersCount} nhân viên)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${team.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Grade Distribution */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Phân bổ xếp loại</h3>
          <GradeDistribution data={primaryData.gradeDistribution} />
        </div>
      </div>
    </>
  );
}
