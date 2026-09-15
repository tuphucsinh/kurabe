import assert from 'node:assert/strict';
import { canReview, canViewEvaluation } from '@/data/workflow';
import type { Evaluation, Role, User } from '@/types';

type TestUser = User & { isActive: boolean };

function user(id: string, role: Role, teamId: string, isActive = true, subleaderId?: string): TestUser {
  return {
    id,
    employeeCode: id,
    name: id,
    role,
    teamId,
    gender: 'Nữ',
    subleaderId,
    isActive,
  };
}

const leader = user('leader-a', 'Leader', 'team-a');
const leaderC = user('leader-c', 'Leader', 'team-c');
const employeeA = user('employee-a', 'Employee', 'team-a', true, 'sub-a');
const employeeB = user('employee-b', 'Employee', 'team-b', true, 'sub-b');
const workerB = user('worker-b', 'Worker', 'team-b', true, 'sub-b');
const employeeC = user('employee-c', 'Employee', 'team-c', true, 'sub-c');
const subA = user('sub-a', 'SubLeader', 'team-a');
const subB = user('sub-b', 'SubLeader', 'team-b');
const subC = user('sub-c', 'SubLeader', 'team-c');
const users = [leader, leaderC, employeeA, employeeB, workerB, employeeC, subA, subB, subC];
const ledTeams = ['team-a', 'team-b'];

function review(employee: TestUser): Evaluation {
  return {
    id: `evaluation-${employee.id}`,
    periodId: 'period-1',
    employeeId: employee.id,
    employeeRole: employee.role,
    teamId: employee.teamId,
    currentRound: 2,
    status: 'NotStarted',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    rounds: [{
      id: `round-${employee.id}`,
      evaluationId: `evaluation-${employee.id}`,
      round: 2,
      evaluatorId: 'assigned-other',
      evaluatorRole: 'Leader',
      scores: {},
      notes: {},
      totalScore: 0,
      grade: 'Pending',
      status: 'NotStarted',
      createdAt: '2026-01-01T00:00:00.000Z',
    }],
  };
}

assert.equal(canReview(leader, review(employeeA), users, ledTeams), true);
assert.equal(canReview(leader, review(employeeB), users, ledTeams), true);
assert.equal(canReview(leader, review(employeeC), users, ledTeams), false);
assert.equal(canReview(leader, review(employeeB), users, ['team-a']), false);
assert.equal(canViewEvaluation(leader, review(employeeA), users, ledTeams), true);
assert.equal(canViewEvaluation(leader, review(employeeB), users, ledTeams), true);
assert.equal(canViewEvaluation(leader, review(employeeC), users, ledTeams), false);

// Primary membership remains independent from appointed leadership.
assert.equal(leader.teamId, 'team-a');
assert.notEqual(leader.teamId, 'team-b');

console.log('MULTI_TEAM_LEADER_REGRESSION PASS cases=9');
