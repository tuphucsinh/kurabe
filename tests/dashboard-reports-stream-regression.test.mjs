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

function extractFunction(code, functionName) {
  const cleanCode = stripComments(code);
  const regex = new RegExp(`(?:export\\s+(?:async\\s+)?)?function\\s+${functionName}\\s*\\([^)]*\\)[^{]*\\{`);
  const match = cleanCode.match(regex);
  assert.ok(match, `Function declaration not found: ${functionName}`);

  const startIndex = match.index;
  const bodyStartIndex = startIndex + match[0].length - 1;

  let depth = 0;
  let endIndex = bodyStartIndex;
  for (let i = bodyStartIndex; i < cleanCode.length; i++) {
    if (cleanCode[i] === '{') depth++;
    else if (cleanCode[i] === '}') {
      depth--;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  assert.strictEqual(depth, 0, `Unbalanced braces in function: ${functionName}`);
  return cleanCode.slice(startIndex, endIndex);
}

// -------------------------------------------------------------
// 1. Dashboard Action & Shared Source Dedupe Architecture
// -------------------------------------------------------------
{
  const sourceCode = readProjectFile('src/lib/db/dashboard-source.ts');
  const cleanSourceCode = stripComments(sourceCode);
  const actionCode = readProjectFile('src/actions/dashboard.ts');
  const cleanActionCode = stripComments(actionCode);

  // 1.1 Source exports & calculation helpers
  assert.ok(
    /export\s+function\s+createDashboardSource\b/.test(cleanSourceCode),
    'src/lib/db/dashboard-source.ts must export createDashboardSource'
  );
  assert.ok(
    /export\s+function\s+computeDashboardPrimaryData\b/.test(cleanSourceCode),
    'src/lib/db/dashboard-source.ts must export computeDashboardPrimaryData'
  );
  assert.ok(
    /export\s+function\s+computeDashboardSecondaryData\b/.test(cleanSourceCode),
    'src/lib/db/dashboard-source.ts must export computeDashboardSecondaryData'
  );

  // 1.2 Action Exports
  assert.ok(
    /export\s+async\s+function\s+getDashboardPrimaryData\b/.test(cleanActionCode),
    'src/actions/dashboard.ts must export getDashboardPrimaryData'
  );
  assert.ok(
    /export\s+async\s+function\s+getDashboardSecondaryData\b/.test(cleanActionCode),
    'src/actions/dashboard.ts must export getDashboardSecondaryData'
  );
  assert.ok(
    /export\s+async\s+function\s+getDashboardData\b/.test(cleanActionCode),
    'src/actions/dashboard.ts must keep getDashboardData exported for backward compatibility'
  );

  // 1.3 Role authorization in actions
  const primaryFn = extractFunction(actionCode, 'getDashboardPrimaryData');
  assert.ok(
    /requireRole\s*\(\s*\[['"`]Manager['"`],\s*['"`]Leader['"`],\s*['"`]SubLeader['"`]\]\s*\)/.test(normalizeWhitespace(primaryFn)),
    'getDashboardPrimaryData must require role Manager/Leader/SubLeader'
  );

  const secondaryFn = extractFunction(actionCode, 'getDashboardSecondaryData');
  assert.ok(
    /requireRole\s*\(\s*\[['"`]Manager['"`],\s*['"`]Leader['"`],\s*['"`]SubLeader['"`]\]\s*\)/.test(normalizeWhitespace(secondaryFn)),
    'getDashboardSecondaryData must require role Manager/Leader/SubLeader'
  );

  const dashboardDataFn = extractFunction(actionCode, 'getDashboardData');
  assert.ok(
    /requireRole\s*\(\s*\[['"`]Manager['"`],\s*['"`]Leader['"`],\s*['"`]SubLeader['"`]\]\s*\)/.test(normalizeWhitespace(dashboardDataFn)),
    'getDashboardData must require role Manager/Leader/SubLeader'
  );

  // 1.4 Dedupe verification: createDashboardSource initiates evaluations, users, teams read once in shared promise
  const createSourceFn = extractFunction(sourceCode, 'createDashboardSource');
  assert.ok(
    createSourceFn.includes('getEvaluationsByPeriodAdmin(') &&
      createSourceFn.includes('getUsersAdmin(') &&
      createSourceFn.includes('getTeamsAdmin('),
    'createDashboardSource must initiate getEvaluationsByPeriodAdmin, getUsersAdmin, and getTeamsAdmin'
  );
  assert.ok(
    /Promise\.all\s*\(\s*\[\s*getEvaluationsByPeriodAdmin\([^)]*\)\s*,\s*getUsersAdmin\([^)]*\)\s*,\s*getTeamsAdmin\([^)]*\)\s*,?\s*\]\s*\)/.test(
      normalizeWhitespace(createSourceFn)
    ),
    'createDashboardSource must batch common reads in Promise.all once per request'
  );

  // 1.5 Primary does NOT load criteria groups (criteria groups are secondary radar only)
  const computePrimaryFn = extractFunction(sourceCode, 'computeDashboardPrimaryData');
  assert.ok(
    !computePrimaryFn.includes('getAllCriteriaGroups'),
    'computeDashboardPrimaryData must not call getAllCriteriaGroups'
  );

  // 1.6 Secondary loads criteria groups for radar
  assert.ok(
    createSourceFn.includes('getAllCriteriaGroups'),
    'createDashboardSource secondary branch must load criteria groups for radar'
  );
}

// -------------------------------------------------------------
// 2. Dashboard Components & Streaming (src/app/dashboard/page.tsx)
// -------------------------------------------------------------
{
  const pageCode = readProjectFile('src/app/dashboard/page.tsx');
  const cleanPageCode = stripComments(pageCode);

  // 2.1 Imports Suspense, primary and secondary sections, and source helper
  assert.ok(
    /import\s+React,\s*\{\s*Suspense\s*\}\s*from\s*['"]react['"]/.test(cleanPageCode) ||
      /import\s*\{[^}]*\bSuspense\b[^}]*\}\s*from\s*['"]react['"]/.test(cleanPageCode),
    'src/app/dashboard/page.tsx must import Suspense from react'
  );
  assert.ok(
    /import\s+DashboardPrimarySection\s+from\s+['"]@\/components\/dashboard\/DashboardPrimarySection['"]/.test(cleanPageCode),
    'src/app/dashboard/page.tsx must import DashboardPrimarySection'
  );
  assert.ok(
    /import\s+DashboardSecondarySection/.test(cleanPageCode) &&
      cleanPageCode.includes('@/components/dashboard/DashboardSecondarySection'),
    'src/app/dashboard/page.tsx must import DashboardSecondarySection'
  );
  assert.ok(
    cleanPageCode.includes('createDashboardSource'),
    'src/app/dashboard/page.tsx must import createDashboardSource'
  );

  // 2.2 Calls createDashboardSource in page critical path, NOT getDashboardData or getDashboardSecondaryData
  assert.ok(
    cleanPageCode.includes('createDashboardSource(periodId, viewer)') ||
      cleanPageCode.includes('createDashboardSource(periodId'),
    'src/app/dashboard/page.tsx must call createDashboardSource'
  );
  assert.ok(
    !cleanPageCode.includes('await getDashboardData('),
    'src/app/dashboard/page.tsx must not await monolithic getDashboardData in page critical path'
  );
  assert.ok(
    !cleanPageCode.includes('await getDashboardSecondaryData('),
    'src/app/dashboard/page.tsx must not await getDashboardSecondaryData in page root (must stream)'
  );

  // 2.3 Suspense wrapping and secondaryPromise pass-through
  assert.ok(
    /<Suspense\s+fallback=\{<DashboardSecondarySkeleton\s*\/>\}>[\s\S]*?<DashboardSecondarySection[\s\S]*?<\/Suspense>/.test(cleanPageCode),
    'src/app/dashboard/page.tsx must wrap DashboardSecondarySection in Suspense with DashboardSecondarySkeleton fallback'
  );
  assert.ok(
    cleanPageCode.includes('secondaryPromise={source?.secondary}') ||
      cleanPageCode.includes('secondaryPromise={source.secondary}'),
    'src/app/dashboard/page.tsx must pass source.secondary into DashboardSecondarySection to eliminate duplicate fetches'
  );

  // 2.4 PrimarySection rendered outside Suspense
  const primarySectionIndex = cleanPageCode.indexOf('<DashboardPrimarySection');
  const suspenseIndex = cleanPageCode.indexOf('<Suspense');
  assert.ok(primarySectionIndex !== -1, 'DashboardPrimarySection must be rendered');
  assert.ok(suspenseIndex !== -1, 'Suspense must be rendered');
  assert.ok(
    primarySectionIndex < suspenseIndex,
    'DashboardPrimarySection must be rendered before Suspense block'
  );

  // 2.5 Auth & Period resolution preserved
  assert.ok(cleanPageCode.includes('getSessionUser()'), 'DashboardPage must preserve getSessionUser auth guard');
  assert.ok(cleanPageCode.includes('resolveCurrentPeriod('), 'DashboardPage must preserve resolveCurrentPeriod');

  // 2.6 Primary Section component verification
  const primarySectionCode = readProjectFile('src/components/dashboard/DashboardPrimarySection.tsx');
  assert.ok(
    !primarySectionCode.includes("'use client'") && !primarySectionCode.includes('"use client"'),
    'DashboardPrimarySection must be a server component (RSC)'
  );
  assert.ok(
    primarySectionCode.includes('primaryData.stats.total') &&
      primarySectionCode.includes('primaryData.stats.percent') &&
      primarySectionCode.includes('primaryData.teamStatus') &&
      primarySectionCode.includes('GradeDistribution'),
    'DashboardPrimarySection must render KPI stats, team status, and GradeDistribution'
  );

  // 2.7 Secondary Section component verification
  const secondarySectionCode = readProjectFile('src/components/dashboard/DashboardSecondarySection.tsx');
  assert.ok(
    /export\s+function\s+DashboardSecondarySkeleton\b/.test(stripComments(secondarySectionCode)),
    'DashboardSecondarySection.tsx must export DashboardSecondarySkeleton'
  );
  assert.ok(
    secondarySectionCode.includes('secondaryPromise') &&
      secondarySectionCode.includes('getDashboardSecondaryData'),
    'DashboardSecondarySection must accept secondaryPromise and fall back to getDashboardSecondaryData'
  );
  assert.ok(
    secondarySectionCode.includes('PendingReviews') &&
      secondarySectionCode.includes('AnomalyAlertCard') &&
      secondarySectionCode.includes('LazySkillGapRadar'),
    'DashboardSecondarySection must render PendingReviews, AnomalyAlertCard, and LazySkillGapRadar'
  );
}

// -------------------------------------------------------------
// 3. Reports Action & Shared Source Dedupe Architecture
// -------------------------------------------------------------
{
  const sourceCode = readProjectFile('src/lib/db/reports-source.ts');
  const cleanSourceCode = stripComments(sourceCode);
  const actionCode = readProjectFile('src/actions/reports.ts');
  const cleanActionCode = stripComments(actionCode);

  // 3.1 Source exports & calculation helpers
  assert.ok(
    /export\s+function\s+createReportsSource\b/.test(cleanSourceCode),
    'src/lib/db/reports-source.ts must export createReportsSource'
  );
  assert.ok(
    /export\s+function\s+computeReportPrimaryData\b/.test(cleanSourceCode),
    'src/lib/db/reports-source.ts must export computeReportPrimaryData'
  );
  assert.ok(
    /export\s+function\s+computeReportSecondaryData\b/.test(cleanSourceCode),
    'src/lib/db/reports-source.ts must export computeReportSecondaryData'
  );

  // 3.2 Action exports
  assert.ok(
    /export\s+async\s+function\s+getReportPrimaryData\b/.test(cleanActionCode),
    'src/actions/reports.ts must export getReportPrimaryData'
  );
  assert.ok(
    /export\s+async\s+function\s+getReportSecondaryData\b/.test(cleanActionCode),
    'src/actions/reports.ts must export getReportSecondaryData'
  );
  assert.ok(
    /export\s+async\s+function\s+getReportAggregation\b/.test(cleanActionCode),
    'src/actions/reports.ts must keep getReportAggregation exported for backward compatibility'
  );

  // 3.3 Role authorization in actions
  const primaryFn = extractFunction(actionCode, 'getReportPrimaryData');
  assert.ok(
    /requireRole\s*\(\s*\[['"`]Manager['"`],\s*['"`]Leader['"`],\s*['"`]SubLeader['"`]\]\s*\)/.test(normalizeWhitespace(primaryFn)),
    'getReportPrimaryData must require role Manager/Leader/SubLeader'
  );

  const secondaryFn = extractFunction(actionCode, 'getReportSecondaryData');
  assert.ok(
    /requireRole\s*\(\s*\[['"`]Manager['"`],\s*['"`]Leader['"`],\s*['"`]SubLeader['"`]\]\s*\)/.test(normalizeWhitespace(secondaryFn)),
    'getReportSecondaryData must require role Manager/Leader/SubLeader'
  );

  const aggregationFn = extractFunction(actionCode, 'getReportAggregation');
  assert.ok(
    /requireRole\s*\(\s*\[['"`]Manager['"`],\s*['"`]Leader['"`],\s*['"`]SubLeader['"`]\]\s*\)/.test(normalizeWhitespace(aggregationFn)),
    'getReportAggregation must require role Manager/Leader/SubLeader'
  );

  // 3.4 Dedupe verification: createReportsSource initiates evaluations, users, teams once in shared promise
  const createSourceFn = extractFunction(sourceCode, 'createReportsSource');
  assert.ok(
    createSourceFn.includes('getEvaluationsByPeriodAdmin(') &&
      createSourceFn.includes('getUsersAdmin(') &&
      createSourceFn.includes('getTeamsAdmin('),
    'createReportsSource must initiate getEvaluationsByPeriodAdmin, getUsersAdmin, and getTeamsAdmin'
  );
  assert.ok(
    /Promise\.all\s*\(\s*\[\s*getEvaluationsByPeriodAdmin\([^)]*\)\s*,\s*getUsersAdmin\([^)]*\)\s*,\s*getTeamsAdmin\([^)]*\)\s*,?\s*\]\s*\)/.test(
      normalizeWhitespace(createSourceFn)
    ),
    'createReportsSource must batch common reads in Promise.all once per request'
  );

  // 3.5 Primary does NOT load criteria groups (criteria analysis is secondary only)
  const computePrimaryFn = extractFunction(sourceCode, 'computeReportPrimaryData');
  assert.ok(
    !computePrimaryFn.includes('getAllCriteriaGroups'),
    'computeReportPrimaryData must not call getAllCriteriaGroups'
  );

  // 3.6 Secondary loads criteria groups for heatmap
  assert.ok(
    createSourceFn.includes('getAllCriteriaGroups'),
    'createReportsSource secondary branch must load criteria groups for heatmap'
  );
}

// -------------------------------------------------------------
// 4. Reports Components & Streaming (src/app/reports/page.tsx)
// -------------------------------------------------------------
{
  const pageCode = readProjectFile('src/app/reports/page.tsx');
  const cleanPageCode = stripComments(pageCode);

  // 4.1 Imports Suspense, primary and secondary sections, and source helper
  assert.ok(
    /import\s+React,\s*\{\s*Suspense\s*\}\s*from\s*['"]react['"]/.test(cleanPageCode) ||
      /import\s*\{[^}]*\bSuspense\b[^}]*\}\s*from\s*['"]react['"]/.test(cleanPageCode),
    'src/app/reports/page.tsx must import Suspense from react'
  );
  assert.ok(
    /import\s+ReportsPrimarySection\s+from\s+['"]@\/components\/reports\/ReportsPrimarySection['"]/.test(cleanPageCode),
    'src/app/reports/page.tsx must import ReportsPrimarySection'
  );
  assert.ok(
    /import\s+ReportsSecondarySection/.test(cleanPageCode) &&
      cleanPageCode.includes('@/components/reports/ReportsSecondarySection'),
    'src/app/reports/page.tsx must import ReportsSecondarySection'
  );
  assert.ok(
    cleanPageCode.includes('createReportsSource'),
    'src/app/reports/page.tsx must import createReportsSource'
  );

  // 4.2 Calls createReportsSource and derived promises, NOT getReportAggregation or getPeriodSummary in root
  assert.ok(
    cleanPageCode.includes('createReportsSource(periodId, team, viewer)') ||
      cleanPageCode.includes('createReportsSource(periodId'),
    'src/app/reports/page.tsx must call createReportsSource'
  );
  assert.ok(
    cleanPageCode.includes('source.teams') && cleanPageCode.includes('source.primary'),
    'src/app/reports/page.tsx must consume source.teams and source.primary from shared snapshot'
  );
  assert.ok(
    !cleanPageCode.includes('getReportAggregation('),
    'src/app/reports/page.tsx must not call getReportAggregation in page critical path'
  );
  assert.ok(
    !cleanPageCode.includes('getPeriodSummary('),
    'src/app/reports/page.tsx must not call getPeriodSummary in page critical path (deferred to secondary section)'
  );

  // 4.3 Suspense wrapping and secondaryPromise pass-through
  assert.ok(
    /<Suspense\s+fallback=\{<ReportsSecondarySkeleton\s*\/>\}>[\s\S]*?<ReportsSecondarySection[\s\S]*?<\/Suspense>/.test(cleanPageCode),
    'src/app/reports/page.tsx must wrap ReportsSecondarySection in Suspense with ReportsSecondarySkeleton fallback'
  );
  assert.ok(
    cleanPageCode.includes('secondaryPromise={source?.secondary}') ||
      cleanPageCode.includes('secondaryPromise={source.secondary}'),
    'src/app/reports/page.tsx must pass source.secondary into ReportsSecondarySection to eliminate duplicate fetches'
  );

  // 4.4 PrimarySection rendered outside Suspense
  const primarySectionIndex = cleanPageCode.indexOf('<ReportsPrimarySection');
  const suspenseIndex = cleanPageCode.indexOf('<Suspense');
  assert.ok(primarySectionIndex !== -1, 'ReportsPrimarySection must be rendered');
  assert.ok(suspenseIndex !== -1, 'Suspense must be rendered');
  assert.ok(
    primarySectionIndex < suspenseIndex,
    'ReportsPrimarySection must be rendered before Suspense block'
  );

  // 4.5 Auth & Period resolution preserved
  assert.ok(cleanPageCode.includes('getSessionUser()'), 'ReportsPage must preserve getSessionUser auth guard');
  assert.ok(cleanPageCode.includes('resolveCurrentPeriod('), 'ReportsPage must preserve resolveCurrentPeriod');

  // 4.6 Primary Section component verification
  const primarySectionCode = readProjectFile('src/components/reports/ReportsPrimarySection.tsx');
  assert.ok(
    !primarySectionCode.includes("'use client'") && !primarySectionCode.includes('"use client"'),
    'ReportsPrimarySection must be a server component (RSC)'
  );
  assert.ok(
    primarySectionCode.includes('primaryData.stats.totalEmployees') &&
      primarySectionCode.includes('primaryData.stats.avgScore') &&
      primarySectionCode.includes('ReportFilters') &&
      primarySectionCode.includes('GradeDistribution'),
    'ReportsPrimarySection must render KPI pill, ReportFilters, and GradeDistribution'
  );

  // 4.7 Secondary Section component verification
  const secondarySectionCode = readProjectFile('src/components/reports/ReportsSecondarySection.tsx');
  assert.ok(
    /export\s+function\s+ReportsSecondarySkeleton\b/.test(stripComments(secondarySectionCode)),
    'ReportsSecondarySection.tsx must export ReportsSecondarySkeleton'
  );
  assert.ok(
    secondarySectionCode.includes('secondaryPromise') &&
      secondarySectionCode.includes('getReportSecondaryData') &&
      secondarySectionCode.includes('getPeriodSummary(periodId)'),
    'ReportsSecondarySection must accept secondaryPromise, fall back to getReportSecondaryData, and call getPeriodSummary concurrently'
  );
  assert.ok(
    secondarySectionCode.includes('TeamComparison') &&
      secondarySectionCode.includes('CriteriaHeatmap') &&
      secondarySectionCode.includes('TopPerformers') &&
      secondarySectionCode.includes('AiSummaryCard'),
    'ReportsSecondarySection must render TeamComparison, CriteriaHeatmap, TopPerformers, and AiSummaryCard'
  );
}

// -------------------------------------------------------------
// 5. Broad Cache & React Query Guardrails
// -------------------------------------------------------------
{
  const dashboardAction = readProjectFile('src/actions/dashboard.ts');
  const reportsAction = readProjectFile('src/actions/reports.ts');
  const dashboardSource = readProjectFile('src/lib/db/dashboard-source.ts');
  const reportsSource = readProjectFile('src/lib/db/reports-source.ts');

  for (const [name, content] of [
    ['src/actions/dashboard.ts', dashboardAction],
    ['src/actions/reports.ts', reportsAction],
    ['src/lib/db/dashboard-source.ts', dashboardSource],
    ['src/lib/db/reports-source.ts', reportsSource],
  ]) {
    assert.ok(
      !content.includes('unstable_cache'),
      `${name} must not use unstable_cache (no broad cache)`
    );
  }

  const dashPrimary = readProjectFile('src/components/dashboard/DashboardPrimarySection.tsx');
  const dashSecondary = readProjectFile('src/components/dashboard/DashboardSecondarySection.tsx');
  const repPrimary = readProjectFile('src/components/reports/ReportsPrimarySection.tsx');
  const repSecondary = readProjectFile('src/components/reports/ReportsSecondarySection.tsx');

  for (const [name, content] of [
    ['DashboardPrimarySection', dashPrimary],
    ['DashboardSecondarySection', dashSecondary],
    ['ReportsPrimarySection', repPrimary],
    ['ReportsSecondarySection', repSecondary],
  ]) {
    assert.ok(
      !content.includes('useQuery'),
      `${name} must not introduce useQuery or React Query keys`
    );
  }
}

console.log('Dashboard & Reports streaming dedupe regression tests: ALL PASS');
