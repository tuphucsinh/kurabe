import { getDashboardSecondaryData } from '@/actions/dashboard';
import type { DashboardSecondaryData } from '@/lib/db/dashboard-source';
import PendingReviews from '@/components/dashboard/PendingReviews';
import AnomalyAlertCard from '@/components/dashboard/AnomalyAlertCard';
import LazySkillGapRadar from '@/components/charts/LazySkillGapRadar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export function DashboardSecondarySkeleton() {
  return (
    <>
      {/* Row 2: Pending Reviews & Anomaly Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[240px]">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[240px]">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Skill Gap Radar & Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[320px] flex flex-col">
          <Skeleton className="h-6 w-40 mb-4" />
          <Skeleton className="h-56 w-full rounded-xl mt-auto" />
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[320px] flex flex-col">
          <Skeleton className="h-6 w-44 mb-6" />
          <div className="space-y-4 flex-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4 p-2">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default async function DashboardSecondarySection({
  secondaryPromise,
  periodId,
  isManager,
}: {
  secondaryPromise?: Promise<DashboardSecondaryData | null>;
  periodId: string;
  isManager: boolean;
}) {
  const secondaryData = secondaryPromise
    ? await secondaryPromise
    : await getDashboardSecondaryData(periodId);
  if (!secondaryData) return null;

  return (
    <>
      {/* Grid: PendingReviews | Anomaly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PendingReviews
          evaluations={secondaryData.rawEvaluations}
          userNameById={secondaryData.userNameById}
        />
        <AnomalyAlertCard
          evaluations={secondaryData.rawEvaluations}
          userNameById={secondaryData.userNameById}
          isManager={isManager}
        />
      </div>

      {/* Grid: Radar | Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <LazySkillGapRadar
            evaluations={secondaryData.rawEvaluations}
            criteriaGroups={secondaryData.rawCriteriaGroups}
          />
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Hoạt động gần đây</h3>
          <div className="space-y-4 flex-1">
            {secondaryData.recentActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">
                  {activity.evaluatorName?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">{activity.evaluatorName}</span> đã{' '}
                    {activity.status === 'Approved' ? 'phê duyệt' : 'gửi'} đánh giá cho{' '}
                    <span className="font-semibold">{activity.employeeName}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Xếp loại: <span className="font-bold text-slate-600">{activity.grade}</span> •{' '}
                    {new Date(activity.date).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              </div>
            ))}
            {secondaryData.recentActivities.length === 0 && (
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
  );
}
