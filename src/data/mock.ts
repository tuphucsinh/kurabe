export type Role = 'Manager' | 'Leader' | 'SubLeader' | 'Employee';
export type Grade = 'S' | 'A' | 'AB' | 'B' | 'C' | 'D' | 'Pending';

export interface User {
  id: string;
  employeeCode?: string;
  name: string;
  role: Role;
  teamId: string;
  joinDate?: string;
  avatar?: string;
}

export interface Team {
  id: string;
  name: string;
  leaderId: string;
}

export type PeriodStatus = 'Active' | 'Closed';
export type EvalStatus = 'NotStarted' | 'Draft' | 'Submitted' | 'Reviewed' | 'Approved';
export type RoundNumber = 1 | 2 | 3;

export interface EvaluationPeriod {
  id: string;
  year: number;
  name: string;           // VD: "Kỳ đánh giá 2026"
  status: PeriodStatus;
  createdBy: string;      // Manager userId
  createdAt: string;
  closedAt?: string;
}

export interface EvaluationRound {
  round: RoundNumber;
  evaluatorId: string;    // Người đánh giá lần này
  evaluatorRole: Role;    // Role snapshot tại thời điểm đánh giá
  scores: Record<string, number>;  // criteriaId → points
  notes?: Record<string, string>;   // criteriaId → ghi chú (optional for backward compat)
  totalScore: number;
  grade: Grade;
  comment?: string;       // Nhận xét chung cho lần đánh giá này
  submittedAt?: string;   // null = Draft, có giá trị = Locked
  createdAt: string;
}

export interface Evaluation {
  id: string;
  periodId: string;       // Thuộc kỳ đánh giá nào
  employeeId: string;     // Người ĐƯỢC đánh giá
  employeeRole: Role;     // Role snapshot
  teamId: string;
  rounds: EvaluationRound[];  // Max 3 rounds
  currentRound: RoundNumber;  // Round đang active
  status: EvalStatus;     // Trạng thái tổng
  finalGrade?: Grade;     // Grade cuối cùng (sau Manager approve)
  finalScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MockDB {
  users: User[];
  teams: Team[];
  periods: EvaluationPeriod[];
  evaluations: Evaluation[];
}

export const mockUsers: User[] = [
  { id: 'u1', employeeCode: 'EMP001', name: 'Nguyễn Văn Quản Lý', role: 'Manager', teamId: 't1', joinDate: '2020-01-15' },
  { id: 'u2', employeeCode: 'EMP002', name: 'Trần Thị Nhóm Trưởng', role: 'Leader', teamId: 't1', joinDate: '2021-03-20' },
  { id: 'u3', employeeCode: 'EMP003', name: 'Lê Văn Nhân Viên 1', role: 'SubLeader', teamId: 't1', joinDate: '2022-05-10' },
  { id: 'u4', employeeCode: 'EMP004', name: 'Phạm Thị Nhân Viên 2', role: 'SubLeader', teamId: 't1', joinDate: '2022-06-01' },
  { id: 'u5', employeeCode: 'EMP005', name: 'Hoàng Văn Nhân Viên 3', role: 'SubLeader', teamId: 't2', joinDate: '2023-01-10' },
];

export const mockTeams: Team[] = [
  { id: 't1', name: 'QAQC Line 1', leaderId: 'u2' },
  { id: 't2', name: 'QAQC Line 2', leaderId: 'u1' },
];

export const mockPeriods: EvaluationPeriod[] = [
  {
    id: 'p1',
    year: 2026,
    name: 'Kỳ đánh giá 2026',
    status: 'Active',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
  }
];

export const mockEvaluations: Evaluation[] = [
  {
    id: 'e1',
    periodId: 'p1',
    employeeId: 'u3',
    employeeRole: 'SubLeader',
    teamId: 't1',
    rounds: [
      {
        round: 1,
        evaluatorId: 'u2',
        evaluatorRole: 'Leader',
        scores: { 'A1': 3, 'A2': 3, 'B1': 4, 'C1': 4, 'D1': 5, 'E1': 4, 'F1': 12 },
        totalScore: 145,
        grade: 'A',
        submittedAt: '2026-04-20T08:00:00Z',
        createdAt: '2026-04-20T08:00:00Z',
      },
      {
        round: 2,
        evaluatorId: 'u2',
        evaluatorRole: 'Leader',
        scores: { 'A1': 3, 'A2': 3, 'B1': 5, 'C1': 5, 'D1': 5, 'E1': 5, 'F1': 15 },
        totalScore: 155,
        grade: 'S',
        submittedAt: '2026-04-25T14:00:00Z',
        createdAt: '2026-04-25T14:00:00Z',
      }
    ],
    currentRound: 3,
    status: 'Reviewed',
    createdAt: '2026-04-20T08:00:00Z',
    updatedAt: '2026-04-25T14:00:00Z',
  },
  {
    id: 'e2',
    periodId: 'p1',
    employeeId: 'u4',
    employeeRole: 'SubLeader',
    teamId: 't1',
    rounds: [
      {
        round: 1,
        evaluatorId: 'u2',
        evaluatorRole: 'Leader',
        scores: { 'A1': 2, 'A2': 3, 'B1': 3, 'C1': 3, 'D1': 4, 'E1': 3, 'F1': 9 },
        totalScore: 120,
        grade: 'AB',
        submittedAt: '2026-04-22T09:00:00Z',
        createdAt: '2026-04-22T09:00:00Z',
      },
      {
        round: 2,
        evaluatorId: 'u2',
        evaluatorRole: 'Leader',
        scores: { 'A1': 2, 'A2': 3, 'B1': 4, 'C1': 3, 'D1': 4, 'E1': 4, 'F1': 9 },
        totalScore: 125,
        grade: 'AB',
        createdAt: '2026-04-27T10:00:00Z',
      }
    ],
    currentRound: 2,
    status: 'Draft',
    createdAt: '2026-04-22T09:00:00Z',
    updatedAt: '2026-04-27T10:00:00Z',
  },
  {
    id: 'e3',
    periodId: 'p1',
    employeeId: 'u5',
    employeeRole: 'SubLeader',
    teamId: 't2',
    rounds: [
      {
        round: 1,
        evaluatorId: 'u5',
        evaluatorRole: 'SubLeader',
        scores: { 'A1': 3, 'A2': 3, 'B1': 3, 'C1': 3, 'D1': 3, 'E1': 3, 'F1': 9 },
        totalScore: 105,
        grade: 'B',
        createdAt: '2026-04-28T08:00:00Z',
      }
    ],
    currentRound: 1,
    status: 'Draft',
    createdAt: '2026-04-28T08:00:00Z',
    updatedAt: '2026-04-28T08:00:00Z',
  },
  {
    id: 'e4',
    periodId: 'p1',
    employeeId: 'u2',
    employeeRole: 'Leader',
    teamId: 't1',
    rounds: [
      {
        round: 1,
        evaluatorId: 'u2',
        evaluatorRole: 'Leader',
        scores: { 'A1': 3, 'A2': 3, 'B1': 5, 'C1': 5, 'D1': 5, 'E1': 5, 'F1': 15 },
        totalScore: 165,
        grade: 'A',
        submittedAt: '2026-04-26T15:00:00Z',
        createdAt: '2026-04-26T15:00:00Z',
      }
    ],
    currentRound: 2,
    status: 'Submitted',
    createdAt: '2026-04-26T15:00:00Z',
    updatedAt: '2026-04-26T15:00:00Z',
  }
];

export const db: MockDB = {
  users: mockUsers,
  teams: mockTeams,
  periods: mockPeriods,
  evaluations: mockEvaluations,
};
