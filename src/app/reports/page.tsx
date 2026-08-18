import React, { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createReportsSource } from '@/lib/db/reports-source';
import { getTeamsAdmin } from '@/lib/db/teams-admin';
import { getSessionUser } from '@/lib/auth';
import { resolveCurrentPeriod } from '@/lib/db/evaluations';
import { isIndividualRole } from '@/lib/role-policy';
import ReportsPrimarySection from '@/components/reports/ReportsPrimarySection';
import ReportsSecondarySection, {
  ReportsSecondarySkeleton,
} from '@/components/reports/ReportsSecondarySection';

export default async function ReportsPage({ searchParams }: { searchParams: { team?: string } }) {
  // Guard role: báo cáo toàn công ty — chỉ Manager/Leader (Phase 39). Employee/Worker chuyển về phiếu đánh giá.
  const viewer = await getSessionUser();
  if (!viewer || (viewer.role !== 'Manager' && viewer.role !== 'Leader')) {
    if (isIndividualRole(viewer?.role)) {
      redirect(`/evaluations/${viewer?.id}`);
    }
    redirect('/dashboard');
  }

  // Giải kỳ hiện tại: cookie → kỳ Active → kỳ mới nhất (helper chung — C5)
  const preferredPeriodId = (await cookies()).get('selected_period_id')?.value;
  const period = await resolveCurrentPeriod(preferredPeriodId);
  const periodId = period?.id;

  const team = searchParams.team || 'all';

  // Khởi tạo shared source duy nhất một lần cho mỗi request trang: fan-out teams và primaryData đồng thời
  const source = periodId ? createReportsSource(periodId, team, viewer) : null;
  const [teams, primaryData] = source
    ? await Promise.all([source.teams, source.primary])
    : await Promise.all([getTeamsAdmin(viewer), Promise.resolve(null)]);

  if (!primaryData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-outline font-medium">Không có dữ liệu báo cáo cho kỳ đánh giá này.</p>
      </div>
    );
  }

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-6 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      <ReportsPrimarySection
        periodId={periodId || ''}
        viewerRole={viewer.role}
        teams={teams}
        primaryData={primaryData}
      />
      {periodId && (
        <Suspense fallback={<ReportsSecondarySkeleton />}>
          <ReportsSecondarySection
            secondaryPromise={source?.secondary}
            periodId={periodId}
            team={team}
          />
        </Suspense>
      )}
    </div>
  );
}
