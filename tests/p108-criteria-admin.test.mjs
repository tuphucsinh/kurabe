#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

console.log('=== P108 Criteria Admin Contract & Action Tests ===\n');

// -----------------------------------------------------------------------------
// 1. Static Contract & Source Boundary Assertions
// -----------------------------------------------------------------------------
console.log('[Test 1] Verifying source boundaries and server action exports...');

const actionsCriteriaPath = path.join(projectRoot, 'src/actions/criteria.ts');
const hooksUseDbPath = path.join(projectRoot, 'src/hooks/use-db.ts');
const pageCriteriaPath = path.join(projectRoot, 'src/app/criteria/page.tsx');
const modalCriteriaPath = path.join(projectRoot, 'src/components/modals/CriteriaModal.tsx');
const modalGroupPath = path.join(projectRoot, 'src/components/modals/CriteriaGroupModal.tsx');
const gradeBandsTabPath = path.join(projectRoot, 'src/components/settings/GradeBandsTab.tsx');

assert.ok(fs.existsSync(actionsCriteriaPath), 'src/actions/criteria.ts must exist');
assert.ok(fs.existsSync(hooksUseDbPath), 'src/hooks/use-db.ts must exist');
assert.ok(fs.existsSync(pageCriteriaPath), 'src/app/criteria/page.tsx must exist');
assert.ok(fs.existsSync(modalCriteriaPath), 'src/components/modals/CriteriaModal.tsx must exist');
assert.ok(fs.existsSync(modalGroupPath), 'src/components/modals/CriteriaGroupModal.tsx must exist');
assert.ok(fs.existsSync(gradeBandsTabPath), 'src/components/settings/GradeBandsTab.tsx must exist');

const actionsContent = fs.readFileSync(actionsCriteriaPath, 'utf8');
const hooksContent = fs.readFileSync(hooksUseDbPath, 'utf8');
const pageContent = fs.readFileSync(pageCriteriaPath, 'utf8');
const modalContent = fs.readFileSync(modalCriteriaPath, 'utf8');
const modalGroupContent = fs.readFileSync(modalGroupPath, 'utf8');
const gradeBandsContent = fs.readFileSync(gradeBandsTabPath, 'utf8');

// 1.1 updateCriterionAudiencesAction MUST NOT exist anywhere in owned files
assert.doesNotMatch(
  actionsContent,
  /updateCriterionAudiencesAction/,
  'actions/criteria.ts must not contain updateCriterionAudiencesAction'
);
assert.doesNotMatch(
  hooksContent,
  /updateCriterionAudiencesAction/,
  'use-db.ts must not import updateCriterionAudiencesAction'
);
assert.doesNotMatch(
  hooksContent,
  /useUpdateCriterionAudiences/,
  'use-db.ts must not export useUpdateCriterionAudiences'
);
assert.doesNotMatch(
  pageContent,
  /useUpdateCriterionAudiences/,
  'criteria/page.tsx must not use useUpdateCriterionAudiences'
);
assert.doesNotMatch(
  pageContent,
  /handleToggleAudience/,
  'criteria/page.tsx must not contain audience toggle handler'
);

// 1.2 No audience checkbox UI in CriteriaModal.tsx
assert.doesNotMatch(
  modalContent,
  /type="checkbox"/,
  'CriteriaModal.tsx must not contain audience checkbox inputs'
);
assert.doesNotMatch(
  modalContent,
  /AUDIENCE_OPTIONS/,
  'CriteriaModal.tsx must not define AUDIENCE_OPTIONS'
);

// 1.3 Next.js Server Action constraints: mapCriteriaError must NOT be an exported value
assert.doesNotMatch(
  actionsContent,
  /export\s+(?:async\s+)?function\s+mapCriteriaError/,
  'actions/criteria.ts must NOT export mapCriteriaError (Server Actions must be async functions)'
);

// 1.4 Must export only async function server actions in actions/criteria.ts
assert.match(
  actionsContent,
  /export\s+async\s+function\s+getCriteriaEditStateAction/,
  'actions/criteria.ts must export async function getCriteriaEditStateAction'
);
assert.match(
  actionsContent,
  /export\s+async\s+function\s+upsertCriteriaGroupAction/,
  'actions/criteria.ts must export async function upsertCriteriaGroupAction'
);
assert.match(
  actionsContent,
  /export\s+async\s+function\s+upsertCriterionAction/,
  'actions/criteria.ts must export async function upsertCriterionAction'
);
assert.match(
  actionsContent,
  /export\s+async\s+function\s+updateDefaultLevelAction/,
  'actions/criteria.ts must export async function updateDefaultLevelAction'
);
assert.match(
  actionsContent,
  /export\s+async\s+function\s+deleteCriteriaGroupAction/,
  'actions/criteria.ts must export async function deleteCriteriaGroupAction'
);
assert.match(
  actionsContent,
  /export\s+async\s+function\s+deleteCriterionAction/,
  'actions/criteria.ts must export async function deleteCriterionAction'
);
assert.match(
  hooksContent,
  /export\s+const\s+useCriteriaEditState/,
  'hooks/use-db.ts must export useCriteriaEditState'
);

// 1.5 Criteria page must have 3 set tabs, UUID keys, and per-set maximum
assert.match(pageContent, /SET_TABS/, 'criteria/page.tsx must define SET_TABS');
assert.match(pageContent, /activeSetKey/, 'criteria/page.tsx must track activeSetKey');
assert.match(pageContent, /criteriaSummaryBySet/, 'criteria/page.tsx must compute criteriaSummaryBySet');
assert.match(pageContent, /key={group\.id}/, 'criteria/page.tsx must key groups by group.id UUID');
assert.match(pageContent, /key={criterion\.id}/, 'criteria/page.tsx must key criteria by criterion.id UUID');

// 1.6 Modals must enforce unchanged Save disabled
assert.match(modalContent, /isFormChanged/, 'CriteriaModal.tsx must track isFormChanged');
assert.match(modalGroupContent, /isChanged/, 'CriteriaGroupModal.tsx must track isChanged');

// 1.7 Stable test attributes and IDs for reliable automation
assert.match(pageContent, /data-criteria-set-tab/, 'criteria/page.tsx must define data-criteria-set-tab');
assert.match(pageContent, /data-criteria-group-id/, 'criteria/page.tsx must define data-criteria-group-id');
assert.match(pageContent, /data-criterion-id/, 'criteria/page.tsx must define data-criterion-id');
assert.match(pageContent, /data-criterion-set/, 'criteria/page.tsx must define data-criterion-set');
assert.match(modalContent, /id="criteria-group"/, 'CriteriaModal.tsx must have id="criteria-group"');
assert.match(modalContent, /id="criteria-code-suffix"/, 'CriteriaModal.tsx must have id="criteria-code-suffix"');
assert.match(modalContent, /id="criteria-name"/, 'CriteriaModal.tsx must have id="criteria-name"');
assert.match(modalContent, /id=\{`criteria-level-label-\$\{idx\}`\}/, 'CriteriaModal.tsx must have criteria-level-label id');

console.log('PASS: Static contract and boundary assertions verified.\n');

