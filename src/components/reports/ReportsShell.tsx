'use client';

import React from 'react';
import { User } from '@/types';
import ReportsDataLayer from '@/components/reports/ReportsDataLayer';

export interface ReportsShellProps {
  viewer: User;
  periodId: string;
  periodYear?: number;
  selectedTeam: string;
  initialTeams?: { id: string; name: string }[];
}

export default function ReportsShell({
  viewer,
  periodId,
  periodYear,
  selectedTeam,
  initialTeams = [],
}: ReportsShellProps) {
  return (
    <div
      data-load-layer="shell"
      className="px-4 sm:px-6 md:px-10 lg:px-12 py-6 md:py-8 space-y-6 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto"
    >
      <ReportsDataLayer
        viewer={viewer}
        periodId={periodId}
        periodYear={periodYear}
        selectedTeam={selectedTeam}
        teams={initialTeams}
      />
    </div>
  );
}
