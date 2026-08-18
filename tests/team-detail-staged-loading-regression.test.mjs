import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

function readProjectFile(relPath) {
  const fullPath = path.join(projectRoot, relPath);
  assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalizeWhitespace(code) {
  return code.replace(/\s+/g, ' ').trim();
}

// -------------------------------------------------------------
// 1. Verify src/components/teams/TeamDetailShell.tsx
// -------------------------------------------------------------
{
  const shellCode = readProjectFile('src/components/teams/TeamDetailShell.tsx');
  const normShell = normalizeWhitespace(stripComments(shellCode));

  assert.ok(
    normShell.includes("'use client'") || normShell.includes('"use client"'),
    'TeamDetailShell must be a client component'
  );

  assert.ok(
    normShell.includes('data-load-layer="shell"'),
    'TeamDetailShell must render data-load-layer="shell" on the outer frame element'
  );

  assert.ok(
    normShell.includes('{children}'),
    'TeamDetailShell must render its children'
  );
}

// -------------------------------------------------------------
// 2. Verify src/components/teams/TeamDetailMemberCell.tsx
// -------------------------------------------------------------
{
  const cellCode = readProjectFile('src/components/teams/TeamDetailMemberCell.tsx');
  const normCell = normalizeWhitespace(stripComments(cellCode));

  assert.ok(
    normCell.includes("'use client'") || normCell.includes('"use client"'),
    'TeamDetailMemberCell must be a client component'
  );

  assert.ok(
    normCell.includes('data-load-layer="heavy"'),
    'TeamDetailMemberCell must render data-load-layer="heavy"'
  );

  assert.ok(
    normCell.includes('GradeBadge'),
    'TeamDetailMemberCell must use GradeBadge'
  );

  assert.ok(
    normCell.includes('Skeleton'),
    'TeamDetailMemberCell must render Skeleton during loading'
  );

  assert.ok(
    normCell.includes('isError'),
    'TeamDetailMemberCell must handle isError state'
  );

  assert.ok(
    normCell.includes('getStatusBadge'),
    'TeamDetailMemberCell must provide getStatusBadge helper'
  );

  assert.ok(
    normCell.includes('Đã có KQĐG') &&
      normCell.includes('Chưa bắt đầu') &&
      normCell.includes('Đã nộp'),
    'TeamDetailMemberCell must contain status labels'
  );
}

// -------------------------------------------------------------
// 3. Verify src/app/teams/[id]/page.tsx
// -------------------------------------------------------------
{
  const pageCode = readProjectFile('src/app/teams/[id]/page.tsx');
  const normPage = normalizeWhitespace(stripComments(pageCode));

  // 3.1 Client component directive
  assert.ok(
    normPage.includes("'use client'") || normPage.includes('"use client"'),
    'TeamDetailPage must be a client component'
  );

  // 3.2 Individual role redirect guard
  assert.ok(
    normPage.includes('isIndividualRole(user?.role)') || normPage.includes('isIndividualRole(user.role)'),
    'TeamDetailPage must check individual role policy'
  );
  assert.ok(
    normPage.includes('router.replace(`/evaluations/${user?.id}`)') || normPage.includes('router.replace(`/evaluations/${user.id}`)'),
    'TeamDetailPage must redirect individual roles to evaluation page'
  );

  // 3.3 NO global whole-page blocking gate on evalsLoading
  assert.ok(
    !normPage.includes('isLoading = usersLoading || teamsLoading || evalsLoading'),
    'TeamDetailPage must NOT have a global blocking gate combining usersLoading, teamsLoading, and evalsLoading'
  );
  assert.ok(
    !normPage.includes('if (isLoading)') && !normPage.includes('if (evalsLoading)'),
    'TeamDetailPage must NOT early-return full-page skeleton on evalsLoading'
  );

  // 3.4 Shell and layered architecture
  assert.ok(
    normPage.includes('<TeamDetailShell') || normPage.includes('TeamDetailShell'),
    'TeamDetailPage must use TeamDetailShell'
  );
  assert.ok(
    normPage.includes('data-load-layer="light"'),
    'TeamDetailPage must render data-load-layer="light" on team structure/identity'
  );
  assert.ok(
    normPage.includes('data-load-layer="heavy"'),
    'TeamDetailPage must render data-load-layer="heavy" on evaluation progress and status'
  );

  // 3.5 Back navigation
  assert.ok(
    normPage.includes('href="/teams"') && normPage.includes('Quay lại danh sách nhóm'),
    'TeamDetailPage must render back navigation link to /teams'
  );

  // 3.6 Single evaluation source
  assert.ok(
    normPage.includes('useEvaluations(currentPeriod?.id, user)'),
    'TeamDetailPage must use useEvaluations as single evaluation data source'
  );
  assert.ok(
    !normPage.includes('supabaseAdmin.from('),
    'TeamDetailPage must not execute direct supabaseAdmin queries'
  );

  // 3.7 Light data (team & members) renders independently from evaluations
  assert.ok(
    normPage.includes('subLeaderBlocks') &&
      normPage.includes('sortedSubLeaders') &&
      normPage.includes('directMemberRows'),
    'TeamDetailPage must group subleader and member rows from light data'
  );

  // 3.8 KPI counts
  assert.ok(
    normPage.includes('thành viên') &&
      normPage.includes('đã đánh giá') &&
      normPage.includes('còn lại'),
    'TeamDetailPage must preserve KPI labels: thành viên, đã đánh giá, còn lại'
  );

  // 3.9 RBAC & Add Employee Modal
  assert.ok(
    normPage.includes('isManager') &&
      normPage.includes('isLeaderOwnTeam') &&
      normPage.includes('canAddEmployee'),
    'TeamDetailPage must retain RBAC checks for Manager and own-team Leader'
  );
  assert.ok(
    normPage.includes('EmployeeModal') &&
      normPage.includes('restrictToTeamId={teamId}'),
    'TeamDetailPage must preserve EmployeeModal restricted to teamId'
  );

  // 3.10 Missing/invalid team handling (fail-closed)
  assert.ok(
    normPage.includes('Nhóm không tồn tại'),
    'TeamDetailPage must render empty state when team is not found'
  );
}

console.log('Team detail staged loading regression tests: ALL PASS');
