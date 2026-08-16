'use client';

import React from 'react';
import { Trophy, Medal, Award, Star } from 'lucide-react';
import DataTable, { Column } from '@/components/ui/DataTable';
import { getGradeColor } from '@/lib/scoring';

interface Performer {
  id: string;
  name: string;
  teamName: string;
  score: number;
  grade: string;
}

interface TopPerformersProps {
  employees: Performer[];
}

export default function TopPerformers({ employees }: TopPerformersProps) {
  const columns: Column<Performer>[] = [
    {
      key: 'rank',
      header: 'Hạng',
      render: (_, index) => {
        const rank = (index || 0) + 1;
        if (rank === 1) return <div className="flex justify-center"><Trophy className="w-5 h-5 text-amber-500" /></div>;
        if (rank === 2) return <div className="flex justify-center"><Medal className="w-5 h-5 text-slate-400" /></div>;
        if (rank === 3) return <div className="flex justify-center"><Medal className="w-5 h-5 text-amber-700" /></div>;
        return <div className="flex justify-center font-medium text-outline-variant">{rank}</div>;
      }
    },
    {
      key: 'name',
      header: 'Nhân viên',
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
            {item.name.split(' ').pop()?.charAt(0)}
          </div>
          <div className="font-medium text-on-surface">{item.name}</div>
        </div>
      )
    },
    {
      key: 'teamName',
      header: 'Nhóm',
      hiddenOnMobile: true
    },
    {
      key: 'score',
      header: 'Điểm số',
      render: (item) => (
        <div className="flex items-center gap-1.5 font-bold text-primary">
          {item.score.toFixed(1)}
          <Star className="w-3 h-3 fill-current" />
        </div>
      )
    },
    {
      key: 'grade',
      header: 'Xếp loại',
      render: (item) => {
        const color = getGradeColor(item.grade as 'A' | 'B' | 'C' | 'D');
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${color.replace('bg-', 'text-').replace('600', '700')} bg-opacity-10 ${color.replace('bg-', 'bg-')}/10`}>
            {item.grade}
          </span>
        );
      }
    }
  ];

  return (
    <div className="bg-white rounded-3xl border border-outline-variant shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-outline-variant bg-surface/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 bg-opacity-10 rounded-xl text-amber-600">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-on-surface">Top Performers</h3>
              <p className="text-xs text-outline font-medium">Bảng xếp hạng 5 nhân viên xuất sắc nhất</p>
            </div>
          </div>
          <button className="text-xs font-bold text-primary hover:underline transition-all">
            Xem tất cả
          </button>
        </div>
      </div>
      
      <div className="flex-1 p-0">
        <DataTable 
          columns={columns} 
          data={employees} 
          className="border-none rounded-none shadow-none"
          rowClassName="!h-14"
        />
      </div>
    </div>
  );
}
