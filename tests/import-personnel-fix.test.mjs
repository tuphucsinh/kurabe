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
// P110M3T02 — Excel import personnel fixes (audit P1-1 / P1-2), behavioral on
// the REAL transpiled upsertUsersAction with stubbed boundaries:
//   P1-1: rows updating an employee beyond the client's 20-row code map must be
//         resolved by employee_code against the full active roster (the client
//         sends a random UUID) — update semantics, no duplicate-code INSERT.
//   P1-2: new Employee/Worker rows (the Excel file has no SubLeader column)
//         must auto-assign the team's unique active SubLeader; ambiguous/zero
//         candidates fail the WHOLE batch before any write, naming the codes.
// ============================================================================

const usersPath = path.join(projectRoot, 'src/actions/users.ts');
const usersTranspiled = ts.transpileModule(fs.readFileSync(usersPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const S = {
  rosterRows: [],           // active users: {id, employee_code, role, team_id, is_active}
  existingById: [],         // rows returned by .select('id').in('id', [...])
  rpcCalls: [],
  rpcResult: null,
  seedCalls: [],
  auditCalls: [],
};

function loadUsersModule() {
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
            let filters = [];
            let selectCols = null;
            const builder = {
              select(cols) { selectCols = cols; return builder; },
              eq(col, val) { filters.push([col, val]); return builder; },
              in(col, vals) { filters.push([col, vals]); return builder; },
              async maybeSingle() {
                const rows = applyFilters(S.existingById);
                return { data: rows[0] ?? null, error: null };
              },
              then(resolve) {
                // List terminal: supabase-js resolves { data, error }; route by select shape.
                const done = (rows) => resolve({ data: rows, error: null });
                if (selectCols === 'id') return done(applyFilters(S.existingById));
                if (selectCols && selectCols.includes('employee_code')) {
                  return done(applyFilters(S.rosterRows).map((r) => ({
                    id: r.id, employee_code: r.employee_code, role: r.role, team_id: r.team_id,
                  })));
                }
                return done(applyFilters(S.rosterRows));
              },
            };
            function applyFilters(source) {
              return source.filter((row) => filters.every(([col, val]) =>
                Array.isArray(val) ? val.includes(row[col]) : row[col] === val));
            }
            return builder;
          },
        },
      };
    }
    if (id === '@/lib/db/evaluations-write') {
      return {
        applyPersonnelTransaction: async (payloads, team, actorId) => {
          S.rpcCalls.push({ payloads, actorId });
          if (S.rpcResult) return S.rpcResult;
          const users = payloads.map((p) => ({
            id: p.id, employee_code: p.employee_code, name: p.name, role: p.role,
            team_id: p.team_id, subleader_id: p.subleader_id, is_active: p.is_active ?? true,
          }));
          return { data: { users, initialized_users: users.length, team: null, active_period_id: null }, error: null };
        },
      };
    }
    if (id === '@/lib/audit') {
      return {
        logAudit: async (...a) => { S.auditCalls.push(a); return { ok: true }; },
        logAuditBatch: async (...a) => { S.auditCalls.push(a); return { ok: true }; },
      };
    }
    if (id === '@/lib/db/password-seed') {
      return { seedDefaultPasswords: async (ids) => { S.seedCalls.push([...ids]); return { seeded: ids, failed: [] }; } };
    }
    if (id === '@/lib/errors') return { toClientError: (err, fallback) => String(err?.message || fallback || err) };
    if (id === '@/lib/db/users') return { mapUserFromDb: (row) => row };
    if (id === '@/lib/db/teams-admin') return { getLeaderTeamIds: async () => [] };
    if (id === '@/types' || id === '@/types/database') return {};
    return require(id);
  };
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', usersTranspiled)(mod.exports, customRequire, mod);
  return mod.exports;
}

const { upsertUsersAction } = loadUsersModule();

function reset() {
  S.rosterRows = []; S.existingById = []; S.rpcCalls = []; S.rpcResult = null;
  S.seedCalls = []; S.auditCalls = [];
}

// --- 1. P1-1: update a user beyond the client's 20-row map (client sent a random UUID) ---
{
  reset();
  S.rosterRows = [
    { id: 'real-aud009', employee_code: 'AUD009', role: 'Employee', team_id: 'T1', is_active: true },
    { id: 'sl-1', employee_code: 'SLD1', role: 'SubLeader', team_id: 'T1', is_active: true },
  ];
  S.existingById = []; // client ids are random UUIDs -> nothing matches by id

  const res = await upsertUsersAction([
    { id: 'client-random-uuid', employeeCode: 'AUD009', name: 'AUD 9 ĐÃ CẬP NHẬT', role: 'Employee', teamId: 'T1' },
  ]);
  assert.equal(res.success, true, 'import must succeed');
  assert.equal(S.rpcCalls.length, 1);
  const payload = S.rpcCalls[0].payloads[0];
  assert.equal(payload.id, 'real-aud009', 'code match must override the client UUID with the real id');
  assert.equal(payload.is_active, undefined, 'matched row is an UPDATE — no is_active default injected');
  assert.equal(payload.name, 'AUD 9 ĐÃ CẬP NHẬT');
  assert.deepEqual(S.seedCalls, [], 'no password seeding for an existing (code-matched) user');
  assert.ok(S.auditCalls.length >= 1 && JSON.stringify(S.auditCalls).includes('UPDATE_USER'),
    'audit labels the code-matched row as UPDATE_USER');
}

