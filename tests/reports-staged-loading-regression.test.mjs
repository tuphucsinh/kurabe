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
// 1. Verify src/app/reports/page.tsx
// -------------------------------------------------------------
{
  const pageCode = readProjectFile('src/app/reports/page.tsx');
  const normPage = normalizeWhitespace(stripComments(pageCode));

  // 1.1 Server auth guard and redirects
  assert.ok(
    normPage.includes('getSessionUser()'),
    'ReportsPage must check session user with getSessionUser()'
  );
  assert.ok(
    normPage.includes("viewer.role !== 'Manager' && viewer.role !== 'Leader'"),
    'ReportsPage must restrict access to Manager and Leader'
  );
  assert.ok(
    normPage.includes("redirect(`/evaluations/${viewer?.id}`)") || normPage.includes("redirect(`/evaluations/${viewer.id}`)"),
    'ReportsPage must redirect individual roles to evaluation page'
  );
  assert.ok(
    normPage.includes("redirect('/dashboard')"),
    'ReportsPage must redirect unauthorized users to dashboard'
  );

  // 1.2 Period resolution
  assert.ok(
    normPage.includes('resolveCurrentPeriod('),
    'ReportsPage must resolve current period on server'
  );

  // 1.3 NO page-level blocking Promise.all with AI summary or heavy report aggregation
  assert.ok(
    !normPage.includes('Promise.all([') || !normPage.includes('getPeriodSummary'),
    'ReportsPage must NOT await getPeriodSummary in a page-level Promise.all before returning shell'
  );
  assert.ok(
    !normPage.includes('getReportAggregation('),
    'ReportsPage must NOT await heavy getReportAggregation on server before returning shell'
  );

  // 1.4 Must render ReportsShell
  assert.ok(
    normPage.includes('<ReportsShell') || normPage.includes('ReportsShell'),
    'ReportsPage must render ReportsShell'
  );
  assert.ok(
    normPage.includes('viewer={viewer}') && normPage.includes('periodId={periodId}'),
    'ReportsPage must pass viewer and periodId to ReportsShell'
  );
}

// -------------------------------------------------------------
// 2. Verify src/components/reports/ReportsShell.tsx
// -------------------------------------------------------------
{
  const shellCode = readProjectFile('src/components/reports/ReportsShell.tsx');
  const normShell = normalizeWhitespace(stripComments(shellCode));

  assert.ok(
    normShell.includes("'use client'") || normShell.includes('"use client"'),
    'ReportsShell must be a client component'
  );

  assert.ok(
    normShell.includes('data-load-layer="shell"'),
    'ReportsShell must render data-load-layer="shell" on the outer frame element'
  );

  assert.ok(
    normShell.includes('<ReportsDataLayer') || normShell.includes('ReportsDataLayer'),
    'ReportsShell must render ReportsDataLayer'
  );
}

