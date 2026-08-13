'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useUsers, useTeams, useEvaluations } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft,
  Users,
  CheckCircle2,
  Clock,
  Crown,
  User as UserIcon,
  FileText,
  ChevronRight,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Evaluation, User } from '@/types';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  Approved: { label: 'Đã xong', className: 'bg-green-100 text-green-700' },
  NotStarted: { label: 'Chưa bắt đầu', className: 'bg-slate-100 text-slate-500' },
  InProgress: { label: 'Đang thực hiện', className: 'bg-amber-100 text-amber-700' },
};

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  Leader: { label: 'Leader', className: 'bg-indigo-100 text-indigo-700' },
  SubLeader: { label: 'SubLeader', className: 'bg-teal-100 text-teal-700' },
  Manager: { label: 'Manager', className: 'bg-rose-100 text-rose-700' },
};

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const teamId = params.id;

  const { user } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useUsers(user);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(user);
  const { data: evaluations = [], isLoading: evalsLoading } = useEvaluations(undefined, user);

  const isLoading = usersLoading || teamsLoading || evalsLoading;

  const team = useMemo(() => teams.find((t) => t.id === teamId) || null, [teams, teamId]);
  const leader = useMemo(
    () => (team ? users.find((u) => u.id === team.leaderId) || null : null),
    [team, users]
  );
  const subLeaders = useMemo(
    () => users.filter((u) => u.teamId === teamId && u.role === 'SubLeader'),
    [users, teamId]
  );
  const members = useMemo(
    () => users.filter((u) => u.teamId === teamId).sort((a, b) => a.role.localeCompare(b.role)),
    [users, teamId]
  );

  const memberRows = useMemo(() => {
    return members.map((m: User) => {
      const ev = evaluations.find((e: Evaluation) => e.employeeId === m.id);
      const status = ev ? ev.status : 'NotStarted';
      const grade = ev?.finalGrade || (ev?.rounds?.length ? ev.rounds[ev.rounds.length - 1].grade : null);
      return { member: m, evaluation: ev || null, status, grade };
    });
  }, [members, evaluations]);

  const completedCount = memberRows.filter((r) => r.status === 'Approved').length;
  const pendingCount = memberRows.length - completedCount;
  const progress = memberRows.length > 0 ? Math.round((completedCount / memberRows.length) * 100) : 0;

  if (isLoading) {
    return (
      <div className="px-6 md:px-10 lg:px-12 py-8 space-y-6 w-full max-w-[1600px] mx-auto">
        <Skeleton variant="text" width={240} height={32} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} variant="rectangular" height={88} className="rounded-2xl" />)}
        </div>
        <Skeleton variant="rectangular" height={320} className="rounded-2xl" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="px-6 md:px-10 lg:px-12 py-8 w-full max-w-[1600px] mx-auto">
        <EmptyState
          icon={Users}
          title="Nhóm không tồn tại"
          description="Nhóm này không có trong hệ thống hoặc đã bị xóa."
          action={{
            label: 'Quay lại danh sách nhóm',
            onClick: () => { window.location.href = '/teams'; },
            icon: ArrowLeft,
          }}
        />
      </div>
    );
  }

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Back + Header */}
      <div>
        <Link href="/teams" className="inline-flex items-center gap-1.5 text-sm font-bold text-outline hover:text-primary transition-colors mb-4">
          <ArrowLeft size={16} />
          Quay lại danh sách nhóm
        </Link>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">{team.name}</h1>
            <p className="text-on-surface-variant mt-1 text-sm md:text-base flex items-center gap-2">
              <Crown size={16} className="text-indigo-500" />
              Leader: <span className="font-semibold text-on-surface">{leader?.name || 'Chưa xác định'}</span>
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${
            progress === 100 ? 'bg-green-100 text-green-700' : progress > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {progress === 100 ? 'Hoàn thành' : progress > 0 ? 'Đang thực hiện' : 'Chưa bắt đầu'}
          </span>
        </div>

        {/* Danh sách SubLeader trong Header */}
        <div className="mt-4 pt-3 border-t border-outline-variant/40 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-outline uppercase tracking-wider flex items-center gap-1.5 shrink-0">
            <UserCheck size={14} className="text-teal-600" />
            SubLeader ({subLeaders.length}):
          </span>
          {subLeaders.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {subLeaders.map((sl) => (
                <div
                  key={sl.id}
                  className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1 rounded-xl text-xs"
                >
                  <span className="font-bold text-on-surface">{sl.name}</span>
                  <span className="text-outline-variant text-[11px]">({sl.employeeCode})</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200/60">
                    {sl.description && sl.description.trim() !== '' ? sl.description : 'Chưa có chức danh'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200/70 px-3 py-1 rounded-xl inline-flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-amber-500" />
              Chưa có SubLeader — cần bổ sung
            </span>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary"><Users size={22} /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-outline">Thành viên</p>
            <p className="text-2xl font-black text-on-surface">{memberRows.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-green-50 text-green-600"><CheckCircle2 size={22} /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-outline">Đã đánh giá</p>
            <p className="text-2xl font-black text-on-surface">{completedCount}<span className="text-base font-medium text-on-surface/40">/{memberRows.length}</span></p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-outline-variant shadow-sm p-5 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 text-amber-600"><Clock size={22} /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-outline">Còn lại</p>
            <p className="text-2xl font-black text-on-surface">{pendingCount}</p>
          </div>
        </div>
      </div>

      {/* Members table */}
      <div className="bg-white rounded-3xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant/50 flex items-center gap-2">
          <UserIcon size={18} className="text-primary" />
          <h2 className="text-lg font-bold text-on-surface">Thành viên nhóm</h2>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{memberRows.length}</span>
        </div>

        {memberRows.length === 0 ? (
          <div className="p-10">
            <EmptyState icon={Users} title="Nhóm chưa có thành viên" description="Chưa có nhân viên nào được gán vào nhóm này." className="p-0" />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {memberRows.map(({ member, evaluation, status, grade }) => {
              const badge = STATUS_BADGE[status] || STATUS_BADGE.NotStarted;
              const assignedSubLeader = member.subleaderId
                ? users.find((u) => u.id === member.subleaderId)
                : null;

              return (
                <div key={member.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                    {member.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-on-surface truncate">{member.name}</p>
                      {member.role !== 'Employee' && ROLE_BADGE[member.role] && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[member.role].className}`}>
                          {ROLE_BADGE[member.role].label}
                        </span>
                      )}
                      {member.id === team.leaderId && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 flex items-center gap-0.5">
                          <Crown size={10} /> Trưởng nhóm
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-outline-variant mt-0.5">Mã: {member.employeeCode}</p>
                  </div>
                  {/* SubLeader của NV */}
                  <div className="shrink-0 flex items-center gap-1.5 text-xs min-w-[130px]">
                    <span className="text-[11px] text-outline font-medium hidden md:inline">SubLeader:</span>
                    {assignedSubLeader ? (
                      <span className="font-semibold text-slate-700 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded-md text-xs truncate max-w-[140px]" title={assignedSubLeader.name}>
                        {assignedSubLeader.name}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200/60">
                        Chưa gán
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${badge.className}`}>
                    {badge.label}
                  </span>
                  {grade && grade !== 'Pending' && (
                    <span className="text-sm font-black text-primary shrink-0 w-8 text-center">{grade}</span>
                  )}
                  {evaluation ? (
                    <Link
                      href={`/evaluations/${member.id}`}
                      className="p-2 text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
                      title="Xem đánh giá"
                    >
                      <FileText size={18} />
                    </Link>
                  ) : (
                    <span className="w-9 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer tip */}
      <div className="flex items-center gap-2 text-sm text-outline-variant">
        <ChevronRight size={16} className="text-outline/40" />
        Bấm icon tài liệu để xem chi tiết đánh giá của từng thành viên.
      </div>
    </div>
  );
}

