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
// 1. Verify src/app/teams/page.tsx
// -------------------------------------------------------------
{
  const pageCode = readProjectFile('src/app/teams/page.tsx');
  const normPage = normalizeWhitespace(stripComments(pageCode));

  // 1.1 Server auth guard and redirects
  assert.ok(
    normPage.includes('getSessionUser()'),
    'TeamsPage must check session user with getSessionUser()'
  );
  assert.ok(
    normPage.includes("redirect('/login')"),
    'TeamsPage must redirect unauthenticated users to /login'
  );
  assert.ok(
    normPage.includes("viewer.role !== 'Manager'") || normPage.includes("viewer?.role !== 'Manager'"),
    'TeamsPage must route every non-Manager role away from the group list'
  );
  assert.ok(
    normPage.includes("redirect(`/evaluations/${viewer.id}`)") || normPage.includes("redirect(`/evaluations/${viewer?.id}`)"),
    'TeamsPage must keep a safe fallback for individual roles without a team'
  );
  assert.ok(
    normPage.includes("redirect(`/teams/${viewer.teamId}`)") || normPage.includes("redirect(`/teams/${viewer?.teamId}`)"),
    'TeamsPage must redirect non-Manager users with a team to their own team'
  );
  assert.ok(
    normPage.includes("redirect('/dashboard')"),
    'TeamsPage must keep a safe fallback for management roles without a team'
  );

  // 1.2 No blocking data fetches before returning shell
  assert.ok(
    !normPage.includes('getEvaluations') &&
      !normPage.includes('getTeams') &&
      !normPage.includes('getUsers'),
    'TeamsPage must NOT await evaluations/teams/users on server before returning shell'
  );

  // 1.3 Must render TeamsClient
  assert.ok(
    normPage.includes('<TeamsClient />') || normPage.includes('TeamsClient'),
    'TeamsPage must render TeamsClient'
  );
}

// -------------------------------------------------------------
// 2. Verify src/components/teams/TeamsShell.tsx
// -------------------------------------------------------------
{
  const shellCode = readProjectFile('src/components/teams/TeamsShell.tsx');
  const normShell = normalizeWhitespace(stripComments(shellCode));

  assert.ok(
    normShell.includes("'use client'") || normShell.includes('"use client"'),
    'TeamsShell must be a client component'
  );

  assert.ok(
    normShell.includes('data-load-layer="shell"'),
    'TeamsShell must render data-load-layer="shell" on the outer frame element'
  );

  assert.ok(
    normShell.includes('{children}'),
    'TeamsShell must render its children'
  );
}

// -------------------------------------------------------------
// 3. Verify src/components/teams/TeamEvaluationCell.tsx
// -------------------------------------------------------------
{
  const cellCode = readProjectFile('src/components/teams/TeamEvaluationCell.tsx');
  const normCell = normalizeWhitespace(stripComments(cellCode));

  assert.ok(
    normCell.includes("'use client'") || normCell.includes('"use client"'),
    'TeamEvaluationCell must be a client component'
  );

  assert.ok(
    normCell.includes('data-load-layer="heavy"'),
    'TeamEvaluationCell must render data-load-layer="heavy"'
  );

  assert.ok(
    normCell.includes('Nhân sự') &&
      normCell.includes('Xong') &&
      normCell.includes('Chờ') &&
      normCell.includes('Tiến độ'),
    'TeamEvaluationCell must render labels for Nhân sự, Xong, Chờ, Tiến độ'
  );

  assert.ok(
    normCell.includes('Skeleton'),
    'TeamEvaluationCell must render Skeleton during loading'
  );

  assert.ok(
    normCell.includes('isError'),
    'TeamEvaluationCell must handle isError state'
  );

  assert.ok(
    normCell.includes('membersCount') &&
      normCell.includes('completedCount') &&
      normCell.includes('progress'),
    'TeamEvaluationCell must accept and display membersCount, completedCount, and progress'
  );
}