// -----------------------------------------------------------------------------
// Helper: Transpile and Load Actual Server Actions with Local Evaluator
// -----------------------------------------------------------------------------
function hashJson(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function makeFixtureConfig() {
  return {
    version: 1,
    version_id: '00000000-0000-4000-8000-000000000001',
    checksum: 'mock-checksum',
    group_count: 3,
    criterion_count: 3,
    level_count: 6,
    audience_count: 3,
    groups: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        set_key: 'leader',
        code: 'A',
        name: 'Leader Group A',
        short_name: 'LG A',
        sort_order: 0,
        criteria: [
          {
            id: '11000000-0000-4000-8000-000000000001',
            group_id: '10000000-0000-4000-8000-000000000001',
            set_key: 'leader',
            code: 'A1',
            name: 'Leader Crit 1',
            description: 'Leader Desc 1',
            applies_to: 'management',
            audiences: ['management'],
            weight: 10,
            default_level_index: 0,
            sort_order: 0,
            levels: [
              { id: '11100000-0000-4000-8000-000000000001', points: 10, label: 'Level 1', sort_order: 0 },
              { id: '11100000-0000-4000-8000-000000000002', points: 20, label: 'Level 2', sort_order: 1 },
            ],
          },
        ],
      },
      {
        id: '20000000-0000-4000-8000-000000000001',
        set_key: 'staff',
        code: 'A',
        name: 'Staff Group A',
        short_name: 'SG A',
        sort_order: 0,
        criteria: [
          {
            id: '21000000-0000-4000-8000-000000000001',
            group_id: '20000000-0000-4000-8000-000000000001',
            set_key: 'staff',
            code: 'A1',
            name: 'Staff Crit 1',
            description: 'Staff Desc',
            applies_to: 'employee',
            audiences: ['employee'],
            weight: 20,
            default_level_index: 1,
            sort_order: 0,
            levels: [
              { id: '21100000-0000-4000-8000-000000000001', points: -5, label: 'Penalty', sort_order: 0 },
              { id: '21100000-0000-4000-8000-000000000002', points: 15, label: 'Standard', sort_order: 1 },
            ],
          },
        ],
      },
      {
        id: '30000000-0000-4000-8000-000000000001',
        set_key: 'worker',
        code: 'A',
        name: 'Worker Group A',
        short_name: 'WG A',
        sort_order: 0,
        criteria: [
          {
            id: '31000000-0000-4000-8000-000000000001',
            group_id: '30000000-0000-4000-8000-000000000001',
            set_key: 'worker',
            code: 'A1',
            name: 'Worker Crit 1',
            description: null,
            applies_to: 'worker',
            audiences: ['worker'],
            weight: 0,
            default_level_index: null,
            sort_order: 0,
            levels: [
              { id: '31100000-0000-4000-8000-000000000001', points: 0, label: 'Base', sort_order: 0 },
              { id: '31100000-0000-4000-8000-000000000002', points: 30, label: 'Good', sort_order: 1 },
            ],
          },
        ],
      },
    ],
  };
}

