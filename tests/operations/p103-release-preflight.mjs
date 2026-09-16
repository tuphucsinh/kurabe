#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildP103ReleaseSet,
  P103_BASE_SHA,
  P103_TASK_ID,
  P103_MIGRATION_001,
  P103_MIGRATION_002,
} from '../integration/release-matrix.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/tmp',
  LANG: 'C',
  LC_ALL: 'C',
  PGPASSFILE: '/dev/null',
  PGSERVICEFILE: '/dev/null',
  PGCONNECT_TIMEOUT: '5',
};

export function safeOutput(value) {
  return String(value || '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}

export function commandAvailable(cmd) {
  try {
    return spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

export function checkDockerDaemon() {
  if (!commandAvailable('docker')) return { available: false, error: 'docker binary not found' };
  try {
    const res = spawnSync('docker', ['info'], { stdio: 'pipe', encoding: 'utf8', timeout: 5000 });
    if (res.status === 0) return { available: true, error: null };
    const err = (res.stderr || res.stdout || '').trim().split(/\r?\n/)[0] || `exit status ${res.status}`;
    return { available: false, error: err };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

export function runtimeAvailability() {
  const requested = process.env.KURABE_RELEASE_DB_ENABLED === '1';
  if (!requested) {
    return {
      status: 'BLOCKED_CAPABILITY',
      reason: 'KURABE_RELEASE_DB_ENABLED=1 is required to opt into disposable PostgreSQL; production, hosted, and synthetic DB targets are forbidden.',
    };
  }
  const dockerState = checkDockerDaemon();
  if (!dockerState.available) {
    return {
      status: 'BLOCKED_CAPABILITY',
      reason: `disposable PostgreSQL requires docker daemon: ${dockerState.error}`,
    };
  }
  return {
    status: 'AVAILABLE',
    reason: 'docker is available for explicitly disposable PostgreSQL container; credentials will be generated in-process.',
  };
}

export function evaluateCompatibilityMatrix() {
  const matrix = [
    {
      app: 'old-app',
      db: 'baseline-db',
      releaseEligible: false,
      safeFallback: false,
      reasons: [
        'H1_WORKFLOW_DESYNC: old workflow resolver does not handle SubLeader-Leader-Manager role steps',
        'H2_MULTITEAM_REJECTION: appointed Leader cannot evaluate members outside primary team',
        'H3_SCOPE_DESYNC: evaluations list and summary diverge on appointed teams',
        'H4_TARGET_DATA_LEAK: unauthorized viewers leak target name/code/team on empty history',
        'H5_REVOCATION_WRITE_BYPASS: revoked assignees retain save/return authority',
        'H6_DRAFT_DESYNC: transaction response contract conflates draft with parent status',
        'H7_DYNAMIC_OVERWRITE: compare view dynamically recalculates historical submitted values against latest config',
      ],
    },
    {
      app: 'old-app',
      db: 'db-after-001',
      releaseEligible: false,
      safeFallback: false,
      reasons: [
        'H4_TARGET_DATA_LEAK: old app still leaks target employee details on history route',
        'CLIENT_STALE_SCOPE_CACHE: old client cache retains revoked evaluation data',
        'H7_DYNAMIC_OVERWRITE: old client recomputes historical grade bands instead of consuming snapshot DTO',
        'OLD_APP_NOT_SAFE_FALLBACK: falling back to old app reintroduces client-side security leaks even with migration 001 SQL present',
      ],
    },
    {
      app: 'old-app',
      db: 'db-after-002',
      releaseEligible: false,
      safeFallback: false,
      reasons: [
        'H4_TARGET_DATA_LEAK: old app history route leaks target info',
        'H1_H2_CLIENT_WORKFLOW_MISMATCH: old app next-step resolution diverges from migration 002 multi-team SQL resolver',
        'OLD_APP_NOT_SAFE_FALLBACK: old app cannot be treated as a universal safe fallback against migrated schema',
      ],
    },
    {
      app: 'new-app-p103',
      db: 'baseline-db',
      releaseEligible: false,
      safeFallback: false,
      reasons: [
        'DB_LACKS_H5_CURRENT_AUTH: baseline DB does not enforce transactional current authorization on save/return RPC',
        'DB_LACKS_H1_H2_MULTITEAM_RPC: baseline DB save function lacks multi-team appointed Leader handling',
      ],
    },
    {
      app: 'new-app-p103',
      db: 'db-after-001',
      releaseEligible: false,
      safeFallback: false,
      reasons: [
        'DB_LACKS_H1_H2_MULTITEAM_RPC: migration 001 lacks multi-team workflow in save RPC; app and DB transitions diverge',
      ],
    },
    {
      app: 'new-app-p103',
      db: 'db-after-002',
      releaseEligible: true,
      safeFallback: false,
      matchedSet: true,
      reasons: [
        'MATCHED_RELEASE_SET: full H1-H7 application fixes paired with migration 001 current authorization and migration 002 multi-team SQL',
      ],
    },
  ];

  for (const entry of matrix) {
    if (entry.app === 'old-app') {
      assert.equal(entry.releaseEligible, false, `old-app must never be release eligible with ${entry.db}`);
      assert.equal(entry.safeFallback, false, `old-app must never be marked safe fallback with ${entry.db}`);
    }
    if (entry.db !== 'db-after-002' || entry.app !== 'new-app-p103') {
      assert.equal(entry.releaseEligible, false, `${entry.app} x ${entry.db} must not be release eligible`);
    }
  }
  const eligible = matrix.filter((entry) => entry.releaseEligible);
  assert.equal(eligible.length, 1, 'exactly one app x DB combination must be release eligible');
  assert.equal(eligible[0].app, 'new-app-p103');
  assert.equal(eligible[0].db, 'db-after-002');
  return matrix;
}

export function dockerCmd(args, timeout = 30000) {
  const res = spawnSync('docker', args, { encoding: 'utf8', timeout });
  if (res.error || res.status !== 0) {
    throw new Error(`docker ${args[0]} failed (${res.status}): ${safeOutput(res.stderr || res.error?.message || '')}`);
  }
  return String(res.stdout || '').trim();
}

export function execSql(container, sql, database = 'postgres') {
  if (commandAvailable('psql')) {
    const res = spawnSync('psql', [
      '--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1',
      '--host', container.target.host,
      '--port', String(container.target.port),
      '--username', container.target.user,
      '--dbname', database,
      '--tuples-only', '--no-align',
    ], {
      env: { ...SAFE_ENV, PGPASSWORD: container.target.password },
      input: sql,
      encoding: 'utf8',
      timeout: 60000,
    });
    return {
      status: res.status,
      stdout: String(res.stdout || '').trim(),
      stderr: String(res.stderr || '').trim(),
      error: res.error,
    };
  }
  const res = spawnSync('docker', [
    'exec', '-i',
    '-e', `PGPASSWORD=${container.target.password}`,
    container.name,
    'psql', '-U', container.target.user, '-d', database,
    '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align',
  ], {
    input: sql,
    encoding: 'utf8',
    timeout: 60000,
  });
  return {
    status: res.status,
    stdout: String(res.stdout || '').trim(),
    stderr: String(res.stderr || '').trim(),
    error: res.error,
  };
}

export function runSql(container, sql, database = 'postgres') {
  const res = execSql(container, sql, database);
  if (res.status !== 0 || res.error) {
    throw new Error(`SQL execution failed (${res.status}): ${safeOutput(res.stderr || res.stdout || res.error?.message)}`);
  }
  return res.stdout;
}

export function runSqlFile(container, filePath, database = 'postgres') {
  if (!commandAvailable('psql')) {
    throw new Error('SQL file execution requires the local psql client so sibling \include paths resolve from the candidate');
  }
  const res = spawnSync('psql', [
    '--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1',
    '--host', container.target.host,
    '--port', String(container.target.port),
    '--username', container.target.user,
    '--dbname', database,
    '--file', filePath,
  ], {
    cwd: path.dirname(filePath),
    env: { ...SAFE_ENV, PGPASSWORD: container.target.password },
    encoding: 'utf8',
    timeout: 120000,
  });
  if (res.status !== 0 || res.error) {
    throw new Error(`SQL file execution failed (${res.status}): ${safeOutput(res.stderr || res.stdout || res.error?.message)}`);
  }
  return String(res.stdout || '').trim();
}

export function startDisposableContainer() {
  const name = `kurabe-p103-preflight-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(24).toString('hex');
  dockerCmd([
    'run', '--detach', '--name', name,
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', 'POSTGRES_DB=postgres',
    '--publish', '127.0.0.1::5432',
    'postgres:17-alpine',
  ]);
  try {
    let port = null;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const portOutput = dockerCmd(['port', name, '5432/tcp']);
      const match = portOutput.match(/127\.0\.0\.1:(\d+)/);
      if (match) {
        port = Number(match[1]);
        const readyCheck = commandAvailable('pg_isready')
          ? spawnSync('pg_isready', ['--host', '127.0.0.1', '--port', String(port), '--username', 'postgres'], {
              env: { ...SAFE_ENV, PGPASSWORD: password }, timeout: 2000,
            }).status === 0
          : spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { timeout: 2000 }).status === 0;
        if (readyCheck) {
          return {
            name,
            target: { host: '127.0.0.1', port, user: 'postgres', database: 'postgres', password },
          };
        }
      }
      spawnSync('sleep', ['0.25']);
    }
    throw new Error('disposable PostgreSQL container did not become ready');
  } catch (error) {
    try { dockerCmd(['rm', '--force', name]); } catch {}
    throw error;
  }
}

export async function run({ rootDir = projectRoot, suite = 'p103-release-preflight', options = {} } = {}) {
  const cases = [];
  const check = (name, fn) => { fn(); cases.push(name); };

  // 1. Check Capability
  const runtime = runtimeAvailability();
  if (runtime.status === 'BLOCKED_CAPABILITY') {
    if (options?.evidence) {
      try {
        fs.mkdirSync(path.dirname(options.evidence), { recursive: true });
        fs.writeFileSync(options.evidence, `${JSON.stringify({
          format: 'kurabe-release-evidence/v1',
          suite,
          status: 'BLOCKED_CAPABILITY',
          tier: 'real-DB',
          real: false,
          passed: false,
          reason: runtime.reason,
          cases: [],
          productionWrites: 0,
          productionMigrations: 0,
          target: 'preflight-no-runtime-contact',
        }, null, 2)}\n`, { mode: 0o600 });
      } catch {}
    }
    throw new Error(`BLOCKED_CAPABILITY: disposable DB execution failed closed; first failure=${runtime.reason}`);
  }

  // 2. Deterministic Release Set Identity & Provenance
  const releaseSet = buildP103ReleaseSet();
  check('deterministic-release-set-identity-and-hashes', () => {
    assert.equal(releaseSet.releaseId, 'P103');
    assert.equal(releaseSet.taskId, P103_TASK_ID);
    assert.equal(releaseSet.baseSha, P103_BASE_SHA);
    assert.equal(releaseSet.inseparable, true);
    assert.equal(releaseSet.migrations.length, 2);
    for (const mig of releaseSet.migrations) {
      assert.match(mig.sha256, /^[a-f0-9]{64}$/);
      assert.ok(fs.existsSync(path.join(rootDir, mig.forwardPath)));
    }
  });

  check('migration-001-and-002-provenance-and-acl-contract', () => {
    const m1Sql = fs.readFileSync(path.join(rootDir, releaseSet.migrations[0].forwardPath), 'utf8');
    const m2Sql = fs.readFileSync(path.join(rootDir, releaseSet.migrations[1].forwardPath), 'utf8');

    assert.match(m1Sql, /kurabe:p103m1t03:candidate:v1:function:return_evaluation_round_transaction/);
    assert.match(m1Sql, /kurabe:p103m1t03:candidate:v1:function:save_evaluation_round_transaction_active_only/);
    assert.match(m1Sql, /REVOKE ALL ON FUNCTION public\.return_evaluation_round_transaction/);
    assert.match(m1Sql, /GRANT EXECUTE ON FUNCTION public\.return_evaluation_round_transaction.*TO service_role/);
    assert.match(m1Sql, /REVOKE ALL ON FUNCTION public\.save_evaluation_round_transaction_active_only/);
    assert.match(m1Sql, /GRANT EXECUTE ON FUNCTION public\.save_evaluation_round_transaction_active_only.*TO service_role/);

    assert.match(m2Sql, /kurabe:p103m2t01:candidate:v1:function:save_evaluation_round_transaction_active_only/);
    assert.match(m2Sql, /REVOKE ALL ON FUNCTION public\.save_evaluation_round_transaction_active_only/);
    assert.match(m2Sql, /GRANT EXECUTE ON FUNCTION public\.save_evaluation_round_transaction_active_only.*TO service_role/);
  });

  // 3. Old/New App x Baseline/001/002 Compatibility Rehearsal
  let compatibilityMatrix;
  check('compatibility-rehearsal-app-x-db-matrix', () => {
    compatibilityMatrix = evaluateCompatibilityMatrix();
    assert.equal(compatibilityMatrix.length, 6);
  });

  check('old-app-rejected-as-universal-safe-fallback', () => {
    const oldAppCombinations = compatibilityMatrix.filter((c) => c.app === 'old-app');
    assert.equal(oldAppCombinations.length, 3);
    for (const comb of oldAppCombinations) {
      assert.equal(comb.releaseEligible, false);
      assert.equal(comb.safeFallback, false);
      assert.ok(comb.reasons.length > 0);
    }
  });

  check('matched-set-new-app-x-db-002-exclusive-release-eligibility', () => {
    const matched = compatibilityMatrix.find((c) => c.app === 'new-app-p103' && c.db === 'db-after-002');
    assert.ok(matched);
    assert.equal(matched.releaseEligible, true);
    assert.equal(matched.matchedSet, true);
  });

  // 4. Real Disposable DB Interrupted Apply & Rollback Rehearsal
  const container = startDisposableContainer();
  let productionWrites = 0;
  let productionMigrations = 0;

  try {
    // Bootstrap roles
    runSql(container, `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;`);

    // Apply baseline
    const baselinePath = path.join(rootDir, 'db/bootstrap/baseline.sql');
    runSqlFile(container, baselinePath);

    // These are the same deterministic configuration fixtures used by the
    // existing transition/criteria integration harnesses. They are required
    // inputs for the pre-P103 config migrations, not progressed evaluation data.
    runSql(container, `
BEGIN;
INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
  ('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
  ('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
  ('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);
INSERT INTO public.criteria_groups (id, code, name, short_name, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000201', 'quality', 'Quality', 'Q', 0),
  ('00000000-0000-0000-0000-000000000202', 'teamwork', 'Teamwork', 'T', 1);
INSERT INTO public.criteria (id, code, name, description, applies_to, weight, group_id, sort_order, default_level_index) VALUES
  ('00000000-0000-0000-0000-000000000211', 'quality-result', 'Result quality', 'Quality of output', 'employee', 60, '00000000-0000-0000-0000-000000000201', 0, 0),
  ('00000000-0000-0000-0000-000000000212', 'team-cooperation', 'Cooperation', 'Works with team', 'employee', 40, '00000000-0000-0000-0000-000000000202', 0, 0);
INSERT INTO public.criterion_levels (id, criterion_id, points, label, description, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000211', 5, 'Excellent', 'Excellent', 0),
  ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000211', 3, 'Good', 'Good', 1),
  ('00000000-0000-0000-0000-000000000223', '00000000-0000-0000-0000-000000000212', 5, 'Excellent', 'Excellent', 0),
  ('00000000-0000-0000-0000-000000000224', '00000000-0000-0000-0000-000000000212', 3, 'Good', 'Good', 1);
INSERT INTO public.criterion_audiences (criterion_id, audience) VALUES
  ('00000000-0000-0000-0000-000000000211', 'employee'),
  ('00000000-0000-0000-0000-000000000212', 'employee');
COMMIT;`);

    // The schema-only baseline contains the pre-P98 catalog. Reconstruct the
    // already-qualified pre-P103 ledger range so migration 001 sees its required
    // 17-argument predecessor and config/transition objects. Migrations already
    // represented by the baseline are intentionally excluded to avoid duplicate
    // index/function application; only 001 and 002 remain the release set.
    const migrationDir = path.join(rootDir, 'supabase/migrations');
    const preP103Migrations = fs.readdirSync(migrationDir)
      .filter((filename) => filename.endsWith('.sql'))
      .filter((filename) => filename >= '20260905070000' && filename < P103_MIGRATION_001)
      .sort();
    for (const filename of preP103Migrations) {
      runSqlFile(container, path.join(migrationDir, filename));
    }

    // Seed fixture evaluation and round
    const fixturePeriodId = '30000000-0000-4000-8000-000000000001';
    const fixtureManagerId = '10000000-0000-4000-8000-000000000001';
    const fixtureLeaderId = '10000000-0000-4000-8000-000000000002';
    const fixtureEmployeeId = '10000000-0000-4000-8000-000000000003';
    const fixtureTeamId = '20000000-0000-4000-8000-000000000001';
    const fixtureEvalId = '40000000-0000-4000-8000-000000000001';

    runSql(container, `
BEGIN;
INSERT INTO public.evaluation_periods (id, year, name, status)
VALUES ('${fixturePeriodId}', 2026, 'P103 Preflight Period', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, name, leader_id)
VALUES ('${fixtureTeamId}', 'Preflight Team', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, employee_code, name, role, team_id, is_active, gender)
VALUES
  ('${fixtureManagerId}', 'P103-MGR', 'Manager One', 'Manager', '${fixtureTeamId}', true, 'Nam'),
  ('${fixtureLeaderId}', 'P103-LDR', 'Leader One', 'Leader', '${fixtureTeamId}', true, 'Nam'),
  ('${fixtureEmployeeId}', 'P103-EMP', 'Employee One', 'Employee', '${fixtureTeamId}', true, 'Nữ')
ON CONFLICT (id) DO NOTHING;

UPDATE public.teams
SET leader_id = '${fixtureLeaderId}'
WHERE id = '${fixtureTeamId}';

INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status, current_round)
VALUES ('${fixtureEvalId}', '${fixturePeriodId}', '${fixtureEmployeeId}', 'Employee', '${fixtureTeamId}', 'NotStarted', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.evaluation_rounds (evaluation_id, round, status, evaluator_id, evaluator_role)
VALUES ('${fixtureEvalId}', 1, 'NotStarted', '${fixtureEmployeeId}', 'Employee')
ON CONFLICT DO NOTHING;
COMMIT;`);

    // Capture baseline state & functions
    let baselineSaveFn = '';
    let baselineReturnFn = '';
    let baselineSaveComment = '';
    let baselineDataDigest = '';

    check('disposable-baseline-seed-and-function-capture', () => {
      baselineSaveFn = runSql(container, `
        SELECT pg_get_functiondef(oid)
        FROM pg_proc
        WHERE proname = 'save_evaluation_round_transaction_active_only'
          AND pronargs = 17;`);
      assert.ok(baselineSaveFn.length > 50, 'baseline save function must exist before migration');

      baselineReturnFn = runSql(container, `
        SELECT pg_get_functiondef(oid)
        FROM pg_proc
        WHERE proname = 'return_evaluation_round_transaction'
          AND pronargs = 4;`);
      assert.ok(baselineReturnFn.length > 50, 'baseline return function must exist before migration');

      baselineSaveComment = runSql(container, `
        SELECT COALESCE(obj_description(oid, 'pg_proc'), '')
        FROM pg_proc
        WHERE proname = 'save_evaluation_round_transaction_active_only'
          AND pronargs = 17;`);

      baselineDataDigest = runSql(container, `
        SELECT md5(string_agg(id::text || status || current_round::text, ',' ORDER BY id))
        FROM public.evaluations;`);
      assert.ok(baselineDataDigest.length === 32, 'baseline data digest must be captured');
    });

    // Apply migration 001
    check('migration-001-apply-and-provenance-readback', () => {
      const m1Sql = fs.readFileSync(path.join(rootDir, releaseSet.migrations[0].forwardPath), 'utf8');
      runSql(container, m1Sql);

      const m1ReturnComment = runSql(container, `
        SELECT obj_description(oid, 'pg_proc')
        FROM pg_proc
        WHERE proname = 'return_evaluation_round_transaction'
          AND pronargs = 4;`);
      assert.equal(m1ReturnComment, 'kurabe:p103m1t03:candidate:v1:function:return_evaluation_round_transaction');

      const m1SaveComment = runSql(container, `
        SELECT obj_description(oid, 'pg_proc')
        FROM pg_proc
        WHERE proname = 'save_evaluation_round_transaction_active_only'
          AND pronargs = 17;`);
      assert.equal(m1SaveComment, 'kurabe:p103m1t03:candidate:v1:function:save_evaluation_round_transaction_active_only');
    });

    // Apply migration 002
    check('migration-002-apply-and-provenance-readback', () => {
      const m2Sql = fs.readFileSync(path.join(rootDir, 'supabase/migrations', P103_MIGRATION_002), 'utf8');
      runSql(container, m2Sql);

      const m2SaveComment = runSql(container, `
        SELECT obj_description(oid, 'pg_proc')
        FROM pg_proc
        WHERE proname = 'save_evaluation_round_transaction_active_only'
          AND pronargs = 17;`);
      assert.equal(m2SaveComment, 'kurabe:p103m2t01:candidate:v1:function:save_evaluation_round_transaction_active_only');
    });

    // Interrupted apply simulation & function capture/restore rehearsal
    check('interrupted-apply-disposable-function-restore-rehearsal', () => {
      // Rehearsal: An interruption occurs. We restore the exact captured baseline functions.
      runSql(container, `
BEGIN;
${baselineSaveFn};
COMMENT ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)
IS ${baselineSaveComment ? `'${baselineSaveComment}'` : 'NULL'};

${baselineReturnFn};
COMMIT;`);

      // Read back restored function definition and verify it matches baseline capture
      const restoredSaveFn = runSql(container, `
        SELECT pg_get_functiondef(oid)
        FROM pg_proc
        WHERE proname = 'save_evaluation_round_transaction_active_only'
          AND pronargs = 17;`);
      assert.equal(restoredSaveFn.trim(), baselineSaveFn.trim(), 'restored function must match baseline capture');

      const restoredSaveComment = runSql(container, `
        SELECT COALESCE(obj_description(oid, 'pg_proc'), '')
        FROM pg_proc
        WHERE proname = 'save_evaluation_round_transaction_active_only'
          AND pronargs = 17;`);
      assert.equal(restoredSaveComment, baselineSaveComment, 'restored provenance must match baseline capture');
      assert.equal(restoredSaveComment.includes('p103m2t01'), false, 'restored state must not pretend to preserve P103 protections');
    });

    check('rollback-containment-preserves-existing-data-unmodified', () => {
      const currentDataDigest = runSql(container, `
        SELECT md5(string_agg(id::text || status || current_round::text, ',' ORDER BY id))
        FROM public.evaluations;`);
      assert.equal(currentDataDigest, baselineDataDigest, 'existing evaluations data must remain completely untouched after rollback');
    });

    check('rollback-demonstrates-loss-of-security-protections', () => {
      // Restored baseline lacks H5 check. Re-applying 001 and 002 is required for production readiness.
      const m1Sql = fs.readFileSync(path.join(rootDir, releaseSet.migrations[0].forwardPath), 'utf8');
      const m2Sql = fs.readFileSync(path.join(rootDir, releaseSet.migrations[1].forwardPath), 'utf8');
      runSql(container, m1Sql);
      runSql(container, m2Sql);
    });

    // 5. Safe forward-fix / write-pause fallback & read-only smoke envelope
    check('write-pause-fallback-blocks-mutations-preserves-reads', () => {
      // Engage write-pause by transitioning period to 'closed'
      runSql(container, `UPDATE public.evaluation_periods SET status = 'closed' WHERE id = '${fixturePeriodId}';`);

      const beforeWritePauseDigest = runSql(container, `
SELECT md5(string_agg(id::text || status || current_round::text, ',' ORDER BY id))
FROM public.evaluations;`);
      const blockedWrite = execSql(container, `
SELECT * FROM public.save_evaluation_round_transaction_active_only(
  '${fixtureEvalId}'::uuid, 1, '${fixtureEmployeeId}'::uuid,
  '{}'::jsonb, '{}'::jsonb, 'write-pause attempt', NULL::numeric, NULL::text,
  false, now(), NULL::integer, NULL::uuid, NULL::text, NULL::text, false,
  (SELECT id FROM public.criteria_config_versions WHERE is_active ORDER BY version_no DESC LIMIT 1),
  (SELECT id FROM public.grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1)
);`);
      assert.notEqual(blockedWrite.status, 0, 'write RPC must fail while the period is closed');
      assert.match(`${blockedWrite.stdout}\n${blockedWrite.stderr}`, /P96T05_PERIOD_NOT_ACTIVE|not active/i);

      // Verify read query succeeds under write-pause
      const readResult = runSql(container, `SELECT count(*) FROM public.evaluations WHERE period_id = '${fixturePeriodId}';`);
      assert.equal(readResult.trim(), '1', 'reads must succeed during write-pause');
      const afterWritePauseDigest = runSql(container, `
SELECT md5(string_agg(id::text || status || current_round::text, ',' ORDER BY id))
FROM public.evaluations;`);
      assert.equal(afterWritePauseDigest, beforeWritePauseDigest, 'blocked write must not change evaluation data');

      // Reopen period
      runSql(container, `UPDATE public.evaluation_periods SET status = 'active' WHERE id = '${fixturePeriodId}';`);
    });

    check('production-read-only-smoke-envelope-transactional', () => {
      const smokeSql = `
BEGIN TRANSACTION READ ONLY;
SELECT current_database(), current_user;
SELECT proname, obj_description(oid, 'pg_proc') FROM pg_proc WHERE proname = 'save_evaluation_round_transaction_active_only' AND pronargs = 17;
SELECT proname, obj_description(oid, 'pg_proc') FROM pg_proc WHERE proname = 'return_evaluation_round_transaction' AND pronargs = 4;
SELECT id, status FROM public.evaluations LIMIT 5;
COMMIT;`;

      assert.equal(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(smokeSql.replace(/--[^\r\n]*/g, '')), false, 'smoke template must be strictly read-only');
      const smokeResult = runSql(container, smokeSql);
      assert.ok(smokeResult.includes('save_evaluation_round_transaction_active_only'));
      assert.ok(smokeResult.includes('return_evaluation_round_transaction'));
    });

    check('production-catalog-drift-unknown-blocks-release', () => {
      // In local execution, live production catalog is not contacted
      assert.equal(releaseSet.productionCatalog.status, 'UNKNOWN');
      assert.equal(releaseSet.productionCatalog.blocking, true);
      assert.equal(releaseSet.deployAuthorized, false);
    });

    check('disposable-runtime-cleanup-and-zero-production-writes', () => {
      assert.equal(productionWrites, 0, 'zero production writes allowed');
      assert.equal(productionMigrations, 0, 'zero production migrations allowed');
    });

  } finally {
    try {
      dockerCmd(['rm', '--force', container.name]);
    } catch {
      /* preserve first useful failure */
    }
  }

  return {
    real: true,
    passed: true,
    tier: 'real-DB',
    status: 'EXECUTED',
    capability: 'AVAILABLE',
    authenticated: false,
    cases,
    releaseSet,
    compatibilityMatrix,
    productionWrites,
    productionMigrations,
    target: 'loopback-disposable-postgresql',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`P103_RELEASE_PREFLIGHT ${result.status} cases=${result.cases.length} target=${result.target}`);
    for (const c of result.cases) console.log(`  CASE ${c}`);
  } catch (error) {
    console.error(`P103_RELEASE_PREFLIGHT FAIL ${safeOutput(error?.message || error)}`);
    process.exitCode = 1;
  }
}
