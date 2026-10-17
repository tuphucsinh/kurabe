#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');

const importScriptPath = path.join(projectRoot, 'scripts/p108-import-criteria.mjs');
const manifestPath = path.join(projectRoot, 'tests/fixtures/p108/synthetic-manifest.json');
const p108Migration = path.join(projectRoot, 'supabase/migrations/20261017093100_p108_criteria_sets.sql');
const confirmationRuntimeScript = path.join(projectRoot, '.github/ci/confirmation-runtime.mjs');

export function redact(text) {
  return String(text || '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(\b(?:POSTGRES_PASSWORD|PGPASSWORD|password|secret|key|service_role|token)\b\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^\s,"';]+)/gi, '$1[redacted]')
    .replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]*/g, '[REDACTED_JWT]');
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

const CRITERIA_ROUTINES = [
  'validate_criteria_config(jsonb)',
  'get_active_criteria_config()',
  'save_criteria_config(jsonb,bigint)',
];

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

function criteriaDigest(dbTarget) {
  const parts = [];

  for (const tbl of CRITERIA_TABLES) {
    const res = runPsql(dbTarget, `
      SELECT COALESCE(string_agg(row_data, E'\\n' ORDER BY row_data), '') FROM (
        SELECT md5(t::text) AS row_data FROM public.${tbl} t
      ) s;
    `);
    parts.push(`tbl:${tbl}=${res.out}`);
  }

  for (const fn of CRITERIA_ROUTINES) {
    const res = runPsql(dbTarget, `
      SELECT md5(COALESCE(pg_get_functiondef(p.oid), '')) || '|' || COALESCE(obj_description(p.oid, 'pg_proc'), 'none')
      FROM pg_proc p WHERE p.oid = 'public.${fn}'::regprocedure;
    `);
    parts.push(`fn:${fn}=${res.out}`);
  }

  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}

function runScript(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [importScriptPath, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...extraEnv,
    },
    encoding: 'utf8',
    timeout: 30000,
  });

  if (result.error) {
    return {
      status: result.status ?? 1,
      stdout: String(result.stdout || '').trim(),
      stderr: redact(`Process error: ${result.error.message}\n${result.stderr || ''}`).trim(),
      json: null,
    };
  }

  const stdout = String(result.stdout || '').trim();
  const stderr = redact(String(result.stderr || '').trim());
  let json = null;
  try {
    json = stdout ? JSON.parse(stdout) : null;
  } catch {
    // not valid JSON
  }

  return {
    status: result.status,
    stdout,
    stderr,
    json,
  };
}

