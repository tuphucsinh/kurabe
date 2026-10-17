#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');
const manifestPath = path.join(projectRoot, 'tests/fixtures/p108/synthetic-manifest.json');
const confirmationRuntimeScript = path.join(projectRoot, '.github/ci/confirmation-runtime.mjs');
const p108MigrationPath = path.join(projectRoot, 'supabase/migrations/20261017093100_p108_criteria_sets.sql');
const tsPath = path.join(projectRoot, 'node_modules/typescript/lib/typescript.js');
const tsUrl = pathToFileURL(tsPath).href;

// Set fallback env for offline module import
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.ci-offline-placeholder';

const loaderCode = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import tsModule from ${JSON.stringify(tsUrl)};
const ts = tsModule.default || tsModule;
const rootDir = ${JSON.stringify(projectRoot)};

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export {};", shortCircuit: true, format: "module" };
  }
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    for (const suffix of [".ts", ".tsx", "/index.ts", ".js", ""]) {
      const p = path.join(rootDir, "src", rel + suffix);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return nextResolve(pathToFileURL(p).href, context);
      }
    }
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (context && context.parentURL) {
        const base = new URL(specifier, context.parentURL);
        for (const suffix of [".ts", ".tsx", "/index.ts"]) {
          const cand = base.href + suffix;
          try {
            if (fs.existsSync(fileURLToPath(cand))) {
              return nextResolve(cand, context);
            }
          } catch {}
        }
      }
      throw err;
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:")) {
    const filePath = fileURLToPath(url);
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      const source = fs.readFileSync(filePath, "utf8");
      const transpiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext }
      });
      return { format: "module", source: transpiled.outputText, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}
`;
register('data:text/javascript,' + encodeURIComponent(loaderCode));

// Import real code under test
const typesModule = await import('@/types');
const applicability = await import('@/lib/criteria-applicability');
const displayAdmin = await import('@/lib/db/evaluation-display-admin');
const criteriaDb = await import('@/lib/db/criteria');

const { buildViewerScopeKey } = typesModule;

const {
  CRITERIA_SET_KEYS,
  ROLE_TO_SET_KEY,
  SET_KEY_TO_AUDIENCE,
  AUDIENCE_TO_SET_KEY,
  roleToSetKey,
  setKeyToAudience,
  audienceToSetKey,
  isCriteriaSetKey,
  isCriterionAudience,
  mapAudiencesToRoles,
  mapRolesToAudiences,
  decodeLegacyAppliesTo,
  decodeLegacyAppliesToRoles,
  encodeAudiencesToLegacy,
  AUDIENCE_ROLES,
  ROLE_TO_AUDIENCE,
} = applicability;

const {
  buildCriteriaSnapshot,
  filterGroupsForDisplay,
  groupsForVersion,
  loadCriteriaSnapshots,
  DEFAULT_SNAPSHOT_PAGE_SIZE,
} = displayAdmin;

function redact(text) {
  return String(text || '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(\b(?:POSTGRES_PASSWORD|PGPASSWORD|password|secret|key|service_role|token)\b\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^\s,"';]+)/gi, '$1[redacted]')
    .replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]*/g, '[REDACTED_JWT]');
}

// ============================================================================
// PART 1: PURE OFFLINE ROOT REGRESSIONS
// ============================================================================
console.log('--- [P108 Reader] Pure Root Regressions ---');

// 0. Real @/types buildViewerScopeKey verification
assert.equal(typeof buildViewerScopeKey, 'function', 'buildViewerScopeKey must be a real function from @/types');
const sampleScopeKey = buildViewerScopeKey({
  userId: 'user-001',
  role: 'Leader',
  primaryTeamId: 'team-beta',
  leaderTeamIds: ['team-charlie', 'team-alpha', 'team-charlie'],
});
assert.equal(
  sampleScopeKey,
  JSON.stringify({
    userId: 'user-001',
    role: 'Leader',
    primaryTeamId: 'team-beta',
    leaderTeamIds: ['team-alpha', 'team-charlie'],
  }),
  'real buildViewerScopeKey must deduplicate and sort leaderTeamIds'
);

// 1. CriteriaSetKey and Applicability Mappings
assert.deepEqual([...CRITERIA_SET_KEYS], ['leader', 'staff', 'worker']);

assert.equal(roleToSetKey('Manager'), 'leader');
assert.equal(roleToSetKey('Leader'), 'leader');
assert.equal(roleToSetKey('SubLeader'), 'leader');
assert.equal(roleToSetKey('Employee'), 'staff');
assert.equal(roleToSetKey('Worker'), 'worker');

assert.equal(setKeyToAudience('leader'), 'management');
assert.equal(setKeyToAudience('staff'), 'employee');
assert.equal(setKeyToAudience('worker'), 'worker');

assert.equal(audienceToSetKey('management'), 'leader');
assert.equal(audienceToSetKey('employee'), 'staff');
assert.equal(audienceToSetKey('worker'), 'worker');

assert.equal(isCriteriaSetKey('leader'), true);
assert.equal(isCriteriaSetKey('staff'), true);
assert.equal(isCriteriaSetKey('worker'), true);
assert.equal(isCriteriaSetKey('other'), false);
assert.equal(isCriteriaSetKey(null), false);
assert.equal(isCriteriaSetKey(undefined), false);
assert.equal(isCriteriaSetKey(123), false);

// 2. Legacy applicability helpers preserved
assert.ok(criteriaDb);
assert.ok(ROLE_TO_SET_KEY);
assert.ok(SET_KEY_TO_AUDIENCE);
assert.ok(AUDIENCE_TO_SET_KEY);
assert.ok(ROLE_TO_AUDIENCE);
assert.equal(DEFAULT_SNAPSHOT_PAGE_SIZE, 1000);

assert.deepEqual(mapRolesToAudiences(['Manager', 'Leader']), ['management']);
assert.deepEqual(decodeLegacyAppliesToRoles('both'), ['Manager', 'Leader', 'SubLeader', 'Employee']);
assert.deepEqual(decodeLegacyAppliesTo('leader'), ['management']);
assert.deepEqual(decodeLegacyAppliesTo('staff'), ['employee']);
assert.deepEqual(decodeLegacyAppliesTo('both'), ['management', 'employee']);
assert.deepEqual(decodeLegacyAppliesTo(null), ['management', 'employee']);
assert.deepEqual(decodeLegacyAppliesTo('unknown'), []);

assert.equal(encodeAudiencesToLegacy(['management']), 'leader');
assert.equal(encodeAudiencesToLegacy(['employee']), 'staff');
assert.equal(encodeAudiencesToLegacy(['management', 'employee']), 'both');

assert.deepEqual(mapAudiencesToRoles(['management']), ['Manager', 'Leader', 'SubLeader']);
assert.deepEqual(mapAudiencesToRoles(['employee']), ['Employee']);
assert.deepEqual(mapAudiencesToRoles(['worker']), ['Worker']);

// 3. Synthetic Manifest Mapping for ALL 93 criteria
assert.ok(fs.existsSync(manifestPath), `manifest must exist at ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let totalCriteriaSeen = 0;
for (const group of manifest.groups) {
  assert.ok(isCriteriaSetKey(group.set_key), `group ${group.id} must have valid set_key`);
  for (const crit of group.criteria) {
    totalCriteriaSeen += 1;
    assert.equal(crit.set_key, group.set_key, `criterion ${crit.id} set_key must match group set_key`);
    assert.ok(isCriteriaSetKey(crit.set_key), `criterion ${crit.id} must have valid set_key`);

    const expectedAudience = setKeyToAudience(crit.set_key);
    assert.ok(isCriterionAudience(expectedAudience), `expected audience must be valid`);

    const roles = AUDIENCE_ROLES[expectedAudience];
    assert.ok(roles.length > 0, `roles for ${expectedAudience} must be non-empty`);
    for (const role of roles) {
      assert.equal(roleToSetKey(role), crit.set_key, `role ${role} must map back to set_key ${crit.set_key}`);
    }

    assert.ok(Array.isArray(crit.levels) && crit.levels.length > 0, `criterion ${crit.id} must have levels`);
    for (const lvl of crit.levels) {
      assert.equal(typeof lvl.points, 'number');
      assert.ok(Number.isFinite(lvl.points));
      assert.ok(lvl.label && lvl.label.trim().length > 0);
    }
  }
}
assert.equal(totalCriteriaSeen, 93, 'must verify exactly 93 criteria in synthetic manifest');

