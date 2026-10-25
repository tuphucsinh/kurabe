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
// P110M7T01 — hai lỗi UX từ live E2E audit 2026-10-25:
//  UX-1: catch của import Excel luôn toast câu chung chung "Lỗi khi xử lý file
//        import." — vứt message thật của server (mã trùng, thiếu kỳ…).
//  UX-2: thêm nhân viên mới khi CHƯA có kỳ active → RPC trả chuỗi kỹ thuật
//        (P99M2T02_INIT_FAILED: expected exactly one active evaluation period)
//        bị toClientError che thành câu chung chung — phải thành thông báo
//        hành động được bằng tiếng Việt.
// ============================================================================

// --- Behavioral: drive the REAL upsertUsersAction/upsertUserAction với RPC
//     trả đúng chuỗi lỗi thật, stub còn lại như import-personnel-fix ---
const usersTranspiled = ts.transpileModule(fs.readFileSync(path.join(projectRoot, 'src/actions/users.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const NO_PERIOD_MSG = 'P99M2T02_INIT_FAILED: expected exactly one active evaluation period, found 0';

function loadUsersModule(rpcError) {
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === 'next/cache') return { revalidatePath: () => {}, revalidateTag: () => {} };
    if (id === '@/lib/auth') {
      return {
        requireManager: async () => ({ error: null, user: { id: 'mgr-1', role: 'Manager' } }),
        requireRole: async () => ({ error: null, user: { id: 'mgr-1', role: 'Manager' } }),
      };
    }
    if (id === '@/lib/supabase-admin') {
      return {
        supabaseAdmin: {
          from(table) {
            if (table !== 'users') throw new Error('unexpected table ' + table);
            let filters = []; let selectCols = null;
            const applyFilters = (source) => source.filter((row) => filters.every(([col, val]) => Array.isArray(val) ? val.includes(row[col]) : row[col] === val));
            const builder = {
              select(c) { selectCols = c; return builder; },
              eq(col, v) { filters.push([col, v]); return builder; },
              in(col, v) { filters.push([col, v]); return builder; },
              async maybeSingle() { return { data: applyFilters([])[0] ?? null, error: null }; },
              then(resolve) { resolve({ data: applyFilters([]), error: null }); },
            };
            return builder;
          },
        },
      };
    }
    if (id === '@/lib/db/evaluations-write') {
      return {
        applyPersonnelTransaction: async () => (rpcError ? { data: null, error: new Error(rpcError) } : { data: null, error: new Error('unreachable') }),
      };
    }
    if (id === '@/lib/audit') return { logAudit: async () => ({ ok: true }), logAuditBatch: async () => ({ ok: true }) };
    if (id === '@/lib/db/password-seed') return { seedDefaultPasswords: async () => ({ seeded: [], failed: [] }) };
    if (id === '@/lib/errors') {
      return { toClientError: (err, fallback) => (err && err.clientSafe ? err.message : fallback) };
    }
    if (id === '@/lib/db/users') return { mapUserFromDb: (row) => row };
    if (id === '@/lib/db/teams-admin') return { getLeaderTeamIds: async () => [] };
    if (id === '@/types' || id === '@/types/database') return {};
    return require(id);
  };
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', usersTranspiled)(mod.exports, customRequire, mod);
  return mod.exports;
}

// 1. Batch import, chưa có kỳ active
{
  const { upsertUsersAction } = loadUsersModule(NO_PERIOD_MSG);
  const res = await upsertUsersAction([{ id: 'u-1', employeeCode: 'NV01', name: 'NV 1', role: 'Employee', teamId: 'T1', subleaderId: 'sl-1' }]);
  assert.equal(res.success, false);
  assert.match(res.error || '', /Chưa có kỳ đánh giá đang mở/,
    'batch: no-active-period phải thành thông báo hành động được');
  assert.doesNotMatch(res.error || '', /P99M2T02|expected exactly one/i, 'không lộ chuỗi kỹ thuật RPC');
}

// 2. Lưu đơn lẻ (modal), chưa có kỳ active
{
  const { upsertUserAction } = loadUsersModule(NO_PERIOD_MSG);
  const res = await upsertUserAction({ employeeCode: 'NV02', name: 'NV 2', role: 'Employee', teamId: 'T1', subleaderId: 'sl-1' });
  assert.equal(res.success, false);
  assert.match(res.error || '', /Chưa có kỳ đánh giá đang mở/);
}

// 3. Lỗi khác vẫn qua toClientError như cũ (fallback giữ nguyên)
{
  const { upsertUsersAction } = loadUsersModule('P99M2T02_INIT_FAILED: no valid Round 1 evaluator for user x');
  const res = await upsertUsersAction([{ id: 'u-1', employeeCode: 'NV01', role: 'Employee', teamId: 'T1', subleaderId: 'sl-1' }]);
  assert.equal(res.success, false);
  assert.match(res.error || '', /Lỗi lưu hàng loạt nhân viên/,
    'lỗi RPC khác vẫn dùng fallback chung (mapping chỉ dành cho no-active-period)');
}

// --- UX-1: source contract — import catch phải toast message thật ---
const clientSource = fs.readFileSync(path.join(projectRoot, 'src/components/employees/EmployeesClient.tsx'), 'utf8');
const catchIdx = clientSource.indexOf("console.error('Import process error:', error);");
assert.ok(catchIdx > 0, 'import catch found');
const catchChunk = clientSource.slice(catchIdx, catchIdx + 400);
assert.match(catchChunk, /error instanceof Error && error\.message \? error\.message :/,
  'toast dùng error.message thật với fallback chung');
assert.doesNotMatch(catchChunk, /toast\('Lỗi khi xử lý file import\.', 'error'\);\s*\n\s*\} finally/,
  'không còn nhánh chỉ-toast-câu-chung-chung');

console.log('P110M7T01 import UX messages: ALL PASS');
