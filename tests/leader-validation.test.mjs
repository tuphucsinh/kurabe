import assert from 'node:assert/strict';
import {
  validateLeaderAssignment,
  selectValidLeader,
} from '../src/lib/team-validation.ts';

// -------------------------------------------------------------
// 1. validateLeaderAssignment: rejection cases
// -------------------------------------------------------------

// Case 1.1: Missing candidate (null or undefined)
{
  const resNull = validateLeaderAssignment(null, 'team-1');
  assert.deepStrictEqual(resNull, {
    ok: false,
    error: 'Không tìm thấy người dùng được chọn làm trưởng nhóm.',
  });

  const resUndefined = validateLeaderAssignment(undefined, 'team-1');
  assert.deepStrictEqual(resUndefined, {
    ok: false,
    error: 'Không tìm thấy người dùng được chọn làm trưởng nhóm.',
  });
}

// Case 1.2: Inactive candidate
{
  const inactiveCandidate = {
    id: 'user-1',
    role: 'Leader',
    isActive: false,
    teamId: 'team-1',
  };
  const res = validateLeaderAssignment(inactiveCandidate, 'team-1');
  assert.deepStrictEqual(res, {
    ok: false,
    error: 'Trưởng nhóm phải là người dùng đang hoạt động.',
  });
}

// Case 1.3: Candidate with role !== 'Leader' (Worker, SubLeader, Manager, Employee, etc.)
{
  const roles = ['Worker', 'SubLeader', 'Manager', 'Employee', 'Staff', 'Admin'];
  for (const role of roles) {
    const candidate = {
      id: `user-${role}`,
      role,
      isActive: true,
      teamId: 'team-1',
    };
    const res = validateLeaderAssignment(candidate, 'team-1');
    assert.deepStrictEqual(
      res,
      {
        ok: false,
        error: 'Trưởng nhóm phải có vai trò Leader.',
      },
      `Candidate with role "${role}" must be rejected`
    );
  }
}

// Case 1.4: Team mismatch (candidate in different team)
{
  const differentTeamCandidate = {
    id: 'user-2',
    role: 'Leader',
    isActive: true,
    teamId: 'team-2',
  };
  const res = validateLeaderAssignment(differentTeamCandidate, 'team-1');
  assert.deepStrictEqual(res, {
    ok: false,
    error: 'Trưởng nhóm phải thuộc về nhóm này.',
  });
}

// Case 1.5: Team mismatch (candidate has null teamId)
{
  const nullTeamCandidate = {
    id: 'user-3',
    role: 'Leader',
    isActive: true,
    teamId: null,
  };
  const res = validateLeaderAssignment(nullTeamCandidate, 'team-1');
  assert.deepStrictEqual(res, {
    ok: false,
    error: 'Trưởng nhóm phải thuộc về nhóm này.',
  });
}

// -------------------------------------------------------------
// 2. validateLeaderAssignment: acceptance case
// -------------------------------------------------------------
{
  const validCandidate = {
    id: 'leader-1',
    role: 'Leader',
    isActive: true,
    teamId: 'team-1',
  };
  const res = validateLeaderAssignment(validCandidate, 'team-1');
  assert.deepStrictEqual(res, { ok: true });
}

// -------------------------------------------------------------
// 3. selectValidLeader: targetTeamId missing/null/empty
// -------------------------------------------------------------
{
  const candidates = [
    { id: 'leader-1', role: 'Leader', isActive: true, teamId: 'team-1' },
  ];
  assert.strictEqual(selectValidLeader('leader-1', null, candidates), null);
  assert.strictEqual(selectValidLeader('leader-1', undefined, candidates), null);
  assert.strictEqual(selectValidLeader('leader-1', '', candidates), null);
}

// -------------------------------------------------------------
// 4. selectValidLeader: appointed leader is valid
// -------------------------------------------------------------
{
  const leader1 = { id: 'leader-1', role: 'Leader', isActive: true, teamId: 'team-1' };
  const leader2 = { id: 'leader-2', role: 'Leader', isActive: true, teamId: 'team-1' };
  const candidates = [leader2, leader1];

  // When appointedId is leader-1, leader-1 must be returned even if leader-2 is first in list
  const selected = selectValidLeader('leader-1', 'team-1', candidates);
  assert.strictEqual(selected, leader1);
}