// -------------------------------------------------------------
// 3. Verify src/components/reports/ReportsDataLayer.tsx
// -------------------------------------------------------------
{
  const layerCode = readProjectFile('src/components/reports/ReportsDataLayer.tsx');
  const normLayer = normalizeWhitespace(stripComments(layerCode));

  assert.ok(
    normLayer.includes("'use client'") || normLayer.includes('"use client"'),
    'ReportsDataLayer must be a client component'
  );

  // 3.1 Single bounded data source & deduplicated single aggregation call site
  assert.ok(
    normLayer.includes('getReportAggregation('),
    'ReportsDataLayer must call getReportAggregation as single data source'
  );

  const cleanLayerCode = stripComments(layerCode);
  const aggregationCalls = (cleanLayerCode.match(/\bgetReportAggregation\s*\(/g) || []).length;
  assert.strictEqual(
    aggregationCalls,
    1,
    'ReportsDataLayer must have exactly 1 getReportAggregation call site (no duplicated inline fetch in useEffect)'
  );

  // Single effect driver invoking shared fetchReportData
  assert.ok(
    normLayer.includes('fetchReportData()'),
    'ReportsDataLayer useEffect must invoke the shared fetchReportData loader'
  );

  // 3.2 Must NOT duplicate raw queries directly
  assert.ok(
    !normLayer.includes('getEvaluationsByPeriodAdmin') &&
      !normLayer.includes('supabaseAdmin.from('),
    'ReportsDataLayer must not bypass the single report aggregation source with duplicate raw DB queries'
  );

  // 3.3 Light data layer markers
  assert.ok(
    normLayer.includes('data-load-layer="light"'),
    'ReportsDataLayer must render data-load-layer="light" on KPI pill and/or filter region'
  );

  // 3.4 Heavy data layer markers
  assert.ok(
    normLayer.includes('data-load-layer="heavy"'),
    'ReportsDataLayer must render data-load-layer="heavy" on heavy sections and skeletons'
  );

  // 3.5 Heavy components included
  assert.ok(
    normLayer.includes('GradeDistribution') &&
      normLayer.includes('TeamComparison') &&
      normLayer.includes('CriteriaHeatmap') &&
      normLayer.includes('TopPerformers') &&
      normLayer.includes('AiSummaryCard'),
    'ReportsDataLayer must wire GradeDistribution, TeamComparison, CriteriaHeatmap, TopPerformers, and AiSummaryCard'
  );

  // 3.6 Actions and modals preserved
  assert.ok(
    normLayer.includes('ExportReportButton') &&
      normLayer.includes('PeriodMinutesModal') &&
      normLayer.includes('BatchResultMessageModal'),
    'ReportsDataLayer must preserve ExportReportButton, PeriodMinutesModal, and BatchResultMessageModal'
  );

  // 3.7 Loading / Error / Empty separation
  assert.ok(
    normLayer.includes('isLoading ?') && normLayer.includes('isError ?'),
    'ReportsDataLayer must distinguish loading, error, and empty data states'
  );
}

// -------------------------------------------------------------
// 4. Verify src/components/reports/ReportFilters.tsx
// -------------------------------------------------------------
{
  const filtersCode = readProjectFile('src/components/reports/ReportFilters.tsx');
  const normFilters = normalizeWhitespace(stripComments(filtersCode));

  assert.ok(
    normFilters.includes("'use client'") || normFilters.includes('"use client"'),
    'ReportFilters must be a client component'
  );

  assert.ok(
    normFilters.includes('data-load-layer="light"'),
    'ReportFilters must render data-load-layer="light"'
  );

  assert.ok(
    normFilters.includes('router.push('),
    'ReportFilters must use router.push to maintain URL search parameters'
  );

  assert.ok(
    normFilters.includes('<option value="all">Tất cả nhóm</option>'),
    'ReportFilters must include default all-teams option'
  );
}

// -------------------------------------------------------------
// 5. Verify src/components/reports/AiSummaryCard.tsx
// -------------------------------------------------------------
{
  const aiCode = readProjectFile('src/components/reports/AiSummaryCard.tsx');
  const normAi = normalizeWhitespace(stripComments(aiCode));

  assert.ok(
    normAi.includes("'use client'") || normAi.includes('"use client"'),
    'AiSummaryCard must be a client component'
  );

  assert.ok(
    normAi.includes('data-load-layer="heavy"'),
    'AiSummaryCard must render data-load-layer="heavy"'
  );

  assert.ok(
    normAi.includes('getPeriodSummary('),
    'AiSummaryCard must fetch AI summary independently without blocking page shell'
  );

  assert.ok(
    normAi.includes('generatePeriodSummary('),
    'AiSummaryCard must allow generating AI summary'
  );

  assert.ok(
    normAi.includes("user?.role !== 'Manager'"),
    'AiSummaryCard must retain Manager-only role guard'
  );
}

// -------------------------------------------------------------
// 6. Verify TeamComparison, CriteriaHeatmap, TopPerformers heavy markers
// -------------------------------------------------------------
{
  const tcCode = readProjectFile('src/components/reports/TeamComparison.tsx');
  assert.ok(
    tcCode.includes('data-load-layer="heavy"'),
    'TeamComparison must render data-load-layer="heavy"'
  );

  const chCode = readProjectFile('src/components/reports/CriteriaHeatmap.tsx');
  assert.ok(
    chCode.includes('data-load-layer="heavy"'),
    'CriteriaHeatmap must render data-load-layer="heavy"'
  );

  const tpCode = readProjectFile('src/components/reports/TopPerformers.tsx');
  assert.ok(
    tpCode.includes('data-load-layer="heavy"'),
    'TopPerformers must render data-load-layer="heavy"'
  );
}

console.log('Reports staged loading regression tests: ALL PASS');
