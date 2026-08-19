'use client';

import Link from 'next/link';
import GradeBadge from '@/components/ui/GradeBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Evaluation, Role } from '@/types';
import { getMaxEvaluationRound } from '@/lib/evaluation-workflow';
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

export function getTargetRoundNumbers(evaluation?: Evaluation | null, roleProp?: Role | string): number[] {
  const role = roleProp || evaluation?.employeeRole;
  if (role) {
    const maxRound = getMaxEvaluationRound(role as Role);
    if (typeof maxRound === 'number' && maxRound >= 1) {
      // giảm dần: [maxRound, ..., 1] — Leader 2 vòng -> [2,1], SubLeader/Worker 3 vòng -> [3,2,1]
      return Array.from({ length: maxRound }, (_, i) => maxRound - i);
    }
  }
  if (evaluation?.rounds && evaluation.rounds.length > 0) {
    const maxSeen = Math.max(...evaluation.rounds.map((r) => r.round || 0));
    if (maxSeen >= 3) return [3, 2, 1];
    if (maxSeen === 2) return [2, 1];
  }
  return [3, 2, 1];
}

export interface TeamDetailMemberCellProps {
  memberId: string;
  evaluation?: Evaluation | null;
  role?: Role | string;
  isLoading?: boolean;
  isError?: boolean;
  mode?: 'desktop' | 'mobile' | 'action';
  canEdit?: boolean;
  onEdit?: () => void;
}

export function TeamDetailMemberEvaluationDesktop({
  evaluation,
  role,
  isLoading = false,
  isError = false,
}: {
  evaluation?: Evaluation | null;
  role?: Role | string;
  isLoading?: boolean;
  isError?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="contents" data-load-layer="heavy">
        <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
        <Skeleton variant="text" width={80} height={20} className="rounded mx-auto shrink-0" />
        <Skeleton variant="rectangular" width={100} height={24} className="rounded-full mx-auto shrink-0" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="contents" data-load-layer="heavy">
        <span className="w-8" />
        <span className="text-center text-xs text-slate-400 shrink-0">-</span>
        <span className="text-center text-xs font-bold px-3 py-1 rounded-full shrink-0 bg-slate-100 text-slate-400 inline-flex items-center justify-center whitespace-nowrap">
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

  const targetRounds = getTargetRoundNumbers(evaluation, role);
  const roundsMap = new Map<number, number | null>();
  if (evaluation?.rounds) {
    for (const r of evaluation.rounds) {
      if (r.status === 'Submitted' || r.submittedAt) {
        roundsMap.set(r.round, r.totalScore ?? null);
      }
    }
  }

  return (
    <div className="contents" data-load-layer="heavy">
      {grade && grade !== 'Pending' ? (
        <GradeBadge grade={grade} className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black shrink-0" />
      ) : (
        <span className="w-8 shrink-0" />
      )}
      {grade && grade !== 'Pending' ? (
        <div className="flex items-center gap-2 tabular-nums text-xs whitespace-nowrap shrink-0">
          {targetRounds.map((roundNum) => {
            const scoreVal = roundsMap.get(roundNum);
            const hasScore = scoreVal != null;
            const isLatest = roundNum === latestSubmittedRound;
            const scoreText = hasScore ? scoreVal : '-';

            return (
              <span
                key={`round-${roundNum}`}
                className={
                  isLatest
                    ? 'font-bold text-slate-800'
                    : 'font-medium text-slate-500 opacity-60'
                }
              >
                L{roundNum}: {scoreText}
              </span>
            );
          })}
        </div>
      ) : (
        <span className="shrink-0" />
      )}
      <span className={`text-center text-xs font-bold px-3 py-1 rounded-full shrink-0 inline-flex items-center justify-center whitespace-nowrap ${badge.className}`}>
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
  role,
  isLoading = false,
  isError = false,
}: {
  evaluation?: Evaluation | null;
  role?: Role | string;
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
  const latestSubmittedRound = submittedRounds[0]?.round ?? evaluation?.currentRound ?? null;
  const grade = evaluation?.finalGrade || (submittedRounds.length ? submittedRounds[0].grade : null);

  if (grade && grade !== 'Pending') {
    const targetRounds = getTargetRoundNumbers(evaluation, role);
    const roundsMap = new Map<number, number | null>();
    if (evaluation?.rounds) {
      for (const r of evaluation.rounds) {
        if (r.status === 'Submitted' || r.submittedAt) {
          roundsMap.set(r.round, r.totalScore ?? null);
        }
      }
    }

    return (
      <p className="text-xs text-slate-600 mt-1" data-load-layer="heavy">
        Xếp loại: {grade}
        {targetRounds.map((roundNum) => {
          const scoreVal = roundsMap.get(roundNum);
          const hasScore = scoreVal != null;
          const isLatest = roundNum === latestSubmittedRound;
          const scoreText = hasScore ? scoreVal : '-';

          return (
            <span key={`mobile-round-${roundNum}`}>
              {' · '}
              <span className={isLatest ? 'font-bold text-slate-800' : 'text-slate-500 opacity-60'}>
                L{roundNum}: {scoreText}
              </span>
            </span>
          );
        })}
      </p>
    );
  }

  return null;
}

export default function TeamDetailMemberCell({
  memberId,
  evaluation,
  role,
  isLoading = false,
  isError = false,
  mode = 'desktop',
  canEdit = false,
  onEdit,
}: TeamDetailMemberCellProps) {
  if (mode === 'mobile') {
    return <TeamDetailMemberEvaluationMobile evaluation={evaluation} role={role} isLoading={isLoading} isError={isError} />;
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
  return <TeamDetailMemberEvaluationDesktop evaluation={evaluation} role={role} isLoading={isLoading} isError={isError} />;
}