// -------------------------------------------------------------
// 5. selectValidLeader: appointed leader invalid -> fallbacks
// -------------------------------------------------------------

// Case 5.1: Appointed leader is inactive -> fallback to first active leader
{
  const inactiveAppointed = { id: 'leader-1', role: 'Leader', isActive: false, teamId: 'team-1' };
  const fallbackLeader = { id: 'leader-2', role: 'Leader', isActive: true, teamId: 'team-1' };
  const candidates = [inactiveAppointed, fallbackLeader];

  const selected = selectValidLeader('leader-1', 'team-1', candidates);
  assert.strictEqual(selected, fallbackLeader);
}

// Case 5.2: Appointed leader has wrong role (e.g. Worker) -> fallback to active leader
{
  const wrongRoleAppointed = { id: 'worker-1', role: 'Worker', isActive: true, teamId: 'team-1' };
  const fallbackLeader = { id: 'leader-1', role: 'Leader', isActive: true, teamId: 'team-1' };
  const candidates = [wrongRoleAppointed, fallbackLeader];

  const selected = selectValidLeader('worker-1', 'team-1', candidates);
  assert.strictEqual(selected, fallbackLeader);
}

// Case 5.3: Appointed leader is in different team -> fallback to active leader in target team
{
  const otherTeamAppointed = { id: 'leader-other', role: 'Leader', isActive: true, teamId: 'team-2' };
  const fallbackLeader = { id: 'leader-1', role: 'Leader', isActive: true, teamId: 'team-1' };
  const candidates = [otherTeamAppointed, fallbackLeader];

  const selected = selectValidLeader('leader-other', 'team-1', candidates);
  assert.strictEqual(selected, fallbackLeader);
}

// Case 5.4: Appointed leader not found in candidates -> fallback to first active leader
{
  const fallbackLeader = { id: 'leader-1', role: 'Leader', isActive: true, teamId: 'team-1' };
  const candidates = [fallbackLeader];

  const selected = selectValidLeader('non-existent-id', 'team-1', candidates);
  assert.strictEqual(selected, fallbackLeader);
}

// -------------------------------------------------------------
// 6. selectValidLeader: appointedId is null/undefined
// -------------------------------------------------------------
{
  const worker = { id: 'worker-1', role: 'Worker', isActive: true, teamId: 'team-1' };
  const leader1 = { id: 'leader-1', role: 'Leader', isActive: true, teamId: 'team-1' };
  const leader2 = { id: 'leader-2', role: 'Leader', isActive: true, teamId: 'team-1' };
  const otherTeamLeader = { id: 'leader-3', role: 'Leader', isActive: true, teamId: 'team-2' };

  const candidates = [worker, leader1, leader2, otherTeamLeader];

  // With null appointedId, returns the first active Leader in target team (leader1)
  const selectedNull = selectValidLeader(null, 'team-1', candidates);
  assert.strictEqual(selectedNull, leader1);

  // With undefined appointedId, returns leader1
  const selectedUndef = selectValidLeader(undefined, 'team-1', candidates);
  assert.strictEqual(selectedUndef, leader1);
}

// -------------------------------------------------------------
// 7. selectValidLeader: no valid leader available -> returns null
// -------------------------------------------------------------
{
  const candidates = [
    { id: 'worker-1', role: 'Worker', isActive: true, teamId: 'team-1' },
    { id: 'subleader-1', role: 'SubLeader', isActive: true, teamId: 'team-1' },
    { id: 'leader-inactive', role: 'Leader', isActive: false, teamId: 'team-1' },
    { id: 'leader-other-team', role: 'Leader', isActive: true, teamId: 'team-2' },
  ];

  // Appointed is inactive and no other valid leader in team-1
  assert.strictEqual(selectValidLeader('leader-inactive', 'team-1', candidates), null);

  // Appointed is null and no valid leader in team-1
  assert.strictEqual(selectValidLeader(null, 'team-1', candidates), null);

  // Empty candidate list
  assert.strictEqual(selectValidLeader('leader-1', 'team-1', []), null);
  assert.strictEqual(selectValidLeader(null, 'team-1', []), null);
}

console.log('Leader validation behavioral tests: ALL PASS');