// -------------------------------------------------------------
// 4. Verify src/components/teams/TeamsClient.tsx
// -------------------------------------------------------------
{
  const clientCode = readProjectFile('src/components/teams/TeamsClient.tsx');
  const normClient = normalizeWhitespace(stripComments(clientCode));

  assert.ok(
    normClient.includes("'use client'") || normClient.includes('"use client"'),
    'TeamsClient must be a client component'
  );

  // 4.1 NO global whole-page blocking gate
  assert.ok(
    !normClient.includes('isLoading = usersLoading || teamsLoading || evalsLoading'),
    'TeamsClient must NOT have a global blocking gate on evalsLoading'
  );

  // 4.2 Shell elements and title
  assert.ok(
    normClient.includes('Quản lý Nhóm QAQC'),
    'TeamsClient must render title "Quản lý Nhóm QAQC"'
  );
  assert.ok(
    normClient.includes('Theo dõi tiến độ đánh giá theo từng đơn vị'),
    'TeamsClient must render subtitle'
  );
  assert.ok(
    normClient.includes('<TeamsShell') || normClient.includes('data-load-layer="shell"'),
    'TeamsClient must use TeamsShell or data-load-layer="shell"'
  );

  // 4.3 Staged loading markers
  assert.ok(
    normClient.includes('data-load-layer="light"'),
    'TeamsClient must render data-load-layer="light" on light data sections'
  );
  assert.ok(
    normClient.includes('data-load-layer="heavy"'),
    'TeamsClient must render data-load-layer="heavy" on heavy KPI/evaluation sections'
  );

  // 4.4 Single data source — aggregated hook (P88); action lives inside useTeamsPageData
  assert.ok(
    normClient.includes('useTeamsPageData'),
    'TeamsClient must use useTeamsPageData (aggregate) as single evaluation/data source'
  );
  assert.ok(
    !normClient.includes('supabaseAdmin.from('),
    'TeamsClient must not execute direct supabaseAdmin queries'
  );

  // 4.5 Team card metadata (light data) renders independently
  assert.ok(
    normClient.includes('team.leaderName') || normClient.includes('leader?.name'),
    'TeamsClient must render team leader name'
  );
  assert.ok(
    normClient.includes('team.membersCount') || normClient.includes('members.length'),
    'TeamsClient must render team members count'
  );
  assert.ok(
    normClient.includes('href={`/teams/${team.id}`}') || normClient.includes('href={`/teams/${team.id}`'),
    'TeamsClient must render navigation link to /teams/[id]'
  );

  // 4.6 KPI semantics
  assert.ok(
    normClient.includes('tổng nhóm') &&
      normClient.includes('đã đánh giá') &&
      normClient.includes('tiến độ'),
    'TeamsClient must preserve KPI labels: tổng nhóm, đã đánh giá, tiến độ'
  );

  // 4.7 Manager actions and RBAC
  assert.ok(
    normClient.includes('isManager') || normClient.includes("user?.role === 'Manager'"),
    'TeamsClient must retain Manager role check'
  );
  assert.ok(
    normClient.includes('handleAddTeam') && normClient.includes('Thêm nhóm mới'),
    'TeamsClient must retain Add Team action for Manager'
  );
  assert.ok(
    normClient.includes('handleEditTeam') && normClient.includes('handleDeleteTeam'),
    'TeamsClient must retain Edit and Delete Team actions for Manager'
  );
  assert.ok(
    normClient.includes('e.preventDefault()') && normClient.includes('e.stopPropagation()'),
    'TeamsClient must stop propagation on edit/delete buttons inside card links'
  );

  // 4.8 Distinct loading, empty, and error states
  assert.ok(
    normClient.includes('isLightLoading') &&
      normClient.includes('isLightError') &&
      normClient.includes('EmptyState'),
    'TeamsClient must distinguish light loading, light error, and empty states'
  );
  assert.ok(
    normClient.includes('isAuthLoading') &&
      normClient.includes('isAuthLoading || isLoading'),
    'TeamsClient must keep the light layer loading while AuthContext is still loading'
  );
  assert.ok(
    !normClient.includes("(!user && user === undefined) || isLoading"),
    'TeamsClient must not treat only undefined user as auth loading'
  );
  assert.strictEqual(
    (clientCode.match(/<TeamCardSkeleton \/>/g) || []).length,
    9,
    'TeamsClient must render nine manager card skeletons'
  );
  assert.ok(
    normClient.includes('Chưa có nhóm nào'),
    'TeamsClient must render empty state message when no teams exist'
  );
}

