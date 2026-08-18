'use server';

import { requireRole } from '@/lib/auth';
import {
  createDashboardSource,
  type DashboardPrimaryData,
  type DashboardSecondaryData,
  type DashboardData,
} from '@/lib/db/dashboard-source';

export async function getDashboardPrimaryData(periodId: string): Promise<DashboardPrimaryData | null> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return null;
  const source = createDashboardSource(periodId, auth.user);
  return source.primary;
}

export async function getDashboardSecondaryData(periodId: string): Promise<DashboardSecondaryData | null> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return null;
  const source = createDashboardSource(periodId, auth.user);
  return source.secondary;
}

export async function getDashboardData(periodId: string): Promise<DashboardData | null> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return null;
  const source = createDashboardSource(periodId, auth.user);
  const [primaryData, secondaryData] = await Promise.all([
    source.primary,
    source.secondary,
  ]);
  if (!primaryData || !secondaryData) return null;
  return {
    ...primaryData,
    ...secondaryData,
  };
}
