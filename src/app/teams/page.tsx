'use client';

import { useUsers, useTeams, useEvaluations, useUpsertTeam, useDeleteTeam } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { Team } from '@/types';
import { 
  Users, 
  User as UserIcon, 
  CheckCircle2, 
  Plus,
  TrendingUp,
  Edit2,
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import TeamModal from '@/components/modals/TeamModal';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Skeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export default function TeamsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const { user } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useUsers(user);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(user);
  const { data: evaluations = [], isLoading: evalsLoading } = useEvaluations(undefined, user);
  const upsertTeam = useUpsertTeam();
  const { mutate: deleteTeam } = useDeleteTeam();
  const { toast } = useToast();
  const confirm = useConfirm();
  
  const isLoading = usersLoading || teamsLoading || evalsLoading;
  const isManager = user?.role === 'Manager';

  const handleAddTeam = () => {
    if (!isManager) {
      toast('Chỉ Quản lý mới có quyền thêm nhóm.', 'warning');
      return;
    }
    setEditingTeam(null);
    setIsModalOpen(true);
  };

  const handleEditTeam = (team: Team) => {
    if (!isManager) {
      toast('Chỉ Quản lý mới có quyền chỉnh sửa nhóm.', 'warning');
      return;
    }
    setEditingTeam(team);
    setIsModalOpen(true);
  };

  const handleDeleteTeam = async (id: string, name: string) => {
    if (!isManager) {
      toast('Chỉ Quản lý mới có quyền xóa nhóm.', 'error');
      return;
    }

    const confirmed = await confirm({
      title: 'Xóa nhóm',
      message: `Bạn có chắc chắn muốn xóa nhóm "${name}"? Các nhân viên trong nhóm sẽ bị gán là "Chưa gán".`,
      confirmText: 'Xóa nhóm',
      variant: 'danger'
    });

    if (confirmed) {
      deleteTeam(id, {
        onSuccess: () => toast('Đã xóa nhóm.', 'success'),
        onError: () => toast('Lỗi khi xóa nhóm.', 'error')
      });
    }
  };

  const handleSaveTeam = (data: Partial<Team>) => {
    upsertTeam.mutate({
      ...editingTeam,
      ...data,
    }, {
      onSuccess: () => toast('Cập nhật nhóm thành công!', 'success'),
      onError: () => toast('Lỗi khi cập nhật nhóm.', 'error')
    });
  };
  
  if (isLoading) {
    return (
      <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 w-full max-w-[1600px] mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="space-y-2">
            <Skeleton variant="text" width={200} height={32} />
            <Skeleton variant="text" width={300} height={20} />
          </div>
          <Skeleton variant="rectangular" width={140} height={40} className="rounded-xl" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">Quản lý Nhóm QAQC</h1>
          <p className="text-on-surface-variant mt-1 text-sm md:text-base">Theo dõi tiến độ đánh giá theo từng đơn vị</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Cụm KPI Compact */}
          <div className="flex items-center bg-white rounded-xl border border-outline-variant/80 px-1 py-0.5 shadow-sm divide-x divide-slate-200">
            <div className="px-4 py-2.5 flex items-center gap-2">
              <Users size={18} className="text-slate-400 shrink-0" />
              <span className="font-black text-lg text-on-surface">{teamsData.length}</span>
              <span className="text-sm text-slate-500">tổng nhóm</span>
            </div>
            <div className="px-4 py-2.5 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-500 shrink-0" />
              <span className="font-black text-lg text-on-surface">{totalCompleted}/{totalMembers}</span>
              <span className="text-sm text-slate-500">đã đánh giá</span>
            </div>
            <div className="px-4 py-2.5 flex items-center gap-2">
              <TrendingUp size={18} className="text-amber-500 shrink-0" />
              <span className="font-black text-lg text-on-surface">{overallProgress}%</span>
              <span className="text-sm text-slate-500">tiến độ</span>
            </div>
          </div>

          {isManager && (
            <button 
              onClick={handleAddTeam}
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group active:scale-95 shrink-0"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
              Thêm nhóm mới
            </button>
          )}
        </div>
      </div>

      {/* Team Cards */}
      {teamsData.length > 0 ? (
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
              <Link 
                key={team.id} 
                href={`/teams/${team.id}`}
                className="group bg-white rounded-2xl border border-outline-variant shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300 flex flex-col overflow-hidden cursor-pointer"
              >
                {/* Card Header */}
                <div className="p-6 pb-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                      <Users size={22} />
                    </div>
                    <div className="flex items-center gap-2">
                      {isManager && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                  <h3 className="text-lg font-black text-on-surface mb-1.5">{team.name}</h3>
                  <p className="text-sm text-outline flex items-center gap-1.5">
                    <UserIcon size={14} />
                    Leader: <span className="font-bold text-on-surface">{team.leaderName}</span>
                  </p>
                </div>

                {/* Card Body */}
                <div className="px-6 pb-6 flex-1 space-y-5">
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

                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-dashed border-outline-variant p-12 min-h-[400px] flex items-center justify-center">
          <EmptyState 
            icon={Users}
            title="Chưa có nhóm nào"
            description="Hệ thống hiện chưa có nhóm QAQC nào. Hãy tạo nhóm mới để bắt đầu quản lý nhân sự và đánh giá."
            action={isManager ? {
              label: "Tạo nhóm mới",
              onClick: handleAddTeam,
              icon: Plus
            } : undefined}
          />
        </div>
      )}

      <TeamModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTeam}
        team={editingTeam}
      />
    </div>
  );
}
