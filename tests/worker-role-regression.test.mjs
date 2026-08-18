import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

function readProjectFile(relPath) {
  const fullPath = path.join(projectRoot, relPath);
  assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
  return fs.readFileSync(fullPath, 'utf8');
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

console.log('Worker role regression tests: ALL PASS');
