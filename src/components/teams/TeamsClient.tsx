'use client';

import { useTeamsPageData, useUpsertTeam, useDeleteTeam } from '@/hooks/use-db';
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
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import TeamsShell from '@/components/teams/TeamsShell';
import TeamEvaluationCell from '@/components/teams/TeamEvaluationCell';
import TeamCardSkeleton from '@/components/teams/TeamCardSkeleton';

export default function TeamsClient() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const { user, currentPeriod } = useAuth();
  const { data, isLoading, isError } = useTeamsPageData(currentPeriod?.id, user);
  const users = data?.users ?? [];
  const teams = data?.teams ?? [];
  const evaluations = data?.evaluations ?? [];
  const usersError = Boolean(data?.usersError || isError);
  const teamsError = Boolean(data?.teamsError || isError);
  const evalsError = Boolean(data?.evalsError || isError);
  const evalsLoading = isLoading;
  const upsertTeam = useUpsertTeam();
  const { mutate: deleteTeam } = useDeleteTeam();
  const { toast } = useToast();
  const confirm = useConfirm();

  const isLightLoading = (!user && user === undefined) || isLoading;
  const isLightError = teamsError || usersError;
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
    const teamId = editingTeam?.id || data.id || crypto.randomUUID();
    upsertTeam.mutate({
      ...editingTeam,
      ...data,
      id: teamId,
    }, {
      onSuccess: () => {
        toast('Cập nhật nhóm thành công!', 'success');
        // Audit CREATE_TEAM/UPDATE_TEAM đã ghi trong upsertTeamAction (P70T02) — không ghi trùng ở UI
      },
      onError: () => toast('Lỗi khi cập nhật nhóm.', 'error')
    });
  };

  const teamsData = teams.map((team) => {
    const members = users.filter((u) => u.teamId === team.id);
    const leader = users.find((u) => u.id === team.leaderId);

    let completedCount = 0;
    let progress = 0;
    let status = 'Chưa bắt đầu';

    if (!evalsLoading && !evalsError && evaluations.length > 0) {
      const teamEvaluations = evaluations.filter((e) =>
        members.some((m) => m.id === e.employeeId)
      );
      completedCount = teamEvaluations.filter(e => e.status === 'Approved').length;
      progress = members.length > 0 ? Math.round((completedCount / members.length) * 100) : 0;
      status = progress === 100 ? 'Hoàn thành' : progress > 0 ? 'Đang thực hiện' : 'Chưa bắt đầu';
    }

    return {
      ...team,
      leader,
      leaderName: leader?.name || 'Chưa xác định',
      members,
      membersCount: members.length,
      completedCount,
      progress,
      status
    };
  });

  // Summary stats
  const totalMembers = teamsData.reduce((s, t) => s + t.membersCount, 0);
  const totalCompleted = teamsData.reduce((s, t) => s + t.completedCount, 0);
  const overallProgress = totalMembers > 0 ? Math.round((totalCompleted / totalMembers) * 100) : 0;

  return (
    <TeamsShell>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">Quản lý Nhóm QAQC</h1>
          <p className="text-on-surface-variant mt-1 text-sm md:text-base">Theo dõi tiến độ đánh giá theo từng đơn vị</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Cụm KPI Compact */}
          <div className="grid grid-cols-3 gap-1 bg-white rounded-xl border border-outline-variant/80 p-1 shadow-sm md:flex md:items-center md:px-1 md:py-0.5 md:gap-0 md:divide-x md:divide-slate-200">
            <div className="px-1 py-2 md:px-4 flex flex-col md:flex-row items-center gap-0.5 md:gap-2" data-load-layer="light">
              <Users size={18} className="text-slate-400 shrink-0 hidden md:block" />
              <span className="font-black text-lg text-on-surface">
                {isLightLoading ? <Skeleton variant="text" width={24} height={20} className="inline-block" /> : teamsData.length}
              </span>
              <span className="text-[11px] md:text-sm text-slate-500">tổng nhóm</span>
            </div>
            <div className="px-1 py-2 md:px-4 flex flex-col md:flex-row items-center gap-0.5 md:gap-2" data-load-layer="heavy">
              <CheckCircle2 size={18} className="text-green-500 shrink-0 hidden md:block" />
              <span className="font-black text-lg text-on-surface">
                {(isLightLoading || evalsLoading) ? (
                  <Skeleton variant="text" width={40} height={20} className="inline-block" />
                ) : evalsError ? (
                  '-'
                ) : (
                  `${totalCompleted}/${totalMembers}`
                )}
              </span>
              <span className="text-[11px] md:text-sm text-slate-500">đã đánh giá</span>
            </div>
            <div className="px-1 py-2 md:px-4 flex flex-col md:flex-row items-center gap-0.5 md:gap-2" data-load-layer="heavy">
              <TrendingUp size={18} className="text-amber-500 shrink-0 hidden md:block" />
              <span className="font-black text-lg text-on-surface">
                {(isLightLoading || evalsLoading) ? (
                  <Skeleton variant="text" width={36} height={20} className="inline-block" />
                ) : evalsError ? (
                  '-'
                ) : (
                  `${overallProgress}%`
                )}
              </span>
              <span className="text-[11px] md:text-sm text-slate-500">tiến độ</span>
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

      {/* Team Cards / Light Layer */}
      {isLightLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6" data-load-layer="light">
          <TeamCardSkeleton />
          <TeamCardSkeleton />
          <TeamCardSkeleton />
          <TeamCardSkeleton />
          <TeamCardSkeleton />
          <TeamCardSkeleton />
          <TeamCardSkeleton />
          <TeamCardSkeleton />
        </div>
      ) : isLightError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center" data-load-layer="light">
          <p className="text-rose-700 font-medium">Đã xảy ra lỗi khi tải danh sách nhóm QAQC. Vui lòng thử lại sau.</p>
        </div>
      ) : teamsData.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6" data-load-layer="light">
          {teamsData.map((team) => (
            <Link
              key={team.id}
              prefetch={false}
              href={`/teams/${team.id}`}
              className="group bg-white rounded-2xl border border-outline-variant shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300 flex flex-col overflow-hidden cursor-pointer"
            >
              {/* Card Header (Light Data) */}
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
                          className="p-2.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-all"
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
                          className="p-2.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
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

              {/* Card Body (Heavy Data / Evaluation Progress) */}
              <div className="px-6 pb-6 flex-1">
                <TeamEvaluationCell
                  membersCount={team.membersCount}
                  completedCount={team.completedCount}
                  progress={team.progress}
                  isLoading={evalsLoading}
                  isError={evalsError}
                />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-dashed border-outline-variant p-12 min-h-[400px] flex items-center justify-center" data-load-layer="light">
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
        key={editingTeam?.id ?? 'new'}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTeam}
        team={editingTeam}
      />
    </TeamsShell>
  );
}
