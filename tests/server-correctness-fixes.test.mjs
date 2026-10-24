import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

// ============================================================================
// P110M4T01 — server correctness bundle from the E2E audit:
//   (a) getEvaluationResultProjectionAction whitelists selectedSet (a bogus
//       value used to throw an opaque INVALID_KPI_SET_FILTER digest error);
//   (b) audit-log read clamps the client-supplied limit;
//   (c) evaluator-resolver propagates DB errors instead of silently resolving
//       to null ("Không tìm thấy Leader phù hợp" on a DB outage);
//   (d) getPeriodSummary throws on a DB error instead of reporting "no summary";
//   (e) parseEmployeeExcel reports successCount;
//   (f) chat criteria context lists group code+name, not raw UUIDs;
//   (g) getUsersAdmin pagination has a stable id tiebreaker.
// Behavioral on real transpiled modules; source contracts where behavioral
// wiring would duplicate the whole app.
// ============================================================================

function transpile(rel) {
  return ts.transpileModule(fs.readFileSync(path.join(projectRoot, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function loadModule(source, customRequire) {
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', source)(mod.exports, customRequire, mod);
  return mod.exports;
}

// --- (a) + (b): read.ts actions, stubbed boundaries (same pattern as the teams test) ---
{
  const S = {
    authUser: { id: 'mgr-1', role: 'Manager' },
    projectionCalls: [],
    sanitizeThrows: false,
    capturedLimit: null,
  };
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
    if (id === 'next/cache') return { revalidatePath: () => {} };
    if (id === '@/lib/auth') {
      return {
        requireAuth: async () => ({ error: null, user: S.authUser }),
        requireRole: async () => ({ error: null, user: S.authUser }),
      };
    }
    if (id === '@/lib/supabase-admin') {
      return {
        supabaseAdmin: {
          from(table) {
            if (table !== 'audit_logs') throw new Error('unexpected table ' + table);
            return {
              select() { return this; },
              order() { return this; },
              limit(n) { S.capturedLimit = n; return Promise.resolve({ data: [], error: null }); },
            };
          },
        },
      };
    }
    if (id === '@/types') return { buildViewerScopeKey: (...p) => JSON.stringify(p) };
    if (id === '@/lib/db/evaluations-admin') {
      return new Proxy({}, { get: (t, k) => (k === 'getEvaluationSummariesByPeriodAdmin' ? async () => [] : async () => []) });
    }
    if (id === '@/lib/db/users-admin') {
      return new Proxy({}, { get: () => async () => ({ users: [], hasMore: false }) });
    }
    if (id === '@/lib/db/teams-admin') return new Proxy({}, { get: () => async () => [] });
    if (id === '@/lib/db/criteria') return new Proxy({}, { get: () => async () => [] });
    if (id === '@/lib/grade-bands') return { loadGradeBandsFromDb: async () => null, getGradeBandsSync: () => null };
    if (id === '@/lib/db/evaluation-history-admin') return { getEvaluationHistoryAdmin: async () => ({ target: null, entries: [] }) };
    if (id === '@/lib/db/evaluation-display-admin') return { getEvaluationDisplayAdmin: async () => null };
    if (id === '@/lib/evaluation-result-projection') {
      return {
        getEvaluationResultProjection: async (...a) => { S.projectionCalls.push(a); return { marker: 'raw' }; },
        sanitizeEvaluationResultProjectionForView: (raw, selectedSet) => {
          if (!['all', 'leader', 'staff', 'worker'].includes(selectedSet)) {
            throw new Error('INVALID_KPI_SET_FILTER');
          }
          return { ...raw, selectedSet };
        },
      };
    }
    return require(id);
  };
  const readModule = loadModule(transpile('src/actions/read.ts'), customRequire);

  // bogus selectedSet → typed null, no throw
  const bogus = await readModule.getEvaluationResultProjectionAction('p1', 'bogus-set');
  assert.equal(bogus, null, 'invalid selectedSet must return null, not throw');
  assert.equal(S.projectionCalls.length, 0, 'invalid selectedSet short-circuits before the projection read');

  // valid selectedSet still flows through projection + sanitizer
  const ok = await readModule.getEvaluationResultProjectionAction('p1', 'staff');
  assert.equal(ok.selectedSet, 'staff');

  // limit clamp
  await readModule.getAuditLogsAction({ limit: 1_000_000 });
  assert.equal(S.capturedLimit, 500, 'client limit is clamped to 500');
  await readModule.getAuditLogsAction({ limit: 0 });
  assert.equal(S.capturedLimit, 1, 'limit 0 clamps up to 1');
}

// --- (c): evaluator-resolver propagates DB errors ---
{
  const S = { teamsError: null, userError: null };
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === './supabase-admin' || id === '@/lib/supabase-admin') {
      return {
        supabaseAdmin: {
          from(table) {
            return {
              select() { return this; },
              eq() { return this; },
              order() { return this; },
              async maybeSingle() {
                if (table === 'users') {
                  if (S.userError) return { data: null, error: S.userError };
                  return { data: null, error: null };
                }
                // teams list terminal
                if (S.teamsError) return Promise.resolve({ data: null, error: S.teamsError });
                return Promise.resolve({ data: [], error: null });
              },
              then(resolve) { resolve(S.teamsError ? { data: null, error: S.teamsError } : { data: [], error: null }); },
            };
          },
        },
      };
    }
    if (id === '@/types' || id === '@/types/database') return {};
    if (id === './evaluation-workflow') return { EvaluatorSelector: {} };
    if (id === '@/lib/evaluation-workflow') return { EvaluatorSelector: {} };
    if (id === './team-validation') return { selectValidLeader: () => null };
    if (id === '@/lib/team-validation') return { selectValidLeader: () => null };
    if (id === '@/lib/parsers') return { parseRole: (r) => r };
    if (id === '@supabase/supabase-js') return {};
    return require(id);
  };
  const resolver = loadModule(transpile('src/lib/evaluator-resolver.ts'), customRequire);

  S.teamsError = { message: 'db down' };
  await assert.rejects(() => resolver.loadTeamLeaderIds(), /Lỗi đọc danh sách nhóm/, 'teams read error must throw');
  S.teamsError = null;

  S.userError = { message: 'db down' };
  await assert.rejects(
    () => resolver.resolveEvaluatorFromDb('SubLeader', { id: 'emp-1', role: 'Employee', teamId: 'T1' }),
    /Lỗi đọc SubLeader/,
    'subleader read error must throw instead of resolving null',
  );
}

// --- (d): getPeriodSummary throws on DB error, keeps honest empty on no row ---
{
  const S = { error: null };
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === 'next/cache') return { revalidatePath: () => {} };
    if (id === '@/lib/auth') return { requireManager: async () => ({ error: null, user: { id: 'm', role: 'Manager' } }) };
    if (id === '@/lib/supabase-admin') {
      return {
        supabaseAdmin: {
          from() {
            return {
              select() { return this; },
              eq() { return this; },
              async maybeSingle() {
                return S.error ? { data: null, error: S.error } : { data: null, error: null };
              },
            };
          },
        },
      };
    }
    if (id === '@/lib/ai') return { callAI: async () => null, isAIConfigured: () => false };
    if (id === '@/lib/db/evaluations-admin') return { getEvaluationsByPeriodAdmin: async () => [] };
    if (id === '@/lib/db/users-admin') return { getUsersAdmin: async () => [] };
    if (id === '@/lib/errors') return { toClientError: (e, f) => String(e?.message || f) };
    if (id === '@/lib/ai-limit') return new Proxy({}, { get: () => async () => ({ allowed: true }) });
    if (id === '@/lib/ai-governance') {
      return { boundAITextWithMeta: (t) => ({ text: t, coverageMeta: null }), MAX_AI_PROMPT_CHARS: 12000, buildAIPayload: () => ({ rows: [] }) };
    }
    if (id === '@/lib/db/evaluation-period-write-guard') return { assertEvaluationPeriodActive: async () => ({ success: true }) };
    if (id === '@/lib/evaluation-result-projection') return { getEvaluationResultProjection: async () => null };
    return require(id);
  };
  const summary = loadModule(transpile('src/actions/ai-summary.ts'), customRequire);

  S.error = { message: 'db down' };
  await assert.rejects(() => summary.getPeriodSummary('p1'), /Lỗi tải tóm tắt/, 'DB error must throw');
  S.error = null;
  assert.deepEqual(await summary.getPeriodSummary('p1'), {}, 'no row still returns the honest empty object');
  assert.deepEqual(await summary.getPeriodSummary(''), {}, 'empty periodId short-circuits');
}

