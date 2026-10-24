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
// P110M3T01 — default-password seed warnings must reach the user. The server
// action returns { success: true, warning } when personnel saved but seeding
// the default password failed; the batch hook must carry the warning out and
// BOTH save paths (Excel import + single/modal save) must surface it as a
// warning toast instead of showing pure success.
// ============================================================================

const hookPath = path.join(projectRoot, 'src/hooks/use-db.ts');
const clientPath = path.join(projectRoot, 'src/components/employees/EmployeesClient.tsx');
const hookSource = fs.readFileSync(hookPath, 'utf8');
const clientSource = fs.readFileSync(clientPath, 'utf8');

// ---------------------------------------------------------------------------
// Part 1 — behavioral: drive the REAL useBatchUpsertUsers mutationFn with a
// stubbed upsertUsersAction and a stubbed react-query, exactly as the app calls it.
// ---------------------------------------------------------------------------
const hookTranspiled = ts.transpileModule(hookSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadHookModule(actionResult) {
  const captured = {};
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === '@tanstack/react-query') {
      return {
        useQuery: () => ({}),
        useQueryClient: () => ({ invalidateQueries: () => {}, cancelQueries: async () => {} }),
        useMutation: (config) => {
          captured.mutationConfig = config;
          return { mutateAsync: config.mutationFn, mutate: () => {}, reset: () => {} };
        },
      };
    }
    if (id === 'react') {
      return {
        useEffect: () => {},
        useRef: (initial) => ({ current: initial }),
        useContext: () => ({ user: { id: 'u-1', role: 'Manager' } }),
        useState: () => [null, () => {}],
      };
    }
    if (id === '@/contexts/AuthContext') {
      return { useAuth: () => ({ user: { id: 'u-1', role: 'Manager' } }) };
    }
    if (id === '@/actions/users') {
      return {
        deleteUserAction: async () => ({}),
        upsertUserAction: async () => ({}),
        upsertUsersAction: async () => actionResult,
      };
    }
    if (id === '@/actions/read') return new Proxy({}, { get: () => async () => ({}) });
    if (id === '@/actions/teams') return new Proxy({}, { get: () => async () => ({}) });
    if (id === '@/actions/criteria') return new Proxy({}, { get: () => async () => ({}) });
    if (id === '@/actions/period') return new Proxy({}, { get: () => async () => ({}) });
    if (id === '@/lib/db/users-admin') return {};
    if (id === '@/types') return {};
    return require(id);
  };
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', hookTranspiled)(mod.exports, customRequire, mod);
  return { module: mod.exports, captured };
}

// 1a. success + warning → mutateAsync resolves carrying the warning
{
  const WARNING = 'Không thể đặt mật khẩu mặc định cho 1 nhân viên (ID: x). Quản lý có thể đặt lại mật khẩu thủ công.';
  const { module: hookModule } = loadHookModule({
    success: true,
    users: [{ id: 'u-9', employeeCode: 'NV9', name: 'NV 9' }],
    warning: WARNING,
  });
  const hook = hookModule.useBatchUpsertUsers();
  assert.equal(typeof hook.mutateAsync, 'function', 'hook exposes mutateAsync');
  const result = await hook.mutateAsync([{ id: 'u-9', employeeCode: 'NV9' }]);
  assert.ok(Array.isArray(result.users) && result.users.length === 1, 'users payload preserved');
  assert.equal(result.warning, WARNING, 'mutation result must carry the server warning');
}

// 1b. success without warning → warning field is undefined (no false alarm)
{
  const { module: hookModule } = loadHookModule({ success: true, users: [], warning: undefined });
  const result = await hookModule.useBatchUpsertUsers().mutateAsync([]);
  assert.equal(result.warning, undefined);
}

// 1c. failure → still throws (existing error contract unchanged)
{
  const { module: hookModule } = loadHookModule({ success: false, users: [], error: 'Lỗi import' });
  await assert.rejects(
    () => hookModule.useBatchUpsertUsers().mutateAsync([]),
    /Lỗi import/,
    'failure path must keep throwing the action error',
  );
}

// ---------------------------------------------------------------------------
// Part 2 — source contracts: both UI save paths surface the warning toast.
// ---------------------------------------------------------------------------

// 2a. Excel import flow: takes the hook result, keeps the success toast, and
// adds a warning toast when the server reported a seed failure.
const importChunk = clientSource.slice(
  clientSource.indexOf('const upsertResult = await batchUpsertUsers(payloads);'),
  clientSource.indexOf('if (result.errors.length > 0)'),
);
assert.ok(importChunk.length > 0, 'import flow chunk found');
assert.match(importChunk, /toast\(`Đã import thành công \$\{payloads\.length\} nhân viên\.`, 'success'\)/,
  'success toast remains');
assert.match(importChunk, /if \(upsertResult\.warning\) \{\s*\n\s*toast\(upsertResult\.warning, 'warning'\);/,
  'import flow must toast the seed warning');

// 2b. Single/modal save: warning toast right after the success branch begins.
const saveChunk = clientSource.slice(
  clientSource.indexOf('const result = await upsertUserAction(payload);'),
  clientSource.indexOf('} catch (err) {', clientSource.indexOf('const result = await upsertUserAction(payload);')),
);
assert.ok(saveChunk.length > 0, 'single-save chunk found');
assert.match(saveChunk, /if \(result\.success\) \{\s*\n\s*toast\('Cập nhật nhân viên thành công!', 'success'\);/,
  'success toast remains');
assert.match(saveChunk, /if \(result\.warning\) \{\s*\n\s*toast\(result\.warning, 'warning'\);/,
  'single save must toast the seed warning');

// 2c. The import flow is the sole batch caller and its call result is consumed.
assert.equal((clientSource.match(/batchUpsertUsers\(/g) || []).length, 1,
  'exactly one awaited batchUpsertUsers call site');
assert.match(clientSource, /const upsertResult = await batchUpsertUsers\(payloads\);/,
  'the call result must be captured (not fire-and-forget)');

console.log('P110M3T01 employee seed-warning surfacing: ALL PASS');
