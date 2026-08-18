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
// 1. Verify src/app/dashboard/page.tsx
// -------------------------------------------------------------
{
  const pageCode = readProjectFile('src/app/dashboard/page.tsx');
  const normPage = normalizeWhitespace(stripComments(pageCode));

  // 1.1 Server auth guard and redirects
  assert.ok(
    normPage.includes('getSessionUser()'),
    'DashboardPage must check session user with getSessionUser()'
  );
  assert.ok(
    normPage.includes("redirect('/login')"),
    'DashboardPage must redirect unauthenticated users to login'
  );
  assert.ok(
    normPage.includes("isIndividualRole(viewer?.role)") || normPage.includes("isIndividualRole(viewer.role)"),
    'DashboardPage must check individual role policy'
  );
  assert.ok(
    normPage.includes("redirect(`/evaluations/${viewer?.id}`)") || normPage.includes("redirect(`/evaluations/${viewer.id}`)"),
    'DashboardPage must redirect individual roles to evaluation page'
  );

  // 1.2 Period resolution
  assert.ok(
    normPage.includes('resolveCurrentPeriod('),
    'DashboardPage must resolve current period on server'
  );

  // 1.3 NO page-level blocking awaits for heavy/dashboard data before returning shell
  assert.ok(
    !normPage.includes('getDashboardData('),
    'DashboardPage must NOT await legacy getDashboardData before returning shell'
  );
  assert.ok(
    !normPage.includes('getDashboardHeavyData('),
    'DashboardPage must NOT await heavy getDashboardHeavyData on server before returning shell'
  );
  assert.ok(
    !normPage.includes('getEvaluationsByPeriodAdmin('),
    'DashboardPage must NOT await raw evaluations on server before returning shell'
  );
  assert.ok(
    !normPage.includes('getAllCriteriaGroups('),
    'DashboardPage must NOT await criteria groups on server before returning shell'
  );

  // 1.4 Must render DashboardShell and DashboardDataLayer
  assert.ok(
    normPage.includes('<DashboardShell') || normPage.includes('DashboardShell'),
    'DashboardPage must render DashboardShell'
  );
  assert.ok(
    normPage.includes('<DashboardDataLayer') || normPage.includes('DashboardDataLayer'),
    'DashboardPage must render DashboardDataLayer'
  );
  assert.ok(
    normPage.includes('viewer={viewer}') && normPage.includes('periodId={periodId}'),
    'DashboardPage must pass viewer and periodId down to components'
  );

  // 1.5 DashboardShell must not receive unused viewer or periodId props
  const shellTagMatch = pageCode.match(/<DashboardShell[\s\S]*?>/);
  assert.ok(shellTagMatch, 'DashboardShell JSX element must be present in page.tsx');
  const shellTag = shellTagMatch[0];
  assert.ok(
    !shellTag.includes('viewer=') && !shellTag.includes('periodId='),
    'DashboardShell must not receive unused viewer or periodId props'
  );
}

// -------------------------------------------------------------
// 2. Verify src/components/dashboard/DashboardShell.tsx
// -------------------------------------------------------------
{
  const shellCode = readProjectFile('src/components/dashboard/DashboardShell.tsx');
  const normShell = normalizeWhitespace(stripComments(shellCode));

  assert.ok(
    normShell.includes("'use client'") || normShell.includes('"use client"'),
    'DashboardShell must be a client component'
  );

  assert.ok(
    normShell.includes('data-load-layer="shell"'),
    'DashboardShell must render data-load-layer="shell" on the outer frame element'
  );

  assert.ok(
    normShell.includes('Tổng quan hệ thống'),
    'DashboardShell must render title "Tổng quan hệ thống"'
  );

  assert.ok(
    normShell.includes('{children}'),
    'DashboardShell must render its children'
  );

  // 2.1 Unused props cleanup
  assert.ok(
    !normShell.includes('_viewer') && !normShell.includes('_periodId'),
    'DashboardShell must not contain unused _viewer or _periodId props'
  );
  assert.ok(
    !normShell.includes('viewer:') && !normShell.includes('periodId:'),
    'DashboardShell must not declare viewer or periodId in props interface'
  );
}

