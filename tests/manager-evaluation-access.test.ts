import assert from 'node:assert/strict';
import { canViewEvaluation, getEvaluationAccessState, hasRoundDraft } from '@/data/workflow';
import type { Evaluation, EvaluationRound, Role, User } from '@/types';

function user(id: string, role: Role, teamId: string, options: Partial<User> = {}): User {
  return {
    id,
    employeeCode: id,
    name: id,
    role,
    teamId,
    gender: 'Nữ',
    ...options,
  };
}

function round(
  roundNumber: 1 | 2 | 3,
  evaluatorId: string,
  evaluatorRole: Role,
  status: EvaluationRound['status'],
  overrides: Partial<EvaluationRound> = {},
): EvaluationRound {
  return {
    id: `round-${roundNumber}`,
    evaluationId: 'evaluation-1',
    round: roundNumber,
    evaluatorId,
    evaluatorRole,
    status,
    scores: {},
    notes: {},
    totalScore: 0,
    grade: 'Pending',
    createdAt: '2026-09-16T00:00:00.000Z',
    ...overrides,
  };
}

function evaluation(
  employee: User,
  rounds: EvaluationRound[],
  currentRound: 1 | 2 | 3,
  status: Evaluation['status'] = 'Draft',
): Evaluation {
  return {
    id: 'evaluation-1',
    periodId: 'period-1',
    employeeId: employee.id,
    employeeRole: employee.role,
    teamId: employee.teamId,
    rounds,
    currentRound,
    status,
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
  };
}

const manager = user('manager-1', 'Manager', 'team-a');
const employee = user('employee-1', 'Employee', 'team-b', { subleaderId: 'subleader-b' });
const subleaderB = user('subleader-b', 'SubLeader', 'team-b');
const leaderC = user('leader-c', 'Leader', 'team-c');
const subleaderC = user('subleader-c', 'SubLeader', 'team-c');
const targetUsers = [employee, subleaderB, manager, leaderC, subleaderC];

// Manager + NotStarted/no visible draft: authorization is view, not NO_DRAFT denial.
{
  const notStartedRound = round(1, subleaderB.id, 'SubLeader', 'NotStarted');
  const target = evaluation(employee, [notStartedRound], 1, 'NotStarted');
  assert.equal(hasRoundDraft(notStartedRound), false);
  assert.equal(canViewEvaluation(manager, target, targetUsers), true);
  const state = getEvaluationAccessState(manager, target, targetUsers);
  assert.equal(state.mode, 'readonly');
  assert.equal(state.reason, undefined);
  assert.equal(state.displayRound, 1);
  assert.deepEqual(state.visibleRounds, []);
}

// Manager + Draft: current rules remain a visible read-only round.
{
  const draftRound = round(1, subleaderB.id, 'SubLeader', 'Draft', { comment: 'current draft' });
  const target = evaluation(employee, [draftRound], 1);
  assert.equal(canViewEvaluation(manager, target, targetUsers), true);
  const state = getEvaluationAccessState(manager, target, targetUsers);
  assert.equal(state.mode, 'readonly');
  assert.equal(state.displayRound, 1);
  assert.deepEqual(state.visibleRounds.map((item) => item.status), ['Draft']);
}

// Manager who is the current evaluator keeps edit access.
{
  const target = evaluation(
    employee,
    [
      round(1, subleaderB.id, 'SubLeader', 'Submitted', { submittedAt: '2026-09-16T00:00:00.000Z' }),
      round(2, leaderC.id, 'Leader', 'Submitted', { submittedAt: '2026-09-16T00:01:00.000Z' }),
      round(3, manager.id, 'Manager', 'Draft'),
    ],
    3,
  );
  const state = getEvaluationAccessState(manager, target, targetUsers, []);
  assert.equal(state.mode, 'edit');
  assert.equal(state.editableRound, 3);
  assert.equal(state.displayRound, 3);
}

// Unrelated Leader and SubLeader remain denied by the existing authorization path.
{
  const target = evaluation(employee, [round(1, subleaderB.id, 'SubLeader', 'NotStarted')], 1, 'NotStarted');
  const leaderState = getEvaluationAccessState(leaderC, target, targetUsers, ['team-c']);
  assert.equal(canViewEvaluation(leaderC, target, targetUsers, ['team-c']), false);
  assert.equal(leaderState.mode, 'blocked');
  assert.equal(leaderState.reason, 'NOT_AUTHORIZED');

  const subleaderState = getEvaluationAccessState(subleaderC, target, targetUsers, []);
  assert.equal(canViewEvaluation(subleaderC, target, targetUsers, []), false);
  assert.equal(subleaderState.mode, 'blocked');
  assert.equal(subleaderState.reason, 'NOT_AUTHORIZED');
}

console.log('MANAGER_EVALUATION_ACCESS_REGRESSION PASS cases=4');
