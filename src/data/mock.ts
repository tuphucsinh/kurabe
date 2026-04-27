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

export interface Criteria {
  id: string;
  groupId: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  code: string;
  name: string;
  description: string;
  weight: number;
}

export interface Evaluation {
  id: string;
  employeeId: string;
  evaluatorId: string;
  scores: Record<string, number>; // criteriaId -> score (1-5)
  totalScore: number;
  grade: Grade;
  status: 'Draft' | 'Submitted' | 'Approved';
  createdAt: string;
}

export interface MockDB {
  users: User[];
  teams: Team[];
  criteria: Criteria[];
  evaluations: Evaluation[];
}

export const mockCriteria: Criteria[] = [
  { id: 'c1', groupId: 'A', code: 'A1', name: 'Tuân thủ quy định', description: 'Tuân thủ giờ giấc, đồng phục, an toàn lao động', weight: 10 },
  { id: 'c2', groupId: 'A', code: 'A2', name: 'Báo cáo', description: 'Báo cáo trung thực, kịp thời', weight: 10 },
  { id: 'c3', groupId: 'B', code: 'B1', name: 'Làm việc nhóm', description: 'Hỗ trợ đồng nghiệp', weight: 15 },
  { id: 'c4', groupId: 'C', code: 'C1', name: 'Cải tiến (Kaizen)', description: 'Đề xuất ý tưởng mới', weight: 15 },
  { id: 'c5', groupId: 'D', code: 'D1', name: 'Trách nhiệm công việc', description: 'Hoàn thành nhiệm vụ được giao', weight: 20 },
  { id: 'c6', groupId: 'E', code: 'E1', name: 'Kỹ năng chuyên môn', description: 'Nắm vững quy trình QAQC', weight: 15 },
  { id: 'c7', groupId: 'F', code: 'F1', name: 'Chất lượng công việc', description: 'Tỉ lệ lỗi (Defect rate)', weight: 15 },
];

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

export const mockEvaluations: Evaluation[] = [
  {
    id: 'e1',
    employeeId: 'u3',
    evaluatorId: 'u2',
    scores: { 'c1': 4, 'c2': 5, 'c3': 4, 'c4': 3, 'c5': 4, 'c6': 4, 'c7': 5 },
    totalScore: 145,
    grade: 'A',
    status: 'Submitted',
    createdAt: '2026-04-27T00:00:00Z',
  },
  {
    id: 'e2',
    employeeId: 'u4',
    evaluatorId: 'u2',
    scores: { 'c1': 5, 'c2': 5, 'c3': 5, 'c4': 4, 'c5': 5, 'c6': 5, 'c7': 5 },
    totalScore: 148,
    grade: 'S',
    status: 'Submitted',
    createdAt: '2026-04-27T00:00:00Z',
  },
  {
    id: 'e3',
    employeeId: 'u5',
    evaluatorId: 'u1',
    scores: { 'c1': 3, 'c2': 4, 'c3': 3, 'c4': 3, 'c5': 3, 'c6': 4, 'c7': 3 },
    totalScore: 115,
    grade: 'B',
    status: 'Submitted',
    createdAt: '2026-04-27T00:00:00Z',
  }
];

export const db: MockDB = {
  users: mockUsers,
  teams: mockTeams,
  criteria: mockCriteria,
  evaluations: mockEvaluations,
};
