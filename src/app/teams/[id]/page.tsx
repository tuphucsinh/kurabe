'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useTeamsPageData } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { upsertUserAction } from '@/actions/users';
import EmployeeModal from '@/components/modals/EmployeeModal';
import {
  ArrowLeft,
  Users,
  CheckCircle2,
  Clock,
  ChevronRight,
  AlertTriangle,
  UserPlus,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Evaluation, User } from '@/types';
import { isIndividualRole } from '@/lib/role-policy';
import TeamDetailShell from '@/components/teams/TeamDetailShell';
import TeamDetailMemberCell from '@/components/teams/TeamDetailMemberCell';

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  Leader: { label: 'Leader', className: 'bg-indigo-100 text-indigo-700' },
  SubLeader: { label: 'SubLeader', className: 'bg-teal-100 text-teal-700' },
  Manager: { label: 'Manager', className: 'bg-rose-100 text-rose-700' },
  Worker: { label: 'Công nhân', className: 'bg-amber-100 text-amber-700' },
};

export default function TeamDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const teamId = params.id;

  const { user, currentPeriod } = useAuth();

  useEffect(() => {
    if (isIndividualRole(user?.role)) {
      router.replace(`/evaluations/${user?.id}`);
    }
  }, [user, router]);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [, setIsSaving] = useState(false);

  const isManager = user?.role === 'Manager';
  const isLeaderOwnTeam = user?.role === 'Leader' && user.teamId === teamId;
  const canAddEmployee = isManager || isLeaderOwnTeam;

  const { data: pg, isLoading, isError } = useTeamsPageData(currentPeriod?.id, user);
  const users = useMemo(() => pg?.users ?? [], [pg?.users]);
  const usersError = Boolean(pg?.usersError || isError);
  const usersLoading = isLoading;
  const teams = useMemo(() => pg?.teams ?? [], [pg?.teams]);
  const teamsError = Boolean(pg?.teamsError || isError);
  const teamsLoading = isLoading;
  const evaluations = useMemo(() => pg?.evaluations ?? [], [pg?.evaluations]);
  const evalsError = Boolean(pg?.evalsError || isError);
  const evalsLoading = isLoading;

  const isLightLoading = (!user && user === undefined) || usersLoading || teamsLoading;
  const isLightError = teamsError || usersError;

  const team = useMemo(() => teams.find((t) => t.id === teamId) || null, [teams, teamId]);
  const leader = useMemo(
    () => (team ? users.find((u) => u.id === team.leaderId) || null : null),
    [team, users]
  );
  const subLeaders = useMemo(
    () => users.filter((u) => u.teamId === teamId && u.role === 'SubLeader'),
    [users, teamId]
  );

  const sortedSubLeaders = useMemo(
    () => [...subLeaders].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [subLeaders]
  );

  const members = useMemo(
    () => users.filter((u) => u.teamId === teamId).sort((a, b) => a.role.localeCompare(b.role)),
    [users, teamId]
  );

  const evaluationMap = useMemo(() => {
    const map = new Map<string, Evaluation>();
    for (const ev of evaluations) {
      map.set(ev.employeeId, ev);
    }
    return map;
  }, [evaluations]);

  const directMemberRows = useMemo(() => {
    return members.filter((member) => {
      const isLeadershipOrManager =
        member.role === 'Leader' ||
        member.role === 'SubLeader' ||
        member.role === 'Manager' ||
        member.id === team?.leaderId;
      return !isLeadershipOrManager;
    });
  }, [members, team]);

  const subLeaderBlocks = useMemo(() => {
    const subLeaderIds = new Set(sortedSubLeaders.map((sl) => sl.id));

    const grouped = sortedSubLeaders.map((sl) => {
      const rows = directMemberRows.filter((member) => member.subleaderId === sl.id);
      return {
        subLeader: sl,
        rows,
      };
    });

    const unassignedRows = directMemberRows.filter(
      (member) => !member.subleaderId || !subLeaderIds.has(member.subleaderId)
    );

    return { grouped, unassignedRows };
  }, [sortedSubLeaders, directMemberRows]);

  const completedCount = useMemo(() => {
    if (evalsLoading || evalsError) return 0;
    const memberIds = new Set(members.map((m) => m.id));
    return evaluations.filter((e) => memberIds.has(e.employeeId) && e.status === 'Approved').length;
  }, [members, evaluations, evalsLoading, evalsError]);

  const pendingCount = Math.max(0, members.length - completedCount);

  const handleEditEmployee = (emp: User) => {
    if (!canAddEmployee) {
      toast('Bạn không có quyền chỉnh sửa nhân viên.', 'error');
      return;
    }
    setEditingEmployee(emp);
    setIsAddModalOpen(true);
  };

  const handleSaveEmployee = async (employee: Partial<User>) => {
    if (!canAddEmployee) {
      toast('Bạn không có quyền lưu thay đổi nhân viên.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const payload = editingEmployee
        ? ({ ...editingEmployee, ...employee, teamId } as User)
        : ({ ...employee, teamId } as User);
      const result = await upsertUserAction(payload);
      if (result.success) {
        toast(editingEmployee ? 'Cập nhật nhân viên thành công!' : 'Thêm nhân viên thành công!', 'success');
        queryClient.invalidateQueries({ queryKey: ['users'] });
        queryClient.invalidateQueries({ queryKey: ['teams'] });
        queryClient.invalidateQueries({ queryKey: ['evaluations'] });
        queryClient.invalidateQueries({ queryKey: ['teams-page-data'] });
      } else {
        toast(result.error || (editingEmployee ? 'Lỗi khi cập nhật nhân viên.' : 'Lỗi khi thêm nhân viên.'), 'error');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : (editingEmployee ? 'Lỗi khi cập nhật nhân viên.' : 'Lỗi khi thêm nhân viên.'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <TeamDetailShell>
      {/* Back Link & Header (Static Shell & Light/Heavy Frames) */}
      <div>
        {user?.role !== 'Leader' && user?.role !== 'SubLeader' ? (
          <Link prefetch={false} href="/teams" className="inline-flex items-center gap-1.5 text-sm font-bold text-outline hover:text-primary transition-colors mb-4">
            <ArrowLeft size={16} />
            Quay lại danh sách nhóm
          </Link>
        ) : null}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-wrap">
          <div>
            {isLightLoading ? (
              <Skeleton variant="text" width={240} height={36} />
            ) : team ? (
              <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">{team.name}</h1>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Cụm KPI Compact */}
            <div className="grid grid-cols-3 gap-1 bg-white rounded-xl border border-outline-variant/80 p-1 shadow-sm md:flex md:items-center md:px-1 md:py-0.5 md:gap-0 md:divide-x md:divide-slate-200">
              <div className="px-1 py-2 md:px-4 flex flex-col md:flex-row items-center gap-0.5 md:gap-2" data-load-layer="light">
                <Users size={18} className="text-slate-400 shrink-0 hidden md:block" />
                <span className="font-black text-lg text-on-surface">
                  {isLightLoading ? (
                    <Skeleton variant="text" width={24} height={20} className="inline-block" />
                  ) : isLightError || !team ? (
                    '-'
                  ) : (
                    members.length
                  )}
                </span>
                <span className="text-[11px] md:text-sm text-slate-500">thành viên</span>
              </div>
              <div className="px-1 py-2 md:px-4 flex flex-col md:flex-row items-center gap-0.5 md:gap-2" data-load-layer="heavy">
                <CheckCircle2 size={18} className="text-green-500 shrink-0 hidden md:block" />
                <span className="font-black text-lg text-on-surface">
                  {(isLightLoading || evalsLoading) ? (
                    <Skeleton variant="text" width={40} height={20} className="inline-block" />
                  ) : (isLightError || evalsError || !team) ? (
                    '-'
                  ) : (
                    `${completedCount}/${members.length}`
                  )}
                </span>
                <span className="text-[11px] md:text-sm text-slate-500">đã đánh giá</span>
              </div>
              <div className="px-1 py-2 md:px-4 flex flex-col md:flex-row items-center gap-0.5 md:gap-2" data-load-layer="heavy">
                <Clock size={18} className="text-amber-500 shrink-0 hidden md:block" />
                <span className="font-black text-lg text-on-surface">
                  {(isLightLoading || evalsLoading) ? (
                    <Skeleton variant="text" width={24} height={20} className="inline-block" />
                  ) : (isLightError || evalsError || !team) ? (
                    '-'
                  ) : (
                    pendingCount
                  )}
                </span>
                <span className="text-[11px] md:text-sm text-slate-500">còn lại</span>
              </div>
            </div>

            {canAddEmployee && (
              <button
                type="button"
                onClick={() => {
                  setEditingEmployee(null);
                  setIsAddModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#07384d] px-4 py-2.5 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#052b3b] active:scale-95 cursor-pointer"
              >
                <UserPlus size={18} />
                Thêm nhân viên
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLightLoading ? (
        <div className="space-y-5" data-load-layer="light">
          <Skeleton variant="rectangular" height={88} className="rounded-2xl" />
          <Skeleton variant="rectangular" height={180} className="rounded-2xl" />
          <Skeleton variant="rectangular" height={180} className="rounded-2xl" />
        </div>
      ) : isLightError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center" data-load-layer="light">
          <p className="text-rose-700 font-medium">Đã xảy ra lỗi khi tải thông tin nhóm QAQC. Vui lòng thử lại sau.</p>
        </div>
      ) : !team ? (
        <div data-load-layer="light">
          <EmptyState
            icon={Users}
            title="Nhóm không tồn tại"
            description="Nhóm này không có trong hệ thống hoặc đã bị xóa."
            action={
              user?.role !== 'Leader' && user?.role !== 'SubLeader'
                ? { label: 'Quay lại danh sách nhóm', onClick: () => { router.push('/teams'); }, icon: ArrowLeft }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-5" data-load-layer="light">
          {members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nhóm chưa có thành viên"
              description="Chưa có nhân viên nào được gán vào nhóm này."
              className="p-6 bg-white rounded-2xl border border-outline-variant shadow-sm"
            />
          ) : sortedSubLeaders.length === 0 && subLeaderBlocks.unassignedRows.length === 0 && !leader ? (
            <div className="py-6 text-center text-sm text-slate-500 bg-white rounded-2xl border border-outline-variant shadow-sm">
              Không có nhân viên trực thuộc trong nhóm.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Leader Block */}
              {leader && (
                <div key={leader.id} className="bg-white rounded-2xl border border-indigo-200/80 shadow-sm overflow-hidden p-4 space-y-3">
                  <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3.5 flex items-center gap-3">
                    {/* Desktop */}
                    <div className="max-md:hidden min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_32px_104px] md:grid-cols-[minmax(0,1fr)_32px_104px_144px] items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link prefetch={false} href={`/evaluations/${leader.id}`} className="font-bold text-slate-800 text-sm md:text-base hover:text-primary hover:underline truncate md:overflow-visible md:whitespace-normal" title="Đánh giá">{leader.name}</Link>
                          <span className="text-xs text-slate-500 font-medium">Mã: {leader.employeeCode}</span>
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                            Leader
                          </span>
                        </div>
                      </div>
                      <TeamDetailMemberCell
                        memberId={leader.id}
                        evaluation={evaluationMap.get(leader.id)}
                        isLoading={evalsLoading}
                        isError={evalsError}
                        mode="desktop"
                        canEdit={canAddEmployee}
                        onEdit={() => handleEditEmployee(leader)}
                      />
                    </div>
                    <TeamDetailMemberCell
                      memberId={leader.id}
                      evaluation={evaluationMap.get(leader.id)}
                      isLoading={evalsLoading}
                      isError={evalsError}
                      mode="action"
                      canEdit={canAddEmployee}
                      onEdit={() => handleEditEmployee(leader)}
                    />
                    {/* Mobile */}
                    <div className="md:hidden min-w-0 flex-1">
                      <Link prefetch={false} href={`/evaluations/${leader.id}`} className="font-bold text-slate-800 text-sm truncate block hover:text-primary hover:underline" title="Đánh giá">{leader.name}</Link>
                      <p className="text-xs text-slate-500 mt-1">Mã: {leader.employeeCode} · Vai trò: Leader</p>
                      <TeamDetailMemberCell
                        memberId={leader.id}
                        evaluation={evaluationMap.get(leader.id)}
                        isLoading={evalsLoading}
                        isError={evalsError}
                        mode="mobile"
                        canEdit={canAddEmployee}
                        onEdit={() => handleEditEmployee(leader)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SubLeader Blocks */}
              {subLeaderBlocks.grouped.map(({ subLeader: sl, rows }) => (
                <div
                  key={sl.id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-4 space-y-3"
                >
                  {/* Block Header */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center gap-3">
                    {/* Desktop */}
                    <div className="max-md:hidden min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_32px_104px] md:grid-cols-[minmax(0,1fr)_32px_104px_144px] items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link prefetch={false} href={`/evaluations/${sl.id}`} className="font-bold text-slate-800 text-sm md:text-base hover:text-primary hover:underline truncate md:overflow-visible md:whitespace-normal" title="Đánh giá">{sl.name}</Link>
                          <span className="text-xs text-slate-500 font-medium">Mã: {sl.employeeCode}</span>
                          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200/70">
                            {sl.description && sl.description.trim() !== '' ? sl.description : 'Chưa có chức danh'}
                          </span>
                        </div>
                      </div>
                      <TeamDetailMemberCell
                        memberId={sl.id}
                        evaluation={evaluationMap.get(sl.id)}
                        isLoading={evalsLoading}
                        isError={evalsError}
                        mode="desktop"
                        canEdit={canAddEmployee}
                        onEdit={() => handleEditEmployee(sl)}
                      />
                    </div>
                    <TeamDetailMemberCell
                      memberId={sl.id}
                      evaluation={evaluationMap.get(sl.id)}
                      isLoading={evalsLoading}
                      isError={evalsError}
                      mode="action"
                      canEdit={canAddEmployee}
                      onEdit={() => handleEditEmployee(sl)}
                    />
                    {/* Mobile */}
                    <div className="md:hidden min-w-0 flex-1">
                      <Link prefetch={false} href={`/evaluations/${sl.id}`} className="font-bold text-slate-800 text-sm truncate block hover:text-primary hover:underline" title="Đánh giá">{sl.name}</Link>
                      <p className="text-xs text-slate-500 mt-1">Mã: {sl.employeeCode} · Vai trò: SubLeader{sl.description && sl.description.trim() !== '' && !['SubLeader', 'Sub Leader', 'Leader', 'Manager'].includes(sl.description.trim()) ? ` · ${sl.description}` : ''}</p>
                      <TeamDetailMemberCell
                        memberId={sl.id}
                        evaluation={evaluationMap.get(sl.id)}
                        isLoading={evalsLoading}
                        isError={evalsError}
                        mode="mobile"
                        canEdit={canAddEmployee}
                        onEdit={() => handleEditEmployee(sl)}
                      />
                    </div>
                  </div>

                  {/* Direct Employees List */}
                  {rows.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400 font-medium italic">
                      Chưa có nhân viên trực thuộc
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {rows.map((member) => (
                        <div
                          key={member.id}
                          className="flex flex-wrap items-center gap-4 px-3 py-3 hover:bg-slate-50/60 rounded-lg transition-colors"
                        >
                          {/* Desktop */}
                          <div className="max-md:hidden min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_32px_104px] md:grid-cols-[minmax(0,1fr)_32px_104px_144px] items-center gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link prefetch={false} href={`/evaluations/${member.id}`} className="text-sm font-semibold text-on-surface truncate hover:text-primary hover:underline truncate md:overflow-visible md:whitespace-normal" title="Đánh giá">{member.name}</Link>
                                {member.role !== 'Employee' && ROLE_BADGE[member.role] && (
                                  <span
                                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[member.role].className}`}
                                  >
                                    {ROLE_BADGE[member.role].label}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-outline-variant mt-0.5">Mã: {member.employeeCode}</p>
                            </div>
                            <TeamDetailMemberCell
                              memberId={member.id}
                              evaluation={evaluationMap.get(member.id)}
                              isLoading={evalsLoading}
                              isError={evalsError}
                              mode="desktop"
                              canEdit={canAddEmployee}
                              onEdit={() => handleEditEmployee(member)}
                            />
                          </div>
                          <TeamDetailMemberCell
                            memberId={member.id}
                            evaluation={evaluationMap.get(member.id)}
                            isLoading={evalsLoading}
                            isError={evalsError}
                            mode="action"
                            canEdit={canAddEmployee}
                            onEdit={() => handleEditEmployee(member)}
                          />
                          {/* Mobile */}
                          <div className="md:hidden min-w-0 flex-1">
                            <Link prefetch={false} href={`/evaluations/${member.id}`} className="text-sm font-semibold text-on-surface truncate block hover:text-primary hover:underline" title="Đánh giá">{member.name}</Link>
                            <p className="text-xs text-slate-500 mt-1">Mã: {member.employeeCode}</p>
                            <TeamDetailMemberCell
                              memberId={member.id}
                              evaluation={evaluationMap.get(member.id)}
                              isLoading={evalsLoading}
                              isError={evalsError}
                              mode="mobile"
                              canEdit={canAddEmployee}
                              onEdit={() => handleEditEmployee(member)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Unassigned SubLeader Block */}
              {subLeaderBlocks.unassignedRows.length > 0 && (
                <div className="bg-white rounded-2xl border border-amber-200/80 shadow-sm overflow-hidden p-4 space-y-3">
                  {/* Warning Header */}
                  <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                      <div>
                        <span className="font-bold text-amber-900 text-sm md:text-base">Chưa gán SubLeader</span>
                        <span className="ml-2 text-xs text-amber-700 font-medium">
                          ({subLeaderBlocks.unassignedRows.length} nhân viên)
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                      Cần phân công
                    </span>
                  </div>

                  {/* Unassigned Employees List */}
                  <div className="divide-y divide-slate-100">
                    {subLeaderBlocks.unassignedRows.map((member) => (
                      <div
                        key={member.id}
                        className="flex flex-wrap items-center gap-4 px-3 py-3 hover:bg-slate-50/60 rounded-lg transition-colors"
                      >
                        {/* Desktop */}
                        <div className="max-md:hidden min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_32px_104px] md:grid-cols-[minmax(0,1fr)_32px_104px_144px] items-center gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link prefetch={false} href={`/evaluations/${member.id}`} className="text-sm font-semibold text-on-surface truncate hover:text-primary hover:underline truncate md:overflow-visible md:whitespace-normal" title="Đánh giá">{member.name}</Link>
                              {member.role !== 'Employee' && ROLE_BADGE[member.role] && (
                                <span
                                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[member.role].className}`}
                                >
                                  {ROLE_BADGE[member.role].label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-outline-variant mt-0.5">Mã: {member.employeeCode}</p>
                          </div>
                          <TeamDetailMemberCell
                            memberId={member.id}
                            evaluation={evaluationMap.get(member.id)}
                            isLoading={evalsLoading}
                            isError={evalsError}
                            mode="desktop"
                            canEdit={canAddEmployee}
                            onEdit={() => handleEditEmployee(member)}
                          />
                        </div>
                        <TeamDetailMemberCell
                          memberId={member.id}
                          evaluation={evaluationMap.get(member.id)}
                          isLoading={evalsLoading}
                          isError={evalsError}
                          mode="action"
                          canEdit={canAddEmployee}
                          onEdit={() => handleEditEmployee(member)}
                        />
                        {/* Mobile */}
                        <div className="md:hidden min-w-0 flex-1">
                          <Link prefetch={false} href={`/evaluations/${member.id}`} className="text-sm font-semibold text-on-surface truncate block hover:text-primary hover:underline" title="Đánh giá">{member.name}</Link>
                          <p className="text-xs text-slate-500 mt-1">Mã: {member.employeeCode}</p>
                          <TeamDetailMemberCell
                            memberId={member.id}
                            evaluation={evaluationMap.get(member.id)}
                            isLoading={evalsLoading}
                            isError={evalsError}
                            mode="mobile"
                            canEdit={canAddEmployee}
                            onEdit={() => handleEditEmployee(member)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer tip */}
      <div className="flex items-center gap-2 text-sm text-outline-variant">
        <ChevronRight size={16} className="text-outline/40" />
        Bấm vào tên để xem chi tiết đánh giá của từng thành viên.
      </div>

      <EmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingEmployee(null);
        }}
        employee={editingEmployee}
        onSave={handleSaveEmployee}
        restrictToTeamId={teamId}
        roleOptions={isManager ? ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'] : ['SubLeader', 'Employee', 'Worker']}
        allUsers={users}
        teams={teams}
      />
    </TeamDetailShell>
  );
}
