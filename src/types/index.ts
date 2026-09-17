import type { XLSX$Utils, WorkBook, WritingOptions } from 'xlsx';

export type Role = 'Manager' | 'Leader' | 'SubLeader' | 'Employee' | 'Worker';

export type AppliesTo = 'leader' | 'staff' | 'both';
export type GradeBandRoleGroup = 'leader' | 'staff' | 'worker';
export type Grade = 'S' | 'A' | 'AB' | 'B' | 'C' | 'D' | 'Pending';
export type PeriodStatus = 'Active' | 'Closed';
export type EvalStatus = 'NotStarted' | 'Draft' | 'Submitted' | 'Reviewed' | 'Approved';
export type RoundNumber = 1 | 2 | 3;

export type EvaluationRoundStatus = 'NotStarted' | 'Draft' | 'Submitted';
export type EvaluationPageMode = 'edit' | 'readonly' | 'blocked';
export type EvaluationAccessReason = 'NO_DRAFT' | 'NOT_AUTHORIZED' | 'ROUND_LOCKED';

export interface EvaluationAccessState {
  mode: EvaluationPageMode;
  displayRound: RoundNumber | null;
  editableRound: RoundNumber | null;
  visibleRounds: EvaluationRound[];
  reason?: EvaluationAccessReason;
}

export interface User {
  id: string;
  employeeCode: string;
  name: string;
  role: Role;
  teamId: string;
  joinDate?: string;
  avatar?: string;
  subleaderId?: string | null;
  description?: string | null;
  gender: string;
}

/** Server-authoritative authorization scope used only as a cache identity. */
export interface ViewerScope {
  userId: string;
  role: Role;
  primaryTeamId: string | null;
  leaderTeamIds: string[];
  scopeKey: string;
}

/** Deterministic identity for a scope; never use this value as an ACL decision. */
export function buildViewerScopeKey(input: {
  userId: string;
  role: Role;
  primaryTeamId: string | null;
  leaderTeamIds: readonly string[];
}): string {
  const leaderTeamIds = Array.from(new Set(input.leaderTeamIds)).sort((a, b) => a.localeCompare(b));
  return JSON.stringify({
    userId: input.userId,
    role: input.role,
    primaryTeamId: input.primaryTeamId,
    leaderTeamIds,
  });
}

export interface Team {
  id: string;
  name: string;
  leaderId: string | null;
  memberCount?: number;
}

export interface EvaluationPeriod {
  id: string;
  year: number;
  name: string;
  status: PeriodStatus;
  createdBy: string;
  createdAt: string;
  closedAt?: string;
  targetRate?: number;
  targetGrade?: string;
}

export interface EvaluationRound {
  id?: string;
  evaluationId?: string;
  round: RoundNumber;
  evaluatorId: string;
  evaluatorRole: Role;
  status: EvaluationRoundStatus;
  scores: Record<string, number>;
  selectedLevelIndexes?: Record<string, number>;
  notes?: Record<string, string>;
  totalScore: number;
  grade: Grade;
  comment?: string;
  additionalComment?: string;
  submittedAt?: string;
  createdAt: string;
  gradeConfigVersionId?: string | null;
  criteriaConfigVersionId?: string | null;
  criteriaSnapshotState?: 'authoritative' | 'legacy_unknown';
}

export interface Evaluation {
  id: string;
  periodId: string;
  employeeId: string;
  employeeRole: Role;
  teamId: string;
  rounds: EvaluationRound[];
  currentRound: RoundNumber;
  status: EvalStatus;
  finalGrade?: Grade;
  finalScore?: number;
  resultMessage?: string | null;
  returnNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CriteriaLevel {
  points: number;
  label: string;
  description?: string;
}

export interface CriteriaVersionMetadata {
  configVersion?: number;
  configVersionId?: string;
}

export interface Criterion extends CriteriaVersionMetadata {
  id: string;
  code: string;
  name: string;
  description?: string;
  appliesTo: Role[];
  levels: CriteriaLevel[];
  groupId?: string;
  weight?: number;
  defaultLevelIndex?: number;
  sortOrder?: number;
}

export interface CriteriaGroup {
  id: string;
  code: string;
  name: string;
  shortName: string;
  criteria: Criterion[];
  sortOrder?: number;
  configVersion?: number;
  configVersionId?: string;
}

export interface EvaluationConfigVersions {
  criteriaConfigVersionId?: string | null;
  gradeConfigVersionId?: string | null;
}

export type EvaluationSnapshotState = 'authoritative' | 'legacy_unknown' | 'unavailable';

export interface EvaluationDisplayRound {
  round: RoundNumber;
  status: EvaluationRoundStatus;
  totalScore: number;
  grade: Grade;
  evaluatorRole: Role;
  criteriaConfigVersionId: string | null;
  gradeConfigVersionId: string | null;
  snapshotState: EvaluationSnapshotState;
  criteriaGroups: CriteriaGroup[];
}

export interface EvaluationDisplayDto {
  evaluationId: string;
  employeeRoleSnapshot: Role;
  rounds: EvaluationDisplayRound[];
}

export type XlsxExportApi = {
  utils: Pick<XLSX$Utils, 'book_new' | 'json_to_sheet' | 'book_append_sheet'>;
  writeFile: (data: WorkBook, filename: string, opts?: WritingOptions) => void;
};

export interface EvaluationTransitionResult {
  roundId: string;
  evaluationId: string;
  nextRoundId: string | null;
  finalStatus: string;
}

export interface ExportEvaluationsOptions {
  includeRoundDetails?: boolean;
  displayDtos?: Map<string, EvaluationDisplayDto> | Record<string, EvaluationDisplayDto>;
  evaluations?: Evaluation[];
  users?: User[];
  teams?: Team[];
  periodData?: EvaluationPeriod | null;
  XLSX?: XlsxExportApi;
}
