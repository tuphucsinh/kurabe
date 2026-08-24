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
// 1. Verify src/components/charts/LazySkillGapRadar.tsx
// -------------------------------------------------------------
{
  const lazyRadarCode = readProjectFile('src/components/charts/LazySkillGapRadar.tsx');
  const normLazyRadar = normalizeWhitespace(stripComments(lazyRadarCode));

  // 1.1 Client component directive
  assert.ok(
    normLazyRadar.includes("'use client'") || normLazyRadar.includes('"use client"'),
    'LazySkillGapRadar must be a client component with use client directive'
  );

  // 1.2 Import next/dynamic
  assert.ok(
    normLazyRadar.includes("import dynamic from 'next/dynamic'") ||
      normLazyRadar.includes('import dynamic from "next/dynamic"'),
    'LazySkillGapRadar must import dynamic from next/dynamic'
  );

  // 1.3 Direct dynamic import of SkillGapRadar selecting named export
  assert.ok(
    /dynamic\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"]@\/components\/charts\/SkillGapRadar['"]\s*\)\.then\s*\(\s*\(?mod\)?\s*=>\s*mod\.SkillGapRadar\s*\)/.test(
      normLazyRadar
    ) ||
      normLazyRadar.includes("import('@/components/charts/SkillGapRadar').then((mod) => mod.SkillGapRadar)") ||
      normLazyRadar.includes("import('@/components/charts/SkillGapRadar').then(mod => mod.SkillGapRadar)"),
    'LazySkillGapRadar must dynamically import @/components/charts/SkillGapRadar and select named export mod.SkillGapRadar'
  );

  // 1.4 Must NOT dynamically import obsolete ClientSkillGapRadar
  assert.ok(
    !normLazyRadar.includes('ClientSkillGapRadar'),
    'LazySkillGapRadar must NOT import or reference ClientSkillGapRadar'
  );

  // 1.5 Must NOT import recharts directly in the lazy wrapper
  assert.ok(
    !normLazyRadar.includes("from 'recharts'") && !normLazyRadar.includes('from "recharts"'),
    'LazySkillGapRadar wrapper must NOT import recharts directly to prevent bundling recharts in the wrapper'
  );

  // 1.6 Retain ssr: false
  assert.ok(
    normLazyRadar.includes('ssr: false'),
    'LazySkillGapRadar dynamic boundary must configure ssr: false'
  );

  // 1.7 Retain explicit loading skeleton with layout height and animation
  assert.ok(
    normLazyRadar.includes('loading:') &&
      normLazyRadar.includes('animate-pulse') &&
      normLazyRadar.includes('h-72') &&
      normLazyRadar.includes('Đang tải biểu đồ...'),
    'LazySkillGapRadar must provide an explicit loading skeleton matching layout height (h-72) and animate-pulse'
  );

  // 1.8 Retain data-load-layer="heavy" marker
  assert.ok(
    normLazyRadar.includes('data-load-layer="heavy"'),
    'LazySkillGapRadar must render data-load-layer="heavy" on its container'
  );

  // 1.9 Prop forwarding: evaluations and criteriaGroups
  assert.ok(
    normLazyRadar.includes('evaluations') && normLazyRadar.includes('criteriaGroups'),
    'LazySkillGapRadar must accept and forward evaluations and criteriaGroups props'
  );
}

// -------------------------------------------------------------
// 2. Verify deletion of obsolete ClientSkillGapRadar.tsx and no remaining callers
// -------------------------------------------------------------
{
  const clientWrapperPath = path.join(projectRoot, 'src/components/charts/ClientSkillGapRadar.tsx');
  assert.strictEqual(
    fs.existsSync(clientWrapperPath),
    false,
    'ClientSkillGapRadar.tsx must be deleted from the filesystem as it is obsolete'
  );

  // Search all source files in src/ for any remaining references to ClientSkillGapRadar
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        assert.ok(
          !content.includes('ClientSkillGapRadar'),
          `Source file ${path.relative(projectRoot, full)} must NOT reference ClientSkillGapRadar`
        );
      }
    }
  }

  scanDir(path.join(projectRoot, 'src'));
}

// -------------------------------------------------------------
// 3. Verify src/components/charts/SkillGapRadar.tsx is the single recharts consumer
// -------------------------------------------------------------
{
  const radarCode = readProjectFile('src/components/charts/SkillGapRadar.tsx');
  const normRadar = normalizeWhitespace(stripComments(radarCode));

  // 3.1 Named export SkillGapRadar
  assert.ok(
    normRadar.includes('export function SkillGapRadar('),
    'SkillGapRadar.tsx must export named function SkillGapRadar'
  );

  // 3.2 Imports recharts primitives
  assert.ok(
    normRadar.includes("from 'recharts'") || normRadar.includes('from "recharts"'),
    'SkillGapRadar.tsx must import chart components from recharts'
  );
  assert.ok(
    normRadar.includes('RadarChart') && normRadar.includes('PolarGrid') && normRadar.includes('ResponsiveContainer'),
    'SkillGapRadar.tsx must render RadarChart, PolarGrid, and ResponsiveContainer'
  );
}

// -------------------------------------------------------------
// 4. Verify src/components/dashboard/DashboardHeavySection.tsx consumes LazySkillGapRadar
// -------------------------------------------------------------
{
  const heavySectionCode = readProjectFile('src/components/dashboard/DashboardHeavySection.tsx');
  const normHeavy = normalizeWhitespace(stripComments(heavySectionCode));

  assert.ok(
    normHeavy.includes("import LazySkillGapRadar from '@/components/charts/LazySkillGapRadar'"),
    'DashboardHeavySection must import LazySkillGapRadar from @/components/charts/LazySkillGapRadar'
  );

  assert.ok(
    normHeavy.includes('<LazySkillGapRadar') &&
      normHeavy.includes('evaluations={data.rawEvaluations}') &&
      normHeavy.includes('criteriaGroups={data.rawCriteriaGroups}'),
    'DashboardHeavySection must render LazySkillGapRadar with data.rawEvaluations and data.rawCriteriaGroups'
  );

  assert.ok(
    !normHeavy.includes('SkillGapRadar.tsx') &&
      !normHeavy.includes('ClientSkillGapRadar') &&
      !normHeavy.includes("from 'recharts'"),
    'DashboardHeavySection must not directly import SkillGapRadar, ClientSkillGapRadar, or recharts'
  );
}

// -------------------------------------------------------------
// 5. Verify staged dashboard loading regression test contract remains untouched
// -------------------------------------------------------------
{
  const regressionTestCode = readProjectFile('tests/dashboard-staged-loading-regression.test.mjs');
  assert.ok(
    regressionTestCode.includes('LazySkillGapRadar'),
    'dashboard-staged-loading-regression.test.mjs must continue to verify LazySkillGapRadar contract'
  );
  assert.ok(
    regressionTestCode.includes('data-load-layer="heavy"'),
    'dashboard-staged-loading-regression.test.mjs must continue to verify data-load-layer="heavy"'
  );
}

console.log('Targeted lazy-load optimization contract tests: ALL PASS');
