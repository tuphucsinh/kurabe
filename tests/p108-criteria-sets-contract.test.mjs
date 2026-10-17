#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractScalar, jsonResult, isCommandTag, redact } from './integration/p108-criteria-sets.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

const migrationPath = path.join(projectRoot, 'supabase/migrations/20261017093100_p108_criteria_sets.sql');
const rollbackPath = path.join(projectRoot, 'db/rollback-p108-criteria-sets.sql');
const typesPath = path.join(projectRoot, 'src/types/database.ts');

console.log('--- P108 Criteria Sets Contract Test ---');

// 1. Verify migration file exists and is non-empty
assert.ok(fs.existsSync(migrationPath), 'migration file must exist');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
assert.ok(migrationSql.length > 500, 'migration file must have substantial content');

// Preflight assertions
assert.match(migrationSql, /P108M1T03_PREFLIGHT_FAILED/, 'preflight must fail closed with P108M1T03_PREFLIGHT_FAILED');
assert.match(migrationSql, /obj_description[\s\S]*?validate_criteria_config[\s\S]*?kurabe:p99m3t02/, 'validate_criteria_config provenance check');
assert.match(migrationSql, /obj_description[\s\S]*?get_active_criteria_config[\s\S]*?kurabe:p99m3t02/, 'get_active_criteria_config provenance check');
assert.match(migrationSql, /obj_description[\s\S]*?save_criteria_config[\s\S]*?kurabe:p99m3t02/, 'save_criteria_config provenance check');
assert.match(migrationSql, /save_evaluation_round_transaction_active_only/, 'evaluation writer check must be present');
assert.match(migrationSql, /UNIQUE \(code\)/, 'preflight must check legacy UNIQUE(code)');
assert.match(migrationSql, /UNIQUE \(version_id, code\)/, 'preflight must check legacy UNIQUE(version_id, code)');

// DDL assertions
assert.match(migrationSql, /ALTER TABLE public\.criteria_groups\s+ADD COLUMN IF NOT EXISTS set_key text CHECK \(set_key IN \('leader', 'staff', 'worker'\)\)/, 'criteria_groups set_key column');
assert.match(migrationSql, /ALTER TABLE public\.criteria\s+ADD COLUMN IF NOT EXISTS set_key text CHECK \(set_key IN \('leader', 'staff', 'worker'\)\)/, 'criteria set_key column');
assert.match(migrationSql, /ALTER TABLE public\.criteria_groups\s+ADD CONSTRAINT criteria_groups_id_set_key_key UNIQUE \(id, set_key\)/, 'criteria_groups composite unique');
assert.match(migrationSql, /FOREIGN KEY \(group_id, set_key\)\s+REFERENCES public\.criteria_groups \(id, set_key\)/, 'criteria composite foreign key');
assert.match(migrationSql, /criteria_groups_active_set_code_uidx[\s\S]*?WHERE is_active/, 'criteria_groups active unique index');
assert.match(migrationSql, /criteria_active_set_code_uidx[\s\S]*?WHERE is_active/, 'criteria active unique index');

// Version table columns and indexes
assert.match(migrationSql, /group_count integer/, 'criteria_config_versions group_count');
assert.match(migrationSql, /criterion_count integer/, 'criteria_config_versions criterion_count');
assert.match(migrationSql, /level_count integer/, 'criteria_config_versions level_count');
assert.match(migrationSql, /audience_count integer/, 'criteria_config_versions audience_count');
assert.match(migrationSql, /criteria_group_versions_legacy_uidx[\s\S]*?WHERE set_key IS NULL/, 'criteria_group_versions legacy partial unique');
assert.match(migrationSql, /criteria_group_versions_set_code_uidx[\s\S]*?WHERE set_key IS NOT NULL/, 'criteria_group_versions set partial unique');
assert.match(migrationSql, /criterion_versions_legacy_uidx[\s\S]*?WHERE set_key IS NULL/, 'criterion_versions legacy partial unique');
assert.match(migrationSql, /criterion_versions_set_code_uidx[\s\S]*?WHERE set_key IS NOT NULL/, 'criterion_versions set partial unique');

// Function lock order and invariants
assert.match(migrationSql, /LOCK TABLE public\.evaluation_periods IN SHARE MODE/, 'lock order 1: LOCK evaluation_periods SHARE');
assert.match(migrationSql, /pg_advisory_xact_lock/, 'lock order 2: advisory lock');
assert.match(migrationSql, /P108_PERIOD_ACTIVE/, 'lock order 3: active period check');
assert.match(migrationSql, /current_setting\('transaction_isolation'\) <> 'read committed'/, 'lock order 4: read committed assert');
assert.match(migrationSql, /P108_SET_IMMUTABLE/, 'immutable set per UUID assert');
assert.match(migrationSql, /temp tables keyed by \(set_key, code\)/i, 'temp tables comment or definition');

