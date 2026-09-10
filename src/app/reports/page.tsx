import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTeamsAdmin } from '@/lib/db/teams-admin';
import { getSessionUser } from '@/lib/auth';
import { resolveCurrentPeriodAdmin as resolveCurrentPeriod } from '@/lib/db/evaluations-admin';
import { isIndividualRole } from '@/lib/role-policy';
import ReportsShell from '@/components/reports/ReportsShell';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ team?: string | string[] }> }) {
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
  const period = await resolveCurrentPeriod(preferredPeriodId, viewer);
  const periodId = period?.id || '';

  const params = await searchParams;
  // Teams metadata for light filter layer (fast scoped query)
  const teams = await getTeamsAdmin(viewer);
  const requestedTeam = typeof params?.team === 'string' ? params.team : 'all';
  const team = requestedTeam === 'all' || teams.some((candidate) => candidate.id === requestedTeam)
    ? requestedTeam
    : 'all';

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