// Compile actual applicability helper to CJS
const applicabilitySource = fs.readFileSync(path.join(projectRoot, 'src/lib/criteria-applicability.ts'), 'utf8');
const applicabilityTranspiled = ts.transpileModule(applicabilitySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const applicabilityModule = { exports: {} };
new Function('exports', 'require', 'module', applicabilityTranspiled)(
  applicabilityModule.exports,
  () => {},
  applicabilityModule
);

// Compile actual lib/errors.ts to CJS
const errorsSource = fs.readFileSync(path.join(projectRoot, 'src/lib/errors.ts'), 'utf8');
const errorsTranspiled = ts.transpileModule(errorsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const errorsModule = { exports: {} };
new Function('exports', 'require', 'module', errorsTranspiled)(
  errorsModule.exports,
  () => {},
  errorsModule
);

// Compile actual actions/criteria.ts to CJS
const actionsSource = fs.readFileSync(actionsCriteriaPath, 'utf8');
const actionsTranspiled = ts.transpileModule(actionsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function createCriteriaActions(dbState, options = {}) {
  const mockAuthUser = options.user || {
    id: '00000000-0000-4000-8000-000000000099',
    role: options.role || 'Manager',
    email: 'manager@example.com',
  };

  const requireAuth = async () => {
    if (options.authError) return { user: null, error: options.authError };
    return { user: mockAuthUser, error: null };
  };

  const requireManager = async () => {
    if (options.managerError) return { user: null, error: options.managerError };
    if (mockAuthUser.role !== 'Manager') return { user: null, error: 'Forbidden' };
    return { user: mockAuthUser, error: null };
  };

  const revalidatePath = (p) => {
    dbState.revalidatedPaths = dbState.revalidatedPaths || [];
    dbState.revalidatedPaths.push(p);
  };

  const logAudit = async (user, action, targetType, targetId, details) => {
    dbState.auditLogs = dbState.auditLogs || [];
    dbState.auditLogs.push({ user, action, targetType, targetId, details });
  };

  const mockSupabaseAdmin = {
    rpc: async (name, args) => {
      if (name === 'get_active_criteria_config') {
        if (dbState.getConfigError) return { data: null, error: dbState.getConfigError };
        return { data: JSON.parse(JSON.stringify(dbState.config)), error: null };
      }
      if (name === 'save_criteria_config') {
        dbState.saveCalls = (dbState.saveCalls || 0) + 1;
        dbState.lastSavedPayload = args.p_config;
        dbState.lastExpectedVersion = args.p_expected_version;

        if (dbState.saveConfigError) {
          return { data: null, error: dbState.saveConfigError };
        }
        if (args.p_expected_version !== dbState.config.version) {
          return { data: null, error: { code: 'P0001', message: 'P99M3T02_CONFIG_STALE' } };
        }
        const updated = JSON.parse(JSON.stringify(args.p_config));
        updated.version = dbState.config.version + 1;
        updated.version_id = crypto.randomUUID();
        dbState.config = updated;
        return { data: updated, error: null };
      }
      throw new Error(`Unhandled mock RPC: ${name}`);
    },
    from: (table) => {
      if (table === 'evaluation_periods') {
        return {
          select: () => ({
            eq: () => ({
              limit: async (num) => {
                if (dbState.periodsError) return { data: null, error: dbState.periodsError };
                const active = (dbState.activePeriods || []).filter((p) => p.status === 'active');
                return { data: active.slice(0, num), error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`Unhandled mock table: ${table}`);
    },
  };

  const customRequire = (id) => {
    if (id === '@/lib/supabase-admin') return { supabaseAdmin: mockSupabaseAdmin };
    if (id === '@/lib/auth') return { requireAuth, requireManager };
    if (id === '@/lib/audit') return { logAudit };
    if (id === 'next/cache') return { revalidatePath };
    if (id === '@/lib/errors') return errorsModule.exports;
    if (id === '@/lib/criteria-applicability') return applicabilityModule.exports;
    throw new Error(`Unexpected mock require: ${id}`);
  };

  const actionsModule = { exports: {} };
  new Function('exports', 'require', 'module', actionsTranspiled)(
    actionsModule.exports,
    customRequire,
    actionsModule
  );
  return actionsModule.exports;
}

// -----------------------------------------------------------------------------
// 2. Unit Tests: Manager Auth Refusal
// -----------------------------------------------------------------------------
console.log('[Test 2] (Unit) Testing Manager auth refusal across server actions...');

{
  const dbState = { config: makeFixtureConfig(), saveCalls: 0 };
  const deniedActions = createCriteriaActions(dbState, { managerError: 'Chỉ Quản lý mới có quyền thực hiện thao tác này.' });

  const leaderGroupId = dbState.config.groups[0].id;
  const leaderCritId = dbState.config.groups[0].criteria[0].id;

  const resUpsert = await deniedActions.upsertCriterionAction({ name: 'X' }, leaderGroupId, 1, 'leader');
  assert.equal(resUpsert.success, false);
  assert.equal(resUpsert.error, 'Chỉ Quản lý mới có quyền thực hiện thao tác này.');
  assert.equal(dbState.saveCalls, 0, 'No save RPC calls on upsert auth refusal');

  const resDelCrit = await deniedActions.deleteCriterionAction(leaderCritId, 1, 'leader');
  assert.equal(resDelCrit.success, false);
  assert.equal(resDelCrit.error, 'Chỉ Quản lý mới có quyền thực hiện thao tác này.');
  assert.equal(dbState.saveCalls, 0, 'No save RPC calls on delete criterion auth refusal');

  const resDelGrp = await deniedActions.deleteCriteriaGroupAction(leaderGroupId, 1, 'leader');
  assert.equal(resDelGrp.success, false);
  assert.equal(resDelGrp.error, 'Chỉ Quản lý mới có quyền thực hiện thao tác này.');
  assert.equal(dbState.saveCalls, 0, 'No save RPC calls on delete group auth refusal');

  const resDef = await deniedActions.updateDefaultLevelAction(leaderCritId, 1, 1, 'leader');
  assert.equal(resDef.success, false);
  assert.equal(resDef.error, 'Chỉ Quản lý mới có quyền thực hiện thao tác này.');
  assert.equal(dbState.saveCalls, 0, 'No save RPC calls on update default level auth refusal');
}

console.log('PASS: Manager auth refusal unit tests verified.\n');

// -----------------------------------------------------------------------------
// 3. Unit Tests: Add Leader Criterion & Byte-Identical Other Set Preservation
// -----------------------------------------------------------------------------
console.log('[Test 3] (Unit) Testing real upsertCriterionAction with set isolation & byte preservation...');

{
  const dbState = { config: makeFixtureConfig(), saveCalls: 0 };
  const staffHashBefore = hashJson(dbState.config.groups[1]);
  const workerHashBefore = hashJson(dbState.config.groups[2]);
  const leaderGroupId = dbState.config.groups[0].id;

  const actions = createCriteriaActions(dbState);
  const result = await actions.upsertCriterionAction(
    {
      code: 'A2',
      name: 'Leader Crit 2',
      description: 'Second criterion in leader set',
      levels: [
        { points: 5, label: 'Pass' },
      ],
    },
    leaderGroupId,
    1,
    'leader'
  );

  assert.equal(result.success, true, `upsertCriterionAction failed: ${result.error}`);
  assert.equal(dbState.saveCalls, 1, 'Exactly one save RPC call must occur');

  // Verify captured save_criteria_config payload
  const savedPayload = dbState.lastSavedPayload;
  assert.ok(savedPayload && Array.isArray(savedPayload.groups), 'Saved payload must contain groups array');

  const savedStaff = savedPayload.groups.find((g) => g.set_key === 'staff');
  const savedWorker = savedPayload.groups.find((g) => g.set_key === 'worker');

  assert.equal(hashJson(savedStaff), staffHashBefore, 'Staff group payload must remain byte-identical');
  assert.equal(hashJson(savedWorker), workerHashBefore, 'Worker group payload must remain byte-identical');
  assert.deepEqual(savedStaff, makeFixtureConfig().groups[1], 'Staff group object must match original exactly');
  assert.deepEqual(savedWorker, makeFixtureConfig().groups[2], 'Worker group object must match original exactly');

  // Check retained values in other sets (negative points, default level index)
  assert.equal(savedStaff.criteria[0].levels[0].points, -5, 'Negative points in Staff must be preserved');
  assert.equal(savedStaff.criteria[0].default_level_index, 1, 'Default level index in Staff must be preserved');

  // Check newly added Leader criterion
  const savedLeader = savedPayload.groups.find((g) => g.set_key === 'leader');
  const newCrit = savedLeader.criteria.find((c) => c.code === 'A2');
  assert.ok(newCrit, 'New criterion A2 must exist in saved Leader group');
  assert.equal(newCrit.set_key, 'leader', 'set_key must be propagated to leader');
  assert.equal(newCrit.applies_to, 'management', 'applies_to must be derived to management');
  assert.deepEqual(newCrit.audiences, ['management'], 'audiences must be derived to [management]');
}

console.log('PASS: Real action upsert and byte-identical other-set preservation verified.\n');

// -----------------------------------------------------------------------------
// 4. Unit Tests: Cross-Set Rejections & Immutable UUID Invariants
// -----------------------------------------------------------------------------
console.log('[Test 4] (Unit) Testing cross-set rejections via actual server actions...');

{
  const dbState = { config: makeFixtureConfig(), saveCalls: 0 };
  const actions = createCriteriaActions(dbState);

  const leaderGroupId = dbState.config.groups[0].id;
  const leaderCritId = dbState.config.groups[0].criteria[0].id;
  const staffGroupId = dbState.config.groups[1].id;

  // 4.1 Mismatched set/group: Leader criterion into Staff group with expectedSetKey='leader'
  dbState.saveCalls = 0;
  const r1 = await actions.upsertCriterionAction({ name: 'Forged' }, staffGroupId, 1, 'leader');
  assert.equal(r1.success, false);
  assert.match(r1.error, /Nhóm tiêu chí không thuộc bộ tiêu chí chỉ định/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on mismatched expectedSetKey');

  // 4.2 Criterion setKey mismatch with group
  dbState.saveCalls = 0;
  const r2 = await actions.upsertCriterionAction({ name: 'Forged', setKey: 'leader' }, staffGroupId, 1);
  assert.equal(r2.success, false);
  assert.match(r2.error, /Bộ tiêu chí của tiêu chí không khớp với nhóm tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on mismatched criterion setKey');

  // 4.3 Move existing Leader criterion UUID to Staff group
  dbState.saveCalls = 0;
  const r3 = await actions.upsertCriterionAction({ id: leaderCritId, name: 'Moved' }, staffGroupId, 1);
  assert.equal(r3.success, false);
  assert.match(r3.error, /Không thể chuyển nhóm hoặc tiêu chí sang bộ tiêu chí khác/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on cross-set UUID move');

  // 4.4 Delete criterion cross-set check
  dbState.saveCalls = 0;
  const r4 = await actions.deleteCriterionAction(leaderCritId, 1, 'staff');
  assert.equal(r4.success, false);
  assert.match(r4.error, /Tiêu chí không thuộc bộ tiêu chí chỉ định/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on cross-set delete criterion');

  // 4.5 Delete group cross-set check
  dbState.saveCalls = 0;
  const r5 = await actions.deleteCriteriaGroupAction(leaderGroupId, 1, 'staff');
  assert.equal(r5.success, false);
  assert.match(r5.error, /Nhóm tiêu chí không thuộc bộ tiêu chí chỉ định/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on cross-set delete group');

  // 4.6 Cross-set default-level update
  dbState.saveCalls = 0;
  const r6 = await actions.updateDefaultLevelAction(leaderCritId, 1, 1, 'staff');
  assert.equal(r6.success, false);
  assert.match(r6.error, /Tiêu chí không thuộc bộ tiêu chí chỉ định/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on cross-set update default level');

  // 4.7 Required expectedSetKey check (omitted or invalid)
  dbState.saveCalls = 0;
  const r7 = await actions.deleteCriterionAction(leaderCritId, 1, undefined);
  assert.equal(r7.success, false);
  assert.match(r7.error, /Bộ tiêu chí không hợp lệ hoặc chưa được chỉ định/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on omitted expectedSetKey');
}

console.log('PASS: Actual cross-set rejections and immutable UUID invariants verified.\n');

// -----------------------------------------------------------------------------
// 5. Unit Tests: Default-Level Update Short-Circuit & Nonempty Config Rule
// -----------------------------------------------------------------------------
console.log('[Test 5] (Unit) Testing default-level short-circuit (zero save calls) and nonempty rule...');

{
  const dbState = { config: makeFixtureConfig(), saveCalls: 0 };
  const actions = createCriteriaActions(dbState);
  const leaderCritId = dbState.config.groups[0].criteria[0].id;
  const leaderGroupId = dbState.config.groups[0].id;

  // 5.1 Same default level index: MUST short-circuit save RPC (0 save calls)
  dbState.saveCalls = 0;
  const noopResult = await actions.updateDefaultLevelAction(leaderCritId, 0, 1, 'leader');
  assert.equal(noopResult.success, true);
  assert.equal(dbState.saveCalls, 0, 'updateDefaultLevelAction must make 0 save calls when default level unchanged');

  // 5.2 Different default level index: MUST execute save RPC (1 save call)
  dbState.saveCalls = 0;
  const changeResult = await actions.updateDefaultLevelAction(leaderCritId, 1, 1, 'leader');
  assert.equal(changeResult.success, true);
  assert.equal(dbState.saveCalls, 1, 'updateDefaultLevelAction must make 1 save call when default level changes');
  assert.equal(dbState.lastSavedPayload.groups[0].criteria[0].default_level_index, 1, 'default_level_index must be updated');

  // 5.3 Global nonempty config rule: deleting last remaining group in config must be refused
  dbState.config.groups = [dbState.config.groups[0]]; // Only 1 group left in entire config
  dbState.saveCalls = 0;
  const delLastGrp = await actions.deleteCriteriaGroupAction(leaderGroupId, dbState.config.version, 'leader');
  assert.equal(delLastGrp.success, false);
  assert.match(delLastGrp.error, /Phải giữ lại ít nhất một nhóm tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls when deleting last group');
}

console.log('PASS: Default-level short-circuit and global nonempty config rule verified.\n');

// -----------------------------------------------------------------------------
// 6. Unit Tests: Legacy Catalog Denial & Clearing Description Handling
// -----------------------------------------------------------------------------
console.log('[Test 6] (Unit) Testing legacy catalog save denial and clearing description...');

{
  const dbState = {
    config: {
      version: 1,
      version_id: crypto.randomUUID(),
      groups: [
        { id: 'uuid-1', set_key: null, code: 'A', name: 'Legacy Group', criteria: [] },
      ],
    },
    saveCalls: 0,
  };
  const actions = createCriteriaActions(dbState);

  // 6.1 Legacy catalog save refusal on upsert
  const legUpsert = await actions.upsertCriterionAction({ name: 'Crit' }, 'uuid-1', 1, 'leader');
  assert.equal(legUpsert.success, false);
  assert.match(legUpsert.error, /Danh mục tiêu chuẩn cũ chưa phân bổ theo bộ tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls when catalog is legacy');

  // 6.2 Legacy catalog save refusal on delete
  const legDel = await actions.deleteCriteriaGroupAction('uuid-1', 1, 'leader');
  assert.equal(legDel.success, false);
  assert.match(legDel.error, /Danh mục tiêu chuẩn cũ chưa phân bổ theo bộ tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls when deleting from legacy catalog');
}

{
  // 6.3 Clearing description sends explicit empty string/null and persists null
  const dbState = { config: makeFixtureConfig(), saveCalls: 0 };
  const actions = createCriteriaActions(dbState);
  const leaderGroupId = dbState.config.groups[0].id;
  const leaderCritId = dbState.config.groups[0].criteria[0].id;

  assert.equal(dbState.config.groups[0].criteria[0].description, 'Leader Desc 1');

  const clearRes = await actions.upsertCriterionAction(
    {
      id: leaderCritId,
      name: 'Leader Crit 1',
      description: '', // Explicit empty string from cleared UI input
    },
    leaderGroupId,
    1,
    'leader'
  );

  assert.equal(clearRes.success, true);
  assert.equal(dbState.saveCalls, 1);
  const savedCrit = dbState.lastSavedPayload.groups[0].criteria.find((c) => c.id === leaderCritId);
  assert.equal(savedCrit.description, null, 'Clearing description must be persisted as null in config payload');
}

console.log('PASS: Legacy catalog denial and clearing description verified.\n');

// -----------------------------------------------------------------------------
// 7. Unit Tests: P0001 Semantic Active & Stale CAS SQL Errors Mapping
// -----------------------------------------------------------------------------
console.log('[Test 7] (Unit) Testing semantic SQL error mapping for Active period and stale CAS...');

{
  const dbState = { config: makeFixtureConfig(), saveCalls: 0, activePeriods: [] };
  const actions = createCriteriaActions(dbState);
  const leaderGroupId = dbState.config.groups[0].id;
  const leaderCritId = dbState.config.groups[0].criteria[0].id;

  // 7.1 Active period check before mutation
  dbState.activePeriods = [{ id: 'active-p1', name: 'Kỳ 2026', status: 'active' }];
  const activeRes = await actions.upsertCriterionAction({ name: 'Active' }, leaderGroupId, 1, 'leader');
  assert.equal(activeRes.success, false);
  assert.equal(activeRes.error, 'Không thể chỉnh sửa tiêu chuẩn khi đang có kỳ đánh giá đang hoạt động.');
  assert.equal(dbState.saveCalls, 0);

  // Active period also prevents default level update
  const activeDefRes = await actions.updateDefaultLevelAction(leaderCritId, 0, 1, 'leader');
  assert.equal(activeDefRes.success, false);
  assert.equal(activeDefRes.error, 'Không thể chỉnh sửa tiêu chuẩn khi đang có kỳ đánh giá đang hoạt động.');
  assert.equal(dbState.saveCalls, 0);

  dbState.activePeriods = [];

  // 7.2 Stale CAS check: expectedVersion mismatch before save
  const staleRes = await actions.upsertCriterionAction({ name: 'Stale' }, leaderGroupId, 999, 'leader');
  assert.equal(staleRes.success, false);
  assert.equal(staleRes.error, 'Cấu hình tiêu chí đã thay đổi. Vui lòng tải lại trang trước khi lưu.');
  assert.equal(dbState.saveCalls, 0);

  // 7.3 RPC returning P99M3T02_CONFIG_STALE
  dbState.saveConfigError = { code: 'P0001', message: 'P99M3T02_CONFIG_STALE: expected version mismatch' };
  const rpcStale = await actions.upsertCriteriaGroupAction({ code: 'B', name: 'New Group', setKey: 'leader' }, 1);
  assert.equal(rpcStale.success, false);
  assert.equal(rpcStale.error, 'Cấu hình tiêu chí đã thay đổi. Vui lòng tải lại trang trước khi lưu.');
  dbState.saveConfigError = null;

  // 7.4 RPC returning P108_PERIOD_ACTIVE
  dbState.saveConfigError = { code: 'P0001', message: 'P108_PERIOD_ACTIVE: cannot modify while active' };
  const rpcActive = await actions.upsertCriteriaGroupAction({ code: 'C', name: 'New Group C', setKey: 'leader' }, 1);
  assert.equal(rpcActive.success, false);
  assert.equal(rpcActive.error, 'Không thể chỉnh sửa tiêu chuẩn khi đang có kỳ đánh giá đang hoạt động.');
  dbState.saveConfigError = null;
}

console.log('PASS: Semantic Active and Stale SQL error mapping verified.\n');

// -----------------------------------------------------------------------------
// 8. Live Browser Mode (Triggered with --browser)
// -----------------------------------------------------------------------------
const isBrowserMode = process.argv.includes('--browser');

if (isBrowserMode) {
  console.log('[Browser Mode] Executing live CDP browser tests with owned confirmation runtime...');

  const confirmationRuntimeScript = path.join(projectRoot, '.github/ci/confirmation-runtime.mjs');
  const browserHelperPath = path.join(projectRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/browser.mjs');
  const orgHelperPath = path.join(projectRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/org.mjs');

  assert.ok(fs.existsSync(confirmationRuntimeScript), 'confirmation-runtime.mjs must exist');
  assert.ok(fs.existsSync(browserHelperPath), 'browser helper must exist');
  assert.ok(fs.existsSync(orgHelperPath), 'org helper must exist');

  const { launchChromium } = await import(browserHelperPath);
  const { loginAs } = await import(orgHelperPath);

  const runtimeRoot = path.join(projectRoot, '.tmp', `p108-browser-${Date.now()}-${process.pid}`);
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const evidenceDir = path.join(projectRoot, '.tmp', `p108-admin-evidence-${process.pid}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const caseResults = [];
  const recordedScreenshots = [];

  async function waitCondition(predicate, { timeout = 15000, interval = 100, label = 'condition' } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const res = await predicate();
        if (res) return res;
      } catch {}
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`Timed out waiting for ${label} after ${timeout}ms`);
  }

  async function verifySetTabsIsolation(page, runPsql, viewportLabel) {
    for (const setKey of ['leader', 'staff', 'worker']) {
      console.log(`[Browser ${viewportLabel}] Verifying set tab: ${setKey}...`);
      await page.evaluate(`document.querySelector('button[data-criteria-set-tab="${setKey}"]').click()`);
      await page.waitFor(
        `document.querySelector('button[data-criteria-set-tab="${setKey}"][aria-selected="true"]') !== null`,
        { timeout: 10000, label: `set tab ${setKey} active` }
      );

      const dbGroupIds = runPsql(`SELECT id FROM public.criteria_groups WHERE set_key = '${setKey}' ORDER BY sort_order;`)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const dbCritIds = runPsql(`SELECT id FROM public.criteria WHERE set_key = '${setKey}';`)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const renderedGroupIds = await page.evaluate(`(() => {
        const nodes = Array.from(document.querySelectorAll('button[data-criteria-group-id]'));
        return Array.from(new Set(nodes.map(n => n.getAttribute('data-criteria-group-id')).filter(Boolean)));
      })()`);

      assert.ok(renderedGroupIds.length > 0, `Group IDs must be rendered for set ${setKey}`);
      assert.equal(
        renderedGroupIds.length,
        dbGroupIds.length,
        `Rendered group count for ${setKey} must match DB count`
      );
      for (const gid of renderedGroupIds) {
        assert.ok(dbGroupIds.includes(gid), `Rendered group ${gid} must belong to set ${setKey}`);
      }

      const renderedCritIds = await page.evaluate(`(() => {
        const nodes = Array.from(document.querySelectorAll('[data-criterion-id]'));
        return Array.from(new Set(nodes.map(n => n.getAttribute('data-criterion-id')).filter(Boolean)));
      })()`);

      assert.ok(renderedCritIds.length > 0, `Criteria must be rendered for active group in set ${setKey}`);
      for (const cid of renderedCritIds) {
        assert.ok(dbCritIds.includes(cid), `Rendered criterion ${cid} must belong to set ${setKey}`);
      }

      const criterionSets = await page.evaluate(`(() => {
        const nodes = Array.from(document.querySelectorAll('[data-criterion-id]'));
        return Array.from(new Set(nodes.map(n => n.getAttribute('data-criterion-set')).filter(Boolean)));
      })()`);
      assert.deepEqual(criterionSets, [setKey], `Rendered criteria must have data-criterion-set="${setKey}"`);

      const activeHeaderGroupId = await page.evaluate(`(() => {
        const el = document.querySelector('[data-criteria-group-id]:not(button)');
        return el ? el.getAttribute('data-criteria-group-id') : null;
      })()`);
      if (activeHeaderGroupId) {
        assert.ok(dbGroupIds.includes(activeHeaderGroupId), `Active group header ${activeHeaderGroupId} must belong to ${setKey}`);
        const dbGroupCritIds = runPsql(`SELECT id FROM public.criteria WHERE group_id = '${activeHeaderGroupId}';`)
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const cid of renderedCritIds) {
          assert.ok(dbGroupCritIds.includes(cid), `Rendered criterion ${cid} must belong to active group ${activeHeaderGroupId}`);
        }
      }
    }
  }

  async function verifyModalCompositionAndUnchanged(page, runPsql, viewportLabel) {
    console.log(`[Browser ${viewportLabel}] Verifying edit modal composition and unchanged state...`);
    await page.evaluate("document.querySelector('button[data-criteria-set-tab=\"leader\"]').click()");
    await page.waitFor("document.querySelector('button[data-criteria-set-tab=\"leader\"][aria-selected=\"true\"]') !== null", { timeout: 10000, label: 'Leader modal context' });
    await page.evaluate(`document.querySelector('button[data-edit-criterion]')?.click()`);
    await page.waitFor("document.querySelector('#criteria-form') !== null", { timeout: 10000, label: 'edit modal open' });

    const existingName = await page.evaluate("document.getElementById('criteria-name')?.value");
    const existingSuffix = await page.evaluate("document.getElementById('criteria-code-suffix')?.value");
    const existingLevel0 = await page.evaluate("document.getElementById('criteria-level-label-0')?.value");
    assert.ok(existingName && existingName.length > 0, 'Existing criterion name must be loaded');
    assert.ok(existingSuffix && existingSuffix.length > 0, 'Existing criterion code suffix must be loaded');
    assert.ok(existingLevel0 && existingLevel0.length > 0, 'Existing criterion level label must be loaded');

    const saveDisabled = await page.evaluate("document.querySelector('button[form=\"criteria-form\"][type=\"submit\"]')?.disabled");
    assert.equal(saveDisabled, true, 'Save button must be disabled when form is unchanged');

    const modalGroupOptionIds = await page.evaluate("Array.from(document.querySelectorAll('#criteria-group option')).map(o => o.value).sort()");
    const expectedLeaderGroupIds = runPsql("SELECT id FROM public.criteria_groups WHERE set_key = 'leader' ORDER BY id;")
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
    assert.equal(modalGroupOptionIds.length, 6, 'Leader set must show exactly 6 groups');
    assert.deepEqual(modalGroupOptionIds, expectedLeaderGroupIds, 'Modal group options UUID set must equal the 6 expected set groups');

    const modalShot = await page.screenshot(`criteria-modal-${viewportLabel}`, { dir: evidenceDir });
    console.log(`[Browser ${viewportLabel}] Modal screenshot captured: ${modalShot.path}`);
    recordedScreenshots.push({
      label: `criteria-modal-${viewportLabel}`,
      path: modalShot.path,
      sha256: modalShot.sha256,
      viewport: { width: viewportLabel === '390' ? 390 : 1440, height: viewportLabel === '390' ? 844 : 900, mobile: viewportLabel === '390' },
    });

    await page.evaluate(`(() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Hủy');
      if (cancelBtn) cancelBtn.click();
      else document.querySelector('button[aria-label="Đóng"]')?.click();
    })()`);
    await page.waitFor("document.querySelector('#criteria-form') === null", { timeout: 10000, label: 'modal closed' });
  }

  let browser;
  let mainError = null;
  const cleanupErrors = [];

  try {
    console.log(`[Browser Setup] Starting disposable confirmation runtime at ${runtimeRoot}...`);
    const startRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'start'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
      timeout: 120000,
    });
    if (startRes.status !== 0) throw new Error(`confirmation-runtime start failed with code ${startRes.status}`);

    console.log('[Browser Setup] Bootstrapping confirmation runtime...');
    const bootRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'bootstrap'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
      timeout: 120000,
    });
    if (bootRes.status !== 0) throw new Error(`confirmation-runtime bootstrap failed with code ${bootRes.status}`);

    const statePath = path.join(runtimeRoot, 'runtime-state.json');
    assert.ok(fs.existsSync(statePath), 'runtime-state.json must exist');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

    const origin = `http://127.0.0.1:${state.nextPort}`;
    const dbTarget = {
      host: '127.0.0.1',
      port: String(state.dbPort),
      database: state.db,
      user: 'postgres',
      password: state.password,
    };

    function runPsql(sql) {
      const res = spawnSync('psql', [
        '-X', '-h', dbTarget.host, '-p', dbTarget.port, '-U', dbTarget.user, '-d', dbTarget.database,
        '-qAt', '-v', 'ON_ERROR_STOP=1',
      ], {
        cwd: projectRoot,
        input: sql,
        env: { ...process.env, PGPASSWORD: dbTarget.password, PGPASSFILE: '/dev/null' },
        encoding: 'utf8',
        timeout: 30000,
      });
      if (res.status !== 0) throw new Error(`psql error: ${res.stderr || res.stdout}`);
      return String(res.stdout || '').trim();
    }

    runPsql(`
      UPDATE public.users SET is_active = true, password_hash = NULL WHERE employee_code = 'P103-MGR';
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_setup_required') THEN
          UPDATE public.users SET password_setup_required = false WHERE employee_code = 'P103-MGR';
        END IF;
      END $$;
    `);

    console.log('[Browser] Launching Chromium...');
    browser = await launchChromium({ runtimeRoot, headless: true });
    const page = await browser.newPage('criteria-admin');

    console.log(`[Browser] Logging in as Manager (P103-MGR) on ${origin}...`);
    await loginAs(page, origin, 'P103-MGR');

    // 1. Check legacy banner and disabled mutations before import
    console.log('[Browser] Checking /criteria in legacy pre-import state...');
    await page.goto(`${origin}/criteria`);
    await page.waitFor(
      "document.body && document.body.innerText.includes('Danh mục tiêu chuẩn cũ — Chờ nhập dữ liệu (waiting for import)')",
      { timeout: 30000, label: 'legacy waiting for import banner' }
    );
    if (await page.evaluate("document.body && document.body.innerText.includes('Đã xảy ra lỗi khi tải tiêu chuẩn đánh giá')")) {
      throw new Error('Criteria page rendered error screen in legacy state');
    }

    const legacyText = await page.evaluate("document.body.innerText");
    assert.ok(
      legacyText.includes('Danh mục tiêu chuẩn cũ — Chờ nhập dữ liệu (waiting for import)'),
      'Legacy waiting-for-import banner must be visible before import'
    );
    const hasAddBtnLegacy = await page.evaluate("Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Thêm tiêu chuẩn'))");
    assert.equal(hasAddBtnLegacy, false, 'Mutations must be disabled in legacy catalog state');
    caseResults.push({ name: 'legacy-waiting-for-import-banner', status: 'PASS' });

    // 2. Close active periods and run real T04 import script
    console.log('[Browser] Closing active periods and executing T04 import script...');
    runPsql("UPDATE public.evaluation_periods SET status = 'closed';");

    const setKeyCheck = runPsql("SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'criteria' AND column_name = 'set_key';");
    if (setKeyCheck !== '1') {
      const migSql = fs.readFileSync(path.join(projectRoot, 'supabase/migrations/20261017093100_p108_criteria_sets.sql'), 'utf8');
      runPsql(migSql);
    }

    const currentVer = runPsql("SELECT COALESCE(max(version_no)::text, '1') FROM public.criteria_config_versions;");
    const importScript = path.join(projectRoot, 'scripts/p108-import-criteria.mjs');
    const manifestPath = path.join(projectRoot, 'tests/fixtures/p108/synthetic-manifest.json');
    const importRes = spawnSync(process.execPath, [
      importScript,
      '--apply',
      '--expected-version', currentVer,
      '--manifest', manifestPath,
      '--disposable',
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        KURABE_SUPABASE_URL: state.supabaseUrl,
        KURABE_SUPABASE_SERVICE_ROLE_KEY: state.serviceRoleKey,
      },
      encoding: 'utf8',
      timeout: 30000,
    });
    if (importRes.status !== 0) throw new Error(`import script failed: ${importRes.stderr || importRes.stdout}`);
    console.log('[Browser] Criteria import successfully applied.');

    // 3. Test 390x844 viewport (Mobile)
    console.log('[Browser] Testing viewport 390x844 (Mobile)...');
    await page.setViewport(390, 844, { mobile: true });
    await page.goto(`${origin}/criteria`);
    await page.waitFor(
      "document.querySelector('button[data-criteria-group-id]') !== null && Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Thêm tiêu chuẩn'))",
      { timeout: 30000, label: 'canEdit controls and groups rendered mobile' }
    );
    if (await page.evaluate("document.body && document.body.innerText.includes('Đã xảy ra lỗi khi tải tiêu chuẩn đánh giá')")) {
      throw new Error('Criteria page rendered error screen after import at 390x844');
    }

    const overflow390 = await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth");
    assert.equal(overflow390, false, 'Must have no horizontal page overflow at 390x844');

    await verifySetTabsIsolation(page, runPsql, '390');
    caseResults.push({ name: 'three-set-tabs-isolation-390', status: 'PASS' });

    const shot390 = await page.screenshot('criteria-admin-390', { dir: evidenceDir });
    console.log(`[Browser] Mobile screenshot captured: ${shot390.path}`);
    recordedScreenshots.push({
      label: 'criteria-admin-390',
      path: shot390.path,
      sha256: shot390.sha256,
      viewport: { width: 390, height: 844, mobile: true },
    });

    await verifyModalCompositionAndUnchanged(page, runPsql, '390');
    caseResults.push({ name: 'modal-composition-unchanged-390', status: 'PASS' });

    // 4. Test 1440x900 viewport (Desktop)
    console.log('[Browser] Testing viewport 1440x900 (Desktop)...');
    await page.setViewport(1440, 900, { mobile: false });
    await page.goto(`${origin}/criteria`);
    await page.waitFor(
      "document.querySelector('button[data-criteria-group-id]') !== null && Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Thêm tiêu chuẩn'))",
      { timeout: 30000, label: 'canEdit controls and groups rendered desktop' }
    );
    if (await page.evaluate("document.body && document.body.innerText.includes('Đã xảy ra lỗi khi tải tiêu chuẩn đánh giá')")) {
      throw new Error('Criteria page rendered error screen after import at 1440x900');
    }

    const overflow1440 = await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth");
    assert.equal(overflow1440, false, 'Must have no horizontal page overflow at 1440x900');

    await verifySetTabsIsolation(page, runPsql, '1440');
    caseResults.push({ name: 'three-set-tabs-isolation-1440', status: 'PASS' });

    const shot1440 = await page.screenshot('criteria-admin-1440', { dir: evidenceDir });
    console.log(`[Browser] Desktop screenshot captured: ${shot1440.path}`);
    recordedScreenshots.push({
      label: 'criteria-admin-1440',
      path: shot1440.path,
      sha256: shot1440.sha256,
      viewport: { width: 1440, height: 900, mobile: false },
    });

    await verifyModalCompositionAndUnchanged(page, runPsql, '1440');
    caseResults.push({ name: 'modal-composition-unchanged-1440', status: 'PASS' });

    // 5. Client-Side Cross-Set Guard & Leader Criterion Creation (Desktop only)
    console.log('[Browser] Testing CREATE modal, client cross-set guard negative, and addition...');
    await page.evaluate("document.querySelector('button[data-criteria-set-tab=\"leader\"]').click()");
    await page.waitFor("document.querySelector('button[data-criteria-set-tab=\"leader\"][aria-selected=\"true\"]') !== null", { timeout: 10000 });

    await page.clickText('Thêm tiêu chuẩn');
    await page.waitFor("document.querySelector('#criteria-form') !== null", { timeout: 10000, label: 'criteria modal form' });

    const saveDisabledInit = await page.evaluate("document.querySelector('button[form=\"criteria-form\"][type=\"submit\"]')?.disabled");
    assert.equal(saveDisabledInit, true, 'Save button must be disabled initially on create');

    await page.fill('#criteria-code-suffix', '99');
    await page.fill('#criteria-name', 'Leader Criterion Synthetic 99');
    await page.fill('#criteria-level-label-0', 'Mức đạt tiêu chuẩn 99');
    await page.fill('#criteria-level-points-0', '15');

    const saveEnabled = await page.evaluate("document.querySelector('button[form=\"criteria-form\"][type=\"submit\"]')?.disabled");
    assert.equal(saveEnabled, false, 'Save button must be enabled when all required fields are filled');

    // Negative test: append forged other-set option and trigger real React change
    const forgedWorkerGroupRow = runPsql("SELECT id || '|' || code || '|' || name FROM public.criteria_groups WHERE set_key = 'worker' ORDER BY sort_order LIMIT 1;").split('|');
    const [forgedGroupId, , forgedGroupName] = forgedWorkerGroupRow;

    await page.evaluate(`(() => {
      const select = document.getElementById('criteria-group');
      const option = document.createElement('option');
      option.value = '${forgedGroupId}';
      option.textContent = '[FORGED] ' + '${forgedGroupName}';
      select.appendChild(option);
      select.value = '${forgedGroupId}';
      const tracker = select._valueTracker;
      if (tracker) tracker.setValue('');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    const saveDisabledForged = await page.evaluate("document.querySelector('button[form=\"criteria-form\"][type=\"submit\"]')?.disabled");
    assert.equal(saveDisabledForged, true, 'Save button must be disabled when forged group from another set is selected');

    const initialVerBeforeForged = runPsql("SELECT COALESCE(max(version_no)::text, '0') FROM public.criteria_config_versions;");
    const critCountBeforeForged = runPsql("SELECT count(*) FROM public.criteria;");

    await page.submit('#criteria-form');
    await new Promise((r) => setTimeout(r, 600));

    const verAfterForged = runPsql("SELECT COALESCE(max(version_no)::text, '0') FROM public.criteria_config_versions;");
    const critCountAfterForged = runPsql("SELECT count(*) FROM public.criteria;");
    assert.equal(verAfterForged, initialVerBeforeForged, 'Zero DB version change on forged submit');
    assert.equal(critCountAfterForged, critCountBeforeForged, 'Zero DB criteria count change on forged submit');
    caseResults.push({ name: 'client-cross-set-guard-negative', status: 'PASS' });

    // Restore to valid Leader group
    const targetLeaderGroupId = runPsql("SELECT id FROM public.criteria_groups WHERE set_key = 'leader' ORDER BY sort_order LIMIT 1;");
    await page.evaluate(`(() => {
      const select = document.getElementById('criteria-group');
      select.value = '${targetLeaderGroupId}';
      const tracker = select._valueTracker;
      if (tracker) tracker.setValue('');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

    const saveEnabledRestored = await page.evaluate("document.querySelector('button[form=\"criteria-form\"][type=\"submit\"]')?.disabled");
    assert.equal(saveEnabledRestored, false, 'Save button must be re-enabled after restoring valid Leader group');

    // Read full config JSON before mutation and hash full Staff/Worker groups
    const configBeforeJson = JSON.parse(runPsql("SELECT public.get_active_criteria_config()::text;"));
    const staffGroupsBefore = configBeforeJson.groups.filter((g) => g.set_key === 'staff');
    const workerGroupsBefore = configBeforeJson.groups.filter((g) => g.set_key === 'worker');
    const staffHashBefore = hashJson(staffGroupsBefore);
    const workerHashBefore = hashJson(workerGroupsBefore);
    const versionBefore = configBeforeJson.version;
    const leaderCritCountBefore = Number(runPsql("SELECT count(*) FROM public.criteria WHERE set_key = 'leader';"));

    // Submit mutation
    await page.submit('#criteria-form');

    await page.waitFor("document.querySelector('#criteria-form') === null", { timeout: 15000, label: 'modal closed' });
    await page.waitFor(
      "document.body && document.body.innerText.includes('Cập nhật tiêu chí thành công!')",
      { timeout: 15000, label: 'success toast' }
    );
    await page.waitFor(
      "document.body && document.body.innerText.includes('Leader Criterion Synthetic 99')",
      { timeout: 15000, label: 'criterion in DOM' }
    );

    // Wait for DB version increment
    await waitCondition(async () => {
      const v = runPsql("SELECT COALESCE(max(version_no)::text, '0') FROM public.criteria_config_versions;");
      return Number(v) > Number(versionBefore);
    }, { timeout: 15000, label: 'SQL criteria_config_versions increment' });

    const leaderCritCountAfter = Number(runPsql("SELECT count(*) FROM public.criteria WHERE set_key = 'leader';"));
    assert.equal(leaderCritCountAfter, leaderCritCountBefore + 1, 'Leader criteria count must increment by 1');

    const savedRecord = runPsql("SELECT set_key || '|' || group_id FROM public.criteria WHERE name = 'Leader Criterion Synthetic 99';");
    assert.equal(savedRecord, `leader|${targetLeaderGroupId}`, 'New criterion must have leader set_key and selected group_id');
    caseResults.push({ name: 'create-leader-criterion-mutation', status: 'PASS' });

    // Read full config JSON after mutation and verify other sets remain byte-identical
    const configAfterJson = JSON.parse(runPsql("SELECT public.get_active_criteria_config()::text;"));
    const staffGroupsAfter = configAfterJson.groups.filter((g) => g.set_key === 'staff');
    const workerGroupsAfter = configAfterJson.groups.filter((g) => g.set_key === 'worker');
    const staffHashAfter = hashJson(staffGroupsAfter);
    const workerHashAfter = hashJson(workerGroupsAfter);

    assert.equal(staffHashAfter, staffHashBefore, 'Staff groups (full config) must remain byte-identical');
    assert.equal(workerHashAfter, workerHashBefore, 'Worker groups (full config) must remain byte-identical');
    caseResults.push({ name: 'other-sets-byte-preservation', status: 'PASS' });

    // 6. Synthetic Active Period: Locked Banner & Zero Mutation Controls
    console.log('[Browser] Creating synthetic active period and verifying locked banner + zero mutation controls...');
    runPsql("UPDATE public.evaluation_periods SET status = 'closed' WHERE status = 'active';");

    const managerId = runPsql("SELECT id FROM public.users WHERE employee_code = 'P103-MGR';");
    assert.ok(managerId, 'Manager fixture must exist');

    const syntheticPeriodId = crypto.randomUUID();
    const syntheticYear = 2030 + (process.pid % 50);
    const syntheticName = `Kỳ đánh giá Synthetic ${syntheticYear} (${syntheticPeriodId.slice(0, 8)})`;

    runPsql(`INSERT INTO public.evaluation_periods (id, name, year, created_by, status) VALUES ('${syntheticPeriodId}', '${syntheticName}', ${syntheticYear}, '${managerId}', 'active');`);

    await page.goto(`${origin}/criteria`);
    await page.waitFor(
      "document.body && document.body.innerText.includes('Kỳ đánh giá đang hoạt động') && document.body.innerText.includes('Chế độ chỉ đọc')",
      { timeout: 30000, label: 'active period locked banner rendered' }
    );

    const activeBannerText = await page.evaluate("document.body.innerText");
    assert.ok(
      activeBannerText.includes(syntheticName) || activeBannerText.includes('Kỳ đánh giá đang hoạt động'),
      'Active banner text must include active period info'
    );

    const hasAddBtnActive = await page.evaluate("Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Thêm tiêu chuẩn'))");
    assert.equal(hasAddBtnActive, false, 'Thêm tiêu chuẩn button must be hidden when evaluation period is active');

    const hasEditCritActive = await page.evaluate("document.querySelector('button[data-edit-criterion]') !== null");
    assert.equal(hasEditCritActive, false, 'Edit criterion button must be hidden when evaluation period is active');

    const hasAddGroupActive = await page.evaluate("document.querySelector('button[title=\"Thêm nhóm tiêu chuẩn\"]') !== null");
    assert.equal(hasAddGroupActive, false, 'Add group button must be hidden when evaluation period is active');

    const hasEditGroupActive = await page.evaluate("document.querySelector('button[title=\"Sửa nhóm\"]') !== null");
    assert.equal(hasEditGroupActive, false, 'Edit group button must be hidden when evaluation period is active');

    const hasDeleteGroupActive = await page.evaluate("document.querySelector('button[title=\"Xóa nhóm\"]') !== null");
    assert.equal(hasDeleteGroupActive, false, 'Delete group button must be hidden when evaluation period is active');

    const hasDeleteCritActive = await page.evaluate("document.querySelector('button[title=\"Xóa tiêu chí\"]') !== null");
    assert.equal(hasDeleteCritActive, false, 'Delete criterion button must be hidden when evaluation period is active');

    const shotActive = await page.screenshot('criteria-active-locked', { dir: evidenceDir });
    recordedScreenshots.push({
      label: 'criteria-active-locked',
      path: shotActive.path,
      sha256: shotActive.sha256,
      viewport: { width: 1440, height: 900, mobile: false },
    });
    caseResults.push({ name: 'synthetic-active-period-locked-banner', status: 'PASS' });

    // Write evidence JSON summary (retained after runtimeRoot deleted)
    const evidenceFile = path.join(evidenceDir, 'evidence.json');
    fs.writeFileSync(evidenceFile, JSON.stringify({
      task: 'P108M1T06',
      pid: process.pid,
      timestamp: new Date().toISOString(),
      evidenceDir,
      screenshots: recordedScreenshots,
      cases: caseResults,
    }, null, 2));

    console.log(`\n[Evidence] Retained evidence root: ${evidenceDir}`);
    console.log(`[Evidence] Summary file: ${evidenceFile}`);
    for (const s of recordedScreenshots) {
      console.log(`  - Screenshot [${s.label}]: ${s.path} (${s.viewport.width}x${s.viewport.height}, mobile=${s.viewport.mobile}) sha256=${s.sha256.slice(0, 16)}...`);
    }
    for (const c of caseResults) {
      console.log(`  - Case [${c.name}]: ${c.status}`);
    }

    console.log('\n[Browser Mode] All browser verification steps executed successfully.');
  } catch (err) {
    mainError = err;
  } finally {
    if (browser) {
      try {
        const stopRes = await browser.stop();
        assert.equal(stopRes.processStopped, true, 'browser.stop() must stop browser process');
        assert.equal(stopRes.profileRemoved, true, 'browser.stop() must remove chrome profile directory');
      } catch (err) {
        cleanupErrors.push(err);
      }
    }

    try {
      console.log('[Browser Cleanup] Cleaning up confirmation runtime...');
      const cleanRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'cleanup'], {
        cwd: projectRoot,
        env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
        encoding: 'utf8',
        timeout: 60000,
      });

      if (cleanRes.error) {
        throw new Error(`cleanup spawn failed: ${cleanRes.error.message}`);
      }
      if (cleanRes.status !== 0) {
        throw new Error(`cleanup exited with code ${cleanRes.status}: ${cleanRes.stderr || cleanRes.stdout}`);
      }

      const stdout = String(cleanRes.stdout || '').trim();
      const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      const jsonLine = lines.reverse().find((l) => l.startsWith('{') && l.endsWith('}'));
      if (!jsonLine) {
        throw new Error(`cleanup output did not contain valid JSON summary: ${stdout}`);
      }
      const cleanupParsed = JSON.parse(jsonLine);
      assert.equal(cleanupParsed.cleaned, true, 'cleanup output must have cleaned: true');
      assert.equal(cleanupParsed.residue, 0, 'cleanup output must have residue: 0');
    } catch (err) {
      cleanupErrors.push(err);
    }

    if (mainError && cleanupErrors.length > 0) {
      throw new AggregateError([mainError, ...cleanupErrors], `Both test execution and cleanup failed: ${mainError.message}`);
    } else if (mainError) {
      throw mainError;
    } else if (cleanupErrors.length > 0) {
      if (cleanupErrors.length === 1) throw cleanupErrors[0];
      throw new AggregateError(cleanupErrors, `Cleanup failed: ${cleanupErrors[0].message}`);
    }
  }
} else {
  console.log('[Note] Run with --browser to execute live CDP browser verification.\n');
}

console.log('=== ALL P108 CRITERIA ADMIN CONTRACT TESTS PASSED ===');
