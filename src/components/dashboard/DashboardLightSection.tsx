'use client';

import React from 'react';
import { Users, TrendingUp, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { GradeDistribution } from '@/components/charts/GradeDistribution';
import { EmptyState } from '@/components/ui/EmptyState';
import type { DashboardLightData } from '@/actions/dashboard';

interface DashboardLightSectionProps {
  data: DashboardLightData | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export default function DashboardLightSection({
  data,
  isLoading,
  error,
  onRetry,
}: DashboardLightSectionProps) {
  return (
    <div data-load-layer="light" className="space-y-8">
      {isLoading ? (
        <>
          {/* Skeleton KPI Compact */}
          <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-4 md:flex-wrap">
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <Users size={18} className="text-primary shrink-0" />
              <Skeleton variant="text" className="w-8 h-5" />
              <span className="text-sm text-slate-500">nhân sự</span>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600 shrink-0" />
              <Skeleton variant="text" className="w-8 h-5" />
              <span className="text-sm text-slate-500">tiến độ</span>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              <Skeleton variant="text" className="w-10 h-5" />
              <span className="text-sm text-slate-500">đã đánh giá</span>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <Clock size={18} className="text-amber-600 shrink-0" />
              <Skeleton variant="text" className="w-8 h-5" />
              <span className="text-sm text-slate-500">chưa xong</span>
            </div>
          </div>

          {/* Skeleton Grid: TeamStatus | GradeDistribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Team Status */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:col-span-1">
              <h3 className="text-lg font-semibold text-slate-800 mb-6">Trạng thái theo nhóm</h3>
              <div className="space-y-6 flex-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <Skeleton variant="text" className="w-24 h-4" />
                      <Skeleton variant="text" className="w-28 h-4" />
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full" />
                  </div>
                ))}
              </div>
            </div>

            {/* Grade Distribution */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Phân bổ xếp loại</h3>
              <div className="space-y-2.5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton variant="text" className="w-6 h-3.5" />
                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full" />
                    <Skeleton variant="text" className="w-6 h-3.5" />
                    <Skeleton variant="text" className="w-8 h-3.5" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center text-rose-700 space-y-3">
          <p className="text-sm font-medium">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <RefreshCw size={14} /> Thử lại
            </button>
          )}
        </div>
      ) : !data || data.stats.total === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-dashed border-outline-variant flex items-center justify-center">
          <EmptyState
            title="Chưa có dữ liệu đánh giá"
            description="Kỳ này hiện chưa có nhân sự hoặc chưa có đánh giá nào."
          />
        </div>
      ) : (
        <>
          {/* KPI Compact */}
          <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-4 md:flex-wrap">
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <Users size={18} className="text-primary shrink-0" />
              <span className="text-lg font-black text-slate-900">{data.stats.total}</span>
              <span className="text-sm text-slate-500">nhân sự</span>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600 shrink-0" />
              <span className="text-lg font-black text-slate-900">{data.stats.percent}%</span>
              <span className="text-sm text-slate-500">tiến độ</span>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              <span className="text-lg font-black text-slate-900">
                {data.stats.completed}/{data.stats.total}
              </span>
              <span className="text-sm text-slate-500">đã đánh giá</span>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <Clock size={18} className="text-amber-600 shrink-0" />
              <span className="text-lg font-black text-slate-900">
                {data.stats.total - data.stats.completed}
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
                {data.teamStatus.map((team) => (
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
              <GradeDistribution data={data.gradeDistribution} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
