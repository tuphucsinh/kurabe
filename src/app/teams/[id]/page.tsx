'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useUsers, useTeams, useEvaluations } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft,
  FileText,
  Users,
  CheckCircle2,
  Clock,
  Crown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Evaluation, User } from '@/types';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  Approved: { label: 'Đã có KẾT QUẢ đánh giá', className: 'bg-emerald-600 text-white font-bold shadow-sm' },
  NotStarted: { label: 'Chưa bắt đầu', className: 'bg-slate-100 text-slate-500' },
  InProgress: { label: 'Đang thực hiện', className: 'bg-amber-100 text-amber-700' },
  Draft: { label: 'Đang thực hiện', className: 'bg-amber-100 text-amber-700' },
  Submitted: { label: 'Đã nộp', className: 'bg-blue-100 text-blue-700' },
  Reviewed: { label: 'Đã xem xét', className: 'bg-indigo-100 text-indigo-700' },
};

function getStatusBadge(status: string, latestRound?: number | null): { label: string; className: string } {
  if (status === 'Submitted') {
    const roundText = latestRound ? ` vòng ${latestRound}` : '';
    return {
      label: `Đã nộp${roundText}`,
      className: 'bg-blue-100 text-blue-700',
    };
  }
  return STATUS_BADGE[status] || STATUS_BADGE.NotStarted;
}

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

  const sortedSubLeaders = useMemo(
    () => [...subLeaders].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [subLeaders]
  );

  const members = useMemo(
    () => users.filter((u) => u.teamId === teamId).sort((a, b) => a.role.localeCompare(b.role)),
    [users, teamId]
  );

  const memberRows = useMemo(() => {
    return members.map((m: User) => {
      const ev = evaluations.find((e: Evaluation) => e.employeeId === m.id);
      const status = ev ? ev.status : 'NotStarted';
      const submittedRounds = ev?.rounds
        ? [...ev.rounds].filter((r) => r.status === 'Submitted' || r.submittedAt).sort((a, b) => b.round - a.round)
        : [];
      const latestSubmittedRound = submittedRounds[0]?.round ?? ev?.currentRound ?? null;
      const grade = ev?.finalGrade || (submittedRounds.length ? submittedRounds[0].grade : null);
      const gradeRound = submittedRounds[0]?.round ?? null;
      const score = submittedRounds[0]?.totalScore ?? null;
      const previousRounds = submittedRounds.slice(1).map((r) => ({
        round: r.round,
        score: r.totalScore,
      }));
      return { member: m, evaluation: ev || null, status, grade, gradeRound, latestSubmittedRound, score, previousRounds };
    });
  }, [members, evaluations]);

  const directMemberRows = useMemo(() => {
    return memberRows.filter(({ member }) => {
      const isLeadershipOrManager =
        member.role === 'Leader' ||
        member.role === 'SubLeader' ||
        member.role === 'Manager' ||
        member.id === team?.leaderId;
      return !isLeadershipOrManager;
    });
  }, [memberRows, team]);

  const subLeaderBlocks = useMemo(() => {
    const subLeaderIds = new Set(sortedSubLeaders.map((sl) => sl.id));

    const grouped = sortedSubLeaders.map((sl) => {
      const rows = directMemberRows.filter(({ member }) => member.subleaderId === sl.id);
      return {
        subLeader: sl,
        rows,
      };
    });

    const unassignedRows = directMemberRows.filter(
      ({ member }) => !member.subleaderId || !subLeaderIds.has(member.subleaderId)
    );

    return { grouped, unassignedRows };
  }, [sortedSubLeaders, directMemberRows]);

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
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-6 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Back + Header */}
      <div>
        <Link href="/teams" className="inline-flex items-center gap-1.5 text-sm font-bold text-outline hover:text-primary transition-colors mb-4">
          <ArrowLeft size={16} />
          Quay lại danh sách nhóm
        </Link>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">{team.name}</h1>
            <p className="text-on-surface-variant mt-1 text-sm md:text-base flex items-center gap-2">
              <Crown size={16} className="text-indigo-500" />
              Leader: <span className="font-semibold text-on-surface">{leader?.name || 'Chưa xác định'}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Cụm KPI Compact */}
            <div className="flex items-center bg-white rounded-xl border border-outline-variant/80 px-1 py-0.5 shadow-sm divide-x divide-slate-200">
              <div className="px-4 py-2.5 flex items-center gap-2">
                <Users size={18} className="text-slate-400 shrink-0" />
                <span className="font-black text-lg text-on-surface">{memberRows.length}</span>
                <span className="text-sm text-slate-500">thành viên</span>
              </div>
              <div className="px-4 py-2.5 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                <span className="font-black text-lg text-on-surface">{completedCount}/{memberRows.length}</span>
                <span className="text-sm text-slate-500">đã đánh giá</span>
              </div>
              <div className="px-4 py-2.5 flex items-center gap-2">
                <Clock size={18} className="text-amber-500 shrink-0" />
                <span className="font-black text-lg text-on-surface">{pendingCount}</span>
                <span className="text-sm text-slate-500">còn lại</span>
              </div>
            </div>

            {/* Status Pill */}
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
              progress === 100 ? 'bg-green-100 text-green-700' : progress > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {progress === 100 ? 'Hoàn thành' : progress > 0 ? 'Đang thực hiện' : 'Chưa bắt đầu'}
            </span>
          </div>
        </div>
      </div>

      {/* Grouped SubLeader Blocks */}
      <div className="space-y-5">
        {memberRows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nhóm chưa có thành viên"
            description="Chưa có nhân viên nào được gán vào nhóm này."
            className="p-6 bg-white rounded-2xl border border-outline-variant shadow-sm"
          />
        ) : sortedSubLeaders.length === 0 && subLeaderBlocks.unassignedRows.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500 bg-white rounded-2xl border border-outline-variant shadow-sm">
            Không có nhân viên trực thuộc trong nhóm.
          </div>
        ) : (
          <div className="space-y-5">
            {/* SubLeader Blocks */}
            {subLeaderBlocks.grouped.map(({ subLeader: sl, rows }) => (
              <div
                key={sl.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-4 space-y-3"
              >
                {/* Block Header */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                      {sl.name.charAt(0)}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm md:text-base">{sl.name}</span>
                      <span className="text-xs text-slate-500 font-medium">Mã: {sl.employeeCode}</span>
                      <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200/70">
                        {sl.description && sl.description.trim() !== '' ? sl.description : 'Chưa có chức danh'}
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
                    {rows.length} nhân viên
                  </span>
                </div>

                {/* Direct Employees List */}
                {rows.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-400 font-medium italic">
                    Chưa có nhân viên trực thuộc
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {rows.map(({ member, evaluation, status, grade, gradeRound, latestSubmittedRound, score, previousRounds }) => {
                      const badge = getStatusBadge(status, latestSubmittedRound);
                      return (
                        <div
                          key={member.id}
                          className="flex flex-wrap items-center gap-4 px-3 py-3 hover:bg-slate-50/60 rounded-lg transition-colors"
                        >
                          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {member.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-on-surface truncate">{member.name}</p>
                              {member.role !== 'Employee' && ROLE_BADGE[member.role] && (
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_BADGE[member.role].className}`}
                                >
                                  {ROLE_BADGE[member.role].label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-outline-variant mt-0.5">Mã: {member.employeeCode}</p>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${badge.className}`}>
                                {badge.label}
                              </span>
                              {grade && grade !== 'Pending' && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black ${
                                    grade === 'S' ? 'bg-indigo-100 text-indigo-700' :
                                    grade === 'A' ? 'bg-emerald-100 text-emerald-700' :
                                    grade === 'AB' ? 'bg-teal-100 text-teal-700' :
                                    grade === 'B' ? 'bg-blue-100 text-blue-700' :
                                    grade === 'C' ? 'bg-amber-100 text-amber-700' :
                                    grade === 'D' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'
                                  }`}>
                                    {grade}
                                  </span>
                                  <div className="flex items-end gap-2 tabular-nums">
                                    {gradeRound != null && (
                                      <div className="w-12 flex flex-col items-center leading-none">
                                        <span className="text-xs text-slate-700 font-bold">L{gradeRound}</span>
                                        <span className="text-base text-slate-800 font-bold mt-1">{score}</span>
                                      </div>
                                    )}
                                    {previousRounds.map((roundData) => (
                                      <div key={roundData.round} className="w-12 flex flex-col items-center leading-none opacity-55">
                                        <span className="text-xs text-slate-500 font-medium">L{roundData.round}</span>
                                        <span className="text-sm text-slate-500 font-medium mt-1">{roundData.score}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <Link
                            href={`/evaluations/${member.id}`}
                            className="p-2 text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
                            title="Xem đánh giá"
                          >
                            <FileText size={18} />
                          </Link>
                        </div>
                      );
                    })}
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
                  {subLeaderBlocks.unassignedRows.map(({ member, evaluation, status, grade, gradeRound, latestSubmittedRound, score, previousRounds }) => {
                    const badge = getStatusBadge(status, latestSubmittedRound);
                    return (
                      <div
                        key={member.id}
                        className="flex flex-wrap items-center gap-4 px-3 py-3 hover:bg-slate-50/60 rounded-lg transition-colors"
                      >
                        <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {member.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-on-surface truncate">{member.name}</p>
                          </div>
                          <p className="text-xs text-outline-variant mt-0.5">Mã: {member.employeeCode}</p>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${badge.className}`}>
                              {badge.label}
                            </span>
                            {grade && grade !== 'Pending' && (
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black ${
                                  grade === 'S' ? 'bg-indigo-100 text-indigo-700' :
                                  grade === 'A' ? 'bg-emerald-100 text-emerald-700' :
                                  grade === 'AB' ? 'bg-teal-100 text-teal-700' :
                                  grade === 'B' ? 'bg-blue-100 text-blue-700' :
                                  grade === 'C' ? 'bg-amber-100 text-amber-700' :
                                  grade === 'D' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'
                                }`}>
                                  {grade}
                                </span>
                                <div className="flex items-end gap-2 tabular-nums">
                                  {gradeRound != null && (
                                    <div className="w-12 flex flex-col items-center leading-none">
                                      <span className="text-xs text-slate-700 font-bold">L{gradeRound}</span>
                                      <span className="text-base text-slate-800 font-bold mt-1">{score}</span>
                                    </div>
                                  )}
                                  {previousRounds.map((roundData) => (
                                    <div key={roundData.round} className="w-12 flex flex-col items-center leading-none opacity-55">
                                      <span className="text-xs text-slate-500 font-medium">L{roundData.round}</span>
                                      <span className="text-sm text-slate-500 font-medium mt-1">{roundData.score}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <Link
                          href={`/evaluations/${member.id}`}
                          className="p-2 text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
                          title="Xem đánh giá"
                        >
                          <FileText size={18} />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
