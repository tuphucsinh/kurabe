'use client';

import { useUsers, useTeams, useEvaluations, useUpsertTeam, useDeleteTeam } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { Team } from '@/types';
import { 
  Users, 
  User as UserIcon, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  Plus,
  TrendingUp,
  Edit2,
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import TeamModal from '@/components/modals/TeamModal';

export default function TeamsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const { user } = useAuth();
  const { data: users = [] } = useUsers(user);
  const { data: teams = [] } = useTeams(user);
  const { data: evaluations = [] } = useEvaluations(undefined, user);
  const upsertTeam = useUpsertTeam();
  const { mutate: deleteTeam } = useDeleteTeam();

  const handleAddTeam = () => {
    setEditingTeam(null);
    setIsModalOpen(true);
  };

  const handleEditTeam = (team: Team) => {
    setEditingTeam(team);
    setIsModalOpen(true);
  };

  const handleDeleteTeam = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa nhóm "${name}"? Các nhân viên trong nhóm sẽ bị gán là "Chưa gán".`)) {
      deleteTeam(id);
    }
  };

  const handleSaveTeam = (data: Partial<Team>) => {
    upsertTeam.mutate({
      ...editingTeam,
      ...data,
    });
  };

  const teamsData = teams.map((team) => {
    const members = users.filter((u) => u.teamId === team.id);
    const leader = users.find((u) => u.id === team.leaderId);
    const teamEvaluations = evaluations.filter((e) => 
      members.some((m) => m.id === e.employeeId)
    );
    
    const completedCount = teamEvaluations.filter(e => e.status === 'Approved').length;
    const progress = members.length > 0 ? Math.round((completedCount / members.length) * 100) : 0;
    
    return {
      ...team,
      leader,
      leaderName: leader?.name || 'Chưa xác định',
      members,
      membersCount: members.length,
      completedCount,
      progress,
      status: progress === 100 ? 'Hoàn thành' : progress > 0 ? 'Đang thực hiện' : 'Chưa bắt đầu'
    };
  });

  // Summary stats
  const totalMembers = teamsData.reduce((s, t) => s + t.membersCount, 0);
  const totalCompleted = teamsData.reduce((s, t) => s + t.completedCount, 0);
  const overallProgress = totalMembers > 0 ? Math.round((totalCompleted / totalMembers) * 100) : 0;

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">Quản lý Nhóm QAQC</h1>
          <p className="text-on-surface-variant mt-1 text-sm md:text-base">Theo dõi tiến độ đánh giá theo từng đơn vị</p>
        </div>
        <button 
          onClick={handleAddTeam}
          className="w-full md:w-auto px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group active:scale-95"
        >
          <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
          Thêm nhóm mới
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Users size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-outline">Tổng nhóm</p>
            <p className="text-2xl font-black text-on-surface">{teamsData.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-50 text-green-600">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-outline">Đã đánh giá</p>
            <p className="text-2xl font-black text-on-surface">{totalCompleted}<span className="text-base font-medium text-on-surface/40">/{totalMembers}</span></p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-outline">Tiến độ chung</p>
            <p className="text-2xl font-black text-on-surface">{overallProgress}<span className="text-base font-medium text-on-surface/40">%</span></p>
          </div>
        </div>
      </div>

      {/* Team Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {teamsData.map((team) => {
          const statusColor = team.progress === 100 
            ? 'bg-green-100 text-green-700' 
            : team.progress > 0 
              ? 'bg-amber-100 text-amber-700' 
              : 'bg-surface text-outline';

          const progressColor = team.progress === 100 
            ? 'bg-green-500' 
            : 'bg-primary';

          return (
            <div 
              key={team.id} 
              className="group bg-white rounded-2xl border border-outline-variant shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300 flex flex-col overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-6 pb-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                    <Users size={22} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleEditTeam(team as unknown as Team);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-all"
                      title="Chỉnh sửa nhóm"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteTeam(team.id, team.name);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                      title="Xóa nhóm"
                    >
                      <Trash2 size={16} />
                    </button>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                      {team.status}
                    </span>
                  </div>
                </div>
                <h3 className="text-lg font-black text-on-surface mb-1.5">{team.name}</h3>
                <p className="text-sm text-outline flex items-center gap-1.5">
                  <UserIcon size={14} />
                  Leader: <span className="font-bold text-on-surface">{team.leaderName}</span>
                </p>
              </div>

              {/* Card Body */}
              <div className="px-6 pb-5 flex-1 space-y-5">
                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-xl bg-surface">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">Nhân sự</p>
                    <p className="text-xl font-black text-on-surface">{team.membersCount}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-surface">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">Xong</p>
                    <p className="text-xl font-black text-green-600">{team.completedCount}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-surface">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">Chờ</p>
                    <p className="text-xl font-black text-amber-600">{team.membersCount - team.completedCount}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-outline uppercase tracking-wider">Tiến độ</span>
                    <span className="text-sm font-black text-primary">{team.progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${progressColor} rounded-full transition-all duration-1000 ease-out`}
                      style={{ width: `${team.progress}%` }}
                    />
                  </div>
                </div>

                {/* Member Avatars */}
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {team.members.slice(0, 4).map((member) => (
                      <div 
                        key={member.id}
                        className="w-7 h-7 rounded-full bg-primary/10 border-2 border-white flex items-center justify-center text-[10px] font-bold text-primary"
                        title={member.name}
                      >
                        {member.name.charAt(0)}
                      </div>
                    ))}
                    {team.membersCount > 4 && (
                      <div className="w-7 h-7 rounded-full bg-surface border-2 border-white flex items-center justify-center text-[10px] font-bold text-outline">
                        +{team.membersCount - 4}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-outline">{team.membersCount} thành viên</span>
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-6 py-4 bg-surface/50 border-t border-outline-variant/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-green-600">
                    <CheckCircle2 size={14} />
                    <span>{team.completedCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
                    <Clock size={14} />
                    <span>{team.membersCount - team.completedCount}</span>
                  </div>
                </div>
                <Link 
                  href={`/teams/${team.id}`}
                  className="text-primary text-sm font-bold flex items-center gap-1 hover:gap-2 transition-all"
                >
                  Chi tiết
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <TeamModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTeam}
        team={editingTeam}
      />
    </div>
  );
}
