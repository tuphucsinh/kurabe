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
// P110M1T02 — saveResultMessageAction must be Approved-only at the UPDATE
// (no TOCTOU window), reject zero updated rows honestly, validate input, and
// never report success for a write that did not happen. The batch modal must
// move a failed save to the error state instead of staying stuck on 'saving'.
// ============================================================================

// 1. Transpile real ai-governance.ts (provides MAX_AI_TOTAL_PAYLOAD_CHARS etc.)
const govPath = path.join(projectRoot, 'src/lib/ai-governance.ts');
const govTranspiled = ts.transpileModule(fs.readFileSync(govPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const govModule = { exports: {} };
new Function('exports', 'require', 'module', govTranspiled)(
  govModule.exports,
  (id) => { if (id === 'server-only') return {}; return require(id); },
  govModule
);
const MAX_AI_TOTAL_PAYLOAD_CHARS = govModule.exports.MAX_AI_TOTAL_PAYLOAD_CHARS;

// 2. Transpile real actions/ai.ts with stubs for its imports
const aiPath = path.join(projectRoot, 'src/actions/ai.ts');
const aiTranspiled = ts.transpileModule(fs.readFileSync(aiPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const S = {
  requireManagerResult: { error: null, user: { id: 'mgr-1', role: 'Manager' } },
  periodGuardResult: { success: true },
  fromHandler: null,
  auditCalls: [],
  revalidateCalls: [],
};

function loadAiModule() {
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/lib/auth') {
      return { requireManager: async () => S.requireManagerResult };
    }
    if (id === '@/lib/ai') return { callAI: async () => null, isAIConfigured: () => false };
    if (id === '@/lib/ai-prompts') return { buildResultPrompt: () => '' };
    if (id === '@/lib/supabase-admin') {
      return { supabaseAdmin: { from: (table) => S.fromHandler(table) } };
    }
    if (id === 'next/cache') return { revalidatePath: (...a) => S.revalidateCalls.push(a) };
    if (id === '@/lib/audit') {
      return {
        logAudit: async (...args) => { S.auditCalls.push(args); return { ok: true }; },
      };
    }
    if (id === '@/lib/db/evaluations-admin') return { getEvaluationsByPeriodAdmin: async () => [] };
    if (id === '@/lib/db/users-admin') return { getUsersAdmin: async () => [] };
    if (id === '@/lib/db/criteria') return { getAllCriteriaGroups: async () => [] };
    if (id === '@/actions/dashboard') return { getDashboardData: async () => ({}) };
    if (id === '@/actions/ai-summary') return { getPeriodSummary: async () => ({}) };
    if (id === '@/lib/errors') {
      return { toClientError: (err, fallback) => fallback || String(err?.message || err) };
    }
    if (id === '@/lib/ai-limit') return { checkAndRecordAiUsage: async () => ({ allowed: true }) };
    if (id === '@/lib/db/evaluation-period-write-guard') {
      return {
        assertEvaluationPeriodActiveForEvaluation: async () => S.periodGuardResult,
      };
    }
    if (id === '@/lib/ai-governance') return govModule.exports;
    return require(id);
  };
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', aiTranspiled)(mod.exports, customRequire, mod);
  return mod.exports;
}

const { saveResultMessageAction } = loadAiModule();

function makeEvaluationsBuilder(finalResult) {
  const calls = { updateArgs: null, eqs: [], selectArg: null };
  const builder = {
    update(args) { calls.updateArgs = args; return builder; },
    eq(col, val) { calls.eqs.push([col, val]); return builder; },
    select(sel) { calls.selectArg = sel; return builder; },
    then(resolve, reject) { return Promise.resolve(finalResult).then(resolve, reject); },
  };
  return { builder, calls };
}

const OK = { error: null, user: { id: 'mgr-1', role: 'Manager' } };

// --- 1. Approved + Active + Manager: update is guarded by status at the DB ---
{
  S.requireManagerResult = OK;
  S.periodGuardResult = { success: true };
  S.auditCalls = [];
  const { builder, calls } = makeEvaluationsBuilder({ data: [{ id: 'ev-1' }], error: null });
  S.fromHandler = (table) => {
    assert.equal(table, 'evaluations');
    return builder;
  };

  const res = await saveResultMessageAction({ evaluationId: 'ev-1', message: 'Thông báo kết quả.' });
  assert.equal(res.ok, true, 'approved row saves successfully');
  assert.equal(res.auditRecorded, true);
  assert.deepEqual(calls.eqs, [['id', 'ev-1'], ['status', 'Approved']],
    'status guard must be part of the UPDATE itself (TOCTOU-safe)');
  assert.equal(calls.selectArg, 'id', 'update must select affected rows to detect zero-row writes');
  assert.equal(S.auditCalls.length, 1, 'exactly one successful audit');
}

// --- 2. Zero updated rows (not Approved / gone): honest error, no audit ---
{
  S.requireManagerResult = OK;
  S.periodGuardResult = { success: true };
  S.auditCalls = [];
  S.fromHandler = () => makeEvaluationsBuilder({ data: [], error: null }).builder;

  const res = await saveResultMessageAction({ evaluationId: 'ev-2', message: 'x' });
  assert.equal(res.ok, undefined, 'zero updated rows must NOT report ok');
  assert.match(res.error || '', /Approved/);
  assert.equal(S.auditCalls.length, 0, 'no success audit for a write that did not happen');
}

// --- 3. data null without error is treated as zero rows, not success ---
{
  S.requireManagerResult = OK;
  S.periodGuardResult = { success: true };
  S.auditCalls = [];
  S.fromHandler = () => makeEvaluationsBuilder({ data: null, error: null }).builder;

  const res = await saveResultMessageAction({ evaluationId: 'ev-3', message: 'x' });
  assert.equal(res.ok, undefined);
  assert.ok(res.error);
  assert.equal(S.auditCalls.length, 0);
}

// --- 4. Supabase update error: honest error, no audit ---
{
  S.requireManagerResult = OK;
  S.periodGuardResult = { success: true };
  S.auditCalls = [];
  S.fromHandler = () => makeEvaluationsBuilder({ data: null, error: { message: 'db down' } }).builder;

  const res = await saveResultMessageAction({ evaluationId: 'ev-4', message: 'x' });
  assert.equal(res.ok, undefined);
  assert.ok(res.error);
  assert.equal(S.auditCalls.length, 0);
}

// --- 5. Non-Manager blocked before any DB access ---
{
  S.requireManagerResult = { error: 'Chỉ Quản lý mới thực hiện được hành động này.', user: null };
  let dbTouched = false;
  S.fromHandler = () => { dbTouched = true; return makeEvaluationsBuilder({ data: [], error: null }).builder; };

  const res = await saveResultMessageAction({ evaluationId: 'ev-5', message: 'x' });
  assert.equal(res.ok, undefined);
  assert.ok(res.error);
  assert.equal(dbTouched, false, 'role check precedes any DB call');
}

// --- 6. Inactive/closed period blocked before update ---
{
  S.requireManagerResult = OK;
  S.periodGuardResult = { success: false, error: 'Kỳ đánh giá đã đóng.' };
  let dbTouched = false;
  S.fromHandler = () => { dbTouched = true; return makeEvaluationsBuilder({ data: [], error: null }).builder; };

  const res = await saveResultMessageAction({ evaluationId: 'ev-6', message: 'x' });
  assert.match(res.error || '', /Kỳ đánh giá đã đóng/);
  assert.equal(dbTouched, false, 'period guard precedes the update');
}

// --- 7. Input validation: empty / non-string / oversize message rejected ---
{
  S.requireManagerResult = OK;
  S.periodGuardResult = { success: true };
  let dbTouched = false;
  S.fromHandler = () => { dbTouched = true; return makeEvaluationsBuilder({ data: [], error: null }).builder; };

  const empty = await saveResultMessageAction({ evaluationId: 'ev-7', message: '   ' });
  assert.ok(empty.error, 'whitespace-only message rejected');
  const nonString = await saveResultMessageAction({ evaluationId: 'ev-7', message: 42 });
  assert.ok(nonString.error, 'non-string message rejected');
  const noId = await saveResultMessageAction({ evaluationId: '', message: 'x' });
  assert.ok(noId.error, 'empty evaluationId rejected');
  const oversize = await saveResultMessageAction({
    evaluationId: 'ev-7',
    message: 'a'.repeat(MAX_AI_TOTAL_PAYLOAD_CHARS + 1),
  });
  assert.ok(oversize.error, 'oversize message rejected (existing payload contract)');
  assert.equal(dbTouched, false, 'invalid input never reaches the DB');
}

// --- 8. Boundary: exactly MAX chars is accepted and stored untruncated ---
{
  S.requireManagerResult = OK;
  S.periodGuardResult = { success: true };
  const { builder, calls } = makeEvaluationsBuilder({ data: [{ id: 'ev-8' }], error: null });
  S.fromHandler = () => builder;
  const big = 'a'.repeat(MAX_AI_TOTAL_PAYLOAD_CHARS);
  const res = await saveResultMessageAction({ evaluationId: 'ev-8', message: big });
  assert.equal(res.ok, true, 'message at the contract boundary is accepted');
  assert.equal(calls.updateArgs.result_message.length, MAX_AI_TOTAL_PAYLOAD_CHARS,
    'no silent truncation at the boundary');
}

// --- 9. Modal: failed saves move the item to the error state ---
const modalPath = path.join(projectRoot, 'src/components/reports/BatchResultMessageModal.tsx');
const modalSource = fs.readFileSync(modalPath, 'utf8');

function extractHandler(source, name) {
  const start = source.indexOf(`const ${name} = async`);
  assert.ok(start >= 0, `${name} exists`);
  const nextHandler = source.indexOf('\n  // ', start + 10);
  const end = nextHandler >= 0 ? nextHandler : source.length;
  return source.slice(start, end);
}

const saveSingle = extractHandler(modalSource, 'handleSaveSingle');
const catchSingle = saveSingle.slice(saveSingle.indexOf('} catch (err)'));
assert.match(catchSingle, /status: 'error'/,
  'handleSaveSingle must mark the item error on a thrown save');
assert.doesNotMatch(catchSingle, /status: 'saving'/,
  'handleSaveSingle catch must not leave the item stuck on saving');

const saveAll = extractHandler(modalSource, 'handleSaveAll');
const catchAll = saveAll.slice(saveAll.indexOf('} catch (err)'));
assert.match(catchAll, /status: 'error'/,
  'handleSaveAll must mark a thrown item as error so it can be retried');

console.log('P110M1T02 result-message approved-only + modal saving reset: ALL PASS');
