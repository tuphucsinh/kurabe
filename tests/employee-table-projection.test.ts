import { strict as assert } from 'node:assert';
import { projectEmployeeTableItems } from '../src/lib/employee-table-projection';
import type { User, Team, Evaluation, EvaluationRound } from '../src/types';

// =========================================================================
// Synthetic Fixture Helpers
// =========================================================================

function makeUser(overrides: Partial<User> & { id: string; name: string }): User {
  const { id, name, ...rest } = overrides;
  return {
    id,
    name,
    employeeCode: rest.employeeCode ?? `EMP-${id}`,
    role: rest.role ?? 'Employee',
    teamId: rest.teamId ?? 'team-1',
    gender: rest.gender ?? 'Nam',
    subleaderId: rest.subleaderId ?? null,
    description: rest.description ?? null,
    ...rest,
  };
}

function makeTeam(id: string, name: string): Team {
  return { id, name, leaderId: null };
}

function makeEval(
  employeeId: string,
  periodId: string,
  overrides?: Partial<Evaluation>
): Evaluation {
  return {
    id: `eval-${employeeId}`,
    periodId,
    employeeId,
    employeeRole: overrides?.employeeRole ?? 'Employee',
    teamId: overrides?.teamId ?? 'team-1',
    rounds: overrides?.rounds ?? [],
    currentRound: overrides?.currentRound ?? 1,
    status: overrides?.status ?? 'Submitted',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeRound(
  round: 1 | 2 | 3,
  status: 'NotStarted' | 'Draft' | 'Submitted',
  totalScore: number,
  grade: 'S' | 'A' | 'AB' | 'B' | 'C' | 'D' | 'Pending',
  overrides?: Partial<EvaluationRound>
): EvaluationRound {
  return {
    round,
    evaluatorId: overrides?.evaluatorId ?? 'evaluator-1',
    evaluatorRole: overrides?.evaluatorRole ?? 'Leader',
    status,
    scores: overrides?.scores ?? {},
    totalScore,
    grade,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// =========================================================================
// 1. Role Sort Rank & Hierarchy (Manager 0 -> Leader 1 -> SubLeader 2 -> Employee 3 -> Worker 4 -> Unknown 99)
// =========================================================================
{
  const uWorker = makeUser({ id: 'u-worker', name: 'Công nhân 1', role: 'Worker' });
  const uManager = makeUser({ id: 'u-mgr', name: 'Quản lý 1', role: 'Manager' });
  const uUnknown = makeUser({ id: 'u-unk', name: 'Khác 1', role: 'UnknownRole' as unknown as User['role'] });
  const uEmployee = makeUser({ id: 'u-emp', name: 'Nhân viên 1', role: 'Employee' });
  const uLeader = makeUser({ id: 'u-ldr', name: 'Trưởng nhóm 1', role: 'Leader' });
  const uSubLeader = makeUser({ id: 'u-sub', name: 'Phó nhóm 1', role: 'SubLeader' });

  const inputUsers = [uWorker, uManager, uUnknown, uEmployee, uLeader, uSubLeader];
  const result = projectEmployeeTableItems({ users: inputUsers });

  assert.equal(result.length, 6, 'Phải giữ đủ 6 nhân viên');
  assert.deepEqual(
    result.map((r) => r.id),
    ['u-mgr', 'u-ldr', 'u-sub', 'u-emp', 'u-worker', 'u-unk'],
    'Thứ tự sắp xếp chức vụ phải là: Manager (0) -> Leader (1) -> SubLeader (2) -> Employee (3) -> Worker (4) -> Unknown (99)'
  );
  assert.equal(result[0].role, 'Manager', 'Manager phải đứng đầu bảng');
  assert.equal(result[4].role, 'Worker', 'Worker phải đứng trước unknown và sau Employee');
}

// =========================================================================
// 2. Within-role Team Sort & Manager 'Toàn bộ bộ phận' Override
// =========================================================================
{
  const teamA = makeTeam('t-a', 'Đội An ninh');
  const teamB = makeTeam('t-b', 'Đội Bảo trì');
  const teamC = makeTeam('t-c', 'Đội Cơ điện');
  const teams = [teamA, teamB, teamC];

  // 2.1 Non-Manager team sorting via localeCompare 'vi'
  const empB = makeUser({ id: 'e-b', name: 'Nhân viên B', role: 'Employee', teamId: 't-b' });
  const empC = makeUser({ id: 'e-c', name: 'Nhân viên C', role: 'Employee', teamId: 't-c' });
  const empA = makeUser({ id: 'e-a', name: 'Nhân viên A', role: 'Employee', teamId: 't-a' });
  const empNoTeam = makeUser({ id: 'e-none', name: 'Nhân viên Không nhóm', role: 'Employee', teamId: 't-unknown' });

  const empResult = projectEmployeeTableItems({
    users: [empB, empC, empA, empNoTeam],
    teams,
  });

  assert.deepEqual(
    empResult.map((r) => r.id),
    ['e-none', 'e-a', 'e-b', 'e-c'],
    'Cùng chức vụ: sort theo tên nhóm ASC theo tiếng Việt, nhóm không tìm thấy coi là rỗng "" đứng đầu'
  );
  assert.equal(empResult[1].teamName, 'Đội An ninh');
  assert.equal(empResult[2].teamName, 'Đội Bảo trì');
  assert.equal(empResult[3].teamName, 'Đội Cơ điện');

  // 2.2 Manager team label is always 'Toàn bộ bộ phận'
  const mgr1 = makeUser({ id: 'm-1', name: 'Bùi Quản lý', role: 'Manager', teamId: 't-b' });
  const mgr2 = makeUser({ id: 'm-2', name: 'An Quản lý', role: 'Manager', teamId: 't-a' });

  const mgrResult = projectEmployeeTableItems({
    users: [mgr1, mgr2],
    teams,
  });

  assert.equal(mgrResult[0].teamName, 'Toàn bộ bộ phận', 'Manager teamName luôn là "Toàn bộ bộ phận"');
  assert.equal(mgrResult[1].teamName, 'Toàn bộ bộ phận', 'Manager teamName luôn là "Toàn bộ bộ phận"');
  assert.deepEqual(
    mgrResult.map((r) => r.id),
    ['m-2', 'm-1'],
    'Manager có teamNameOf giống nhau nên được sort tiếp theo tên nhân viên: An (m-2) -> Bùi (m-1)'
  );
}

// =========================================================================
// 3. Within-team SubLeader Sort (subleaderMap -> userMap -> '')
// =========================================================================
{
  const team = makeTeam('t-1', 'Nhóm QA');
  const teams = [team];

  // emp1: subleader from subleaderMap -> 'Đặng SubLeader'
  const emp1 = makeUser({ id: 'e-1', name: 'Nhân viên 1', role: 'Employee', teamId: 't-1', subleaderId: 'sub-1' });
  // emp2: subleader from userMap -> 'Cao SubLeader'
  const emp2 = makeUser({ id: 'e-2', name: 'Nhân viên 2', role: 'Employee', teamId: 't-1', subleaderId: 'sub-2' });
  // emp3: no subleader -> ''
  const emp3 = makeUser({ id: 'e-3', name: 'Nhân viên 3', role: 'Employee', teamId: 't-1', subleaderId: null });
  // emp4: subleader from subleaderMap -> 'Vũ SubLeader'
  const emp4 = makeUser({ id: 'e-4', name: 'Nhân viên 4', role: 'Employee', teamId: 't-1', subleaderId: 'sub-4' });

  const subleaderMap: Record<string, string> = {
    'sub-1': 'Đặng SubLeader',
    'sub-4': 'Vũ SubLeader',
  };

  const userMap = new Map<string, User>([
    ['sub-2', makeUser({ id: 'sub-2', name: 'Cao SubLeader', role: 'SubLeader', teamId: 't-1' })],
  ]);

  const result = projectEmployeeTableItems({
    users: [emp1, emp4, emp2, emp3],
    teams,
    subleaderMap,
    userMap,
  });

  assert.deepEqual(
    result.map((r) => r.id),
    ['e-3', 'e-2', 'e-1', 'e-4'],
    'Sort theo subleader name: Không có ("") -> Cao SubLeader -> Đặng SubLeader -> Vũ SubLeader'
  );

  // Auto-resolution of userMap when userMap is omitted from params
  const subUserInList = makeUser({ id: 'sub-auto', name: 'Bạch SubLeader', role: 'SubLeader', teamId: 't-1' });
  const empWithAutoSub = makeUser({ id: 'e-auto', name: 'Nhân viên A', role: 'Employee', teamId: 't-1', subleaderId: 'sub-auto' });
  const empNoSub = makeUser({ id: 'e-nosub', name: 'Nhân viên B', role: 'Employee', teamId: 't-1', subleaderId: null });

  const autoResult = projectEmployeeTableItems({
    users: [empWithAutoSub, empNoSub, subUserInList],
    teams,
  });

  // subUserInList is SubLeader role (rank 2), so it appears before Employee (rank 3)
  assert.equal(autoResult[0].id, 'sub-auto', 'SubLeader có role rank cao hơn Employee');
  assert.equal(autoResult[1].id, 'e-nosub', 'Employee không có subleader ("") đứng trước Employee có Bạch SubLeader');
  assert.equal(autoResult[2].id, 'e-auto', 'Employee có Bạch SubLeader đứng sau');
}

// =========================================================================
// 4. Within-subleader Employee Name Sort & Input Immutability
// =========================================================================
{
  const u1 = makeUser({ id: 'u-1', name: 'Vũ Văn D' });
  const u2 = makeUser({ id: 'u-2', name: 'An Văn A' });
  const u3 = makeUser({ id: 'u-3', name: 'Đỗ Văn C' });
  const u4 = makeUser({ id: 'u-4', name: 'Bùi Văn B' });

  // Freeze objects to ensure pure immutability
  const originalUsers = Object.freeze([Object.freeze(u1), Object.freeze(u2), Object.freeze(u3), Object.freeze(u4)]);

  const result = projectEmployeeTableItems({ users: originalUsers });

  assert.deepEqual(
    result.map((r) => r.name),
    ['An Văn A', 'Bùi Văn B', 'Đỗ Văn C', 'Vũ Văn D'],
    'Sắp xếp tên nhân viên theo thứ tự bảng chữ cái tiếng Việt'
  );

  // Ensure original input array was not mutated
  assert.equal(originalUsers[0].id, 'u-1', 'Mảng users đầu vào không bị thay đổi phần tử đầu');
  assert.equal(originalUsers[1].id, 'u-2', 'Mảng users đầu vào không bị thay đổi phần tử thứ hai');
  assert.equal(originalUsers.length, 4, 'Độ dài mảng đầu vào giữ nguyên');
}

// =========================================================================
// 5. Evaluation Selection & Period Matching & Fallbacks
// =========================================================================
{
  const u1 = makeUser({ id: 'u-eval-1', name: 'Nhân viên 1' });
  const teams = [makeTeam('team-1', 'Nhóm 1')];

  // 5.1 Matching period
  const evalPeriod2026 = makeEval('u-eval-1', 'period-2026', {
    finalGrade: 'A',
    finalScore: 85,
  });

  const resMatching = projectEmployeeTableItems({
    users: [u1],
    teams,
    currentPeriodId: 'period-2026',
    evaluationsMap: { 'u-eval-1': evalPeriod2026 },
  });

  assert.equal(resMatching[0].grade, 'A', 'Đúng kỳ -> nhận finalGrade A');
  assert.equal(resMatching[0].score, 85, 'Đúng kỳ -> nhận finalScore 85');
  assert.equal(resMatching[0].hasFinalResult, true, 'Đúng kỳ có finalGrade -> hasFinalResult = true');

  // 5.2 Mismatched period -> ignored (treated as null)
  const resMismatch = projectEmployeeTableItems({
    users: [u1],
    teams,
    currentPeriodId: 'period-2025',
    evaluationsMap: { 'u-eval-1': evalPeriod2026 },
  });

  assert.equal(resMismatch[0].grade, '-', 'Khác kỳ -> fallback grade "-"');
  assert.equal(resMismatch[0].score, 0, 'Khác kỳ -> fallback score 0');
  assert.equal(resMismatch[0].gradeRound, null, 'Khác kỳ -> fallback gradeRound null');
  assert.deepEqual(resMismatch[0].previousRoundScores, [], 'Khác kỳ -> fallback previousRoundScores []');
  assert.equal(resMismatch[0].hasFinalResult, false, 'Khác kỳ -> fallback hasFinalResult false');

  // 5.3 currentPeriodId is empty / null -> evaluation accepted
  const resNoPeriodFilter = projectEmployeeTableItems({
    users: [u1],
    teams,
    currentPeriodId: null,
    evaluationsMap: { 'u-eval-1': evalPeriod2026 },
  });
  assert.equal(resNoPeriodFilter[0].grade, 'A', 'currentPeriodId=null -> chấp nhận evaluation');

  // 5.4 rawEval.periodId is empty / null -> evaluation accepted even if currentPeriodId is set
  const evalNoPeriod = makeEval('u-eval-1', '', { finalGrade: 'B', finalScore: 75 });
  const resEvalNoPeriod = projectEmployeeTableItems({
    users: [u1],
    teams,
    currentPeriodId: 'period-2026',
    evaluationsMap: { 'u-eval-1': evalNoPeriod },
  });
  assert.equal(resEvalNoPeriod[0].grade, 'B', 'eval.periodId rỗng -> chấp nhận evaluation');
}

// =========================================================================
// 6. Scored Rounds Predicate, Latest Round, and Previous Round Scores
// =========================================================================
{
  const u1 = makeUser({ id: 'u-scored-1', name: 'Nhân viên Scored' });
  const teams = [makeTeam('team-1', 'Nhóm 1')];

  const round1Draft = makeRound(1, 'Draft', 50, 'D');
  const round1Submitted = makeRound(1, 'Submitted', 70, 'C');
  const round2Submitted = makeRound(2, 'Submitted', 82, 'B');
  const round3Reviewed: EvaluationRound = {
    ...makeRound(3, 'Submitted', 94, 'A'),
    status: 'Reviewed' as unknown as EvaluationRound['status'],
  };
  const round3NotStarted = makeRound(3, 'NotStarted', 0, 'Pending');

  // 6.1 Filter excludes Draft and NotStarted, includes Submitted / Reviewed
  const evalWithRounds = makeEval('u-scored-1', 'p-1', {
    rounds: [round1Submitted, round2Submitted, round3Reviewed, round3NotStarted],
    finalGrade: undefined,
    finalScore: undefined,
  });

  const res = projectEmployeeTableItems({
    users: [u1],
    teams,
    currentPeriodId: 'p-1',
    evaluationsMap: { 'u-scored-1': evalWithRounds },
  });

  assert.equal(res[0].grade, 'A', 'grade lấy từ round điểm cao nhất hợp lệ (round 3)');
  assert.equal(res[0].score, 94, 'score lấy từ round 3 (94)');
  assert.equal(res[0].gradeRound, 3, 'gradeRound là 3');
  assert.equal(res[0].hasFinalResult, false, 'Không có finalGrade -> hasFinalResult = false');
  assert.deepEqual(
    res[0].previousRoundScores,
    [
      { round: 2, score: 82 },
      { round: 1, score: 70 },
    ],
    'previousRoundScores chứa round 2 và 1, sắp xếp theo round DESC'
  );

  // 6.2 Draft without submittedAt is excluded
  const evalOnlyDraft = makeEval('u-scored-1', 'p-1', {
    rounds: [round1Draft],
  });
  const resDraft = projectEmployeeTableItems({
    users: [u1],
    teams,
    currentPeriodId: 'p-1',
    evaluationsMap: { 'u-scored-1': evalOnlyDraft },
  });
  assert.equal(resDraft[0].grade, '-', 'Draft không có điểm hợp lệ -> grade "-"');
  assert.equal(resDraft[0].score, 0, 'Draft không có điểm hợp lệ -> score 0');
  assert.equal(resDraft[0].gradeRound, null, 'Draft -> gradeRound null');
  assert.deepEqual(resDraft[0].previousRoundScores, [], 'Draft -> previousRoundScores []');

  // 6.3 When finalGrade & finalScore are explicitly present, they take precedence
  const evalFinal = makeEval('u-scored-1', 'p-1', {
    rounds: [round1Submitted, round2Submitted],
    finalGrade: 'S',
    finalScore: 99,
  });
  const resFinal = projectEmployeeTableItems({
    users: [u1],
    teams,
    currentPeriodId: 'p-1',
    evaluationsMap: { 'u-scored-1': evalFinal },
  });
  assert.equal(resFinal[0].grade, 'S', 'finalGrade ưu tiên hơn round grade');
  assert.equal(resFinal[0].score, 99, 'finalScore ưu tiên hơn round score');
  assert.equal(resFinal[0].gradeRound, 2, 'gradeRound vẫn phản ánh round mới nhất (round 2)');
  assert.equal(resFinal[0].hasFinalResult, true, 'hasFinalResult = true khi có finalGrade');
}

// =========================================================================
// 7. Loading & Error Flags and Team Fallback Labels
// =========================================================================
{
  const uManager = makeUser({ id: 'u-m', name: 'Quản lý', role: 'Manager', teamId: '' });
  const uWorker = makeUser({ id: 'u-w', name: 'Công nhân', role: 'Worker', teamId: 't-none' });
  const uEmp = makeUser({ id: 'u-e', name: 'Nhân viên', role: 'Employee', teamId: 't-1' });

  const teams = [makeTeam('t-1', 'Nhóm Sản xuất')];

  // 7.1 Loading state for teams
  const resTeamsLoading = projectEmployeeTableItems({
    users: [uManager, uWorker, uEmp],
    teams: [],
    teamsLoading: true,
    evalLoadingMap: { 'u-w': true },
    evalErrorMap: { 'u-e': true },
  });

  const mgrItem = resTeamsLoading.find((r) => r.id === 'u-m');
  const workerItem = resTeamsLoading.find((r) => r.id === 'u-w');
  const empItem = resTeamsLoading.find((r) => r.id === 'u-e');

  assert.equal(mgrItem?.teamName, 'Toàn bộ bộ phận', 'Manager luôn là "Toàn bộ bộ phận" kể cả khi teamsLoading=true');
  assert.equal(workerItem?.teamName, 'Đang tải...', 'Worker chưa gán nhóm khi teamsLoading=true hiển thị "Đang tải..."');
  assert.equal(workerItem?.evaluationLoading, true, 'Worker có evalLoadingMap=true -> evaluationLoading=true');
  assert.equal(empItem?.evaluationError, true, 'Employee có evalErrorMap=true -> evaluationError=true');

  // 7.2 Error state for teams
  const resTeamsError = projectEmployeeTableItems({
    users: [uWorker],
    teams: [],
    teamsError: 'Network Error',
  });
  assert.equal(resTeamsError[0].teamName, 'Lỗi tải nhóm', 'Không tìm thấy nhóm khi teamsError hiển thị "Lỗi tải nhóm"');

  // 7.3 Unassigned team fallback
  const resUnassigned = projectEmployeeTableItems({
    users: [uWorker],
    teams,
    teamsLoading: false,
    teamsError: null,
  });
  assert.equal(resUnassigned[0].teamName, 'Chưa gán', 'Không tìm thấy nhóm khi không loading/error hiển thị "Chưa gán"');
}

// =========================================================================
// 8. Edge Cases (Empty Users, Default Params)
// =========================================================================
{
  const emptyRes = projectEmployeeTableItems({ users: [] });
  assert.deepEqual(emptyRes, [], 'Mảng users rỗng trả về []');

  const singleUser = makeUser({ id: 'u-single', name: 'Một Nhân viên' });
  const defaultParamsRes = projectEmployeeTableItems({ users: [singleUser] });
  assert.equal(defaultParamsRes.length, 1);
  assert.equal(defaultParamsRes[0].teamName, 'Chưa gán');
  assert.equal(defaultParamsRes[0].grade, '-');
  assert.equal(defaultParamsRes[0].score, 0);
  assert.equal(defaultParamsRes[0].evaluationLoading, false);
  assert.equal(defaultParamsRes[0].evaluationError, false);
}

console.log('employee-table-projection tests: ALL PASS');
