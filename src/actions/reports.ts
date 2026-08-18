'use server';

import { requireRole } from '@/lib/auth';
import {
  createReportsSource,
  type ReportPrimaryData,
  type ReportSecondaryData,
  type ReportAggregationData,
} from '@/lib/db/reports-source';

export async function getReportPrimaryData(
  periodId: string,
  selectedTeam: string = 'all'
): Promise<ReportPrimaryData | null> {
  if (!periodId) return null;
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return null;
  const source = createReportsSource(periodId, selectedTeam, auth.user);
  return source.primary;
}

export async function getReportSecondaryData(
  periodId: string,
  selectedTeam: string = 'all'
): Promise<ReportSecondaryData | null> {
  if (!periodId) return null;
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return null;
  const source = createReportsSource(periodId, selectedTeam, auth.user);
  return source.secondary;
}

export async function getReportAggregation(
  periodId: string,
  selectedTeam: string = 'all'
): Promise<ReportAggregationData | null> {
  if (!periodId) return null;
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return null;
  const source = createReportsSource(periodId, selectedTeam, auth.user);
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
