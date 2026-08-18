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

// 2. src/app/evaluations/[id]/page.tsx
{
  const code = readProjectFile('src/app/evaluations/[id]/page.tsx');
  assert.ok(
    !code.includes("evaluatorRole: usesLeaderGrading ? 'Leader' : 'Employee'"),
    'src/app/evaluations/[id]/page.tsx must not collapse Worker to Employee in currentSummaryRound'
  );
  assert.ok(
    code.includes('evaluatorRole: employee.role'),
    'src/app/evaluations/[id]/page.tsx must pass employee.role into currentSummaryRound.evaluatorRole'
  );
}

// 3. src/app/evaluations/[id]/compare/page.tsx
{
  const code = readProjectFile('src/app/evaluations/[id]/compare/page.tsx');
  assert.ok(
    !code.includes("const role = isLeaderGradingRole(employee.role) ? 'Leader' : 'Employee'"),
    'src/app/evaluations/[id]/compare/page.tsx must not collapse Worker to Employee for criteria filtering'
  );
  assert.ok(
    !code.includes("const evaluatorRole = isLeaderGradingRole(employee.role) ? 'Leader' : 'Employee'"),
    'src/app/evaluations/[id]/compare/page.tsx must not collapse Worker to Employee for round scoring'
  );
  assert.ok(
    code.includes('const role = employee.role;'),
    'src/app/evaluations/[id]/compare/page.tsx must filter criteria using employee.role'
  );
  assert.ok(
    code.includes('const evaluatorRole = employee.role;'),
    'src/app/evaluations/[id]/compare/page.tsx must calculate round score using employee.role'
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
}

// 11. src/lib/evaluator-resolver.ts
{
  const code = readProjectFile('src/lib/evaluator-resolver.ts');

  // resolveEvaluatorFromDb
  const dbResolverRegion = extractFunction(code, 'resolveEvaluatorFromDb');
  const dbLeaderBranch = extractBetween(dbResolverRegion, "if (selector === 'Leader'", "if (selector === 'Manager')");

  const dbFallbackSplit = dbLeaderBranch.split(/\/\/\s*2\.\s*Fallback/);
  assert.strictEqual(
    dbFallbackSplit.length,
    2,
    'resolveEvaluatorFromDb Leader branch must split cleanly into appointed block and fallback block at fallback comment'
  );
  const [appointedDbBlock, fallbackDbBlock] = dbFallbackSplit;

  // Appointed leader query block in resolveEvaluatorFromDb
  const cleanAppointedDb = stripComments(appointedDbBlock);
  assert.ok(
    cleanAppointedDb.includes(".from('teams')") &&
      cleanAppointedDb.includes(".select('leader_id')") &&
      cleanAppointedDb.includes(".eq('id', subject.teamId)"),
    'resolveEvaluatorFromDb appointed block must query teams for subject.teamId in executable code'
  );
  assert.ok(
    cleanAppointedDb.includes(".from('users')") &&
      cleanAppointedDb.includes(".eq('id', team.leader_id)") &&
      cleanAppointedDb.includes(".eq('team_id', subject.teamId)") &&
      (cleanAppointedDb.includes(".eq('role', 'Leader')") || cleanAppointedDb.includes('.eq("role", "Leader")')) &&
      cleanAppointedDb.includes(".eq('is_active', true)"),
    'resolveEvaluatorFromDb appointed block must query users with team.leader_id, team_id equal subject.teamId, role Leader, and is_active true in executable code'
  );

  const teamIdAppointedIdx = appointedDbBlock.indexOf(".eq('team_id', subject.teamId)");
  const returnAppointedIdx = appointedDbBlock.indexOf('return { id: teamLeader.id');
  assert.ok(
    teamIdAppointedIdx !== -1 && returnAppointedIdx !== -1 && teamIdAppointedIdx < returnAppointedIdx,
    'resolveEvaluatorFromDb appointed block must filter .eq("team_id", subject.teamId) inside the appointed block before returning teamLeader'
  );
  assert.ok(
    !appointedDbBlock.includes('false &&'),
    'resolveEvaluatorFromDb appointed block must not contain false &&'
  );

  // Fallback query block in resolveEvaluatorFromDb
  const cleanFallbackDb = stripComments(fallbackDbBlock);
  assert.ok(
    cleanFallbackDb.includes(".from('users')") &&
      cleanFallbackDb.includes(".eq('team_id', subject.teamId)") &&
      (cleanFallbackDb.includes(".eq('role', 'Leader')") || cleanFallbackDb.includes('.eq("role", "Leader")')) &&
      cleanFallbackDb.includes(".eq('is_active', true)"),
    'resolveEvaluatorFromDb fallback block must independently query users with team_id equal subject.teamId, role Leader, and is_active true in executable code'
  );

  const teamIdFallbackIdx = fallbackDbBlock.indexOf(".eq('team_id', subject.teamId)");
  const returnFallbackIdx = fallbackDbBlock.indexOf('return { id: fallbackLeader.id');
  assert.ok(
    teamIdFallbackIdx !== -1 && returnFallbackIdx !== -1 && teamIdFallbackIdx < returnFallbackIdx,
    'resolveEvaluatorFromDb fallback block must filter .eq("team_id", subject.teamId) inside fallback block before returning fallbackLeader'
  );
  assert.ok(
    !fallbackDbBlock.includes('false &&'),
    'resolveEvaluatorFromDb fallback block must not contain false &&'
  );

  // resolveEvaluatorFromList
  const listResolverRegion = extractFunction(code, 'resolveEvaluatorFromList');
  const listLeaderBranch = extractBetween(listResolverRegion, "if (selector === 'Leader')", "if (selector === 'Manager')");

  assert.ok(
    listLeaderBranch.includes('if (!subject.teamId) return null;'),
    'resolveEvaluatorFromList must check !subject.teamId and return null before leader resolution'
  );

  const cleanListLeader = stripComments(listLeaderBranch);
  assert.ok(
    cleanListLeader.includes('selectValidLeader('),
    'resolveEvaluatorFromList must delegate leader selection to selectValidLeader helper'
  );
  assert.ok(
    cleanListLeader.includes('teamLeaderIds?.[subject.teamId]') || cleanListLeader.includes('teamLeaderIds[subject.teamId]'),
    'resolveEvaluatorFromList must pass appointed leader ID from teamLeaderIds'
  );
  assert.ok(
    !listLeaderBranch.includes('false &&'),
    'resolveEvaluatorFromList must not contain false &&'
  );

  // Null fallback behavior
  assert.ok(
    listResolverRegion.includes('return null;'),
    'resolveEvaluatorFromList must have null fallback return when selector has no match'
  );
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
}

console.log('Worker role regression tests: ALL PASS');