// ACL selective closure & invariant assertions
assert.match(migrationSql, /EVIDENCE-DRIVEN SELECTIVE TABLE ACL CLOSURE/, 'evidence-driven selective table ACL closure');
assert.match(migrationSql, /P108M1T03_ACL_CLOSURE_FAILED/, 'closure verification assert');
assert.match(migrationSql, /information_schema\.table_privileges/, 'table_privileges query for selective revoke');
assert.doesNotMatch(migrationSql, /GRANT EXECUTE ON FUNCTION public\.get_active_criteria_config\(\) TO anon/, 'RPC EXECUTE grants must remain unchanged (no regrant to anon)');

// Constraints: P107 writer untouched, no NOT VALID
assert.doesNotMatch(migrationSql, /NOT VALID/, 'NOT VALID is prohibited');

// 2. Verify rollback artifact exists and has both branches
assert.ok(fs.existsSync(rollbackPath), 'rollback artifact must exist');
const rollbackSql = fs.readFileSync(rollbackPath, 'utf8');
assert.match(rollbackSql, /P108_ROLLBACK_UNAPPROVED/, 'rollback approval guard');
assert.match(rollbackSql, /revert-import/, 'rollback (a) revert-import branch');
assert.match(rollbackSql, /P108_REVERT_IMPORT_BLOCKED/, 'revert-import guards');
assert.match(rollbackSql, /kurabe\.p108_expected_import_version_id/, 'revert-import explicit expected version identity');
assert.match(rollbackSql, /kurabe\.p108_pre_migration_acl/, 'schema rollback captured ACL input');
assert.match(rollbackSql, /P108_SCHEMA_ROLLBACK_REFUSED/, 'schema rollback guards after import');
assert.match(rollbackSql, /criteria_groups_code_key/, 'schema rollback recreates legacy constraint');
assert.match(rollbackSql, /criteria_code_key/, 'schema rollback recreates legacy criteria code constraint');
assert.doesNotMatch(rollbackSql, /GRANT EXECUTE ON FUNCTION public\.get_active_criteria_config\(\) TO anon/, 'schema rollback must not regrant RPC EXECUTE to anon');

