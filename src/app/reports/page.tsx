import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTeamsAdmin } from '@/lib/db/teams-admin';
import { getSessionUser } from '@/lib/auth';
import { resolveCurrentPeriod } from '@/lib/db/evaluations';
import { isIndividualRole } from '@/lib/role-policy';
import ReportsShell from '@/components/reports/ReportsShell';

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
  const periodId = period?.id || '';

  const team = searchParams?.team || 'all';
  // Teams metadata for light filter layer (fast scoped query)
  const teams = await getTeamsAdmin(viewer);

  return (
    <ReportsShell
      viewer={viewer}
      periodId={periodId}
      periodYear={period?.year}
      selectedTeam={team}
      initialTeams={teams}
    />
  );
}
