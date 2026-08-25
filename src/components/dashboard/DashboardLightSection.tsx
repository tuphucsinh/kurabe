'use client';

import React from 'react';
import { Users, TrendingUp, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import ClientGradeDistribution from '@/components/charts/ClientGradeDistribution';
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
    <div data-load-layer="light" className="space-y-6 md:space-y-8">
      {isLoading ? (
        <>
          {/* Skeleton KPI Compact */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:flex md:items-center md:gap-4 md:flex-wrap">
            <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm px-3 py-2.5 md:px-4 md:py-2.5 flex items-center gap-2">
              <Users size={18} className="text-primary shrink-0" />
              <Skeleton variant="text" className="w-8 h-5" />
              <span className="text-xs sm:text-sm text-ink-muted">nhân sự</span>
            </div>
            <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm px-3 py-2.5 md:px-4 md:py-2.5 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600 shrink-0" />
              <Skeleton variant="text" className="w-8 h-5" />
              <span className="text-xs sm:text-sm text-ink-muted">tiến độ</span>
            </div>
            <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm px-3 py-2.5 md:px-4 md:py-2.5 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              <Skeleton variant="text" className="w-10 h-5" />
              <span className="text-xs sm:text-sm text-ink-muted">đã đánh giá</span>
            </div>
            <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm px-3 py-2.5 md:px-4 md:py-2.5 flex items-center gap-2">
              <Clock size={18} className="text-amber-600 shrink-0" />
              <Skeleton variant="text" className="w-8 h-5" />
              <span className="text-xs sm:text-sm text-ink-muted">chưa xong</span>
            </div>
          </div>

          {/* Skeleton Grid: TeamStatus | GradeDistribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Team Status */}
            <div className="bg-surface-raised p-4 sm:p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col lg:col-span-1">
              <h3 className="text-base sm:text-lg font-semibold text-ink mb-4 sm:mb-6">Trạng thái theo nhóm</h3>
              <div className="space-y-4 sm:space-y-6 flex-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between items-center text-xs sm:text-sm">
                      <Skeleton variant="text" className="w-24 h-4" />
                      <Skeleton variant="text" className="w-28 h-4" />
                    </div>
                    <div className="h-2 w-full bg-surface-muted rounded-full" />
                  </div>
                ))}
              </div>
            </div>

            {/* Grade Distribution */}
            <div className="bg-surface-raised p-4 sm:p-5 rounded-2xl shadow-sm border border-outline-soft">
              <h3 className="text-sm font-bold text-ink mb-3 sm:mb-4">Phân bổ xếp loại</h3>
              <div className="space-y-2.5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton variant="text" className="w-6 h-3.5" />
                    <div className="flex-1 h-2.5 bg-surface-muted rounded-full" />
                    <Skeleton variant="text" className="w-6 h-3.5" />
                    <Skeleton variant="text" className="w-8 h-3.5" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 sm:p-6 text-center text-rose-700 space-y-3">
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
        <div className="bg-surface-raised p-6 sm:p-12 rounded-3xl border border-dashed border-outline-soft flex items-center justify-center">
          <EmptyState
            title="Chưa có dữ liệu đánh giá"
            description="Kỳ này hiện chưa có nhân sự hoặc chưa có đánh giá nào."
          />
        </div>
      ) : (
        <>
          {/* KPI Compact */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:flex md:items-center md:gap-4 md:flex-wrap">
            <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm px-3 py-2.5 md:px-4 md:py-2.5 flex items-center gap-2">
              <Users size={18} className="text-primary shrink-0" />
              <span className="text-base sm:text-lg font-black text-ink">{data.stats.total}</span>
              <span className="text-xs sm:text-sm text-ink-muted">nhân sự</span>
            </div>
            <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm px-3 py-2.5 md:px-4 md:py-2.5 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600 shrink-0" />
              <span className="text-base sm:text-lg font-black text-ink">{data.stats.percent}%</span>
              <span className="text-xs sm:text-sm text-ink-muted">tiến độ</span>
            </div>
            <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm px-3 py-2.5 md:px-4 md:py-2.5 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              <span className="text-base sm:text-lg font-black text-ink">
                {data.stats.completed}/{data.stats.total}
              </span>
              <span className="text-xs sm:text-sm text-ink-muted">đã đánh giá</span>
            </div>
            <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm px-3 py-2.5 md:px-4 md:py-2.5 flex items-center gap-2">
              <Clock size={18} className="text-amber-600 shrink-0" />
              <span className="text-base sm:text-lg font-black text-ink">
                {data.stats.total - data.stats.completed}
              </span>
              <span className="text-xs sm:text-sm text-ink-muted">chưa xong</span>
            </div>
          </div>

          {/* Grid: TeamStatus | GradeDistribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Team Status */}
            <div className="bg-surface-raised p-4 sm:p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col lg:col-span-1">
              <h3 className="text-base sm:text-lg font-semibold text-ink mb-4 sm:mb-6">Trạng thái theo nhóm</h3>
              <div className="space-y-4 sm:space-y-6 flex-1">
                {data.teamStatus.map((team) => (
                  <div key={team.id} className="space-y-2">
                    <div className="flex justify-between items-center text-xs sm:text-sm">
                      <span className="font-medium text-ink">{team.name}</span>
                      <span className="text-ink-muted">
                        {team.progress}%<span className="max-md:hidden"> ({team.membersCount} nhân viên)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-surface-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-mid rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${team.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Grade Distribution */}
            <div className="bg-surface-raised p-4 sm:p-5 rounded-2xl shadow-sm border border-outline-soft">
              <h3 className="text-sm font-bold text-ink mb-3 sm:mb-4">Phân bổ xếp loại</h3>
              <ClientGradeDistribution data={data.gradeDistribution} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
