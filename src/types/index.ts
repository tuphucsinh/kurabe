export type Role = 'Manager' | 'Leader' | 'SubLeader' | 'Employee';

export type AppliesTo = 'leader' | 'staff' | 'both';
export type Grade = 'S' | 'A' | 'AB' | 'B' | 'C' | 'D' | 'Pending';
export type PeriodStatus = 'Active' | 'Closed';
export type EvalStatus = 'NotStarted' | 'Draft' | 'Submitted' | 'Reviewed' | 'Approved';
export type RoundNumber = 1 | 2 | 3;

export interface User {
  id: string;
  employeeCode: string;
  name: string;
  role: Role;
  teamId: string;
  joinDate?: string;
  avatar?: string;
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
}

export interface EvaluationRound {
  id?: string;
  evaluationId?: string;
  round: RoundNumber;
  evaluatorId: string;
  evaluatorRole: Role;
  scores: Record<string, number>;
  notes?: Record<string, string>;
  totalScore: number;
  grade: Grade;
  comment?: string;
  additionalComment?: string;
  submittedAt?: string;
  createdAt: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface CriteriaLevel {
  points: number;
  label: string;
  description?: string;
}

export interface Criterion {
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
}
