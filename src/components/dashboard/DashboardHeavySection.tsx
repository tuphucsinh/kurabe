'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import PendingReviews from '@/components/dashboard/PendingReviews';
import AnomalyAlertCard from '@/components/dashboard/AnomalyAlertCard';
import LazySkillGapRadar from '@/components/charts/LazySkillGapRadar';
import { EmptyState } from '@/components/ui/EmptyState';
import type { DashboardHeavyData } from '@/actions/dashboard';
import type { User } from '@/types';

interface DashboardHeavySectionProps {
  data: DashboardHeavyData | null;
  userNameById: Record<string, string>;
  viewer: User | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export default function DashboardHeavySection({
  data,
  userNameById,
  viewer,
  isLoading,
  error,
  onRetry,
}: DashboardHeavySectionProps) {
  return (
    <div data-load-layer="heavy" className="space-y-6 md:space-y-8">
      {isLoading ? (
        <div className="space-y-6 md:space-y-8">
          {/* Skeleton Grid: PendingReviews | Anomaly */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className="bg-surface-raised p-4 sm:p-6 rounded-2xl shadow-sm border border-outline-soft h-64 animate-pulse" />
            <div className="bg-surface-raised p-4 sm:p-6 rounded-2xl shadow-sm border border-outline-soft h-64 animate-pulse" />
          </div>

          {/* Skeleton Grid: Radar | Recent */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className="bg-surface-raised p-4 sm:p-6 rounded-2xl shadow-sm border border-outline-soft h-72 animate-pulse" />
            <div className="bg-surface-raised p-4 sm:p-6 rounded-2xl shadow-sm border border-outline-soft h-72 animate-pulse" />
          </div>
        </div>
      ) : error ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-6 text-center text-amber-800 space-y-3">
          <p className="text-sm font-medium">Không thể tải dữ liệu phân tích chi tiết: {error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <RefreshCw size={14} /> Thử lại
            </button>
          )}
        </div>
      ) : !data ? null : (
        <>
          {/* Grid: PendingReviews | Anomaly */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <PendingReviews evaluations={data.rawEvaluations} userNameById={userNameById} />
            <AnomalyAlertCard
              evaluations={data.rawEvaluations}
              userNameById={userNameById}
              isManager={viewer?.role === 'Manager'}
            />
          </div>

          {/* Grid: Radar | Recent */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div>
              <LazySkillGapRadar
                evaluations={data.rawEvaluations}
                criteriaGroups={data.rawCriteriaGroups}
              />
            </div>
            <div className="bg-surface-raised p-4 sm:p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold text-ink mb-4 sm:mb-6">Hoạt động gần đây</h3>
              <div className="space-y-3 sm:space-y-4 flex-1">
                {data.recentActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl hover:bg-surface-muted transition-colors"
                  >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-brand-soft text-brand flex items-center justify-center font-bold flex-shrink-0 text-sm sm:text-base">
                      {activity.evaluatorName?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-ink">
                        <span className="font-semibold">{activity.evaluatorName}</span> đã{' '}
                        {activity.status === 'Approved' ? 'phê duyệt' : 'gửi'} đánh giá cho{' '}
                        <span className="font-semibold">{activity.employeeName}</span>
                      </p>
                      <p className="text-[11px] sm:text-xs text-ink-muted mt-1">
                        Xếp loại: <span className="font-bold text-ink">{activity.grade}</span>
                        <span className="max-md:hidden"> • {new Date(activity.date).toLocaleDateString('vi-VN')}</span>
                      </p>
                    </div>
                  </div>
                ))}
                {data.recentActivities.length === 0 && (
                  <div className="h-full flex items-center justify-center py-10">
                    <EmptyState
                      title="Không có hoạt động"
                      description="Chưa có hoạt động đánh giá nào gần đây."
                      className="p-0"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
