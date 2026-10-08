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

/**
 * One deterministic page of ids returned by a stable, count-verifying reader.
 * `totalCount` is the exact server-reported row count for the whole query, never
 * the page length. A missing/`null` count is a denial (never a silent empty success).
 */
export interface StableIdPage {
  ids: string[];
  totalCount: number | null;
}

/** Complete-reader manifest: the full stable ID set plus its exact expected count. */
export interface IdManifest {
  ids: string[];
  totalCount: number;
  pages: number;
}

/**
 * Minimal personnel graph identity used to validate an evaluation-period roster
 * against the live active users/teams graph under a deterministic lock.
 */
export interface RosterGraphEntry {
  id: string;
  role: Role;
  teamId: string | null;
  subleaderId: string | null;
}

/**
 * Explicit unknown marker for bounded, immutable historical label capture.
 * `known` requires a value; `unknown` records an absent historical field without
 * fabricating one.
 */
export type HistoricalLabelState = 'known' | 'unknown';

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
  isRedacted?: boolean;
}

/** Explicit status/assignment-only round metadata DTO */
export interface EvaluationRoundMetadata {
  round: RoundNumber;
  evaluatorId: string;
  evaluatorRole: Role;
  status: EvaluationRoundStatus;
  submittedAt?: string;
  isRedacted?: boolean;
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
  roundMetadata?: EvaluationRoundMetadata[];
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

/**
 * Server-computed skill-gap radar datum (self vs manager average per pinned
 * criteria group). Replaces the previous raw evaluations/criteriaGroups props so
 * the dashboard heavy DTO never carries raw round scores.
 */
export interface SkillGapRadarDatum {
  subject: string;
  Self: number;
  Manager: number;
  fullMark: number;
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
  /**
   * Status/assignment-only metadata for rounds whose payload was withheld for
   * this viewer (unauthorized drafts / redacted rounds). These rounds are
   * omitted from `rounds` entirely, so the payload can never leak.
   */
  redactedRounds?: EvaluationRoundMetadata[];
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
  /** Explicit official (Approved) evaluation ids; otherwise resolved via the result projector. */
  officialEvaluationIds?: string[];
  XLSX?: XlsxExportApi;
}