// 4. buildCriteriaSnapshot - Missing / Unknown version
const missingSnapshot = buildCriteriaSnapshot(['missing-v1'], [], [], [], [], []);
assert.ok(missingSnapshot.unavailable.has('missing-v1'), 'unknown version must be marked unavailable');
assert.equal(missingSnapshot.groups.size, 0);

// 5. buildCriteriaSnapshot - P108 exact count validation
const v1Id = '00000000-0000-4000-8000-000000000001';
const v1Group1 = {
  version_id: v1Id,
  group_id: '00000000-0000-4000-8000-000000000011',
  code: 'G1',
  name: 'Group 1',
  short_name: 'G1',
  sort_order: 0,
  set_key: 'leader',
};
const v1Group2 = {
  version_id: v1Id,
  group_id: '00000000-0000-4000-8000-000000000012',
  code: 'G2',
  name: 'Group 2',
  short_name: 'G2',
  sort_order: 1,
  set_key: 'staff',
};
const v1Crit1 = {
  version_id: v1Id,
  criterion_id: '00000000-0000-4000-8000-000000000021',
  group_id: v1Group1.group_id,
  code: 'C1',
  name: 'Crit 1',
  description: null,
  applies_to: 'management',
  weight: 0,
  default_level_index: 0,
  sort_order: 0,
  set_key: 'leader',
};
const v1Crit2 = {
  version_id: v1Id,
  criterion_id: '00000000-0000-4000-8000-000000000022',
  group_id: v1Group2.group_id,
  code: 'C2',
  name: 'Crit 2',
  description: null,
  applies_to: 'employee',
  weight: 0,
  default_level_index: 0,
  sort_order: 0,
  set_key: 'staff',
};
const v1Levels = [
  { version_id: v1Id, criterion_id: v1Crit1.criterion_id, level_id: '00000000-0000-4000-8000-000000000031', points: 10, label: 'L1', description: null, sort_order: 0 },
  { version_id: v1Id, criterion_id: v1Crit1.criterion_id, level_id: '00000000-0000-4000-8000-000000000032', points: 5, label: 'L2', description: null, sort_order: 1 },
  { version_id: v1Id, criterion_id: v1Crit2.criterion_id, level_id: '00000000-0000-4000-8000-000000000033', points: 10, label: 'L1', description: null, sort_order: 0 },
  { version_id: v1Id, criterion_id: v1Crit2.criterion_id, level_id: '00000000-0000-4000-8000-000000000034', points: 5, label: 'L2', description: null, sort_order: 1 },
];
const v1Audiences = [
  { version_id: v1Id, criterion_id: v1Crit1.criterion_id, audience: 'management' },
  { version_id: v1Id, criterion_id: v1Crit2.criterion_id, audience: 'employee' },
];

