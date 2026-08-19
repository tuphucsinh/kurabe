'use client';

import Link from 'next/link';
import GradeBadge from '@/components/ui/GradeBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Evaluation } from '@/types';
import { FileText, Pencil } from 'lucide-react';

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  Approved: { label: 'Đã có KQĐG', className: 'bg-emerald-600 text-white font-bold shadow-sm' },
  NotStarted: { label: 'Chưa bắt đầu', className: 'bg-slate-100 text-slate-500' },
  InProgress: { label: 'Đang thực hiện', className: 'bg-amber-100 text-amber-700' },
  Draft: { label: 'Đang thực hiện', className: 'bg-amber-100 text-amber-700' },
  Submitted: { label: 'Đã nộp', className: 'bg-blue-100 text-blue-700' },
  Reviewed: { label: 'Đã nộp', className: 'bg-blue-100 text-blue-700' },
};

export function getStatusBadge(status: string, latestRound?: number | null): { label: string; className: string } {
  if (status === 'Submitted' || status === 'Reviewed') {
    const roundText = latestRound ? ` vòng ${latestRound}` : '';
    return {
      label: `Đã nộp${roundText}`,
      className: 'bg-blue-100 text-blue-700',
    };
  }
  return STATUS_BADGE[status] || STATUS_BADGE.NotStarted;
}

export interface TeamDetailMemberCellProps {
  memberId: string;
  evaluation?: Evaluation | null;
  isLoading?: boolean;
  isError?: boolean;
  mode?: 'desktop' | 'mobile' | 'action';
  canEdit?: boolean;
  onEdit?: () => void;
}

export function TeamDetailMemberEvaluationDesktop({
  evaluation,
  isLoading = false,
  isError = false,
}: {
  evaluation?: Evaluation | null;
  isLoading?: boolean;
  isError?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="contents" data-load-layer="heavy">
        <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
        <Skeleton variant="text" width={64} height={20} className="rounded mx-auto" />
        <Skeleton variant="rectangular" width={110} height={24} className="rounded-full mx-auto" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="contents" data-load-layer="heavy">
        <span className="w-8" />
        <span className="w-[104px] text-center text-xs text-slate-400">-</span>
        <span className="col-span-3 sm:col-span-1 w-full max-md:hidden w-36 text-center text-xs font-bold px-2.5 py-1 rounded-full shrink-0 bg-slate-100 text-slate-400">
          Chưa tải được
        </span>
      </div>
    );
  }

  const submittedRounds = evaluation?.rounds
    ? [...evaluation.rounds].filter((r) => r.status === 'Submitted' || r.submittedAt).sort((a, b) => b.round - a.round)
    : [];
  const latestSubmittedRound = submittedRounds[0]?.round ?? evaluation?.currentRound ?? null;
  const status = evaluation ? evaluation.status : 'NotStarted';
  const badge = getStatusBadge(status, latestSubmittedRound);
  const grade = evaluation?.finalGrade || (submittedRounds.length ? submittedRounds[0].grade : null);
  const gradeRound = submittedRounds[0]?.round ?? null;
  const score = submittedRounds[0]?.totalScore ?? null;
  const previousRounds = submittedRounds
    .filter((r) => (gradeRound != null ? r.round !== gradeRound : true))
    .sort((a, b) => a.round - b.round)
    .map((r) => ({ round: r.round, score: r.totalScore }));

  return (
    <div className="contents" data-load-layer="heavy">
      {grade && grade !== 'Pending' ? (
        <GradeBadge grade={grade} className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black" />
      ) : (
        <span className="w-8" />
      )}
      {grade && grade !== 'Pending' ? (
        <div className="flex items-end gap-2 tabular-nums min-w-[104px]">
          {previousRounds.map((roundData) => (
            <div key={`prev-${roundData.round}`} className="max-md:hidden w-12 flex flex-col items-center leading-none opacity-55">
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
  );
}

export function TeamDetailMemberAction({
  memberId,
  evaluation,
  isLoading = false,
  canEdit = false,
  onEdit,
}: {
  memberId: string;
  evaluation?: Evaluation | null;
  isLoading?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  const hasEvalContent = isLoading || Boolean(evaluation);
  if (!hasEvalContent && !canEdit) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      {isLoading ? (
        <span
          className="p-2.5 min-w-11 min-h-11 flex items-center justify-center text-slate-300 rounded-lg shrink-0"
          data-load-layer="heavy"
        >
          <FileText size={18} />
        </span>
      ) : evaluation ? (
        <Link
          prefetch={false}
          href={`/evaluations/${memberId}`}
          className="p-2.5 min-w-11 min-h-11 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
          title="Xem đánh giá"
          data-load-layer="heavy"
        >
          <FileText size={18} />
        </Link>
      ) : null}

      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="p-2.5 min-w-11 min-h-11 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0 cursor-pointer"
          title="Chỉnh sửa nhân viên"
        >
          <Pencil size={18} />
        </button>
      )}
    </div>
  );
}

export function TeamDetailMemberEvaluationMobile({
  evaluation,
  isLoading = false,
  isError = false,
}: {
  evaluation?: Evaluation | null;
  isLoading?: boolean;
  isError?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="mt-1" data-load-layer="heavy">
        <Skeleton variant="text" width={160} height={16} />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-xs text-slate-400 mt-1" data-load-layer="heavy">
        Chưa tải được đánh giá
      </p>
    );
  }

  const submittedRounds = evaluation?.rounds
    ? [...evaluation.rounds].filter((r) => r.status === 'Submitted' || r.submittedAt).sort((a, b) => b.round - a.round)
    : [];
  const grade = evaluation?.finalGrade || (submittedRounds.length ? submittedRounds[0].grade : null);
  const gradeRound = submittedRounds[0]?.round ?? null;
  const score = submittedRounds[0]?.totalScore ?? null;

  if (score != null && gradeRound != null && grade && grade !== 'Pending') {
    return (
      <p className="text-xs text-slate-600 mt-1" data-load-layer="heavy">
        Xếp loại: {grade} · Vòng L{gradeRound} · <span className="font-bold text-slate-800">{score} điểm</span>
      </p>
    );
  }

  return null;
}

export default function TeamDetailMemberCell({
  memberId,
  evaluation,
  isLoading = false,
  isError = false,
  mode = 'desktop',
  canEdit = false,
  onEdit,
}: TeamDetailMemberCellProps) {
  if (mode === 'mobile') {
    return <TeamDetailMemberEvaluationMobile evaluation={evaluation} isLoading={isLoading} isError={isError} />;
  }
  if (mode === 'action') {
    return (
      <TeamDetailMemberAction
        memberId={memberId}
        evaluation={evaluation}
        isLoading={isLoading}
        canEdit={canEdit}
        onEdit={onEdit}
      />
    );
  }
  return <TeamDetailMemberEvaluationDesktop evaluation={evaluation} isLoading={isLoading} isError={isError} />;
}
