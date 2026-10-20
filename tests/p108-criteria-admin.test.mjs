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

// 1.8 Criterion responsive header and badge display formatter contract
assert.match(pageContent, /formatCriterionBadge/, 'criteria/page.tsx must define formatCriterionBadge');
assert.match(pageContent, /data-criterion-badge/, 'criteria/page.tsx must define data-criterion-badge');
assert.match(pageContent, /data-criterion-name/, 'criteria/page.tsx must define data-criterion-name');
assert.match(pageContent, /data-criterion-description/, 'criteria/page.tsx must define data-criterion-description');
assert.doesNotMatch(pageContent, /lg:flex-nowrap/, 'criteria/page.tsx must not enforce lg:flex-nowrap on criterion header');

function testBadgeFormatter(code) {
  if (!code) return '';
  const match = code.match(/^[ABC](\d+)$/i);
  return match ? match[1] : code;
}
assert.equal(testBadgeFormatter('A8'), '8', 'A8 formatted to 8');
assert.equal(testBadgeFormatter('B10'), '10', 'B10 formatted to 10');
assert.equal(testBadgeFormatter('C12'), '12', 'C12 formatted to 12');
assert.equal(testBadgeFormatter('C14'), '14', 'C14 formatted to 14');
assert.equal(testBadgeFormatter('A1'), '1', 'A1 formatted to 1');
assert.equal(testBadgeFormatter('D4'), 'D4', 'D4 non-ABC remains D4');
assert.equal(testBadgeFormatter('CUSTOM-01'), 'CUSTOM-01', 'Custom remains unchanged');
assert.equal(testBadgeFormatter(null), '', 'Null code handled');
assert.equal(testBadgeFormatter(''), '', 'Empty string handled');

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
// 5. Unit Tests: G1 Explicit Scoring Default Denial, Short-Circuit & Config Actions
// -----------------------------------------------------------------------------
console.log('[Test 5] (Unit) Testing G1 explicit scoring default denial, short-circuit, and nonempty rule...');

