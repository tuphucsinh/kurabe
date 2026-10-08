import { Evaluation, EvaluationPeriod, EvaluationRound, User, PeriodStatus, EvaluationRoundStatus, EvaluationRoundMetadata } from '@/types';

import { canViewEvaluation, canViewRoundPayload } from '@/data/workflow';
import { Tables } from '@/types/database';
import { splitRoundNotes } from '@/lib/round-level-selection';
import { parseRole, parseGrade, parseEvalStatus, parseRoundNumber } from '@/lib/parsers';

type DbPeriod = Tables<'evaluation_periods'>;
type DbRound = Tables<'evaluation_rounds'>;
type DbEvaluation = Tables<'evaluations'> & { evaluation_rounds?: DbRound[] };

/**
 * Sanitizes an evaluation for a specific viewer:
 * - Omits unauthorized drafts from `rounds` completely to protect confidentiality.
 * - Captures non-sensitive status/assignment metadata into `roundMetadata`.
 * - Payload-bearing authorized rounds retain their existing complete type and required fields.
 */
export function sanitizeEvaluationForViewer(
  evaluation: Evaluation,
  viewer?: User | null,
  allUsers?: User[],
  ledTeamIds?: readonly string[]
): Evaluation {
  const roundMetadata: EvaluationRoundMetadata[] = (evaluation.rounds || []).map((r) => ({
    round: r.round,
    evaluatorId: r.evaluatorId,
    evaluatorRole: r.evaluatorRole,
    status: r.status,
    submittedAt: r.submittedAt,
    isRedacted: !canViewRoundPayload(viewer, evaluation, r, allUsers, ledTeamIds),
  }));

  const authorizedRounds = (evaluation.rounds || []).filter((r) =>
    canViewRoundPayload(viewer, evaluation, r, allUsers, ledTeamIds)
  );

  return {
    ...evaluation,
    rounds: authorizedRounds,
    roundMetadata,
  };
}

export function filterEvaluationsForViewer(
  evaluations: Evaluation[],
  viewer?: User | null,
  allUsers?: User[],
  ledTeamIds?: readonly string[]
): Evaluation[] {
  if (!viewer || !Array.isArray(evaluations) || evaluations.length === 0) return [];
  return evaluations
    .filter((ev) => canViewEvaluation(viewer, ev, allUsers, ledTeamIds))
    .map((ev) => sanitizeEvaluationForViewer(ev, viewer, allUsers, ledTeamIds));
}

const PERIOD_STATUS_MAP: Record<string, PeriodStatus> = {
  active: 'Active',
  closed: 'Closed',
};

/**
 * Giải kỳ hiện tại cho trang server: id ưu tiên (cookie) → kỳ Active → kỳ mới nhất.
 * Tối đa 2 query (thay 3 query tuần tự cũ — C5). Lỗi → null, không làm vỡ page.
 */
// Helpers
export function mapPeriodFromDb(db: DbPeriod): EvaluationPeriod {
  return {
    id: db.id,
    year: db.year,
    name: db.name,
    status: PERIOD_STATUS_MAP[db.status || ''] || 'Closed',
    createdBy: db.created_by || '',
    createdAt: db.created_at || '',
    closedAt: db.closed_at || undefined,
    targetRate: db.target_rate ?? 75,
    targetGrade: db.target_grade || 'AB',
  };
}

export function mapEvaluationFromDb(db: DbEvaluation): Evaluation {
  return {
    id: db.id,
    periodId: db.period_id || '',
    employeeId: db.employee_id || '',
    employeeRole: parseRole(db.employee_role),
    teamId: db.team_id || '',
    rounds: (db.evaluation_rounds || [])
      .map(mapRoundFromDb)
      .sort((a, b) => a.round - b.round),
    currentRound: parseRoundNumber(db.current_round),
    status: parseEvalStatus(db.status),
    finalGrade: db.final_grade ? parseGrade(db.final_grade) : undefined,
    finalScore: db.final_score ?? undefined,
    resultMessage: db.result_message ?? null,
    returnNote: db.return_note || undefined,
    createdAt: db.created_at || '',
    updatedAt: db.updated_at || '',
  };
}

function mapRoundFromDb(db: DbRound): EvaluationRound {
  const { userNotes, selectedLevelIndexes } = splitRoundNotes((db.notes as Record<string, string>) || {});
  return {
    id: db.id,
    evaluationId: db.evaluation_id || '',
    round: parseRoundNumber(db.round),
    evaluatorId: db.evaluator_id || '',
    evaluatorRole: parseRole(db.evaluator_role),
    status: normalizeRoundStatus(db),
    scores: (db.scores as Record<string, number>) ?? {},
    selectedLevelIndexes,
    notes: userNotes,
    totalScore: db.total_score ?? 0,
    grade: parseGrade(db.grade),
    comment: db.comment || undefined,
    additionalComment: db.additional_comment || undefined,
    submittedAt: db.submitted_at || undefined,
    createdAt: db.created_at || '',
    gradeConfigVersionId: db.grade_config_version_id,
    criteriaConfigVersionId: db.criteria_config_version_id,
    criteriaSnapshotState: db.criteria_config_version_id ? 'authoritative' : 'legacy_unknown',
  };
}

/**
 * Chuẩn hóa trạng thái round từ dữ liệu DB (hỗ trợ legacy)
 */
function normalizeRoundStatus(db: DbRound): EvaluationRoundStatus {
  // submitted_at luôn ưu tiên cao nhất để tránh stale status.
  if (db.submitted_at) return 'Submitted';

  if (db.status === 'Submitted' || db.status === 'Draft' || db.status === 'NotStarted') {
    return db.status as EvaluationRoundStatus;
  }

  // Legacy fallback: Kiểm tra xem có dữ liệu nháp không.
  const hasScores = db.scores && typeof db.scores === 'object' && Object.keys(db.scores as object).length > 0;
  const hasNotes = db.notes && typeof db.notes === 'object' && Object.keys(db.notes as object).length > 0;

  if (hasScores || hasNotes || db.comment) {
    return 'Draft';
  }

  return 'NotStarted';
}