// -------------------------------------------------------------
// 3. Verify src/components/dashboard/DashboardDataLayer.tsx
// -------------------------------------------------------------
{
  const layerCode = readProjectFile('src/components/dashboard/DashboardDataLayer.tsx');
  const normLayer = normalizeWhitespace(stripComments(layerCode));

  assert.ok(
    normLayer.includes("'use client'") || normLayer.includes('"use client"'),
    'DashboardDataLayer must be a client component'
  );

  // 3.1 Invokes staged server actions
  assert.ok(
    normLayer.includes('getDashboardLightData('),
    'DashboardDataLayer must call getDashboardLightData'
  );
  assert.ok(
    normLayer.includes('getDashboardHeavyData('),
    'DashboardDataLayer must call getDashboardHeavyData'
  );

  // 3.2 Single orchestration: no duplicated inline DB queries
  assert.ok(
    !normLayer.includes('getEvaluationsByPeriodAdmin') &&
      !normLayer.includes('supabaseAdmin.from('),
    'DashboardDataLayer must not bypass server actions with duplicate raw DB queries'
  );

  // 3.3 Stale-request guards and retry
  assert.ok(
    normLayer.includes('reqIdRef') || normLayer.includes('currentReqId'),
    'DashboardDataLayer must handle stale requests across periodId changes'
  );
  assert.ok(
    normLayer.includes('handleRetryLight') || normLayer.includes('onRetry'),
    'DashboardDataLayer must provide retry capabilities'
  );

  // 3.4 Wires light and heavy sections
  assert.ok(
    normLayer.includes('DashboardLightSection') && normLayer.includes('DashboardHeavySection'),
    'DashboardDataLayer must render DashboardLightSection and DashboardHeavySection'
  );

  // 3.5 Passes userNameById
  assert.ok(
    normLayer.includes('userNameById'),
    'DashboardDataLayer must pass userNameById to heavy sections'
  );
}

// -------------------------------------------------------------
// 4. Verify src/components/dashboard/DashboardLightSection.tsx
// -------------------------------------------------------------
{
  const lightCode = readProjectFile('src/components/dashboard/DashboardLightSection.tsx');
  const normLight = normalizeWhitespace(stripComments(lightCode));

  assert.ok(
    normLight.includes("'use client'") || normLight.includes('"use client"'),
    'DashboardLightSection must be a client component'
  );

  assert.ok(
    normLight.includes('data-load-layer="light"'),
    'DashboardLightSection must render data-load-layer="light"'
  );

  assert.ok(
    normLight.includes('GradeDistribution'),
    'DashboardLightSection must render GradeDistribution'
  );

  assert.ok(
    normLight.includes('Trạng thái theo nhóm'),
    'DashboardLightSection must render Team Status header'
  );

  assert.ok(
    normLight.includes('nhân sự') && normLight.includes('tiến độ') && normLight.includes('đã đánh giá') && normLight.includes('chưa xong'),
    'DashboardLightSection must render KPI labels (nhân sự, tiến độ, đã đánh giá, chưa xong)'
  );
}

// -------------------------------------------------------------
// 5. Verify src/components/dashboard/DashboardHeavySection.tsx
// -------------------------------------------------------------
{
  const heavyCode = readProjectFile('src/components/dashboard/DashboardHeavySection.tsx');
  const normHeavy = normalizeWhitespace(stripComments(heavyCode));

  assert.ok(
    normHeavy.includes("'use client'") || normHeavy.includes('"use client"'),
    'DashboardHeavySection must be a client component'
  );

  assert.ok(
    normHeavy.includes('data-load-layer="heavy"'),
    'DashboardHeavySection must render data-load-layer="heavy"'
  );

  assert.ok(
    normHeavy.includes('PendingReviews') &&
      normHeavy.includes('AnomalyAlertCard') &&
      normHeavy.includes('LazySkillGapRadar'),
    'DashboardHeavySection must render PendingReviews, AnomalyAlertCard, and LazySkillGapRadar'
  );

  assert.ok(
    normHeavy.includes('Hoạt động gần đây'),
    'DashboardHeavySection must render Recent Activities section'
  );
}