// --- 2. P1-1 (control): a genuinely new code keeps new-user semantics ---
{
  reset();
  S.rosterRows = [{ id: 'sl-1', employee_code: 'SLD1', role: 'SubLeader', team_id: 'T1', is_active: true }];
  const res = await upsertUsersAction([
    { id: 'fresh-uuid', employeeCode: 'NEW001', name: 'Mới', role: 'Employee', teamId: 'T1' },
  ]);
  assert.equal(res.success, true);
  const payload = S.rpcCalls[0].payloads[0];
  assert.equal(payload.id, 'fresh-uuid');
  assert.equal(payload.is_active, true, 'new row keeps is_active default');
  assert.deepEqual(S.seedCalls, [['fresh-uuid']], 'new row is seeded');
}

// --- 3. P1-2: new Employee auto-assigns the team's UNIQUE active SubLeader ---
{
  reset();
  S.rosterRows = [
    { id: 'sl-1', employee_code: 'SLD1', role: 'SubLeader', team_id: 'T1', is_active: true },
  ];
  const res = await upsertUsersAction([
    { id: 'u-2', employeeCode: 'NEW002', name: 'NV mới', role: 'Employee', teamId: 'T1' },
    { id: 'u-3', employeeCode: 'NEW003', name: 'CN mới', role: 'Worker', teamId: 'T1' },
  ]);
  assert.equal(res.success, true, 'import of new Employee/Worker must succeed with a unique SubLeader');
  assert.equal(S.rpcCalls[0].payloads[0].subleader_id, 'sl-1', 'Employee round-1 subleader auto-assigned');
  assert.equal(S.rpcCalls[0].payloads[1].subleader_id, 'sl-1', 'Worker round-1 subleader auto-assigned');
}

// --- 4. P1-2 (ambiguous): two SubLeaders in the team -> whole batch fails BEFORE any write ---
{
  reset();
  S.rosterRows = [
    { id: 'sl-1', employee_code: 'SLD1', role: 'SubLeader', team_id: 'T1', is_active: true },
    { id: 'sl-2', employee_code: 'SLD2', role: 'SubLeader', team_id: 'T1', is_active: true },
  ];
  const res = await upsertUsersAction([
    { id: 'u-9', employeeCode: 'AMB001', name: 'Mơ hồ', role: 'Employee', teamId: 'T1' },
  ]);
  assert.equal(res.success, false, 'ambiguous subleader must fail the import');
  assert.match(res.error || '', /AMB001/, 'error names the offending employee code');
  assert.match(res.error || '', /SubLeader/, 'error explains the SubLeader requirement');
  assert.equal(S.rpcCalls.length, 0, 'no write may happen when the batch fails');
}

// --- 5. P1-2 (zero subleaders): same fail-closed-before-write behavior ---
{
  reset();
  S.rosterRows = [];
  const res = await upsertUsersAction([
    { id: 'u-10', employeeCode: 'NONE001', name: 'Không có SL', role: 'Worker', teamId: 'T1' },
  ]);
  assert.equal(res.success, false);
  assert.match(res.error || '', /NONE001/);
  assert.equal(S.rpcCalls.length, 0);
}

// --- 6. Rows without a team (not an import shape) keep the legacy passthrough ---
{
  reset();
  S.rosterRows = [];
  const res = await upsertUsersAction([
    { id: 'u-11', employeeCode: 'NOTEAM', name: 'Không nhóm', role: 'Employee' },
  ]);
  assert.equal(res.success, true, 'no-teamId rows are not subleader-validated (parseEmployeeExcel enforces teams)');
  assert.equal(S.rpcCalls.length, 1);
}

// --- 7. Case-insensitive code matching (client lowercased both sides) ---
{
  reset();
  S.rosterRows = [{ id: 'real-x', employee_code: 'MiXeDcAsE', role: 'Employee', team_id: 'T1', is_active: true }];
  const res = await upsertUsersAction([
    { id: 'rnd', employeeCode: 'mixedcase', name: 'Khớp hoa thường', role: 'Employee', teamId: 'T1' },
  ]);
  assert.equal(res.success, true);
  assert.equal(S.rpcCalls[0].payloads[0].id, 'real-x', 'code matching is case-insensitive');
}

console.log('P110M3T02 import personnel fixes: ALL PASS');
