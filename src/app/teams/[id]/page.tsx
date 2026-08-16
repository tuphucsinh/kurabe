'use client';

import { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useUsers, useTeams, useEvaluations } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { upsertUserAction } from '@/actions/users';
import EmployeeModal from '@/components/modals/EmployeeModal';
import {
  ArrowLeft,
  FileText,
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

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  Approved: { label: 'Đã có KQĐG', className: 'bg-emerald-600 text-white font-bold shadow-sm' },
  NotStarted: { label: 'Chưa bắt đầu', className: 'bg-slate-100 text-slate-500' },
  InProgress: { label: 'Đang thực hiện', className: 'bg-amber-100 text-amber-700' },
  Draft: { label: 'Đang thực hiện', className: 'bg-amber-100 text-amber-700' },
  Submitted: { label: 'Đã nộp', className: 'bg-blue-100 text-blue-700' },
  Reviewed: { label: 'Đã nộp', className: 'bg-blue-100 text-blue-700' },
};

function getStatusBadge(status: string, latestRound?: number | null): { label: string; className: string } {
  if (status === 'Submitted' || status === 'Reviewed') {
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
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const teamId = params.id;

  const { user } = useAuth();

  useEffect(() => {
    if (user?.role === 'Employee') {
      router.replace(`/evaluations/${user.id}`);
    }
  }, [user, router]);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isManager = user?.role === 'Manager';
  const isLeaderOwnTeam = user?.role === 'Leader' && user.teamId === teamId;
  const canAddEmployee = isManager || isLeaderOwnTeam;

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
      const previousRounds = submittedRounds
        .slice(1)
        .sort((a, b) => a.round - b.round)
        .map((r) => ({
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

  const handleSaveEmployee = async (employee: Partial<User>) => {
    setIsSaving(true);
    try {
      const payload = { ...employee, teamId };
      const result = await upsertUserAction(payload);
      if (result.success) {
        toast('Thêm nhân viên thành công!', 'success');
        queryClient.invalidateQueries({ queryKey: ['users'] });
        queryClient.invalidateQueries({ queryKey: ['teams'] });
        queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      } else {
        toast(result.error || 'Lỗi khi thêm nhân viên.', 'error');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Lỗi khi thêm nhân viên.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

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
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Cụm KPI Compact */}
            <div className="grid grid-cols-3 gap-1 bg-white rounded-xl border border-outline-variant/80 p-1 shadow-sm md:flex md:items-center md:px-1 md:py-0.5 md:gap-0 md:divide-x md:divide-slate-200">
              <div className="px-1 py-2 md:px-4 flex flex-col md:flex-row items-center gap-0.5 md:gap-2">
                <Users size={18} className="text-slate-400 shrink-0 hidden md:block" />
                <span className="font-black text-lg text-on-surface">{memberRows.length}</span>
                <span className="text-[11px] md:text-sm text-slate-500">thành viên</span>
              </div>
              <div className="px-1 py-2 md:px-4 flex flex-col md:flex-row items-center gap-0.5 md:gap-2">
                <CheckCircle2 size={18} className="text-green-500 shrink-0 hidden md:block" />
                <span className="font-black text-lg text-on-surface">{completedCount}/{memberRows.length}</span>
                <span className="text-[11px] md:text-sm text-slate-500">đã đánh giá</span>
              </div>
              <div className="px-1 py-2 md:px-4 flex flex-col md:flex-row items-center gap-0.5 md:gap-2">
                <Clock size={18} className="text-amber-500 shrink-0 hidden md:block" />
                <span className="font-black text-lg text-on-surface">{pendingCount}</span>
                <span className="text-[11px] md:text-sm text-slate-500">còn lại</span>
              </div>
            </div>

            {canAddEmployee && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#07384d] px-4 py-2.5 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#052b3b] active:scale-95 cursor-pointer"
              >
                <UserPlus size={18} />
                Thêm nhân viên
              </button>
            )}
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
            {/* Leader Block */}
            {leader && (
              (() => {
                const leaderEvaluation = evaluations.find((e: Evaluation) => e.employeeId === leader.id) || null;
                const leaderSubmitted = leaderEvaluation?.rounds
                  ? [...leaderEvaluation.rounds].filter((r) => r.status === 'Submitted' || r.submittedAt).sort((a, b) => b.round - a.round)
                  : [];
                const leaderStatus = leaderEvaluation?.status || 'NotStarted';
                const leaderBadge = getStatusBadge(leaderStatus, leaderSubmitted[0]?.round ?? leaderEvaluation?.currentRound ?? null);
                const leaderGrade = leaderEvaluation?.finalGrade || (leaderSubmitted.length ? leaderSubmitted[0].grade : null);
                const leaderGradeRound = leaderSubmitted[0]?.round ?? null;
                const leaderScore = leaderSubmitted[0]?.totalScore ?? null;
                const leaderPreviousRounds = leaderSubmitted
                  .filter(r => leaderGradeRound != null ? r.round !== leaderGradeRound : true)
                  .sort((a, b) => a.round - b.round)
                  .map(r => ({ round: r.round, score: r.totalScore }));
                return (
                  <div key={leader.id} className="bg-white rounded-2xl border border-indigo-200/80 shadow-sm overflow-hidden p-4 space-y-3">
                    <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-xl p-3.5 flex items-center gap-3">
                      {/* Desktop: giữ nguyên bản cũ */}
                      <div className="max-md:hidden min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_32px_104px] md:grid-cols-[minmax(0,1fr)_32px_104px_144px] items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/evaluations/${leader.id}`} className="font-bold text-slate-800 text-sm md:text-base hover:text-primary hover:underline truncate md:overflow-visible md:whitespace-normal" title="Đánh giá">{leader.name}</Link>
                            <span className="text-xs text-slate-500 font-medium">Mã: {leader.employeeCode}</span>
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                              Leader
                            </span>
                          </div>
                        </div>
                        {leaderGrade && leaderGrade !== 'Pending' ? (
                          <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black ${
                            leaderGrade === 'S' ? 'bg-indigo-100 text-indigo-700' :
                            leaderGrade === 'A' ? 'bg-emerald-100 text-emerald-700' :
                            leaderGrade === 'AB' ? 'bg-teal-100 text-teal-700' :
                            leaderGrade === 'B' ? 'bg-blue-100 text-blue-700' :
                            leaderGrade === 'C' ? 'bg-amber-100 text-amber-700' :
                            leaderGrade === 'D' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {leaderGrade}
                          </span>
                        ) : (
                          <span className="w-8" />
                        )}
                        {leaderGrade && leaderGrade !== 'Pending' ? (
                          <div className="flex items-end gap-2 tabular-nums min-w-[104px]">
                            {leaderPreviousRounds.map((roundData) => (
                              <div key={`leader-prev-${roundData.round}`} className="max-md:hidden w-12 flex flex-col items-center leading-none opacity-55">
                                <span className="text-xs text-slate-500 font-medium">L{roundData.round}</span>
                                <span className="text-sm text-slate-500 font-medium mt-1">{roundData.score}</span>
                              </div>
                            ))}
                            {leaderGradeRound != null && (
                              <div className="w-12 flex flex-col items-center leading-none">
                                <span className="text-xs text-slate-700 font-bold">L{leaderGradeRound}</span>
                                <span className="text-base text-slate-800 font-bold mt-1">{leaderScore}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="w-[104px]" />
                        )}
                        <span className={`col-span-3 sm:col-span-1 w-full max-md:hidden w-36 text-center text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${leaderBadge.className}`}>
                          {leaderBadge.label}
                        </span>
                      </div>
                      {leaderEvaluation && (
                        <Link
                          href={`/evaluations/${leader.id}`}
                          className="max-md:hidden p-2.5 min-w-11 min-h-11 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
                          title="Xem đánh giá"
                        >
                          <FileText size={18} />
                        </Link>
                      )}
                      {/* Mobile: text thuần (không badge/box) */}
                      <div className="md:hidden min-w-0 flex-1">
                        <Link href={`/evaluations/${leader.id}`} className="font-bold text-slate-800 text-sm truncate block hover:text-primary hover:underline" title="Đánh giá">{leader.name}</Link>
                        <p className="text-xs text-slate-500 mt-1">Mã: {leader.employeeCode} · Vai trò: Leader</p>
                        {leaderScore != null && leaderGradeRound != null && leaderGrade && leaderGrade !== 'Pending' && (
                          <p className="text-xs text-slate-600 mt-1">Xếp loại: {leaderGrade} · Vòng L{leaderGradeRound} · <span className="font-bold text-slate-800">{leaderScore} điểm</span></p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}

            {/* SubLeader Blocks */}
            {subLeaderBlocks.grouped.map(({ subLeader: sl, rows }) => {
              const slEvaluation = evaluations.find((e: Evaluation) => e.employeeId === sl.id) || null;
              const slSubmitted = slEvaluation?.rounds
                ? [...slEvaluation.rounds].filter((r) => r.status === 'Submitted' || r.submittedAt).sort((a, b) => b.round - a.round)
                : [];
              const slStatus = slEvaluation?.status || 'NotStarted';
              const slBadge = getStatusBadge(slStatus, slSubmitted[0]?.round ?? slEvaluation?.currentRound ?? null);
              const slGrade = slEvaluation?.finalGrade || (slSubmitted.length ? slSubmitted[0].grade : null);
              const slGradeRound = slSubmitted[0]?.round ?? null;
              const slScore = slSubmitted[0]?.totalScore ?? null;
              const slPreviousRounds = slSubmitted
                .filter(r => slGradeRound != null ? r.round !== slGradeRound : true)
                .sort((a, b) => a.round - b.round)
                .map(r => ({ round: r.round, score: r.totalScore }));
              return (
              <div
                key={sl.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden p-4 space-y-3"
              >
                {/* Block Header */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center gap-3">
                  {/* Desktop: giữ nguyên bản cũ */}
                  <div className="max-md:hidden min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_32px_104px] md:grid-cols-[minmax(0,1fr)_32px_104px_144px] items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/evaluations/${sl.id}`} className="font-bold text-slate-800 text-sm md:text-base hover:text-primary hover:underline truncate md:overflow-visible md:whitespace-normal" title="Đánh giá">{sl.name}</Link>
                        <span className="text-xs text-slate-500 font-medium">Mã: {sl.employeeCode}</span>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200/70">
                          {sl.description && sl.description.trim() !== '' ? sl.description : 'Chưa có chức danh'}
                        </span>
                      </div>
                    </div>
                    {slGrade && slGrade !== 'Pending' ? (
                      <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black ${
                        slGrade === 'S' ? 'bg-indigo-100 text-indigo-700' :
                        slGrade === 'A' ? 'bg-emerald-100 text-emerald-700' :
                        slGrade === 'AB' ? 'bg-teal-100 text-teal-700' :
                        slGrade === 'B' ? 'bg-blue-100 text-blue-700' :
                        slGrade === 'C' ? 'bg-amber-100 text-amber-700' :
                        slGrade === 'D' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'
                      }`}>
                        {slGrade}
                      </span>
                    ) : (
                      <span className="w-8" />
                    )}
                    {slGrade && slGrade !== 'Pending' ? (
                      <div className="flex items-end gap-2 tabular-nums min-w-[104px]">
                        {slPreviousRounds.map((roundData) => (
                          <div key={`sl-prev-${roundData.round}`} className="max-md:hidden w-12 flex flex-col items-center leading-none opacity-55">
                            <span className="text-xs text-slate-500 font-medium">L{roundData.round}</span>
                            <span className="text-sm text-slate-500 font-medium mt-1">{roundData.score}</span>
                          </div>
                        ))}
                        {slGradeRound != null && (
                          <div className="w-12 flex flex-col items-center leading-none">
                            <span className="text-xs text-slate-700 font-bold">L{slGradeRound}</span>
                            <span className="text-base text-slate-800 font-bold mt-1">{slScore}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="w-[104px]" />
                    )}
                    <span className={`col-span-3 sm:col-span-1 w-full max-md:hidden w-36 text-center text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${slBadge.className}`}>
                      {slBadge.label}
                    </span>
                  </div>
                  {slEvaluation && (
                    <Link
                      href={`/evaluations/${sl.id}`}
                      className="max-md:hidden p-2.5 min-w-11 min-h-11 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
                      title="Xem đánh giá"
                    >
                      <FileText size={18} />
                    </Link>
                  )}
                  {/* Mobile: text thuần (không badge/box) */}
                  <div className="md:hidden min-w-0 flex-1">
                    <Link href={`/evaluations/${sl.id}`} className="font-bold text-slate-800 text-sm truncate block hover:text-primary hover:underline" title="Đánh giá">{sl.name}</Link>
                    <p className="text-xs text-slate-500 mt-1">Mã: {sl.employeeCode} · Vai trò: SubLeader{sl.description && sl.description.trim() !== '' && !['SubLeader', 'Sub Leader', 'Leader', 'Manager'].includes(sl.description.trim()) ? ` · ${sl.description}` : ''}</p>
                    {slScore != null && slGradeRound != null && slGrade && slGrade !== 'Pending' && (
                      <p className="text-xs text-slate-600 mt-1">Xếp loại: {slGrade} · Vòng L{slGradeRound} · <span className="font-bold text-slate-800">{slScore} điểm</span></p>
                    )}
                  </div>
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
                          {/* Desktop: giữ nguyên bản cũ */}
                          <div className="max-md:hidden min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_32px_104px] md:grid-cols-[minmax(0,1fr)_32px_104px_144px] items-center gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link href={`/evaluations/${member.id}`} className="text-sm font-semibold text-on-surface truncate hover:text-primary hover:underline truncate md:overflow-visible md:whitespace-normal" title="Đánh giá">{member.name}</Link>
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
                            {grade && grade !== 'Pending' ? (
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
                            ) : (
                              <span className="w-8" />
                            )}
                            {grade && grade !== 'Pending' ? (
                              <div className="flex items-end gap-2 tabular-nums min-w-[104px]">
                                {previousRounds.map((roundData) => (
                                  <div key={roundData.round} className="max-md:hidden w-12 flex flex-col items-center leading-none opacity-55">
                                    <span className="text-xs text-slate-500 font-medium">L{roundData.round}</span>
                                    <span className="text-sm text-slate-500 font-medium mt-1">{roundData.score}</span>
                                  </div>
                                ))}
                                {gradeRound != null && (
                                  <div className="w-12 flex flex-col items-center leading-none">
                                    <span className="text-xs text-slate-700 font-bold">L{gradeRound}</span>
                                    <span className="text-base text-slate-800 font-bold mt-1">{score}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="w-[104px]" />
                            )}
                            <span className={`col-span-3 sm:col-span-1 w-full max-md:hidden w-36 text-center text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                          <Link
                            href={`/evaluations/${member.id}`}
                            className="max-md:hidden p-2.5 min-w-11 min-h-11 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
                            title="Xem đánh giá"
                          >
                            <FileText size={18} />
                          </Link>
                          {/* Mobile: text thuần */}
                          <div className="md:hidden min-w-0 flex-1">
                            <Link href={`/evaluations/${member.id}`} className="text-sm font-semibold text-on-surface truncate block hover:text-primary hover:underline" title="Đánh giá">{member.name}</Link>
                            <p className="text-xs text-slate-500 mt-1">Mã: {member.employeeCode}</p>
                            {score != null && gradeRound != null && grade && grade !== 'Pending' && (
                              <p className="text-xs text-slate-600 mt-1">Xếp loại: {grade} · Vòng L{gradeRound} · <span className="font-bold text-slate-800">{score} điểm</span></p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
              </div>
            );
            })}
 
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
                        {/* Desktop: giữ nguyên bản cũ */}
                        <div className="max-md:hidden min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_32px_104px] md:grid-cols-[minmax(0,1fr)_32px_104px_144px] items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link href={`/evaluations/${member.id}`} className="text-sm font-semibold text-on-surface truncate hover:text-primary hover:underline truncate md:overflow-visible md:whitespace-normal" title="Đánh giá">{member.name}</Link>
                          </div>
                          <p className="text-xs text-outline-variant mt-0.5">Mã: {member.employeeCode}</p>
                        </div>
                        {grade && grade !== 'Pending' ? (
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
                        ) : (
                          <span className="w-8" />
                        )}
                        {grade && grade !== 'Pending' ? (
                          <div className="flex items-end gap-2 tabular-nums min-w-[104px]">
                            {previousRounds.map((roundData) => (
                              <div key={roundData.round} className="max-md:hidden w-12 flex flex-col items-center leading-none opacity-55">
                                <span className="text-xs text-slate-500 font-medium">L{roundData.round}</span>
                                <span className="text-sm text-slate-500 font-medium mt-1">{roundData.score}</span>
                              </div>
                            ))}
                            {gradeRound != null && (
                              <div className="w-12 flex flex-col items-center leading-none">
                                <span className="text-xs text-slate-700 font-bold">L{gradeRound}</span>
                                <span className="text-base text-slate-800 font-bold mt-1">{score}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="w-[104px]" />
                        )}
                        <span className={`col-span-3 sm:col-span-1 w-full max-md:hidden w-36 text-center text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${badge.className}`}>
                          {badge.label}
                        </span>
                        </div>
                        <Link
                        href={`/evaluations/${member.id}`}
                        className="max-md:hidden p-2.5 min-w-11 min-h-11 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
                        title="Xem đánh giá"
                        >
                        <FileText size={18} />
                        </Link>
                        {/* Mobile: text thuần */}
                        <div className="md:hidden min-w-0 flex-1">
                        <Link href={`/evaluations/${member.id}`} className="text-sm font-semibold text-on-surface truncate block hover:text-primary hover:underline" title="Đánh giá">{member.name}</Link>
                        <p className="text-xs text-slate-500 mt-1">Mã: {member.employeeCode}</p>
                        {score != null && gradeRound != null && grade && grade !== 'Pending' && (
                          <p className="text-xs text-slate-600 mt-1">Xếp loại: {grade} · Vòng L{gradeRound} · <span className="font-bold text-slate-800">{score} điểm</span></p>
                        )}
                        </div>
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
        Bấm vào tên để xem chi tiết đánh giá của từng thành viên.
      </div>

      <EmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveEmployee}
        restrictToTeamId={teamId}
        roleOptions={['SubLeader', 'Employee']}
        allUsers={users}
        teams={teams}
      />
    </div>
  );
}