// -------------------------------------------------------------
// 6. Verify src/actions/dashboard.ts
// -------------------------------------------------------------
{
  const actionsCode = readProjectFile('src/actions/dashboard.ts');
  const normActions = normalizeWhitespace(stripComments(actionsCode));

  // 6.1 Server action directive
  assert.ok(
    normActions.includes("'use server'") || normActions.includes('"use server"'),
    'dashboard.ts must have use server directive'
  );

  // 6.2 Exports getDashboardLightData, getDashboardHeavyData, and getDashboardData
  assert.ok(
    normActions.includes('export async function getDashboardLightData'),
    'dashboard.ts must export getDashboardLightData'
  );
  assert.ok(
    normActions.includes('export async function getDashboardHeavyData'),
    'dashboard.ts must export getDashboardHeavyData'
  );
  assert.ok(
    normActions.includes('export async function getDashboardData'),
    'dashboard.ts must export getDashboardData for compatibility'
  );

  // 6.3 Role guard preservation
  assert.ok(
    normActions.includes("requireRole(['Manager', 'Leader', 'SubLeader'])") ||
      normActions.includes("requireRole([ 'Manager', 'Leader', 'SubLeader' ])"),
    'dashboard actions must require Manager, Leader, SubLeader roles'
  );

  // 6.4 Light action must use summary projection and NOT load criteria groups
  assert.ok(
    normActions.includes('getEvaluationSummariesByPeriodAdmin'),
    'getDashboardLightData must use light summary projection getEvaluationSummariesByPeriodAdmin'
  );

  // 6.5 Math invariants: S, A, AB, B, C, D grades, colors, percent calculation
  assert.ok(
    normActions.includes('S:') &&
      normActions.includes('A:') &&
      normActions.includes('AB:') &&
      normActions.includes('B:') &&
      normActions.includes('C:') &&
      normActions.includes('D:'),
    'Grade distribution counts must include S, A, AB, B, C, D'
  );
  assert.ok(
    normActions.includes('bg-indigo-500') &&
      normActions.includes('bg-emerald-500') &&
      normActions.includes('bg-teal-500') &&
      normActions.includes('bg-blue-500') &&
      normActions.includes('bg-amber-500') &&
      normActions.includes('bg-rose-500'),
    'Grade colors must match existing design palette'
  );
  assert.ok(
    normActions.includes('Math.round((completed / totalCount) * 100)'),
    'Progress percent formula must be preserved exactly'
  );

  // 6.6 Heavy action must NOT perform duplicate getUsersAdmin call
  const heavyFunctionMatch = actionsCode.match(/export async function getDashboardHeavyData[\s\S]*?(?=export async function|$)/);
  assert.ok(heavyFunctionMatch, 'getDashboardHeavyData function must be found in dashboard.ts');
  const heavyBody = stripComments(heavyFunctionMatch[0]);
  assert.ok(
    !heavyBody.includes('getUsersAdmin('),
    'getDashboardHeavyData must NOT call getUsersAdmin to avoid duplicate users load'
  );
}

// -------------------------------------------------------------
// 7. Verify Component DOM Load Layer Markers
// -------------------------------------------------------------
{
  const pendingCode = readProjectFile('src/components/dashboard/PendingReviews.tsx');
  assert.ok(
    pendingCode.includes('data-load-layer="heavy"'),
    'PendingReviews must render data-load-layer="heavy"'
  );

  const anomalyCode = readProjectFile('src/components/dashboard/AnomalyAlertCard.tsx');
  assert.ok(
    anomalyCode.includes('data-load-layer="heavy"'),
    'AnomalyAlertCard must render data-load-layer="heavy"'
  );

  const radarCode = readProjectFile('src/components/charts/LazySkillGapRadar.tsx');
  assert.ok(
    radarCode.includes('data-load-layer="heavy"'),
    'LazySkillGapRadar must render data-load-layer="heavy"'
  );

  const gradeCode = readProjectFile('src/components/charts/GradeDistribution.tsx');
  assert.ok(
    gradeCode.includes('data-load-layer="light"'),
    'GradeDistribution must render data-load-layer="light"'
  );
}

console.log('Dashboard staged loading regression tests: ALL PASS');
