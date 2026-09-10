import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { resolveCurrentPeriodAdmin as resolveCurrentPeriod } from '@/lib/db/evaluations-admin';
import { isIndividualRole } from '@/lib/role-policy';
import type { EvaluationPeriod } from '@/types';
import DashboardShell from '@/components/dashboard/DashboardShell';
import DashboardDataLayer from '@/components/dashboard/DashboardDataLayer';

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
  const currentPeriod: EvaluationPeriod | null = await resolveCurrentPeriod(preferredPeriodId, viewer);
  const periodId = currentPeriod?.id || '';
  const periodYear = currentPeriod?.year;
  const periodName = currentPeriod?.name;

  return (
    <DashboardShell
      periodYear={periodYear}
      periodName={periodName}
      hasPeriod={!!currentPeriod}
    >
      <DashboardDataLayer
        viewer={viewer}
        periodId={periodId}
      />
    </DashboardShell>
  );
}
