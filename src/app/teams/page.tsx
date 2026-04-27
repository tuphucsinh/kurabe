'use client';

import { db } from '@/data/mock';
import { Users, User as UserIcon, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function TeamsPage() {
  const teamsData = db.teams.map((team) => {
    const members = db.users.filter((u) => u.teamId === team.id);
    const leader = db.users.find((u) => u.id === team.leaderId);
    const evaluations = db.evaluations.filter((e) => 
      members.some((m) => m.id === e.employeeId)
    );
    
    const completedCount = evaluations.filter(e => e.status === 'Approved').length;
    const progress = members.length > 0 ? Math.round((completedCount / members.length) * 100) : 0;
    
    return {
      ...team,
      leaderName: leader?.name || 'Chưa xác định',
      membersCount: members.length,
      completedCount,
      progress,
      status: progress === 100 ? 'Hoàn thành' : 'Đang thực hiện'
    };
  });

  return (
    <div className="w-full space-y-6 p-4 md:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Danh sách nhóm QAQC</h1>
          <p className="text-slate-500 mt-1 text-sm md:text-base">Quản lý và theo dõi tiến độ đánh giá theo từng đơn vị</p>
        </div>
        <button className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 active:scale-95">
          Thêm nhóm mới
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
        {teamsData.map((team) => (
          <div 
            key={team.id} 
            className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col overflow-hidden"
          >
            {/* Card Header */}
            <div className="p-6 border-b border-slate-50">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                  <Users size={24} />
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  team.progress === 100 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {team.status}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">{team.name}</h3>
              <p className="text-sm text-slate-500 flex items-center gap-1.5">
                <UserIcon size={14} className="text-slate-400" />
                Leader: <span className="font-medium text-slate-700">{team.leaderName}</span>
              </p>
            </div>

            {/* Card Body */}
            <div className="p-6 flex-1 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Nhân sự</p>
                  <p className="text-xl font-bold text-slate-800">{team.membersCount}</p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Đã đánh giá</p>
                  <p className="text-xl font-bold text-slate-800">{team.completedCount}/{team.membersCount}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-medium">
                  <span className="text-slate-500 text-sm">Tiến độ</span>
                  <span className="text-indigo-600 text-sm font-bold">{team.progress}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-out group-hover:bg-indigo-600" 
                    style={{ width: `${team.progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Card Footer */}
            <div className="px-6 py-4 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span>{team.completedCount}</span>
                </div>
                <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                  <Clock size={14} className="text-amber-500" />
                  <span>{team.membersCount - team.completedCount}</span>
                </div>
              </div>
              <Link 
                href={`/teams/${team.id}`}
                className="text-indigo-600 text-sm font-bold flex items-center gap-1 hover:text-indigo-800 transition-colors"
              >
                Xem chi tiết
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
