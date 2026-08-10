'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Filter, Calendar, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function ReportFilters({ teams }: { teams: { id: string, name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentPeriod } = useAuth();
  
  const selectedTeam = searchParams.get('team') || 'all';

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTeam = e.target.value;
    const params = new URLSearchParams(searchParams);
    if (newTeam === 'all') {
      params.delete('team');
    } else {
      params.set('team', newTeam);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-outline-variant shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-xl">
        <Filter className="w-4 h-4 text-outline" />
        <span className="text-sm font-medium text-outline">Lọc:</span>
      </div>
      
      <select 
        value={selectedTeam}
        onChange={handleTeamChange}
        className="px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
      >
        <option value="all">Tất cả nhóm</option>
        {teams.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-semibold text-indigo-600">
        <Calendar className="w-4 h-4" />
        <span>Kỳ {currentPeriod?.year}</span>
      </div>

      <div className="ml-auto text-sm text-outline flex items-center gap-2">
        <Clock className="w-4 h-4" />
        Dữ liệu thời gian thực
      </div>
    </div>
  );
}
