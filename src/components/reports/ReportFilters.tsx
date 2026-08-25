'use client';

import React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Filter, Calendar, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export interface ReportFiltersProps {
  teams: { id: string; name: string }[];
  periodYear?: number;
  isLoadingTeams?: boolean;
}

export default function ReportFilters({
  teams,
  periodYear,
  isLoadingTeams = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentPeriod } = useAuth();

  const selectedTeam = searchParams?.get('team') || 'all';

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTeam = e.target.value;
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    if (newTeam === 'all') {
      params.delete('team');
    } else {
      params.set('team', newTeam);
    }
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const displayYear = periodYear ?? currentPeriod?.year;

  return (
    <div
      data-load-layer="light"
      className="flex flex-wrap items-center gap-3 bg-white p-3 md:p-4 rounded-2xl border border-outline-variant shadow-sm"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-xl">
        <Filter className="w-4 h-4 text-outline" />
        <span className="text-sm font-medium text-outline">Lọc:</span>
      </div>

      <select
        value={selectedTeam}
        onChange={handleTeamChange}
        disabled={isLoadingTeams}
        aria-label="Chọn nhóm"
        className="px-3 md:px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all flex-1 min-w-0 md:flex-none disabled:opacity-60"
      >
        <option value="all">Tất cả nhóm</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2 px-3 md:px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-semibold text-indigo-600">
        <Calendar className="w-4 h-4" />
        <span>Kỳ {displayYear || '—'}</span>
      </div>

      <div className="max-md:hidden md:ml-auto text-xs md:text-sm text-outline flex items-center gap-2 w-full md:w-auto">
        <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
        Dữ liệu thời gian thực
      </div>
    </div>
  );
}