{
  const dbState = { config: makeFixtureConfig(), saveCalls: 0 };
  const actions = createCriteriaActions(dbState);
  const leaderCritId = dbState.config.groups[0].criteria[0].id;
  const leaderGroupId = dbState.config.groups[0].id;
  const workerCritId = dbState.config.groups[2].criteria[0].id;
  const workerGroupId = dbState.config.groups[2].id;

  // 5.1 Same default level index: MUST short-circuit save RPC (0 save calls, preserve pre-existing)
  dbState.saveCalls = 0;
  const noopResult = await actions.updateDefaultLevelAction(leaderCritId, 0, 1, 'leader');
  assert.equal(noopResult.success, true);
  assert.equal(dbState.saveCalls, 0, 'updateDefaultLevelAction must make 0 save calls when default level unchanged');

  // 5.2 Direct set of new non-null default (0 and positive): MUST be refused with 0 save calls
  dbState.saveCalls = 0;
  const directPosResult = await actions.updateDefaultLevelAction(workerCritId, 1, 1, 'worker');
  assert.equal(directPosResult.success, false);
  assert.match(directPosResult.error, /Không thể đặt mức mặc định cho tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'updateDefaultLevelAction must make 0 save calls when setting positive default');

  dbState.saveCalls = 0;
  const directZeroResult = await actions.updateDefaultLevelAction(workerCritId, 0, 1, 'worker');
  assert.equal(directZeroResult.success, false);
  assert.match(directZeroResult.error, /Không thể đặt mức mặc định cho tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'updateDefaultLevelAction must make 0 save calls when setting zero default');

  // 5.3 Null clearing via updateDefaultLevelAction: allowed with 1 save call
  dbState.saveCalls = 0;
  const clearResult = await actions.updateDefaultLevelAction(leaderCritId, null, 1, 'leader');
  assert.equal(clearResult.success, true);
  assert.equal(dbState.saveCalls, 1, 'updateDefaultLevelAction must make 1 save call when clearing default to null');
  assert.equal(dbState.lastSavedPayload.groups[0].criteria[0].default_level_index, null, 'default_level_index must be cleared to null');

  // Clearing already-null default: zero write / no-op
  dbState.saveCalls = 0;
  const clearNoopResult = await actions.updateDefaultLevelAction(workerCritId, null, dbState.config.version, 'worker');
  assert.equal(clearNoopResult.success, true);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls when clearing already-null default');

  // 5.4 Upsert set of new default (0 and positive): MUST be refused with 0 save calls
  dbState.saveCalls = 0;
  const upPosResult = await actions.upsertCriterionAction(
    { id: workerCritId, name: 'Worker Crit 1', defaultLevelIndex: 1 },
    workerGroupId,
    dbState.config.version,
    'worker'
  );
  assert.equal(upPosResult.success, false);
  assert.match(upPosResult.error, /Không thể đặt mức mặc định cho tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on upsert setting positive default');

  dbState.saveCalls = 0;
  const upZeroResult = await actions.upsertCriterionAction(
    { id: workerCritId, name: 'Worker Crit 1', defaultLevelIndex: 0 },
    workerGroupId,
    dbState.config.version,
    'worker'
  );
  assert.equal(upZeroResult.success, false);
  assert.match(upZeroResult.error, /Không thể đặt mức mặc định cho tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on upsert setting zero default');

  dbState.saveCalls = 0;
  const upNewResult = await actions.upsertCriterionAction(
    { name: 'New Criterion With Default', defaultLevelIndex: 0, levels: [{ points: 10, label: 'L1' }] },
    leaderGroupId,
    dbState.config.version,
    'leader'
  );
  assert.equal(upNewResult.success, false);
  assert.match(upNewResult.error, /Không thể đặt mức mặc định cho tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls on creating new criterion with requested default');

  // 5.5 Positive ordinary edit with old default preserved
  // Restore pre-existing default 0 for leaderCrit
  dbState.config.groups[0].criteria[0].default_level_index = 0;

  // Edit omitting defaultLevelIndex field
  dbState.saveCalls = 0;
  const editOmitResult = await actions.upsertCriterionAction(
    { id: leaderCritId, name: 'Leader Crit Renamed' },
    leaderGroupId,
    dbState.config.version,
    'leader'
  );
  assert.equal(editOmitResult.success, true);
  assert.equal(dbState.saveCalls, 1);
  assert.equal(
    dbState.lastSavedPayload.groups[0].criteria[0].default_level_index,
    0,
    'Old default preserved when omitting defaultLevelIndex'
  );

  // Edit passing unchanged defaultLevelIndex
  dbState.saveCalls = 0;
  const editSameResult = await actions.upsertCriterionAction(
    { id: leaderCritId, name: 'Leader Crit Renamed Again', defaultLevelIndex: 0 },
    leaderGroupId,
    dbState.config.version,
    'leader'
  );
  assert.equal(editSameResult.success, true);
  assert.equal(dbState.saveCalls, 1);
  assert.equal(
    dbState.lastSavedPayload.groups[0].criteria[0].default_level_index,
    0,
    'Old default preserved when passing unchanged defaultLevelIndex'
  );

  // Null clearing via upsert
  dbState.saveCalls = 0;
  const editNullResult = await actions.upsertCriterionAction(
    { id: leaderCritId, name: 'Leader Crit No Default', defaultLevelIndex: null },
    leaderGroupId,
    dbState.config.version,
    'leader'
  );
  assert.equal(editNullResult.success, true);
  assert.equal(dbState.saveCalls, 1);
  assert.equal(
    dbState.lastSavedPayload.groups[0].criteria[0].default_level_index,
    null,
    'Default cleared to null via upsert'
  );

  // 5.6 Global nonempty config rule: deleting last remaining group in config must be refused
  dbState.config.groups = [dbState.config.groups[0]]; // Only 1 group left in entire config
  dbState.saveCalls = 0;
  const delLastGrp = await actions.deleteCriteriaGroupAction(leaderGroupId, dbState.config.version, 'leader');
  assert.equal(delLastGrp.success, false);
  assert.match(delLastGrp.error, /Phải giữ lại ít nhất một nhóm tiêu chí/);
  assert.equal(dbState.saveCalls, 0, 'Zero save calls when deleting last group');
}

console.log('PASS: G1 default denial, short-circuit, and nonempty config rule verified.\n');

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
  const { loginAs, browserAction, loadActionManifest } = await import(orgHelperPath);

  const runtimeRoot = path.join(projectRoot, '.tmp', `p108-browser-${Date.now()}-${process.pid}`);
  fs.mkdirSync(runtimeRoot, { recursive: true });

  const evidenceDir = path.join(projectRoot, '.tmp', `p108-admin-evidence-${process.pid}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const caseResults = [];
  const recordedScreenshots = [];
  const layoutMeasurements = [];

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

  async function verifyCriteriaResponsiveHeadersAndBadges(page, runPsql, viewportLabel) {
    console.log(`[Browser ${viewportLabel}] Verifying responsive criterion header, badges, group names, and overflow...`);
    const TARGET_CONFIG = [
      {
        groupCode: 'A',
        criteria: [
          { code: 'A1', expectedSuffix: '1', isControl: true },
          { code: 'A8', expectedSuffix: '8' },
        ],
      },
      {
        groupCode: 'B',
        criteria: [
          { code: 'B10', expectedSuffix: '10' },
        ],
      },
      {
        groupCode: 'C',
        criteria: [
          { code: 'C12', expectedSuffix: '12' },
          { code: 'C14', expectedSuffix: '14' },
        ],
      },
    ];

    for (const setKey of ['leader', 'staff', 'worker']) {
      console.log(`[Browser ${viewportLabel}] Checking criterion headers & badges for set: ${setKey}...`);
      await page.evaluate(`document.querySelector('button[data-criteria-set-tab="${setKey}"]').click()`);
      await page.waitFor(
        `document.querySelector('button[data-criteria-set-tab="${setKey}"][aria-selected="true"]') !== null`,
        { timeout: 10000, label: `set tab ${setKey} active` }
      );

      for (const groupConfig of TARGET_CONFIG) {
        const groupId = runPsql(
          `SELECT id FROM public.criteria_groups WHERE set_key = '${setKey}' AND code = '${groupConfig.groupCode}' LIMIT 1;`
        ).trim();
        assert.ok(groupId, `Group ${groupConfig.groupCode} must exist in set ${setKey}`);

        await page.evaluate(`document.querySelector('button[data-criteria-group-id="${groupId}"]').click()`);
        await page.waitFor(
          `document.querySelector('button[data-criteria-group-id="${groupId}"][aria-selected="true"]') !== null`,
          { timeout: 10000, label: `group ${groupConfig.groupCode} tab active in set ${setKey}` }
        );

        // Group names remain A/B/C assertion
        const groupTabCodeText = await page.evaluate(`(() => {
          const btn = document.querySelector('button[data-criteria-group-id="${groupId}"]');
          return btn ? btn.innerText : '';
        })()`);
        assert.ok(
          groupTabCodeText.includes(groupConfig.groupCode),
          `Group tab must retain visible group code "${groupConfig.groupCode}" for set ${setKey} at ${viewportLabel}; got ${JSON.stringify(groupTabCodeText)}`
        );

        const groupHeaderTitle = await page.evaluate(`(() => {
          const header = document.querySelector('div[data-criteria-group-id="${groupId}"] h2');
          return header ? header.innerText : '';
        })()`);
        assert.ok(
          groupHeaderTitle.includes(`Nhóm ${groupConfig.groupCode}`),
          `Active group header must retain group name "Nhóm ${groupConfig.groupCode}" for set ${setKey} at ${viewportLabel}`
        );

        for (const crit of groupConfig.criteria) {
          const critId = runPsql(
            `SELECT id FROM public.criteria WHERE set_key = '${setKey}' AND group_id = '${groupId}' AND code = '${crit.code}' LIMIT 1;`
          ).trim();
          assert.ok(critId, `Criterion ${crit.code} must exist in DB for set ${setKey}`);

          await page.waitFor(
            `document.querySelector('[data-criterion-id="${critId}"]') !== null`,
            { timeout: 10000, label: `criterion ${crit.code} card rendered` }
          );

          const cardStats = await page.evaluate(`(() => {
            const card = document.querySelector('[data-criterion-id="${critId}"]');
            if (!card) return null;
            const header = card.firstElementChild;
            const textGroup = header?.children?.[0];
            const actions = header?.children?.[1];
            const badge = card.querySelector('[data-criterion-badge]') || card.querySelector('span.font-black');
            const title = card.querySelector('[data-criterion-name]');
            const desc = card.querySelector('[data-criterion-description]') || card.querySelector('span.text-ink-muted\\/80');
            const cardRect = card.getBoundingClientRect();
            const headerStyle = header ? getComputedStyle(header) : null;
            const headerPadding = headerStyle
              ? Number.parseFloat(headerStyle.paddingLeft) + Number.parseFloat(headerStyle.paddingRight)
              : 0;
            const headerInnerWidth = header ? header.clientWidth - headerPadding : 0;
            const columnGap = headerStyle ? Number.parseFloat(headerStyle.columnGap) || 0 : 0;
            const actionsRect = actions ? actions.getBoundingClientRect() : null;
            const textGroupRect = textGroup ? textGroup.getBoundingClientRect() : null;
            const actionsOnSameRow = Boolean(actionsRect && textGroupRect
              && actionsRect.top < textGroupRect.bottom - 1
              && actionsRect.bottom > textGroupRect.top + 1);
            const availableTextWidth = actionsOnSameRow
              ? headerInnerWidth - actionsRect.width - columnGap
              : headerInnerWidth;
            const titleRect = title ? title.getBoundingClientRect() : null;
            const titleStyle = title ? getComputedStyle(title) : null;
            const titleLineHeight = titleStyle ? (Number.parseFloat(titleStyle.lineHeight) || Number.parseFloat(titleStyle.fontSize) * 1.2) : 0;
            const descRect = desc ? desc.getBoundingClientRect() : null;
            const descStyle = desc ? getComputedStyle(desc) : null;
            const lineCharacterCounts = new Map();
            if (desc) {
              const walker = document.createTreeWalker(desc, NodeFilter.SHOW_TEXT);
              const range = document.createRange();
              let textNode;
              while ((textNode = walker.nextNode())) {
                for (let offset = 0; offset < textNode.textContent.length;) {
                  const codePoint = textNode.textContent.codePointAt(offset);
                  const charLength = codePoint > 0xffff ? 2 : 1;
                  range.setStart(textNode, offset);
                  range.setEnd(textNode, offset + charLength);
                  const charRect = range.getBoundingClientRect();
                  if (charRect.width > 0 && charRect.height > 0) {
                    const lineTop = Math.round(charRect.top * 2) / 2;
                    lineCharacterCounts.set(lineTop, (lineCharacterCounts.get(lineTop) || 0) + 1);
                  }
                  offset += charLength;
                }
              }
            }
            const descVisualLineCounts = [...lineCharacterCounts.values()];
            return {
              badgeText: badge ? badge.textContent.trim() : '',
              titleText: title ? title.textContent.trim() : '',
              titleWidth: titleRect ? titleRect.width : 0,
              titleLines: titleRect && titleLineHeight > 0 ? Math.round(titleRect.height / titleLineHeight) : 0,
              hasDesc: Boolean(desc),
              descText: desc ? desc.textContent.trim() : '',
              cardWidth: cardRect.width,
              descWidth: descRect ? descRect.width : 0,
              headerInnerWidth,
              actionsWidth: actionsRect ? actionsRect.width : 0,
              columnGap,
              actionsOnSameRow,
              availableTextWidth,
              textGroupWidth: textGroupRect ? textGroupRect.width : 0,
              descWritingMode: descStyle ? descStyle.writingMode : '',
              descVisualLineCount: descVisualLineCounts.length,
              descMaxCharsPerVisualLine: Math.max(0, ...descVisualLineCounts),
              cardScrollWidth: card.scrollWidth,
              cardClientWidth: card.clientWidth,
              pageScrollWidth: document.documentElement.scrollWidth,
              pageClientWidth: document.documentElement.clientWidth,
            };
          })()`);

          assert.ok(cardStats, `Card for criterion ${crit.code} in set ${setKey} must be found in DOM`);

          // 1. Visible numeric label assertion
          assert.equal(
            cardStats.badgeText,
            crit.expectedSuffix,
            `Criterion ${crit.code} badge in set ${setKey} at ${viewportLabel} must display numeric suffix "${crit.expectedSuffix}", got "${cardStats.badgeText}"`
          );
          assert.notEqual(
            cardStats.badgeText,
            crit.code,
            `Criterion ${crit.code} badge must not display canonical code "${crit.code}"`
          );

          if (!crit.isControl) {
            assert.ok(
              cardStats.titleText.length >= 100,
              `Criterion ${crit.code} must render the long canonical Vietnamese title in set ${setKey}`
            );
            assert.ok(
              cardStats.titleWidth > 160 && cardStats.titleLines >= 2,
              `Criterion ${crit.code} title must wrap as readable text, not a narrow vertical column (${cardStats.titleWidth}px, ${cardStats.titleLines} lines) at ${viewportLabel}`
            );
            const containsJapanese = /[\u3040-\u30ff\u3400-\u9fff]/u.test(cardStats.descText);
            assert.ok(
              cardStats.descText.length >= 60 && containsJapanese,
              `Criterion ${crit.code} must render the long canonical Japanese description in set ${setKey} (length=${cardStats.descText.length}, containsJapanese=${containsJapanese})`
            );
          }

          // 2. Description must use the actual available text column after
          // card padding, action controls, and the rendered flex gap.
          assert.ok(
            cardStats.hasDesc,
            `Criterion ${crit.code} must have description element in set ${setKey}`
          );
          assert.ok(
            Math.abs(cardStats.textGroupWidth - cardStats.availableTextWidth) <= 2,
            `Criterion ${crit.code} text column must fill measured available width at ${viewportLabel}: ${JSON.stringify(cardStats)}`
          );
          assert.ok(
            Math.abs(cardStats.descWidth - cardStats.textGroupWidth) <= 2,
            `Criterion ${crit.code} description must use the full text column at ${viewportLabel}: ${JSON.stringify(cardStats)}`
          );

          if (!crit.isControl) {
            assert.equal(cardStats.descWritingMode, 'horizontal-tb', `Criterion ${crit.code} Japanese description must use horizontal writing at ${viewportLabel}`);
            assert.ok(
              cardStats.descVisualLineCount > 1 && cardStats.descMaxCharsPerVisualLine > 1,
              `Criterion ${crit.code} Japanese text must wrap across lines, not stack vertically at ${viewportLabel}: ${JSON.stringify(cardStats)}`
            );
          }

          layoutMeasurements.push({
            viewport: viewportLabel,
            setKey,
            code: crit.code,
            cardWidth: cardStats.cardWidth,
            headerInnerWidth: cardStats.headerInnerWidth,
            actionsWidth: cardStats.actionsWidth,
            columnGap: cardStats.columnGap,
            actionsOnSameRow: cardStats.actionsOnSameRow,
            availableTextWidth: cardStats.availableTextWidth,
            textGroupWidth: cardStats.textGroupWidth,
            descWidth: cardStats.descWidth,
            descWritingMode: cardStats.descWritingMode,
            descVisualLineCount: cardStats.descVisualLineCount,
            descMaxCharsPerVisualLine: cardStats.descMaxCharsPerVisualLine,
            cardScrollWidth: cardStats.cardScrollWidth,
            cardClientWidth: cardStats.cardClientWidth,
            pageScrollWidth: cardStats.pageScrollWidth,
            pageClientWidth: cardStats.pageClientWidth,
          });

          // 3. Horizontal overflow assertion (cards and page must not overflow)
          assert.ok(
            cardStats.cardScrollWidth <= cardStats.cardClientWidth + 1,
            `Criterion ${crit.code} card at ${viewportLabel} must not overflow horizontally (scrollWidth ${cardStats.cardScrollWidth} <= clientWidth ${cardStats.cardClientWidth})`
          );
          assert.ok(
            cardStats.pageScrollWidth <= cardStats.pageClientWidth + 1,
            `Page at ${viewportLabel} must not overflow horizontally (scrollWidth ${cardStats.pageScrollWidth} <= clientWidth ${cardStats.pageClientWidth})`
          );

          if (setKey === 'leader' && !crit.isControl) {
            const targetShot = await page.screenshot(`criteria-${crit.code}-${viewportLabel}`, { dir: evidenceDir });
            recordedScreenshots.push({
              label: `criteria-${crit.code}-${viewportLabel}`,
              path: targetShot.path,
              sha256: targetShot.sha256,
              criterion: crit.code,
              setKey,
              viewport: { width: viewportLabel === '390' ? 390 : 1440, height: viewportLabel === '390' ? 844 : 900, mobile: viewportLabel === '390' },
            });
          }
        }
      }
    }

    // Reset view to Leader set and Group A
    const leaderGroupAId = runPsql("SELECT id FROM public.criteria_groups WHERE set_key = 'leader' AND code = 'A' LIMIT 1;").trim();
    await page.evaluate("document.querySelector('button[data-criteria-set-tab=\"leader\"]').click()");
    await page.waitFor("document.querySelector('button[data-criteria-set-tab=\"leader\"][aria-selected=\"true\"]') !== null", { timeout: 10000 });
    if (leaderGroupAId) {
      await page.evaluate(`document.querySelector('button[data-criteria-group-id="${leaderGroupAId}"]')?.click()`);
      await page.waitFor(`document.querySelector('button[data-criteria-group-id="${leaderGroupAId}"][aria-selected=\"true\"]') !== null`, { timeout: 10000 });
    }
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

    function hashString(content) {
      return crypto.createHash('sha256').update(content).digest('hex');
    }

    const CRITERIA_TABLES = [
      'criteria_groups',
      'criteria',
      'criterion_levels',
      'criterion_audiences',
      'criteria_config_versions',
      'criteria_group_versions',
      'criterion_versions',
      'criterion_level_versions',
      'criterion_audience_versions',
    ];

    function criteriaDigest(psqlFn) {
      const parts = [];
      for (const tbl of CRITERIA_TABLES) {
        const res = psqlFn(`
          SELECT COALESCE(string_agg(row_data, E'\\n' ORDER BY row_data), '') FROM (
            SELECT md5(t::text) AS row_data FROM public.${tbl} t
          ) s;
        `);
        parts.push(`tbl:${tbl}=${res}`);
      }
      return hashString(parts.join('\n'));
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

    // Use real multilingual labels from the canonical manifest only as fixture content
    // in this disposable local database; no manifest or production data is modified.
    const responsiveCodes = new Set(['A8', 'B10', 'C12', 'C14']);
    const responsiveSets = new Set(['leader', 'staff', 'worker']);
    const canonicalManifest = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'db/seed/p108-criteria-manifest.json'),
      'utf8'
    ));
    const responsiveRecords = canonicalManifest.groups.flatMap((group) =>
      group.criteria
        .filter((criterion) => responsiveCodes.has(criterion.code) && responsiveSets.has(group.set_key))
        .map((criterion) => ({ ...criterion, set_key: group.set_key, group_code: group.code }))
    );
    assert.equal(responsiveRecords.length, 12, 'Canonical manifest must supply four target criteria for each of three sets');
    const sqlLiteral = (value) => `'${String(value).replace(/'/g, "''")}'`;
    const responsiveConfig = JSON.parse(runPsql('SELECT public.get_active_criteria_config()::text;'));
    for (const criterion of responsiveRecords) {
      const group = responsiveConfig.groups.find((item) => item.set_key === criterion.set_key && item.code === criterion.group_code);
      assert.ok(group, `Versioned fixture must contain group ${criterion.set_key}/${criterion.group_code}`);
      const versionedCriterion = group.criteria.find((item) => item.code === criterion.code);
      assert.ok(versionedCriterion, `Versioned fixture must contain criterion ${criterion.set_key}/${criterion.code}`);
      versionedCriterion.name = criterion.name;
      versionedCriterion.description = criterion.description;
    }
    const previousVersion = responsiveConfig.version;
    const fixtureVersion = Number(runPsql(`
      SELECT (public.save_criteria_config(${sqlLiteral(JSON.stringify(responsiveConfig))}::jsonb, ${previousVersion})->>'version')::integer;
    `));
    assert.equal(fixtureVersion, previousVersion + 1, 'Canonical fixture update must create exactly one active criteria version');
    const fixtureReadback = JSON.parse(runPsql('SELECT public.get_active_criteria_config()::text;'));
    for (const criterion of responsiveRecords) {
      const group = fixtureReadback.groups.find((item) => item.set_key === criterion.set_key && item.code === criterion.group_code);
      const versionedCriterion = group?.criteria.find((item) => item.code === criterion.code);
      assert.ok(versionedCriterion, `Versioned fixture readback must include ${criterion.set_key}/${criterion.code}`);
      assert.equal(versionedCriterion.name, criterion.name, `Versioned fixture must use canonical Vietnamese title ${criterion.code}`);
      assert.equal(versionedCriterion.description, criterion.description, `Versioned fixture must use canonical Japanese description ${criterion.code}`);
    }
    console.log(`[Browser] Loaded/read back real VI/JA target text through save_criteria_config in disposable local version ${fixtureVersion}.`);

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

    await verifyCriteriaResponsiveHeadersAndBadges(page, runPsql, '390');
    caseResults.push({ name: 'criterion-responsive-header-and-badges-390', status: 'PASS' });

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

    await verifyCriteriaResponsiveHeadersAndBadges(page, runPsql, '1440');
    caseResults.push({ name: 'criterion-responsive-header-and-badges-1440', status: 'PASS' });

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

    // 4.5. G1 Explicit Scoring: No set-default buttons when canEdit=true & direct/upsert default refusal
    console.log('[Browser] Verifying no P108 set-default buttons exist in DOM across all three set tabs when canEdit=true...');
    for (const tabKey of ['leader', 'staff', 'worker']) {
      await page.evaluate(`document.querySelector('button[data-criteria-set-tab="${tabKey}"]').click()`);
      await page.waitFor(
        `document.querySelector('button[data-criteria-set-tab="${tabKey}"][aria-selected="true"]') !== null`,
        { timeout: 10000, label: `set tab ${tabKey} active` }
      );
      // Positive control: ensure canEdit=true with visible and enabled create/edit controls
      const hasAddBtn = await page.evaluate(
        "Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Thêm tiêu chuẩn') && !b.disabled)"
      );
      assert.equal(hasAddBtn, true, `Positive control 'Thêm tiêu chuẩn' must be visible and enabled on tab ${tabKey}`);

      const hasSetDefaultButtons = await page.evaluate(`(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(b => {
          const title = b.getAttribute('title') || '';
          const label = b.getAttribute('aria-label') || '';
          const text = b.textContent || '';
          return title.includes('Đặt làm mặc định') || title.includes('Đang là mức mặc định') ||
                 label.includes('Đặt làm mặc định') || text.includes('Đặt làm mặc định');
        });
      })()`);
      assert.equal(hasSetDefaultButtons, false, `Must have zero set-default buttons in DOM on tab ${tabKey} when canEdit=true`);
    }
    caseResults.push({ name: 'no-p108-set-default-buttons-can-edit', status: 'PASS' });

    console.log('[Browser] Verifying direct and upsert default attempts are refused with exact reason and zero catalog mutation...');
    const buildDir = path.join(projectRoot, '.next', 'dev');
    const actionManifest = loadActionManifest(buildDir);
    const updateDefaultAction = actionManifest.find((entry) => entry.exportedName === 'updateDefaultLevelAction');
    if (!updateDefaultAction) {
      throw new Error('BLOCKED CAPABILITY: updateDefaultLevelAction not found in action manifest');
    }
    const upsertAction = actionManifest.find((entry) => entry.exportedName === 'upsertCriterionAction');
    if (!upsertAction) {
      throw new Error('BLOCKED CAPABILITY: upsertCriterionAction not found in action manifest');
    }

    // Query a criterion with existing non-null default (default exists = 0 in synthetic fixtures)
    const leaderCritRow = runPsql("SELECT id || '|' || group_id || '|' || COALESCE(default_level_index::text, '') FROM public.criteria WHERE set_key = 'leader' AND default_level_index IS NOT NULL ORDER BY sort_order, id LIMIT 1;").split('|');
    const [leaderCritIdForAction, leaderGroupIdForAction, currentDefaultLevelIndex] = leaderCritRow;
    assert.equal(currentDefaultLevelIndex, '0', 'Synthetic fixture leader criterion default_level_index must be 0');

    let activeVer = Number(runPsql("SELECT COALESCE(max(version_no)::text, '0') FROM public.criteria_config_versions;"));

    // 1. Direct default attempt with changed non-null requested index (1 vs currently stored 0)
    const digestBeforeDirect = criteriaDigest(runPsql);
    const directRes = await browserAction(page, {
      manifest: actionManifest,
      name: 'updateDefaultLevelAction',
      args: [leaderCritIdForAction, 1, activeVer, 'leader'],
    });
    assert.equal(directRes.ok, true, 'Transport for direct updateDefaultLevelAction succeeded');
    assert.equal(directRes.value?.success, false, 'Direct default set with changed index must be refused');
    assert.equal(
      directRes.value?.error,
      'Không thể đặt mức mặc định cho tiêu chí. Hệ thống áp dụng cơ chế chấm điểm tường minh (không chọn sẵn mức mặc định).',
      'Direct default must return exact intended error'
    );
    const digestAfterDirect = criteriaDigest(runPsql);
    assert.equal(digestAfterDirect, digestBeforeDirect, 'FULL catalog/version tables digest must remain byte-identical after refused direct default');

    // 2. Generic upsert default attempt with changed non-null requested index (1 vs currently stored 0)
    const digestBeforeUpsert = criteriaDigest(runPsql);
    const upsertRes = await browserAction(page, {
      manifest: actionManifest,
      name: 'upsertCriterionAction',
      args: [
        { id: leaderCritIdForAction, name: 'Bypass Attempt', defaultLevelIndex: 1 },
        leaderGroupIdForAction,
        activeVer,
        'leader',
      ],
    });
    assert.equal(upsertRes.ok, true, 'Transport for upsertCriterionAction succeeded');
    assert.equal(upsertRes.value?.success, false, 'Upsert default set with changed index must be refused');
    assert.equal(
      upsertRes.value?.error,
      'Không thể đặt mức mặc định cho tiêu chí. Hệ thống áp dụng cơ chế chấm điểm tường minh (không chọn sẵn mức mặc định).',
      'Upsert default must return exact intended error'
    );
    const digestAfterUpsert = criteriaDigest(runPsql);
    assert.equal(digestAfterUpsert, digestBeforeUpsert, 'FULL catalog/version tables digest must remain byte-identical after refused upsert default');

    // 3. Authorized null-clear positive control, followed by NULL-default criterion direct/upsert 0 denial
    console.log('[Browser] Executing authorized null-clear positive control...');
    const nullClearRes = await browserAction(page, {
      manifest: actionManifest,
      name: 'updateDefaultLevelAction',
      args: [leaderCritIdForAction, null, activeVer, 'leader'],
    });
    assert.equal(nullClearRes.ok, true, 'Transport for null-clear succeeded');
    assert.equal(nullClearRes.value?.success, true, 'Authorized null-clear must succeed');

    // Update activeVer after successful version bump
    activeVer = Number(runPsql("SELECT COALESCE(max(version_no)::text, '0') FROM public.criteria_config_versions;"));
    const storedAfterClear = runPsql(`SELECT default_level_index FROM public.criteria WHERE id = '${leaderCritIdForAction}';`);
    assert.equal(storedAfterClear, '', 'default_level_index in DB must be NULL after clear');

    // Direct 0 denial on NULL-default criterion:
    const digestBeforeNullToZeroDirect = criteriaDigest(runPsql);
    const directZeroRes = await browserAction(page, {
      manifest: actionManifest,
      name: 'updateDefaultLevelAction',
      args: [leaderCritIdForAction, 0, activeVer, 'leader'],
    });
    assert.equal(directZeroRes.ok, true, 'Transport for direct 0 on null-default succeeded');
    assert.equal(directZeroRes.value?.success, false, 'Direct 0 on null-default criterion must be refused');
    assert.equal(
      directZeroRes.value?.error,
      'Không thể đặt mức mặc định cho tiêu chí. Hệ thống áp dụng cơ chế chấm điểm tường minh (không chọn sẵn mức mặc định).',
      'Direct 0 on null-default must return exact intended error'
    );
    assert.equal(criteriaDigest(runPsql), digestBeforeNullToZeroDirect, 'Catalog tables digest must remain byte-identical after refused direct 0 on null-default');

    // Upsert 0 denial on NULL-default criterion:
    const digestBeforeNullToZeroUpsert = criteriaDigest(runPsql);
    const upsertZeroRes = await browserAction(page, {
      manifest: actionManifest,
      name: 'upsertCriterionAction',
      args: [
        { id: leaderCritIdForAction, name: 'Null To Zero Attempt', defaultLevelIndex: 0 },
        leaderGroupIdForAction,
        activeVer,
        'leader',
      ],
    });
    assert.equal(upsertZeroRes.ok, true, 'Transport for upsert 0 on null-default succeeded');
    assert.equal(upsertZeroRes.value?.success, false, 'Upsert 0 on null-default criterion must be refused');
    assert.equal(
      upsertZeroRes.value?.error,
      'Không thể đặt mức mặc định cho tiêu chí. Hệ thống áp dụng cơ chế chấm điểm tường minh (không chọn sẵn mức mặc định).',
      'Upsert 0 on null-default must return exact intended error'
    );
    assert.equal(criteriaDigest(runPsql), digestBeforeNullToZeroUpsert, 'Catalog tables digest must remain byte-identical after refused upsert 0 on null-default');

    caseResults.push({ name: 'direct-and-upsert-default-refused-digest-unchanged', status: 'PASS' });

    // Direct action probes bypass the UI mutation hook's cache invalidation.
    // Null-clear created a new config version; reload that version before UI CRUD.
    // The unchanged CAS guard must reject stale versions, not be bypassed.
    await page.goto(`${origin}/criteria`);
    await page.waitFor("document.querySelector('button[data-edit-criterion]') !== null", { timeout: 15000, label: 'fresh catalog after direct action probes' });

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
      task: 'P108M1T12',
      pid: process.pid,
      timestamp: new Date().toISOString(),
      evidenceDir,
      screenshots: recordedScreenshots,
      layoutMeasurements,
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