// -------------------------------------------------------------
// 5. Verify authorization-aware Teams query cache identity
// -------------------------------------------------------------
{
  const hookCode = readProjectFile('src/hooks/use-db.ts');
  const normHook = normalizeWhitespace(stripComments(hookCode));
  const keyStart = normHook.indexOf("queryKey: ['teams-page-data'");
  const keyEnd = normHook.indexOf('],', keyStart);
  assert.ok(keyStart >= 0 && keyEnd > keyStart, 'useTeamsPageData query key must be present');
  const teamsPageKey = normHook.slice(keyStart, keyEnd);
  assert.ok(teamsPageKey.includes('periodId'), 'Teams page query key must include periodId');
  assert.ok(teamsPageKey.includes('requester?.id'), 'Teams page query key must include requester identity');
  assert.ok(teamsPageKey.includes('requester?.role'), 'Teams page query key must include requester role');
  assert.ok(teamsPageKey.includes('requester?.teamId'), 'Teams page query key must include requester team scope');
}

// -------------------------------------------------------------
// 6. Verify route and client loading skeletons stay consistent
// -------------------------------------------------------------
{
  const loadingCode = readProjectFile('src/app/teams/loading.tsx');
  const normLoading = normalizeWhitespace(stripComments(loadingCode));
  assert.ok(
    normLoading.includes("import TeamCardSkeleton from '@/components/teams/TeamCardSkeleton'") ||
      normLoading.includes('import TeamCardSkeleton from "@/components/teams/TeamCardSkeleton"'),
    'Teams route loading must use the same TeamCardSkeleton as the client'
  );
  assert.strictEqual(
    (loadingCode.match(/<TeamCardSkeleton \/>/g) || []).length,
    9,
    'Teams route loading must render nine manager card skeletons'
  );
  assert.strictEqual(
    (loadingCode.match(/<CardSkeleton \/>/g) || []).length,
    0,
    'Teams route loading must not render the old generic CardSkeleton set'
  );
}

// -------------------------------------------------------------
// 7. Verify non-Manager team entry points stay on own team
// -------------------------------------------------------------
{
  const detailCode = readProjectFile('src/app/teams/[id]/page.tsx');
  const normDetail = normalizeWhitespace(stripComments(detailCode));
  assert.ok(
    !normDetail.includes('isIndividualRole(user?.role)'),
    'Team detail must not redirect Employee/Worker away from their own team'
  );
  assert.ok(
    normDetail.includes("user?.role === 'Manager'"),
    'Team detail must show the back-to-list link only to Manager'
  );

  const sidebarCode = readProjectFile('src/components/layout/Sidebar.tsx');
  const normSidebar = normalizeWhitespace(stripComments(sidebarCode));
  assert.ok(
    normSidebar.includes('`/teams/${user.teamId}`'),
    'Sidebar must provide a direct own-team link for scoped users'
  );
  assert.ok(
    normSidebar.includes('isIndividualRole(user?.role)') &&
      normSidebar.includes('UsersRound'),
    'Individual-role Sidebar must include the own-team entry point'
  );

  const layoutCode = readProjectFile('src/components/layout/AppLayout.tsx');
  const normLayout = normalizeWhitespace(stripComments(layoutCode));
  assert.ok(
    normLayout.includes('ownTeamHref') && normLayout.includes('`/teams/${user.teamId}`'),
    'Mobile navigation must link scoped users directly to their own team'
  );
}

console.log('Teams staged loading regression tests: ALL PASS');