const v1ValidConfig = {
  id: v1Id,
  version_no: 1,
  group_count: 2,
  criterion_count: 2,
  level_count: 4,
  audience_count: 2,
};

// 5a. Matching counts -> available
const validSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [v1Group1, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(validSnapshot.unavailable.has(v1Id), false, 'valid counts must not be unavailable');
assert.equal(validSnapshot.groups.size, 2);

// 5b. Mismatch group_count -> unavailable
const badGroupCount = buildCriteriaSnapshot(
  [v1Id],
  [{ ...v1ValidConfig, group_count: 3 }],
  [v1Group1, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(badGroupCount.unavailable.has(v1Id), true, 'group_count mismatch must be unavailable');

// 5c. Mismatch criterion_count -> unavailable
const badCritCount = buildCriteriaSnapshot(
  [v1Id],
  [{ ...v1ValidConfig, criterion_count: 3 }],
  [v1Group1, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(badCritCount.unavailable.has(v1Id), true, 'criterion_count mismatch must be unavailable');

// 5d. Mismatch level_count (e.g. 1 deleted level row) -> unavailable
const badLevelCount = buildCriteriaSnapshot(
  [v1Id],
  [{ ...v1ValidConfig, level_count: 5 }],
  [v1Group1, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(badLevelCount.unavailable.has(v1Id), true, 'level_count mismatch must be unavailable');

// 5e. Mismatch audience_count -> unavailable
const badAudienceCount = buildCriteriaSnapshot(
  [v1Id],
  [{ ...v1ValidConfig, audience_count: 3 }],
  [v1Group1, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(badAudienceCount.unavailable.has(v1Id), true, 'audience_count mismatch must be unavailable');

// 5f. Requirement 3 Counterexample: One count null but other mismatched -> unavailable
const mixedOneNullMismatched = buildCriteriaSnapshot(
  [v1Id],
  [{ ...v1ValidConfig, group_count: null, criterion_count: 999 }],
  [v1Group1, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(mixedOneNullMismatched.unavailable.has(v1Id), true, 'mixed count metadata with one null must be unavailable');

// 5g. Requirement 3 Counterexample: Partially null P108 header -> unavailable
const partiallyNullP108Header = buildCriteriaSnapshot(
  [v1Id],
  [{ ...v1ValidConfig, audience_count: null }],
  [v1Group1, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(partiallyNullP108Header.unavailable.has(v1Id), true, 'partially null P108 header must be unavailable');

// 5h. Requirement 3 Counterexample: All-null header with non-null P108 sets -> unavailable
const allNullHeaderWithP108Sets = buildCriteriaSnapshot(
  [v1Id],
  [{ id: v1Id, version_no: 1, group_count: null, criterion_count: null, level_count: null, audience_count: null }],
  [v1Group1, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(allNullHeaderWithP108Sets.unavailable.has(v1Id), true, 'all-null count header with non-null P108 sets must be unavailable');

// 6. Legacy Version (ALL 4 counts null/undefined AND rows genuinely legacy set_key null/absent -> structural validation only)
const legacyId = '00000000-0000-4000-8000-000000000002';
const legacyConfig = {
  id: legacyId,
  version_no: 1,
  group_count: null,
  criterion_count: null,
  level_count: null,
  audience_count: null,
};
const legacyGroup = {
  version_id: legacyId,
  group_id: '00000000-0000-4000-8000-000000000051',
  code: 'LG',
  name: 'Legacy Group',
  short_name: 'LG',
  sort_order: 0,
  set_key: null,
};
const legacyCrit = {
  version_id: legacyId,
  criterion_id: '00000000-0000-4000-8000-000000000061',
  group_id: legacyGroup.group_id,
  code: 'LC1',
  name: 'Legacy Crit 1',
  description: null,
  applies_to: 'both',
  weight: 0,
  default_level_index: 0,
  sort_order: 0,
  set_key: null,
};
const legacyLevels = [
  { version_id: legacyId, criterion_id: legacyCrit.criterion_id, level_id: '00000000-0000-4000-8000-000000000071', points: 10, label: 'L1', description: null, sort_order: 0 },
];
const legacyAudiences = [
  { version_id: legacyId, criterion_id: legacyCrit.criterion_id, audience: 'management' },
  { version_id: legacyId, criterion_id: legacyCrit.criterion_id, audience: 'employee' },
];

const legacyValidSnapshot = buildCriteriaSnapshot(
  [legacyId],
  [legacyConfig],
  [legacyGroup],
  [legacyCrit],
  legacyLevels,
  legacyAudiences
);
assert.equal(legacyValidSnapshot.unavailable.has(legacyId), false, 'legacy valid version must be available');

// 6a. Legacy criterion with 0 levels -> unavailable
const legacyZeroLevels = buildCriteriaSnapshot(
  [legacyId],
  [legacyConfig],
  [legacyGroup],
  [legacyCrit],
  [],
  legacyAudiences
);
assert.equal(legacyZeroLevels.unavailable.has(legacyId), true, 'legacy criterion with 0 levels must be unavailable');

// 6b. Legacy criterion with invalid points (non-finite) -> unavailable
const legacyBadPoints = buildCriteriaSnapshot(
  [legacyId],
  [legacyConfig],
  [legacyGroup],
  [legacyCrit],
  [{ ...legacyLevels[0], points: NaN }],
  legacyAudiences
);
assert.equal(legacyBadPoints.unavailable.has(legacyId), true, 'invalid level points must be unavailable');

// 7. Orphan Rows Rejection
// 7a. Orphan criterion (unknown group_id)
const orphanCritSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [v1Group1],
  [{ ...v1Crit1, group_id: '00000000-0000-4000-8000-999999999999' }],
  v1Levels.slice(0, 2),
  v1Audiences.slice(0, 1)
);
assert.equal(orphanCritSnapshot.unavailable.has(v1Id), true, 'orphan criterion must cause unavailable');

// 7b. Orphan level (unknown criterion_id)
const orphanLevelSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [v1Group1],
  [v1Crit1],
  [{ ...v1Levels[0], criterion_id: '00000000-0000-4000-8000-999999999999' }],
  v1Audiences.slice(0, 1)
);
assert.equal(orphanLevelSnapshot.unavailable.has(v1Id), true, 'orphan level must cause unavailable');

// 7c. Orphan audience (unknown criterion_id)
const orphanAudSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [v1Group1],
  [v1Crit1],
  v1Levels.slice(0, 2),
  [{ version_id: v1Id, criterion_id: '00000000-0000-4000-8000-999999999999', audience: 'management' }]
);
assert.equal(orphanAudSnapshot.unavailable.has(v1Id), true, 'orphan audience must cause unavailable');

// 8. Requirement 4: Set Matching, Rejection of Invalid Keys, and Audience Validation
// 8a. Criterion set_key does not match group set_key
const setMismatchSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [v1Group1], // leader
  [{ ...v1Crit1, set_key: 'staff' }], // staff in leader group
  v1Levels.slice(0, 2),
  v1Audiences.slice(0, 1)
);
assert.equal(setMismatchSnapshot.unavailable.has(v1Id), true, 'criterion/group set mismatch must cause unavailable');

// 8b. Audience mixing in P108 (worker audience for leader crit)
const audienceMixingSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [v1Group1], // leader
  [v1Crit1],  // leader
  v1Levels.slice(0, 2),
  [{ version_id: v1Id, criterion_id: v1Crit1.criterion_id, audience: 'worker' }]
);
assert.equal(audienceMixingSnapshot.unavailable.has(v1Id), true, 'audience mixing in P108 must cause unavailable');

// 8c. Invalid non-null group set_key -> unavailable (must not silently normalize to null)
const invalidGroupKeySnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [{ ...v1Group1, set_key: 'invalid_role_group' }, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(invalidGroupKeySnapshot.unavailable.has(v1Id), true, 'invalid non-null group set_key must cause unavailable');

// 8d. Invalid non-null criterion set_key -> unavailable
const invalidCritKeySnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [v1Group1, v1Group2],
  [{ ...v1Crit1, set_key: 'invalid_role_group' }, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(invalidCritKeySnapshot.unavailable.has(v1Id), true, 'invalid non-null criterion set_key must cause unavailable');

// 8e. P108 group/criterion null mismatch (group has set_key, criterion is null) -> unavailable
const groupHasSetCritNullSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [v1Group1, v1Group2],
  [{ ...v1Crit1, set_key: null }, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(groupHasSetCritNullSnapshot.unavailable.has(v1Id), true, 'group set_key with null criterion set_key must cause unavailable');

// 8f. P108 group/criterion null mismatch (group is null, criterion has set_key) -> unavailable
const groupNullCritHasSetSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [v1ValidConfig],
  [{ ...v1Group1, set_key: null }, v1Group2],
  [v1Crit1, v1Crit2],
  v1Levels,
  v1Audiences
);
assert.equal(groupNullCritHasSetSnapshot.unavailable.has(v1Id), true, 'null group set_key with non-null criterion set_key must cause unavailable');

// 8g. P108 criterion with 0 audiences -> unavailable
const p108ZeroAudienceSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [{ ...v1ValidConfig, group_count: 1, criterion_count: 1, level_count: 2, audience_count: 0 }],
  [v1Group1],
  [v1Crit1],
  v1Levels.slice(0, 2),
  [] // 0 audiences
);
assert.equal(p108ZeroAudienceSnapshot.unavailable.has(v1Id), true, 'P108 criterion with 0 audiences must cause unavailable');

// 8h. P108 criterion with multiple audiences -> unavailable
const p108MultiAudienceSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [{ ...v1ValidConfig, group_count: 1, criterion_count: 1, level_count: 2, audience_count: 2 }],
  [v1Group1],
  [v1Crit1],
  v1Levels.slice(0, 2),
  [
    { version_id: v1Id, criterion_id: v1Crit1.criterion_id, audience: 'management' },
    { version_id: v1Id, criterion_id: v1Crit1.criterion_id, audience: 'employee' },
  ]
);
assert.equal(p108MultiAudienceSnapshot.unavailable.has(v1Id), true, 'P108 criterion with multiple audiences must cause unavailable');

// 8i. Active criteria reader/admin validations with mock RPC
const mockDb = (data, error = null) => ({
  rpc: async () => ({ data, error }),
});

// Invalid group set_key throws
await assert.rejects(
  () => criteriaDb.getAllCriteriaGroups(mockDb({
    version: 1,
    version_id: '00000000-0000-4000-8000-000000000001',
    group_count: 1,
    criterion_count: 0,
    level_count: 0,
    audience_count: 0,
    groups: [{ id: 'g1', code: 'G1', name: 'G1', sort_order: 0, set_key: 'invalid_key', criteria: [] }],
  })),
  /Invalid group set_key/
);

// Mismatched group and criterion set_key throws
await assert.rejects(
  () => criteriaDb.getAllCriteriaGroups(mockDb({
    version: 1,
    version_id: '00000000-0000-4000-8000-000000000001',
    group_count: 1,
    criterion_count: 1,
    level_count: 1,
    audience_count: 1,
    groups: [{
      id: 'g1',
      code: 'G1',
      name: 'G1',
      sort_order: 0,
      set_key: 'leader',
      criteria: [{
        id: 'c1',
        group_id: 'g1',
        code: 'C1',
        name: 'C1',
        sort_order: 0,
        set_key: 'staff',
        audiences: ['employee'],
        levels: [{ id: 'l1', points: 10, label: 'L1', sort_order: 0 }],
      }],
    }],
  })),
  /Mismatch between group set_key and criterion set_key/
);

// 9. Valid Empty Group Remains Available in Snapshot
const emptyGroupSnapshot = buildCriteriaSnapshot(
  [v1Id],
  [{ ...v1ValidConfig, group_count: 2, criterion_count: 1, level_count: 2, audience_count: 1 }],
  [v1Group1, v1Group2], // G1 has crit1, G2 has NO criteria
  [v1Crit1],
  v1Levels.slice(0, 2),
  v1Audiences.slice(0, 1)
);
assert.equal(emptyGroupSnapshot.unavailable.has(v1Id), false, 'empty group must not cause unavailable');
assert.equal(emptyGroupSnapshot.groups.size, 2, 'both groups must be present in snapshot');
const g2 = emptyGroupSnapshot.groups.get(`${v1Id}:${v1Group2.group_id}`);
assert.ok(g2, 'empty group G2 must exist in snapshot');
assert.equal(g2.criteria.length, 0, 'empty group must have criteria array length 0');
assert.equal(g2.setKey, 'staff');

// 10. Display DTO Filtering
// 10a. Valid empty group is dropped after role filtering in DTO
const displayGroupsForLeader = filterGroupsForDisplay(
  [emptyGroupSnapshot.groups.get(`${v1Id}:${v1Group1.group_id}`), g2],
  'Leader'
);
assert.equal(displayGroupsForLeader.length, 1, 'empty group G2 must be dropped from display DTO');
assert.equal(displayGroupsForLeader[0].id, v1Group1.group_id);

// 10b. P108 subject set only filtering
const mixedGroups = [
  {
    id: 'grp-leader',
    code: 'GL',
    name: 'Leader Group',
    shortName: 'GL',
    setKey: 'leader',
    criteria: [
      { id: 'c-lead', code: 'CL', name: 'Crit Lead', appliesTo: ['Manager', 'Leader', 'SubLeader'], levels: [{ points: 10, label: 'L1' }], setKey: 'leader' },
    ],
  },
  {
    id: 'grp-staff',
    code: 'GS',
    name: 'Staff Group',
    shortName: 'GS',
    setKey: 'staff',
    criteria: [
      { id: 'c-staff', code: 'CS', name: 'Crit Staff', appliesTo: ['Employee'], levels: [{ points: 10, label: 'L1' }], setKey: 'staff' },
    ],
  },
  {
    id: 'grp-worker',
    code: 'GW',
    name: 'Worker Group',
    shortName: 'GW',
    setKey: 'worker',
    criteria: [
      { id: 'c-work', code: 'CW', name: 'Crit Worker', appliesTo: ['Worker'], levels: [{ points: 10, label: 'L1' }], setKey: 'worker' },
    ],
  },
];

const leaderDtoGroups = filterGroupsForDisplay(mixedGroups, 'Manager');
assert.equal(leaderDtoGroups.length, 1);
assert.equal(leaderDtoGroups[0].id, 'grp-leader');
assert.equal(leaderDtoGroups[0].criteria[0].id, 'c-lead');

const staffDtoGroups = filterGroupsForDisplay(mixedGroups, 'Employee');
assert.equal(staffDtoGroups.length, 1);
assert.equal(staffDtoGroups[0].id, 'grp-staff');
assert.equal(staffDtoGroups[0].criteria[0].id, 'c-staff');

const workerDtoGroups = filterGroupsForDisplay(mixedGroups, 'Worker');
assert.equal(workerDtoGroups.length, 1);
assert.equal(workerDtoGroups[0].id, 'grp-worker');
assert.equal(workerDtoGroups[0].criteria[0].id, 'c-work');

// 10c. Legacy multi-audience filtering unchanged
const legacyDisplayGroups = [
  {
    id: 'grp-leg',
    code: 'GL',
    name: 'Legacy Group',
    shortName: 'GL',
    setKey: null,
    criteria: [
      { id: 'c-both', code: 'CB', name: 'Crit Both', appliesTo: ['Manager', 'Leader', 'SubLeader', 'Employee'], levels: [{ points: 10, label: 'L1' }], setKey: null },
      { id: 'c-worker-only', code: 'CW', name: 'Crit Worker Only', appliesTo: ['Worker'], levels: [{ points: 10, label: 'L1' }], setKey: null },
    ],
  },
];

const legacyForEmployee = filterGroupsForDisplay(legacyDisplayGroups, 'Employee');
assert.equal(legacyForEmployee.length, 1);
assert.equal(legacyForEmployee[0].criteria.length, 1);
assert.equal(legacyForEmployee[0].criteria[0].id, 'c-both');

const legacyForWorker = filterGroupsForDisplay(legacyDisplayGroups, 'Worker');
assert.equal(legacyForWorker.length, 1);
assert.equal(legacyForWorker[0].criteria.length, 1);
assert.equal(legacyForWorker[0].criteria[0].id, 'c-worker-only');

// 11. Requirement 6: pageSize input validation before DB requests
const invalidPageSize0 = await loadCriteriaSnapshots(['any-id'], { pageSize: 0 });
assert.ok(invalidPageSize0.unavailable.has('any-id'), 'pageSize=0 must return unavailable before DB request');
assert.equal(invalidPageSize0.groups.size, 0);

const invalidPageSizeNeg = await loadCriteriaSnapshots(['any-id'], { pageSize: -5 });
assert.ok(invalidPageSizeNeg.unavailable.has('any-id'), 'negative pageSize must return unavailable before DB request');

const invalidPageSizeFloat = await loadCriteriaSnapshots(['any-id'], { pageSize: 2.5 });
assert.ok(invalidPageSizeFloat.unavailable.has('any-id'), 'non-integer pageSize must return unavailable before DB request');

const invalidPageSizeNaN = await loadCriteriaSnapshots(['any-id'], { pageSize: NaN });
assert.ok(invalidPageSizeNaN.unavailable.has('any-id'), 'NaN pageSize must return unavailable before DB request');

console.log('PASS: All pure root offline regressions verified successfully.');

// ============================================================================
// PART 2: INTEGRATION TESTS (--integration mode)
// ============================================================================
const isIntegration = process.argv.includes('--integration');

if (!isIntegration) {
  console.log('Skipping integration mode (pass --integration to run real local PostgREST stack tests).');
  process.exit(0);
}

console.log('\n--- [P108 Reader] Starting Local Stack Integration Tests ---');

function runPsql(dbTarget, sql, expectPass = true) {
  const result = spawnSync('psql', [
    '-X',
    '-h', dbTarget.host,
    '-p', String(dbTarget.port),
    '-U', dbTarget.user,
    '-d', dbTarget.database,
    '-qAt',
    '-v', 'ON_ERROR_STOP=1',
  ], {
    cwd: projectRoot,
    input: sql,
    env: { ...process.env, PGPASSWORD: dbTarget.password, PGPASSFILE: '/dev/null' },
    encoding: 'utf8',
    timeout: 30000,
  });

  if (result.error) {
    throw new Error(`psql process error: ${redact(result.error.message)}`);
  }

  if (expectPass && result.status !== 0) {
    throw new Error(`psql failed: ${redact(result.stderr || '')}\nSQL was: ${sql.slice(0, 200)}`);
  }

  return {
    out: String(result.stdout || '').trim(),
    err: redact(String(result.stderr || '').trim()),
    status: result.status,
  };
}

let runtimeRoot = null;
let testError = null;
let cleanupError = null;

try {
  runtimeRoot = path.join(projectRoot, '.tmp', `p108-reader-${Date.now()}-${process.pid}`);
  fs.mkdirSync(runtimeRoot, { recursive: true });
  process.env.KURABE_CI_RUNTIME_ROOT = runtimeRoot;

  console.log('[Setup] Starting owned confirmation-runtime lifecycle...');
  const startRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'start'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
    timeout: 120000,
  });
  if (startRes.error || startRes.status !== 0) {
    throw new Error(`confirmation-runtime start failed: ${startRes.error?.message || startRes.status}`);
  }

  console.log('[Setup] Bootstrapping confirmation-runtime stack...');
  const bootstrapRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'bootstrap'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
    timeout: 120000,
  });
  if (bootstrapRes.error || bootstrapRes.status !== 0) {
    throw new Error(`confirmation-runtime bootstrap failed: ${bootstrapRes.error?.message || bootstrapRes.status}`);
  }

  const statePath = path.join(runtimeRoot, 'runtime-state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const supabaseUrl = state.supabaseUrl;
  const serviceRoleKey = state.serviceRoleKey;
  const dbTarget = {
    host: '127.0.0.1',
    port: String(state.dbPort),
    database: state.db,
    user: 'postgres',
    password: state.password,
  };

  // Reconfigure PostgREST with physical max_rows = 1000
  console.log('[Setup] Configuring PostgREST max-rows = 1000...');
  const postgrestConfPath = path.join(runtimeRoot, 'postgrest.conf');
  let currentConf = fs.readFileSync(postgrestConfPath, 'utf8');
  if (!currentConf.includes('max-rows = 1000')) {
    currentConf += '\nmax-rows = 1000\n';
    fs.writeFileSync(postgrestConfPath, currentConf, { mode: 0o600 });
    const restartRes = spawnSync('docker', ['restart', `${state.name}-rest`], { encoding: 'utf8' });
    if (restartRes.status !== 0) {
      throw new Error(`Failed to restart PostgREST container: ${restartRes.stderr}`);
    }

    // Bounded readiness check: loopback health/read request to avoid blind race
    console.log('[Setup] Awaiting PostgREST readiness...');
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const ping = await fetch(`${supabaseUrl}/rest/v1/`, {
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        });
        if (ping.ok || ping.status === 200 || ping.status === 404) {
          ready = true;
          break;
        }
      } catch {
        // still starting up
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) {
      throw new Error('PostgREST did not become ready within 15 seconds after restart');
    }
    console.log('[Setup] PostgREST is ready.');
  }

  // Ensure P108 migration is applied
  const colCheck = runPsql(dbTarget, `
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'criteria' AND column_name = 'set_key';
  `);
  if (colCheck.out !== '1') {
    console.log('[Setup] Applying P108 migration SQL...');
    const migrationSql = fs.readFileSync(p108MigrationPath, 'utf8');
    runPsql(dbTarget, migrationSql);
  }

  // Close active evaluation periods in the disposable test fixture so save_criteria_config can proceed
  console.log('[Setup] Closing active evaluation periods in disposable test fixture...');
  runPsql(dbTarget, `UPDATE public.evaluation_periods SET status = 'closed', closed_at = now() WHERE status = 'active';`);

  // 1. Build extended manifest in memory: 93 criteria * 12 levels = 1116 level rows per version
  console.log('[Integration 1] Building extended levels in-memory (93 criteria * 12 levels = 1116 per version)...');
  const baseFixture = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  function buildExtendedConfig(variantName) {
    let globalLevelCounter = 1;
    const groups = baseFixture.groups.map((g, gIdx) => {
      const criteria = g.criteria.map((c, cIdx) => {
        const levels = [];
        for (let l = 0; l < 12; l++) {
          const levelId = `10810000-0003-4000-8000-${String(globalLevelCounter++).padStart(12, '0')}`;
          levels.push({
            id: levelId,
            points: 120 - l * 10,
            label: `Level ${l + 1} (${variantName})`,
            description: `Synthetic level ${l + 1}`,
            sort_order: l,
          });
        }
        return {
          id: c.id,
          set_key: c.set_key,
          code: c.code,
          name: `${c.name} - ${variantName}`,
          description: c.description ?? null,
          weight: c.weight ?? 0,
          default_level_index: 0,
          sort_order: c.sort_order ?? cIdx,
          levels,
        };
      });

      return {
        id: g.id,
        set_key: g.set_key,
        code: g.code,
        name: `${g.name} - ${variantName}`,
        short_name: g.short_name ?? g.code,
        sort_order: g.sort_order ?? gIdx,
        criteria,
      };
    });

    return { groups };
  }

  // Save 3 distinct versions via REAL RPC save_criteria_config
  console.log('[Integration 2] Saving 3 versions via REAL RPC save_criteria_config...');
  const versionIds = [];

  // Get current active version
  const curVerRes = runPsql(dbTarget, `SELECT COALESCE(max(version_no), 0) FROM public.criteria_config_versions WHERE is_active;`);
  let expectedVersion = Number(curVerRes.out);

  for (const variant of ['V101', 'V102', 'V103']) {
    const configData = buildExtendedConfig(variant);
    const saveSql = `
      SELECT (public.save_criteria_config('${JSON.stringify(configData).replaceAll("'", "''")}'::jsonb, ${expectedVersion}))->>'version_id';
    `;
    const res = runPsql(dbTarget, saveSql);
    const versionId = res.out;
    assert.ok(versionId && versionId.length > 20, `valid versionId must be returned for ${variant}`);
    versionIds.push(versionId);

    // Verify stored metadata counts on the version row
    const countsSql = `
      SELECT group_count, criterion_count, level_count, audience_count
      FROM public.criteria_config_versions WHERE id = '${versionId}';
    `;
    const countsOut = runPsql(dbTarget, countsSql).out.split('|');
    assert.equal(Number(countsOut[0]), 18, 'stored group_count must be 18');
    assert.equal(Number(countsOut[1]), 93, 'stored criterion_count must be 93');
    assert.equal(Number(countsOut[2]), 1116, 'stored level_count must be 1116');
    assert.equal(Number(countsOut[3]), 93, 'stored audience_count must be 93');

    expectedVersion += 1;
  }
  assert.equal(versionIds.length, 3, 'must have saved 3 versions');
  console.log(`Saved 3 versions: ${versionIds.join(', ')}`);

  // 2. Prove table cap physically: unpaginated real REST query returns 1000 while exact count is 1116
  console.log('[Integration 3] Proving table cap physically via unpaginated REST query...');
  const unpaginatedUrl = `${supabaseUrl}/rest/v1/criterion_level_versions?select=level_id&version_id=eq.${versionIds[0]}`;
  const unpaginatedRes = await fetch(unpaginatedUrl, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
    },
  });
  assert.ok(unpaginatedRes.ok, `unpaginated REST query must succeed (status=${unpaginatedRes.status})`);
  const unpaginatedRows = await unpaginatedRes.json();
  const contentRange = unpaginatedRes.headers.get('content-range');
  console.log(`Unpaginated REST returned ${unpaginatedRows.length} rows. Content-Range: ${contentRange}`);
  assert.equal(unpaginatedRows.length, 1000, 'unpaginated REST query must be physically capped at 1000 rows');
  assert.ok(contentRange && contentRange.endsWith('/1116'), `total exact count in Content-Range must be 1116, got: ${contentRange}`);

  // 3. Import genuine @supabase/supabase-js and execute ACTUAL loader
  console.log('[Integration 4] Executing ACTUAL paginated loader across all 3 versions...');
  const { createClient } = await import('@supabase/supabase-js');
  const genuineClient = createClient(supabaseUrl, serviceRoleKey);

  const snapshot = await loadCriteriaSnapshots(versionIds, { client: genuineClient, pageSize: 1000 });
  assert.equal(snapshot.unavailable.size, 0, 'actual paginated loader must succeed with 0 unavailable versions');

  for (const vId of versionIds) {
    const groups = groupsForVersion(vId, snapshot);
    assert.equal(groups.length, 18, `version ${vId} must have 18 groups`);
    let totalCriteria = 0;
    let totalLevels = 0;
    for (const g of groups) {
      assert.ok(g.setKey, `group in version ${vId} must have setKey`);
      totalCriteria += g.criteria.length;
      for (const c of g.criteria) {
        assert.equal(c.setKey, g.setKey);
        totalLevels += c.levels.length;
      }
    }
    assert.equal(totalCriteria, 93, `version ${vId} must have 93 criteria`);
    assert.equal(totalLevels, 1116, `version ${vId} must have all 1116 levels loaded completely`);
  }
  console.log('SUCCESS: All 3 versions (>1000 level rows each) loaded completely!');

  // 4. Force real truncation with oversized requested page size (1500 > PostgREST cap of 1000)
  console.log('[Integration 5] Forcing real truncation with pageSize=1500 against 1000 row cap...');
  const truncatedSnapshot = await loadCriteriaSnapshots([versionIds[0]], { client: genuineClient, pageSize: 1500 });
  assert.ok(truncatedSnapshot.unavailable.has(versionIds[0]), 'forced truncation must cause version to be unavailable');
  console.log('SUCCESS: Truncation resulted in unavailable (not partial snapshot).');

  // 5. Delete ONE level row as postgres -> stored metadata mismatch -> unavailable
  console.log('[Integration 6] Deleting ONE level row in DB to verify stored metadata mismatch...');
  runPsql(dbTarget, `
    DELETE FROM public.criterion_level_versions
    WHERE version_id = '${versionIds[1]}'
      AND level_id = (SELECT level_id FROM public.criterion_level_versions WHERE version_id = '${versionIds[1]}' LIMIT 1);
  `);
  const mismatchSnapshot = await loadCriteriaSnapshots([versionIds[1]], { client: genuineClient, pageSize: 1000 });
  assert.ok(mismatchSnapshot.unavailable.has(versionIds[1]), 'level_count mismatch after row deletion must cause unavailable');
  console.log('SUCCESS: Level deletion resulted in unavailable (stored metadata count mismatch strictly enforced).');

  console.log('\nALL P108 SNAPSHOT READER INTEGRATION TESTS PASSED!');
} catch (err) {
  testError = err;
  console.error('Integration test failure:', redact(err.message));
} finally {
  if (runtimeRoot) {
    console.log('[Teardown] Cleaning up owned disposable runtime...');
    try {
      const cleanupRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'cleanup'], {
        cwd: projectRoot,
        stdio: 'inherit',
        env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
        timeout: 120000,
      });
      if (cleanupRes.error || cleanupRes.status !== 0) {
        cleanupError = new Error(`Cleanup failed: ${cleanupRes.error?.message || cleanupRes.status}`);
      }
    } catch (cleanupErr) {
      cleanupError = cleanupErr;
    }
  }

  if (testError && cleanupError) {
    console.error('Additionally, cleanup error occurred:', cleanupError);
    throw new Error(`Test failed: ${testError.message} (cleanup also failed: ${cleanupError.message})`);
  }
  if (testError) throw testError;
  if (cleanupError) throw cleanupError;
}