async function main() {
  console.log('--- Starting P108 Criteria Import Integration Test ---');

  const casesPassed = [];
  const isOwnedRuntime = true;
  let runtimeRoot = null;
  let dbTarget = null;
  let supabaseUrl = null;
  let serviceRoleKey = null;
  let testError = null;
  let cleanupError = null;

  try {
    console.log('[Setup] Starting owned confirmation-runtime lifecycle');
    runtimeRoot = path.join(projectRoot, '.tmp', `p108-import-${Date.now()}-${process.pid}`);
    fs.mkdirSync(runtimeRoot, { recursive: true });
    process.env.KURABE_CI_RUNTIME_ROOT = runtimeRoot;

    // Start disposable stack
    const startRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'start'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
      timeout: 120000,
    });
    if (startRes.error) {
      throw new Error(`confirmation-runtime start failed: ${startRes.error.message}`);
    }
    if (startRes.status !== 0) {
      throw new Error(`confirmation-runtime start failed with status ${startRes.status}`);
    }

    // Bootstrap stack
    console.log('[Setup] Bootstrapping confirmation-runtime stack');
    const bootstrapRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'bootstrap'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
      timeout: 120000,
    });
    if (bootstrapRes.error) {
      throw new Error(`confirmation-runtime bootstrap failed: ${bootstrapRes.error.message}`);
    }
    if (bootstrapRes.status !== 0) {
      throw new Error(`confirmation-runtime bootstrap failed with status ${bootstrapRes.status}`);
    }

    const statePath = path.join(runtimeRoot, 'runtime-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    supabaseUrl = state.supabaseUrl;
    serviceRoleKey = state.serviceRoleKey;
    dbTarget = {
      host: '127.0.0.1',
      port: String(state.dbPort),
      database: state.db,
      user: 'postgres',
      password: state.password,
    };
    // 2. Preflight database setup
    // Check if P108 migration is applied; if not, apply it
    const setKeyCheck = runPsql(dbTarget, `
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'criteria' AND column_name = 'set_key';
    `);
    if (setKeyCheck.out !== '1') {
      console.log('[Setup] Applying P108 criteria sets migration');
      const migrationSql = fs.readFileSync(p108Migration, 'utf8');
      runPsql(dbTarget, migrationSql);
    }

    // Check if legacy criteria catalog (version 1) exists; if not, seed it
    const versionCheck = runPsql(dbTarget, `
      SELECT COALESCE(max(version_no)::text, '0') FROM public.criteria_config_versions;
    `);
    if (versionCheck.out === '0') {
      console.log('[Setup] Seeding legacy criteria catalog fixture (v1)');
      runPsql(dbTarget, `
        BEGIN;
        INSERT INTO public.criteria_groups(id, code, name, short_name, sort_order, is_active)
        VALUES ('00000000-0000-4000-8000-000000000201', 'A', 'Legacy Group', 'LG', 0, true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.criteria(id, group_id, code, name, description, applies_to, weight, sort_order, is_active)
        VALUES ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000201', 'A1', 'Legacy Crit A1', 'Desc', 'employee', 100, 0, true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.criterion_levels(id, criterion_id, points, label, sort_order, is_active)
        VALUES ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000211', 10, 'Level 1', 0, true)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.criterion_audiences(criterion_id, audience, is_active)
        VALUES ('00000000-0000-4000-8000-000000000211', 'employee', true)
        ON CONFLICT (criterion_id, audience) DO NOTHING;

        INSERT INTO public.criteria_config_versions(id, version_no, checksum, is_active)
        VALUES ('00000000-0000-4000-8000-000000000200', 1, 'legacy-v1-checksum', true)
        ON CONFLICT (id) DO NOTHING;
        COMMIT;
      `);
    }

    const scriptEnv = {
      KURABE_SUPABASE_URL: supabaseUrl,
      KURABE_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    };

    // -------------------------------------------------------------
    // TEST 1: Dry-run verification (pure computation, no network write)
    // -------------------------------------------------------------
    console.log('[Test 1] Executing --dry-run mode');
    const dryRunResult = runScript(['--dry-run', '--manifest', manifestPath], scriptEnv);
    assert.equal(dryRunResult.status, 0, `dry-run failed: ${dryRunResult.stderr}`);
    assert.ok(dryRunResult.json, 'dry-run did not output valid JSON');
    assert.equal(dryRunResult.json.success, true);
    assert.equal(dryRunResult.json.mode, 'dry-run');

    // Counts check: exactly 18 groups / 93 criteria (6/6/6 and 33/30/30)
    assert.equal(dryRunResult.json.counts.leader.groups, 6);
    assert.equal(dryRunResult.json.counts.leader.criteria, 33);
    assert.equal(dryRunResult.json.counts.staff.groups, 6);
    assert.equal(dryRunResult.json.counts.staff.criteria, 30);
    assert.equal(dryRunResult.json.counts.worker.groups, 6);
    assert.equal(dryRunResult.json.counts.worker.criteria, 30);
    assert.equal(dryRunResult.json.total_groups, 18);
    assert.equal(dryRunResult.json.total_criteria, 93);

    const dryRunHashes = dryRunResult.json.hashes;
    assert.ok(dryRunHashes.leader && dryRunHashes.leader.length === 64);
    assert.ok(dryRunHashes.staff && dryRunHashes.staff.length === 64);
    assert.ok(dryRunHashes.worker && dryRunHashes.worker.length === 64);
    casesPassed.push('dry-run-counts-and-hashes');

    // -------------------------------------------------------------
    // TEST 2: Refusal on Active Period (with zero mutation proven)
    // -------------------------------------------------------------
    console.log('[Test 2] Testing refusal on active evaluation period');
    // Ensure at least one period is active
    runPsql(dbTarget, `
      UPDATE public.evaluation_periods SET status = 'active'
      WHERE id = (SELECT id FROM public.evaluation_periods LIMIT 1);
    `);
    const activeCheck = runPsql(dbTarget, `SELECT count(*) FROM public.evaluation_periods WHERE status = 'active';`);
    assert.ok(Number(activeCheck.out) >= 1, 'expected at least one active period');

    const digestBeforeActiveRefusal = criteriaDigest(dbTarget);
    const activePeriodResult = runScript([
      '--apply',
      '--expected-version', '1',
      '--manifest', manifestPath,
      '--disposable',
    ], scriptEnv);

    assert.notEqual(activePeriodResult.status, 0, 'apply during active period must fail');
    assert.ok(
      activePeriodResult.stdout.includes('P108_PERIOD_ACTIVE') || activePeriodResult.stderr.includes('P108_PERIOD_ACTIVE'),
      `expected P108_PERIOD_ACTIVE error, got: ${activePeriodResult.stdout} ${activePeriodResult.stderr}`
    );

    const digestAfterActiveRefusal = criteriaDigest(dbTarget);
    assert.equal(digestBeforeActiveRefusal, digestAfterActiveRefusal, 'active period refusal caused unexpected criteria mutation');
    casesPassed.push('refusal-active-period-zero-mutation');

    // Close all periods before valid apply
    runPsql(dbTarget, `UPDATE public.evaluation_periods SET status = 'closed';`);

    // -------------------------------------------------------------
    // TEST 3: Apply mode (expected-version 1 -> version 2)
    // -------------------------------------------------------------
    console.log('[Test 3] Executing --apply mode (v1 -> v2)');
    const applyResult = runScript([
      '--apply',
      '--expected-version', '1',
      '--manifest', manifestPath,
      '--disposable',
    ], scriptEnv);

    assert.equal(applyResult.status, 0, `apply failed: ${applyResult.stderr} ${applyResult.stdout}`);
    assert.ok(applyResult.json, 'apply did not output valid JSON');
    assert.equal(applyResult.json.success, true);
    assert.equal(applyResult.json.mode, 'apply');
    assert.equal(applyResult.json.version, 2);

    // Dry-run == apply hashes
    assert.equal(applyResult.json.hashes.leader, dryRunHashes.leader, 'Leader hash mismatch between dry-run and apply');
    assert.equal(applyResult.json.hashes.staff, dryRunHashes.staff, 'Staff hash mismatch between dry-run and apply');
    assert.equal(applyResult.json.hashes.worker, dryRunHashes.worker, 'Worker hash mismatch between dry-run and apply');

    // Counts: exactly 18/93
    assert.equal(applyResult.json.counts.leader.groups, 6);
    assert.equal(applyResult.json.counts.leader.criteria, 33);
    assert.equal(applyResult.json.counts.staff.groups, 6);
    assert.equal(applyResult.json.counts.staff.criteria, 30);
    assert.equal(applyResult.json.counts.worker.groups, 6);
    assert.equal(applyResult.json.counts.worker.criteria, 30);
    assert.equal(applyResult.json.total_groups, 18);
    assert.equal(applyResult.json.total_criteria, 93);
    casesPassed.push('apply-v2-hashes-and-counts');

    // -------------------------------------------------------------
    // TEST 4: Readback verifier (--verify mode)
    // -------------------------------------------------------------
    console.log('[Test 4] Executing --verify mode');
    const verifyResult = runScript([
      '--verify',
      '--manifest', manifestPath,
      '--disposable',
    ], scriptEnv);

    assert.equal(verifyResult.status, 0, `verify failed: ${verifyResult.stderr} ${verifyResult.stdout}`);
    assert.ok(verifyResult.json, 'verify did not output valid JSON');
    assert.equal(verifyResult.json.success, true);
    assert.equal(verifyResult.json.mode, 'verify');
    assert.equal(verifyResult.json.version, 2);
    assert.equal(verifyResult.json.audiences_verified, true);
    assert.equal(verifyResult.json.hashes.leader, dryRunHashes.leader);
    assert.equal(verifyResult.json.hashes.staff, dryRunHashes.staff);
    assert.equal(verifyResult.json.hashes.worker, dryRunHashes.worker);
    casesPassed.push('verify-readback-audiences-and-hashes');

    // -------------------------------------------------------------
    // TEST 5: Every live and version row carries the manifest UUID
    // -------------------------------------------------------------
    console.log('[Test 5] Verifying UUID fidelity across live and version tables');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifestGroupIds = new Set();
    const manifestCritIds = new Set();
    const manifestLevelIds = new Set();

    for (const g of manifest.groups) {
      manifestGroupIds.add(g.id);
      for (const c of g.criteria) {
        manifestCritIds.add(c.id);
        for (const l of c.levels) {
          manifestLevelIds.add(l.id);
        }
      }
    }

    assert.equal(manifestGroupIds.size, 18);
    assert.equal(manifestCritIds.size, 93);
    assert.equal(manifestLevelIds.size, 186);

    // Check live tables
    const liveGroups = runPsql(dbTarget, `SELECT id::text FROM public.criteria_groups WHERE is_active ORDER BY id;`).out.split('\n').filter(Boolean);
    const liveCriteria = runPsql(dbTarget, `SELECT id::text FROM public.criteria WHERE is_active ORDER BY id;`).out.split('\n').filter(Boolean);
    const liveLevels = runPsql(dbTarget, `SELECT id::text FROM public.criterion_levels WHERE is_active ORDER BY id;`).out.split('\n').filter(Boolean);

    assert.equal(liveGroups.length, 18);
    assert.equal(liveCriteria.length, 93);
    assert.equal(liveLevels.length, 186);

    for (const gid of liveGroups) assert.ok(manifestGroupIds.has(gid), `Live group ${gid} not in manifest`);
    for (const cid of liveCriteria) assert.ok(manifestCritIds.has(cid), `Live criterion ${cid} not in manifest`);
    for (const lid of liveLevels) assert.ok(manifestLevelIds.has(lid), `Live level ${lid} not in manifest`);

    // Check version tables
    const versionGroups = runPsql(dbTarget, `SELECT group_id::text FROM public.criteria_group_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 2) ORDER BY group_id;`).out.split('\n').filter(Boolean);
    const versionCriteria = runPsql(dbTarget, `SELECT criterion_id::text FROM public.criterion_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 2) ORDER BY criterion_id;`).out.split('\n').filter(Boolean);
    const versionLevels = runPsql(dbTarget, `SELECT level_id::text FROM public.criterion_level_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 2) ORDER BY level_id;`).out.split('\n').filter(Boolean);

    assert.equal(versionGroups.length, 18);
    assert.equal(versionCriteria.length, 93);
    assert.equal(versionLevels.length, 186);

    for (const gid of versionGroups) assert.ok(manifestGroupIds.has(gid), `Version group ${gid} not in manifest`);
    for (const cid of versionCriteria) assert.ok(manifestCritIds.has(cid), `Version criterion ${cid} not in manifest`);
    for (const lid of versionLevels) assert.ok(manifestLevelIds.has(lid), `Version level ${lid} not in manifest`);

    casesPassed.push('uuid-fidelity-live-and-version-tables');

    // -------------------------------------------------------------
    // TEST 6: Second apply with same content = no-op
    // (same version_no, no new version, no UUID changed)
    // -------------------------------------------------------------
    console.log('[Test 6] Testing second apply idempotence (same content no-op)');
    const versionCountBefore = runPsql(dbTarget, `SELECT count(*) FROM public.criteria_config_versions;`).out;
    const maxVersionBefore = runPsql(dbTarget, `SELECT max(version_no) FROM public.criteria_config_versions;`).out;
    assert.equal(maxVersionBefore, '2');

    const secondApplyResult = runScript([
      '--apply',
      '--expected-version', '2',
      '--manifest', manifestPath,
      '--disposable',
    ], scriptEnv);

    assert.equal(secondApplyResult.status, 0, `second apply failed: ${secondApplyResult.stderr}`);
    assert.equal(secondApplyResult.json.version, 2, 'second apply should return current version 2');

    const versionCountAfter = runPsql(dbTarget, `SELECT count(*) FROM public.criteria_config_versions;`).out;
    const maxVersionAfter = runPsql(dbTarget, `SELECT max(version_no) FROM public.criteria_config_versions;`).out;

    assert.equal(versionCountAfter, versionCountBefore, 'second apply created a new version row');
    assert.equal(maxVersionAfter, '2', 'max version_no changed after identical apply');

    // Confirm no live UUID changed
    const liveGroupsAfter = runPsql(dbTarget, `SELECT id::text FROM public.criteria_groups WHERE is_active ORDER BY id;`).out.split('\n').filter(Boolean);
    const liveCriteriaAfter = runPsql(dbTarget, `SELECT id::text FROM public.criteria WHERE is_active ORDER BY id;`).out.split('\n').filter(Boolean);
    const liveLevelsAfter = runPsql(dbTarget, `SELECT id::text FROM public.criterion_levels WHERE is_active ORDER BY id;`).out.split('\n').filter(Boolean);
    assert.deepEqual(liveGroupsAfter, liveGroups);
    assert.deepEqual(liveCriteriaAfter, liveCriteria);
    assert.deepEqual(liveLevelsAfter, liveLevels);
    casesPassed.push('second-apply-idempotent-noop');

    // -------------------------------------------------------------
    // TEST 7: Refusal Cases with Zero Mutation (Digest Verification)
    // Cases:
    //   a) missing id node (group, criterion, level)
    //   b) wrong signed SHA on non-disposable target
    //   c) CAS mismatch
    //   d) invalid expected-version (fraction, NaN, Infinity)
    //   e) unknown --service-role-key rejected without echoing value
    // -------------------------------------------------------------
    console.log('[Test 7] Testing refusal cases with zero mutation');

    // Refusal A: missing id node (group, criterion, level)
    const missingIdNodeTypes = [
      {
        name: 'group',
        mutate: (obj) => { delete obj.groups[0].id; },
      },
      {
        name: 'criterion',
        mutate: (obj) => { delete obj.groups[0].criteria[0].id; },
      },
      {
        name: 'level',
        mutate: (obj) => { delete obj.groups[0].criteria[0].levels[0].id; },
      },
    ];

    for (const item of missingIdNodeTypes) {
      const badManifestPath = path.join(projectRoot, '.tmp', `bad-manifest-missing-${item.name}-${Date.now()}.json`);
      fs.mkdirSync(path.dirname(badManifestPath), { recursive: true });
      const badManifestObj = structuredClone(manifest);
      item.mutate(badManifestObj);
      fs.writeFileSync(badManifestPath, JSON.stringify(badManifestObj));

      const digestBeforeMissingId = criteriaDigest(dbTarget);
      const missingIdResult = runScript([
        '--apply',
        '--expected-version', '2',
        '--manifest', badManifestPath,
        '--disposable',
      ], scriptEnv);

      fs.rmSync(badManifestPath, { force: true });
      assert.notEqual(missingIdResult.status, 0, `missing ${item.name} UUID node must be refused`);
      assert.ok(
        missingIdResult.stdout.includes('REFUSE_MISSING_UUID') || missingIdResult.stderr.includes('REFUSE_MISSING_UUID'),
        `expected REFUSE_MISSING_UUID for ${item.name}, got: ${missingIdResult.stdout} ${missingIdResult.stderr}`
      );
      const digestAfterMissingId = criteriaDigest(dbTarget);
      assert.equal(digestBeforeMissingId, digestAfterMissingId, `missing ${item.name} id refusal mutated criteria tables`);
    }
    casesPassed.push('refusal-missing-id-node-zero-mutation');

    // Refusal B: wrong signed SHA on non-disposable target (without --disposable flag)
    const digestBeforeShaMismatch = criteriaDigest(dbTarget);
    const shaMismatchResult = runScript([
      '--apply',
      '--expected-version', '2',
      '--manifest', manifestPath,
      '--signed-sha', '0000000000000000000000000000000000000000000000000000000000000000',
      // Note: NO --disposable flag! Target is treated as non-disposable
    ], scriptEnv);

    assert.notEqual(shaMismatchResult.status, 0, 'wrong signed sha on non-disposable target must fail');
    assert.ok(
      shaMismatchResult.stdout.includes('REFUSE_SIGNED_SHA_MISMATCH') || shaMismatchResult.stderr.includes('REFUSE_SIGNED_SHA_MISMATCH'),
      `expected REFUSE_SIGNED_SHA_MISMATCH, got: ${shaMismatchResult.stdout} ${shaMismatchResult.stderr}`
    );
    const digestAfterShaMismatch = criteriaDigest(dbTarget);
    assert.equal(digestBeforeShaMismatch, digestAfterShaMismatch, 'sha mismatch refusal mutated criteria tables');
    casesPassed.push('refusal-wrong-signed-sha-zero-mutation');

    // Refusal C: CAS mismatch (expected-version 999 while current is 2)
    const digestBeforeCas = criteriaDigest(dbTarget);
    const casResult = runScript([
      '--apply',
      '--expected-version', '999',
      '--manifest', manifestPath,
      '--disposable',
    ], scriptEnv);

    assert.notEqual(casResult.status, 0, 'CAS mismatch must fail');
    assert.ok(
      casResult.stdout.includes('P99M3T02_CONFIG_STALE') || casResult.stderr.includes('P99M3T02_CONFIG_STALE'),
      `expected P99M3T02_CONFIG_STALE, got: ${casResult.stdout} ${casResult.stderr}`
    );
    const digestAfterCas = criteriaDigest(dbTarget);
    assert.equal(digestBeforeCas, digestAfterCas, 'CAS mismatch mutated criteria tables');
    casesPassed.push('refusal-cas-mismatch-zero-mutation');

    // Refusal D: invalid expected-version (fraction, NaN, Infinity)
    const invalidVersionCases = [
      { label: 'fraction', value: '1.5' },
      { label: 'Infinity', value: 'Infinity' },
      { label: 'NaN', value: 'NaN' },
    ];
    for (const iv of invalidVersionCases) {
      const digestBeforeInvalidVer = criteriaDigest(dbTarget);
      const invalidVerResult = runScript([
        '--apply',
        '--expected-version', iv.value,
        '--manifest', manifestPath,
        '--disposable',
      ], scriptEnv);

      assert.notEqual(invalidVerResult.status, 0, `expected-version=${iv.label} must be refused`);
      assert.ok(
        invalidVerResult.stdout.includes('REFUSE_MISSING_EXPECTED_VERSION') || invalidVerResult.stderr.includes('REFUSE_MISSING_EXPECTED_VERSION'),
        `expected REFUSE_MISSING_EXPECTED_VERSION for ${iv.label}, got: ${invalidVerResult.stdout} ${invalidVerResult.stderr}`
      );
      const digestAfterInvalidVer = criteriaDigest(dbTarget);
      assert.equal(digestBeforeInvalidVer, digestAfterInvalidVer, `expected-version=${iv.label} refusal mutated criteria tables`);
    }
    casesPassed.push('refusal-invalid-expected-version-zero-mutation');

    // Refusal E: unknown --service-role-key option rejected without echoing value
    const secretValue = 'super-secret-service-key-should-not-leak';
    const unknownOptResult = runScript([
      '--apply',
      '--expected-version', '2',
      '--manifest', manifestPath,
      '--disposable',
      '--service-role-key', secretValue,
    ], scriptEnv);

    assert.notEqual(unknownOptResult.status, 0, '--service-role-key must be rejected as unknown option');
    assert.ok(
      unknownOptResult.stdout.includes('Unknown option: --service-role-key') ||
      unknownOptResult.stderr.includes('Unknown option: --service-role-key'),
      `expected Unknown option: --service-role-key, got: ${unknownOptResult.stdout} ${unknownOptResult.stderr}`
    );
    assert.ok(!unknownOptResult.stdout.includes(secretValue), 'secret value was echoed in stdout');
    assert.ok(!unknownOptResult.stderr.includes(secretValue), 'secret value was echoed in stderr');
    casesPassed.push('refusal-unknown-service-role-key-no-echo');

    console.log(`\nALL ${casesPassed.length} P108 IMPORT TEST CASES PASSED:`);
    for (const c of casesPassed) {
      console.log(`  ✓ ${c}`);
    }
  } catch (err) {
    testError = err;
    console.error('Integration test body error:', err);
  } finally {
    // -------------------------------------------------------------
    // TEARDOWN: cleanup owned confirmation runtime with exit check
    // -------------------------------------------------------------
    if (isOwnedRuntime && runtimeRoot) {
      console.log('[Teardown] Cleaning up owned disposable runtime');
      try {
        const cleanupRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'cleanup'], {
          cwd: projectRoot,
          stdio: 'inherit',
          env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
          timeout: 120000,
        });

        if (cleanupRes.error) {
          cleanupError = new Error(`Teardown spawn error: ${cleanupRes.error.message}`);
        } else if (cleanupRes.status !== 0) {
          cleanupError = new Error(`Teardown failed with status ${cleanupRes.status}`);
        }
      } catch (cleanupErr) {
        cleanupError = cleanupErr;
      }
    }

    if (testError && cleanupError) {
      console.error('Teardown failure occurred after test failure:', cleanupError);
      const combined = new Error(`Test failed: ${testError.message}\nAdditionally, cleanup failed: ${cleanupError.message}`);
      combined.cause = { testError, cleanupError };
      throw combined;
    }
    if (testError) {
      throw testError;
    }
    if (cleanupError) {
      throw cleanupError;
    }
  }
}

main().catch((err) => {
  console.error('FATAL P108 IMPORT TEST FAILURE:', err);
  process.exit(1);
});