// 3. Verify TypeScript database definitions
assert.ok(fs.existsSync(typesPath), 'types file must exist');
const typesContent = fs.readFileSync(typesPath, 'utf8');
assert.match(typesContent, /criteria: {[\s\S]*?set_key: string \| null/, 'criteria table set_key in Row');
assert.match(typesContent, /criteria_groups: {[\s\S]*?set_key: string \| null/, 'criteria_groups table set_key in Row');
assert.match(typesContent, /criteria_config_versions: {[\s\S]*?group_count: number \| null/, 'criteria_config_versions group_count');
assert.match(typesContent, /criteria_config_versions: {[\s\S]*?criterion_count: number \| null/, 'criteria_config_versions criterion_count');
assert.match(typesContent, /criteria_config_versions: {[\s\S]*?level_count: number \| null/, 'criteria_config_versions level_count');
assert.match(typesContent, /criteria_config_versions: {[\s\S]*?audience_count: number \| null/, 'criteria_config_versions audience_count');
assert.match(typesContent, /criteria_group_versions: {[\s\S]*?set_key: string \| null/, 'criteria_group_versions set_key');
assert.match(typesContent, /criterion_versions: {[\s\S]*?set_key: string \| null/, 'criterion_versions set_key');

// 4. Test Canonical Checksum Algorithm Contract in JavaScript
function computeCanonicalHash(config) {
  // Sort groups by (set_key, sort_order, code)
  const normalizedGroups = (config.groups || []).map((g) => {
    const derivedAudience = g.set_key === 'leader' ? 'management' : g.set_key === 'staff' ? 'employee' : 'worker';
    const criteria = (g.criteria || []).map((c) => {
      const levels = (c.levels || []).map((l, lIdx) => ({
        id: l.id,
        criterion_id: c.id,
        points: l.points,
        label: l.label,
        description: l.description ?? null,
        sort_order: l.sort_order ?? lIdx,
      })).sort((a, b) => a.sort_order - b.sort_order);

      return {
        id: c.id,
        group_id: g.id,
        set_key: c.set_key,
        code: c.code,
        name: c.name,
        description: c.description ?? null,
        applies_to: derivedAudience,
        weight: c.weight ?? 0,
        default_level_index: c.default_level_index ?? null,
        sort_order: c.sort_order ?? 0,
        audiences: [derivedAudience],
        levels,
      };
    }).sort((a, b) => (a.sort_order - b.sort_order) || a.code.localeCompare(b.code));

    return {
      id: g.id,
      set_key: g.set_key,
      code: g.code,
      name: g.name,
      short_name: g.short_name ?? null,
      sort_order: g.sort_order ?? 0,
      criteria,
    };
  }).sort((a, b) => a.set_key.localeCompare(b.set_key) || (a.sort_order - b.sort_order) || a.code.localeCompare(b.code));

  const canonicalJson = JSON.stringify({ groups: normalizedGroups });
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

const fixture1 = {
  groups: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      set_key: 'staff',
      code: 'Q',
      name: 'Quality',
      criteria: [
        {
          id: '00000000-0000-0000-0000-000000000011',
          set_key: 'staff',
          code: 'Q1',
          name: 'Quality Output',
          levels: [{ id: '00000000-0000-0000-0000-000000000021', points: 10, label: 'High' }],
        },
      ],
    },
  ],
};

const fixture2 = structuredClone(fixture1);
const hash1 = computeCanonicalHash(fixture1);
const hash2 = computeCanonicalHash(fixture2);
assert.equal(hash1, hash2, 'identical content must have identical canonical hash');

const fixtureModified = structuredClone(fixture1);
fixtureModified.groups[0].name = 'Quality Changed';
const hash3 = computeCanonicalHash(fixtureModified);
assert.notEqual(hash1, hash3, 'modified content must have distinct canonical hash');

// 5. Test SET/RESET Output Wrapping & Scalar Extraction Invariants (Falsifiable)
console.log('Testing scalar extraction and noise filtering...');

// Positive scalar extraction when wrapped in SET / RESET tags
const wrappedScalar = 'SET\n2\nRESET';
assert.equal(extractScalar(wrappedScalar), '2', 'extractScalar must strip SET/RESET command tags');
assert.ok(Number(extractScalar(wrappedScalar)) >= 2, 'Number() on extracted scalar must be >= 2');

// Positive single scalar without wrapping
assert.equal(extractScalar('  42  '), '42');
assert.equal(extractScalar('00000000-0000-0000-0000-000000000301'), '00000000-0000-0000-0000-000000000301');

// Command tag tester verification
assert.ok(isCommandTag('SET'));
assert.ok(isCommandTag('RESET'));
assert.ok(isCommandTag('BEGIN'));
assert.ok(isCommandTag('COMMIT'));
assert.ok(!isCommandTag('2'));
assert.ok(!isCommandTag('Draft'));

// Falsifiable: must fail closed when multiple numeric data rows returned (extra rows)
assert.throws(() => {
  extractScalar('SET\n2\n3\nRESET');
}, /Expected single scalar output, got 2 rows/);

// Falsifiable: must fail closed when multiple data rows returned
assert.throws(() => {
  extractScalar('row1\nrow2');
}, /Expected single scalar output, got 2 rows/);

// Falsifiable: must fail closed when no scalar returned (only command tags or empty)
assert.throws(() => {
  extractScalar('SET\nRESET');
}, /No scalar found in output/);

assert.throws(() => {
  extractScalar('');
}, /No scalar found in output/);

// Strict JSON parsing with SET / RESET wrapping
const wrappedJson = 'SET\n{"version": 4, "groups": []}\nRESET';
const parsedJson = jsonResult(wrappedJson);
assert.equal(parsedJson.version, 4);

// Falsifiable: jsonResult must fail closed on multiple JSON rows
assert.throws(() => {
  jsonResult('SET\n{"a":1}\n{"b":2}\nRESET');
}, /Expected single JSON result line, got 2 rows/);

// Falsifiable: jsonResult must fail closed on invalid JSON or noise
assert.throws(() => {
  jsonResult('SET\nNOT_VALID_JSON\nRESET');
}, /SyntaxError/);

// 6. Test Redact Helper Regression (H3, synthetic canaries only, no actual credentials)
console.log('Testing redact helper against synthetic secret canaries...');
const canaries = [
  'CANARY_SECRET_ALPHA_123',
  'CANARY_PASSWORD_BETA_456',
  'CANARY_KEY_GAMMA_789',
  'CANARY_POSTGRES_PASSWORD_DELTA_999',
  'CANARY_PGPASSWORD_EPSILON_888',
];

const rawSensitiveText = `
  Error with POSTGRES_PASSWORD=CANARY_POSTGRES_PASSWORD_DELTA_999
  and PGPASSWORD=CANARY_PGPASSWORD_EPSILON_888
  and password=CANARY_PASSWORD_BETA_456
  and secret=CANARY_SECRET_ALPHA_123
  and key=CANARY_KEY_GAMMA_789
  while preserving set_key='staff' and criteria_groups_code_key correctly.
`;

const sanitizedText = redact(rawSensitiveText);

for (const canary of canaries) {
  assert.ok(!sanitizedText.includes(canary), `redacted text must not contain canary ${canary}`);
}

assert.ok(sanitizedText.includes('POSTGRES_PASSWORD=[redacted]'), 'POSTGRES_PASSWORD redacted');
assert.ok(sanitizedText.includes('PGPASSWORD=[redacted]'), 'PGPASSWORD redacted');
assert.ok(sanitizedText.includes('password=[redacted]'), 'password redacted');
assert.ok(sanitizedText.includes('secret=[redacted]'), 'secret redacted');
assert.ok(sanitizedText.includes('key=[redacted]'), 'key redacted');
assert.ok(sanitizedText.includes("set_key='staff'"), "set_key must not be redacted");
assert.ok(sanitizedText.includes("criteria_groups_code_key"), "criteria_groups_code_key must not be redacted");

console.log('P108_CRITERIA_SETS_CONTRACT PASS all contract checks verified');