// --- (e): parseEmployeeExcel successCount (real module + real workbook) ---
{
  const importModule = loadModule(transpile('src/lib/import.ts'), (id) => {
    if (id === '@/types') return {};
    if (id === '@/lib/role-policy') return { ALL_ROLES: ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'] };
    return require(id);
  });
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Mã NV', 'Họ tên', 'Chức vụ', 'Nhóm', 'Ngày vào làm'],
    ['S01', 'A', 'Manager', '', ''],
    ['S02', 'B', 'Manager', '', ''],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'D');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const FileCtor = globalThis.File ?? (await import('node:buffer')).File;
  const result = await importModule.parseEmployeeExcel(new FileCtor([buf], 'e.xlsx'), []);
  assert.equal(result.data.length, 2);
  assert.equal(result.successCount, 2, 'successCount must reflect parsed rows');
}

// --- (f) + (g): source contracts ---
const chatSource = fs.readFileSync(path.join(projectRoot, 'src/actions/chat.ts'), 'utf8');
assert.match(chatSource, /groups\.map\(\(g\) => `\$\{g\.code\} – \$\{g\.name\}`\)/,
  'criteria context lists group code+name, not UUIDs');
assert.doesNotMatch(chatSource, /groups\.map\(\(g\) => g\.id\)/, 'no raw UUID list remains');

const usersAdminSource = fs.readFileSync(path.join(projectRoot, 'src/lib/db/users-admin.ts'), 'utf8');
assert.match(usersAdminSource, /query\.order\('name'\)\.order\('id', \{ ascending: true \}\)/,
  'getUsersAdmin pagination keeps a stable id tiebreaker');

console.log('P110M4T01 server correctness fixes: ALL PASS');
