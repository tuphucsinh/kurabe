import React, { Suspense } from 'react';
import { createDashboardSource } from '@/lib/db/dashboard-source';
import { EmptyState } from '@/components/ui/EmptyState';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { resolveCurrentPeriod } from '@/lib/db/evaluations';
import { isIndividualRole } from '@/lib/role-policy';
import type { EvaluationPeriod } from '@/types';
import DashboardPrimarySection from '@/components/dashboard/DashboardPrimarySection';
import DashboardSecondarySection, {
  DashboardSecondarySkeleton,
} from '@/components/dashboard/DashboardSecondarySection';

export default async function DashboardPage() {
  const viewer = await getSessionUser();
  if (!viewer) {
    redirect('/login');
  }
  if (isIndividualRole(viewer?.role)) {
    redirect(`/evaluations/${viewer?.id}`);
  }

  // Giải kỳ hiện tại: cookie → kỳ Active → kỳ mới nhất (helper chung — C5)
  const preferredPeriodId = (await cookies()).get('selected_period_id')?.value;
  const currentPeriod: EvaluationPeriod | null = await resolveCurrentPeriod(preferredPeriodId);
  const periodId = currentPeriod?.id;

  // Khởi tạo shared source duy nhất một lần cho mỗi request trang
  const source = periodId ? createDashboardSource(periodId, viewer) : null;
  const primaryData = source ? await source.primary : null;

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tổng quan hệ thống</h1>
          <p className="text-slate-500 mt-1">
            {currentPeriod ? (
              <>
                Theo dõi tiến độ đánh giá năng lực QAQC —{' '}
                <span className="text-indigo-600 font-semibold">Kỳ {currentPeriod.year}</span>
              </>
            ) : (
              'Chưa có kỳ đánh giá nào được chọn'
            )}
          </p>
        </div>
      </div>

      {!primaryData || primaryData.stats.total === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-dashed border-outline-variant flex items-center justify-center">
          <EmptyState
            title="Chưa có dữ liệu đánh giá"
            description="Kỳ này hiện chưa có nhân sự hoặc chưa có đánh giá nào."
          />
        </div>
      ) : (
        <>
          <DashboardPrimarySection primaryData={primaryData} />
          {periodId && (
            <Suspense fallback={<DashboardSecondarySkeleton />}>
              <DashboardSecondarySection
                secondaryPromise={source?.secondary}
                periodId={periodId}
                isManager={viewer?.role === 'Manager'}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
