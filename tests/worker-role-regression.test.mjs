import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

function readProjectFile(relPath) {
  const fullPath = path.join(projectRoot, relPath);
  assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

function extractBetween(code, startDelimiter, endDelimiter) {
  const startIndex = code.indexOf(startDelimiter);
  assert.ok(startIndex !== -1, `Start delimiter not found: ${startDelimiter}`);
  const searchFrom = startIndex + startDelimiter.length;
  if (!endDelimiter) {
    return code.slice(startIndex);
  }
  const endIndex = code.indexOf(endDelimiter, searchFrom);
  assert.ok(endIndex !== -1, `End delimiter not found: ${endDelimiter}`);
  return code.slice(startIndex, endIndex);
}

function extractFunction(code, functionName) {
  const regex = new RegExp(`(?:export\\s+(?:async\\s+)?)?function\\s+${functionName}\\b`);
  const match = code.match(regex);
  assert.ok(match, `Function declaration not found: ${functionName}`);
  const startIndex = match.index;
  const fromStart = code.slice(startIndex);
  const nextExportMatch = fromStart.slice(match[0].length).match(/\nexport\s+/);
  if (nextExportMatch) {
    return fromStart.slice(0, match[0].length + nextExportMatch.index);
  }
  return fromStart;
}

function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// 1. src/actions/evaluation.ts
{
  const code = readProjectFile('src/actions/evaluation.ts');
  assert.ok(
    !code.includes("evaluatorRole: isLeaderGradingRole(evaluation.employeeRole) ? 'Leader' : 'Employee'"),
    'src/actions/evaluation.ts must not collapse Worker to Employee when building tempRound'
  );
  assert.ok(
    code.includes('evaluatorRole: evaluation.employeeRole'),
    'src/actions/evaluation.ts must pass actual evaluation.employeeRole into tempRound.evaluatorRole'
  );
}

// 2. src/app/evaluations/[id]/EvaluationPageClient.tsx
{
  const code = readProjectFile('src/app/evaluations/[id]/EvaluationPageClient.tsx');
  assert.ok(
    !code.includes("evaluatorRole: usesLeaderGrading ? 'Leader' : 'Employee'"),
    'src/app/evaluations/[id]/EvaluationPageClient.tsx must not collapse Worker to Employee in currentSummaryRound'
  );
  assert.ok(
    code.includes('evaluatorRole: employee.role'),
    'src/app/evaluations/[id]/EvaluationPageClient.tsx must pass employee.role into currentSummaryRound.evaluatorRole'
  );
}

// 3. src/app/evaluations/[id]/compare/ComparePageClient.tsx
{
  const code = readProjectFile('src/app/evaluations/[id]/compare/ComparePageClient.tsx');
  assert.ok(
    !code.includes("const role = isLeaderGradingRole(employee.role) ? 'Leader' : 'Employee'"),
    'src/app/evaluations/[id]/compare/ComparePageClient.tsx must not collapse Worker to Employee for criteria filtering'
  );
  assert.ok(
    !code.includes("const evaluatorRole = isLeaderGradingRole(employee.role) ? 'Leader' : 'Employee'"),
    'src/app/evaluations/[id]/compare/ComparePageClient.tsx must not collapse Worker to Employee for round scoring'
  );
  assert.ok(
    code.includes('const role = employee.role;'),
    'src/app/evaluations/[id]/compare/ComparePageClient.tsx must filter criteria using employee.role'
  );
  assert.ok(
    code.includes('const evaluatorRole = employee.role;'),
    'src/app/evaluations/[id]/compare/ComparePageClient.tsx must calculate round score using employee.role'
  );
}

// 4. src/components/evaluation/ResultCard.tsx
{
  const code = readProjectFile('src/components/evaluation/ResultCard.tsx');
  assert.ok(
    !code.includes("const roleGroup = isLeaderGradingRole(employee.role) ? 'leader' : 'staff';"),
    'src/components/evaluation/ResultCard.tsx must not use binary leader/staff fallback without Worker handling'
  );
  assert.ok(
    code.includes("employee.role === 'Worker'") && (code.includes("'worker'") || code.includes('gradeBands.worker')),
    "src/components/evaluation/ResultCard.tsx must handle employee.role === 'Worker' and select worker grade band"
  );
}

// 5. src/components/evaluation/EvaluationHeader.tsx
{
  const code = readProjectFile('src/components/evaluation/EvaluationHeader.tsx');
  assert.ok(
    !code.includes('calculateGrade(rScore, isLeader)'),
    'src/components/evaluation/EvaluationHeader.tsx must not use boolean-only calculateGrade for previous rounds'
  );
  assert.ok(
    code.includes('getGradeFromScore(rScore, employee.role'),
    'src/components/evaluation/EvaluationHeader.tsx must use role-aware getGradeFromScore with employee.role'
  );
}

// 6. src/components/settings/AccountTab.tsx
{
  const code = readProjectFile('src/components/settings/AccountTab.tsx');
  assert.ok(
    code.includes("Worker: 'Công nhân'") || code.includes('Worker: "Công nhân"'),
    'src/components/settings/AccountTab.tsx must define Vietnamese label "Công nhân" for Worker role'
  );
  assert.ok(
    /Worker:\s*['"]/.test(code),
    'src/components/settings/AccountTab.tsx must define badge styling for Worker role'
  );
}

// 7. src/components/chat/ChatWidget.tsx
{
  const code = readProjectFile('src/components/chat/ChatWidget.tsx');
  const roleMatch = code.match(/\[([^\]]+)\]\.includes\(\s*user\.role\s*\)/);
  assert.ok(roleMatch, 'src/components/chat/ChatWidget.tsx must check user.role against an allowed role list');
  const allowedRoles = roleMatch[1].split(',').map((r) => r.trim().replace(/['"]/g, ''));
  assert.ok(allowedRoles.includes('Worker'), 'ChatWidget allowlist must include Worker');
  assert.ok(allowedRoles.includes('Manager'), 'ChatWidget allowlist must include Manager');
  assert.ok(allowedRoles.includes('Leader'), 'ChatWidget allowlist must include Leader');
  assert.ok(allowedRoles.includes('SubLeader'), 'ChatWidget allowlist must include SubLeader');
  assert.ok(!allowedRoles.includes('Employee'), 'ChatWidget allowlist must exclude Employee');
}

// 8. src/actions/chat.ts
{
  const code = readProjectFile('src/actions/chat.ts');
  assert.ok(
    code.includes("if (role === 'Worker') return 'Công nhân';") || code.includes('Worker: "Công nhân"'),
    'src/actions/chat.ts must localize Worker role as "Công nhân"'
  );
  assert.ok(
    code.includes("role === 'Worker' ? 'Công nhân' : 'Nhân viên'") || code.includes("role === 'Worker'"),
    'src/actions/chat.ts must route Worker as individual/staff-like role, distinct from SubLeader/management'
  );

  const greetingMatch = code.match(/chatGreetingAction[\s\S]*?requireRole\(\s*\[([^\]]+)\]\s*\)/);
  assert.ok(greetingMatch, 'chatGreetingAction must call requireRole with an array of allowed roles');
  const greetingRoles = greetingMatch[1].split(',').map((r) => r.trim().replace(/['"]/g, ''));
  assert.ok(greetingRoles.includes('Worker'), 'chatGreetingAction requireRole array must include Worker');
  assert.ok(
    greetingRoles.includes('Manager') && greetingRoles.includes('Leader') && greetingRoles.includes('SubLeader'),
    'chatGreetingAction must preserve Manager/Leader/SubLeader'
  );
  assert.ok(!greetingRoles.includes('Employee'), 'chatGreetingAction must exclude unauthorized roles like Employee');

  const prepareMatch = code.match(/prepareChatContext[\s\S]*?requireRole\(\s*\[([^\]]+)\]\s*\)/);
  assert.ok(prepareMatch, 'prepareChatContext must call requireRole with an array of allowed roles');
  const prepareRoles = prepareMatch[1].split(',').map((r) => r.trim().replace(/['"]/g, ''));
  assert.ok(prepareRoles.includes('Worker'), 'prepareChatContext requireRole array must include Worker');
  assert.ok(
    prepareRoles.includes('Manager') && prepareRoles.includes('Leader') && prepareRoles.includes('SubLeader'),
    'prepareChatContext must preserve Manager/Leader/SubLeader'
  );
  assert.ok(!prepareRoles.includes('Employee'), 'prepareChatContext must exclude unauthorized roles like Employee');
}

// 9. src/lib/chat-knowledge.md
{
  const knowledge = readProjectFile('src/lib/chat-knowledge.md');
  assert.ok(
    knowledge.includes('Công nhân') && knowledge.includes('Worker'),
    'src/lib/chat-knowledge.md must document Worker role with "Công nhân" localization'
  );
  assert.ok(
    knowledge.includes('### Công nhân (Worker)'),
    'src/lib/chat-knowledge.md must include operational guide section for Công nhân (Worker)'
  );
}

// 10. src/actions/teams.ts
{
  const code = readProjectFile('src/actions/teams.ts');
  const upsertRegion = extractFunction(code, 'upsertTeamAction');

  const upsertIdx = upsertRegion.indexOf(".from('teams')\n      .upsert") !== -1
    ? upsertRegion.indexOf(".from('teams')\n      .upsert")
    : upsertRegion.indexOf('.upsert(');
  assert.ok(upsertIdx !== -1, 'upsertTeamAction must contain .upsert(');

  // Existing team lookup must destructure { data, error } and handle error before upsert
  const existingTeamLookupRegion = extractBetween(upsertRegion, 'if (team.id)', 'const teamId');
  assert.ok(
    existingTeamLookupRegion.includes('{ data, error }') || /\{\s*data\s*,\s*error\s*\}/.test(existingTeamLookupRegion),
    'upsertTeamAction existing team lookup must destructure { data, error }'
  );
  const existingErrorIdx = upsertRegion.indexOf('if (error)');
  assert.ok(
    existingErrorIdx !== -1 && existingErrorIdx < upsertIdx,
    'upsertTeamAction must handle existing team lookup error before .upsert('
  );
  assert.ok(
    existingTeamLookupRegion.includes('return { success: false'),
    'upsertTeamAction existing team lookup must return fail-closed error on query failure'
  );

  // Semantic leader lookup and validation region
  const leaderValidationRegion = extractBetween(upsertRegion, 'if (leaderId)', 'const dbTeam');
  assert.ok(
    leaderValidationRegion.includes(".from('users')") && leaderValidationRegion.includes(".eq('id', leaderId)"),
    'upsertTeamAction must perform semantic lookup of leaderId from users table'
  );

  // Leader lookup must destructure { data: leaderUser, error: leaderLookupError }
  assert.ok(
    leaderValidationRegion.includes('{ data: leaderUser, error: leaderLookupError }') ||
      /\{\s*data\s*:\s*leaderUser\s*,\s*error\s*:\s*leaderLookupError\s*\}/.test(leaderValidationRegion),
    'upsertTeamAction leader lookup must destructure { data: leaderUser, error: leaderLookupError }'
  );

  // Error and validation indices before upsert
  const leaderLookupErrorIdx = upsertRegion.indexOf('if (leaderLookupError)');
  assert.ok(
    leaderLookupErrorIdx !== -1 && leaderLookupErrorIdx < upsertIdx,
    'upsertTeamAction must handle leaderLookupError before .upsert('
  );

  // Validation helper call wiring before upsert
  const validationCallIdx = upsertRegion.indexOf('validateLeaderAssignment(');
  assert.ok(
    validationCallIdx !== -1 && validationCallIdx < upsertIdx,
    'upsertTeamAction must invoke validateLeaderAssignment helper before .upsert('
  );

  const validationOkIdx = upsertRegion.indexOf('if (!validation.ok)');
  assert.ok(
    validationOkIdx !== -1 && validationOkIdx < upsertIdx,
    'upsertTeamAction must check !validation.ok before .upsert('
  );

  // Assert no false && in validation region and before upsert
  assert.ok(
    !leaderValidationRegion.includes('false &&'),
    'Leader validation region must not contain false && bypass'
  );
  assert.ok(
    !upsertRegion.slice(0, upsertIdx).includes('false &&'),
    'upsertTeamAction pre-upsert region must not contain false &&'
  );

  // Active validation statements exist in non-comment code
  const cleanValidationRegion = stripComments(leaderValidationRegion);
  assert.ok(cleanValidationRegion.includes('if (leaderLookupError)'), 'leaderLookupError check must be active code');
  assert.ok(cleanValidationRegion.includes('validateLeaderAssignment('), 'validateLeaderAssignment call must be active code');
  assert.ok(cleanValidationRegion.includes('if (!validation.ok)'), '!validation.ok check must be active code');

  // Explicit null clear handling
  assert.ok(
    upsertRegion.includes('leader_id: leaderId') || /leader_id:\s*.*\|\|\s*null/.test(upsertRegion),
    'upsertTeamAction must pass leader_id into dbTeam payload'
  );
  assert.ok(
    upsertRegion.includes('team.leaderId ? team.leaderId : null') || upsertRegion.includes('team.leaderId || null'),
    'upsertTeamAction must normalize omitted/empty leaderId to null'
  );
  assert.ok(
    upsertRegion.includes('leaderId: data.leader_id || null') || upsertRegion.includes('leaderId: data.leader_id ?? null'),
    'upsertTeamAction must map savedTeam leaderId explicitly with data.leader_id || null'
  );

  // Existing name preservation
  assert.ok(
    upsertRegion.includes(".from('teams')") && upsertRegion.includes(".select('id, name')") && upsertRegion.includes(".eq('id', team.id)"),
    'upsertTeamAction must read existing team name when team.id is provided'
  );
  assert.ok(
    upsertRegion.includes('team.name || existingTeam?.name') || upsertRegion.includes('team.name || existingTeam.name'),
    'upsertTeamAction must use existing team name when update name is omitted'
  );
  assert.ok(
    !upsertRegion.includes('name: team.name || ""') && !upsertRegion.includes("name: team.name || ''"),
    'upsertTeamAction must not unconditionally overwrite existing name with empty string'
  );

  // Team/user relationship is now committed atomically by the personnel RPC.
  const postUpsertRegion = upsertRegion.slice(upsertIdx);
  const cleanPostUpsertRegion = stripComments(postUpsertRegion);
  assert.ok(
    cleanPostUpsertRegion.includes('applyPersonnelTransaction([], dbTeam, auth.user.id)'),
    'upsertTeamAction must commit team/leader changes through the atomic personnel transaction'
  );
  assert.ok(
    !cleanPostUpsertRegion.includes(".from('users')") ||
      !cleanPostUpsertRegion.includes('.update('),
    'upsertTeamAction must not perform a compensating direct users update'
  );
}

// 10b. appointed Leader UI scope
{
  const code = readProjectFile('src/app/teams/[id]/page.tsx');
  assert.ok(
    code.includes('team?.leaderId === user.id'),
    'team detail actions must allow a Leader appointed through teams.leader_id'
  );
}

// 11. src/lib/evaluator-resolver.ts
{
  const code = readProjectFile('src/lib/evaluator-resolver.ts');

  // resolveEvaluatorFromDb
  const dbResolverRegion = extractFunction(code, 'resolveEvaluatorFromDb');
  const dbLeaderBranch = extractBetween(dbResolverRegion, "if (selector === 'Leader'", "if (selector === 'Manager')");

  assert.ok(
    dbLeaderBranch.includes(".from('teams')") &&
      dbLeaderBranch.includes(".select('leader_id')") &&
      dbLeaderBranch.includes(".eq('id', subject.teamId)"),
    'resolveEvaluatorFromDb Leader branch must query teams.leader_id for subject.teamId'
  );
  const cleanLeaderDb = stripComments(dbLeaderBranch);
  assert.ok(
    cleanLeaderDb.includes(".from('users')") &&
      cleanLeaderDb.includes(".eq('id', team.leader_id)") &&
      (cleanLeaderDb.includes(".eq('role', 'Leader')") || cleanLeaderDb.includes('.eq("role", "Leader")')) &&
      cleanLeaderDb.includes(".eq('is_active', true)"),
    'appointed Leader lookup must require an active Leader without a primary-team equality filter'
  );
  assert.ok(
    !cleanLeaderDb.includes(".eq('team_id', subject.teamId)") &&
      !dbLeaderBranch.includes('return { id: fallbackLeader.id'),
    'resolveEvaluatorFromDb must not infer a fallback Leader from users.team_id'
  );
  assert.ok(!dbLeaderBranch.includes('false &&'), 'resolveEvaluatorFromDb Leader branch must not contain false &&');

  // resolveEvaluatorFromList
  const listResolverRegion = extractFunction(code, 'resolveEvaluatorFromList');
  const listLeaderBranch = extractBetween(listResolverRegion, "if (selector === 'Leader')", "if (selector === 'Manager')");

  assert.ok(
    listLeaderBranch.includes('if (!subject.teamId) return null;'),
    'resolveEvaluatorFromList must check !subject.teamId and return null before leader resolution'
  );

  const cleanListLeader = stripComments(listLeaderBranch);
  assert.ok(cleanListLeader.includes('selectValidLeader('), 'resolveEvaluatorFromList must delegate leader selection to helper');
  assert.ok(
    cleanListLeader.includes('teamLeaderIds?.[subject.teamId]') || cleanListLeader.includes('teamLeaderIds[subject.teamId]'),
    'resolveEvaluatorFromList must use appointed leader ID from teamLeaderIds'
  );
  assert.ok(cleanListLeader.includes('if (!appointedId) return null;'), 'list resolution must not infer a fallback leader');
  assert.ok(!listLeaderBranch.includes('false &&'), 'resolveEvaluatorFromList must not contain false &&');

  // Null fallback behavior
  assert.ok(listResolverRegion.includes('return null;'), 'resolveEvaluatorFromList must return null without an appointment');
}

// 12. src/lib/team-validation.ts
{
  const code = readProjectFile('src/lib/team-validation.ts');
  assert.ok(
    !code.includes('import ') && !code.includes('import('),
    'src/lib/team-validation.ts must have zero external imports'
  );
  assert.ok(
    code.includes('export interface Candidate') || code.includes('export type Candidate'),
    'src/lib/team-validation.ts must export Candidate interface'
  );
  assert.ok(
    code.includes('export function validateLeaderAssignment') || code.includes('export const validateLeaderAssignment'),
    'src/lib/team-validation.ts must export validateLeaderAssignment'
  );
  assert.ok(
    code.includes('export function selectValidLeader') || code.includes('export const selectValidLeader'),
    'src/lib/team-validation.ts must export selectValidLeader'
  );
  assert.ok(
    code.includes('allowUnassigned'),
    'src/lib/team-validation.ts must support allowUnassigned option'
  );
}

// 13. src/components/modals/TeamModal.tsx
{
  const code = readProjectFile('src/components/modals/TeamModal.tsx');
  assert.ok(
    code.includes("users.filter((u) => u.role === 'Leader')") || code.includes('u.role === "Leader"'),
    'TeamModal must filter leader dropdown to only users with role === "Leader"'
  );
  assert.ok(
    !code.includes('!isIndividualRole(u.role)') && !code.includes('!isIndividualRole'),
    'TeamModal must not use isIndividualRole to prevent Manager/SubLeader in leader dropdown'
  );
  assert.ok(
    code.includes('<option value="">-- Chọn trưởng nhóm --</option>'),
    'TeamModal must preserve default unassigned option'
  );
}

console.log('Worker role regression tests: ALL PASS');
