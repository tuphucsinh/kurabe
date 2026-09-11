#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run as runDbBootstrap } from './db-bootstrap.mjs';
import { run as runPersonnelTransaction } from './personnel-transaction.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readBuffer = (file) => fs.readFileSync(path.join(root, file));
const roles = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'];
const cases = [];
const check = (name, fn) => { fn(); cases.push(name); };
const BOOTSTRAP_PREDICATE_KEYS = [
  'extensions', 'schemas', 'tables', 'columns', 'constraints', 'indexes',
  'policies', 'functions', 'triggers', 'roles', 'table_privileges', 'routine_privileges',
];
const ROLLBACK_TARGETS = Object.freeze({
  'rollback-ai-quota.sql': 'supabase/migrations/20260907000800_ai_quota.sql',
  'rollback-credential-change.sql': 'supabase/migrations/20260907000100_credential_change.sql',
  'rollback-criteria-config-version.sql': 'supabase/migrations/20260907000600_criteria_config_version.sql',
  'rollback-grade-config-version.sql': 'supabase/migrations/20260907000500_grade_config_version.sql',
  'rollback-login-rate-limit.sql': 'supabase/migrations/20260907000200_login_rate_limit.sql',
  'rollback-p3-evaluation-transaction.sql': 'db/migration-p3-evaluation-transaction.sql',
  'rollback-p3-retention.sql': 'db/migration-p3-retention.sql',
  'rollback-p96t03-single-active-period.sql': 'supabase/migrations/20260826000000_p96t03_single_active_period.sql',
  'rollback-p96t04-atomic-period-lifecycle.sql': 'supabase/migrations/20260826010000_p96t04_atomic_period_lifecycle.sql',
  'rollback-p96t05-closed-period-write-firewall.sql': 'supabase/migrations/20260826020000_p96t05_closed_period_write_firewall.sql',
  'rollback-p98-evaluator-null-safety.sql': 'supabase/migrations/20260905071000_p98_evaluator_null_safety.sql',
  'rollback-p98-mark-legacy-password-setup.sql': 'supabase/migrations/20260905070500_p98_mark_legacy_password_setup.sql',
  'rollback-p98-password-setup-transaction.sql': 'supabase/migrations/20260905072000_p98_password_setup_transaction.sql',
  'rollback-p98-password-setup.sql': 'supabase/migrations/20260905070000_p98_password_setup.sql',
  'rollback-p98-reconcile-login-attempts.sql': 'supabase/migrations/20260909000100_p98_reconcile_login_attempts.sql',
  'rollback-personnel-history-guard.sql': 'supabase/migrations/20260907000300_personnel_history_guard.sql',
  'rollback-personnel-transaction.sql': 'supabase/migrations/20260907000400_personnel_transaction.sql',
  'rollback-sensitive-read-grants.sql': 'supabase/migrations/20260907000700_sensitive_read_grants.sql',
});
const PERSONNEL_FORWARD = 'supabase/migrations/20260907000400_personnel_transaction.sql';
const PERSONNEL_HISTORY = 'supabase/migrations/20260907000300_personnel_history_guard.sql';
const PERSONNEL_ROLLBACK = 'db/rollback-personnel-transaction.sql';
const P96T03_ROLLBACK = 'db/rollback-p96t03-single-active-period.sql';
const P96T03_INDEX_COMMENT = 'P96T03: Enforces at most one active evaluation period at any time';
const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/tmp', LANG: 'C', LC_ALL: 'C', PGPASSFILE: '/dev/null',
  PGSERVICEFILE: '/dev/null', PGCONNECT_TIMEOUT: '5',
};

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function verifyBootstrapContract() {
  const manifest = JSON.parse(read('db/bootstrap/manifest.json'));
  const expected = JSON.parse(read(manifest.expected_catalog.path));
  assert.deepEqual(Object.keys(expected.predicate).sort(), [...BOOTSTRAP_PREDICATE_KEYS].sort(), 'bootstrap catalog predicate keys must be complete');
  for (const artifact of [manifest.baseline, manifest.functions, manifest.expected_catalog]) {
    assert.equal(sha256(readBuffer(artifact.path)), artifact.sha256, `${artifact.path} hash must match bootstrap manifest`);
  }
  for (const entry of manifest.legacy_provenance ?? []) {
    if (entry.source === null || entry.path === null) continue;
    assert.equal(sha256(readBuffer(entry.path)), entry.sha256, `${entry.path} hash must match legacy provenance`);
  }
  return {
    manifest: manifest.format,
    expected_catalog: manifest.expected_catalog.path,
    expected_catalog_sha256: manifest.expected_catalog.sha256,
    predicate_keys: BOOTSTRAP_PREDICATE_KEYS,
    catalog_predicate_counts: Object.fromEntries(Object.entries(expected.predicate).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])),
  };
}

function buildRollbackRecords() {
  const rollbackDir = path.join(root, 'db');
  const actualFiles = fs.readdirSync(rollbackDir).filter((name) => name.startsWith('rollback-') && name.endsWith('.sql')).sort();
  assert.deepEqual(actualFiles, Object.keys(ROLLBACK_TARGETS).sort(), 'every rollback file must have one explicit target mapping');
  return actualFiles.map((name) => {
    const targetPath = ROLLBACK_TARGETS[name];
    assert.ok(fs.existsSync(path.join(root, targetPath)), `${name} target is missing: ${targetPath}`);
    return { name, targetPath, sha256: sha256(readBuffer(`db/${name}`)) };
  });
}

export function buildRollbackManifest() { return buildRollbackRecords(); }

function migrationManifest() {
  const migrationDir = path.join(root, 'supabase/migrations');
  const migrations = fs.readdirSync(migrationDir).filter((n) => n.endsWith('.sql')).sort();
  const rollbackRecords = buildRollbackRecords();
  const bootstrap = verifyBootstrapContract();
  assert.ok(migrations.length > 0, 'ordered migration set is empty');
  return migrations.map((filename, order) => {
    const contents = readBuffer(`supabase/migrations/${filename}`);
    const rollback = rollbackRecords.find((record) => record.targetPath === `supabase/migrations/${filename}`) ?? null;
    return {
      order: order + 1,
      filename,
      forwardPath: `supabase/migrations/${filename}`,
      sha256: sha256(contents),
      rollback: rollback?.name ?? null,
      rollbackTarget: rollback?.targetPath ?? null,
      authoritativeCatalog: bootstrap,
    };
  });
}

export function buildManifest() { return migrationManifest(); }

function verifyPrivilegeOrder(manifest) {
  let pairedMigrationCount = 0;
  for (const entry of manifest) {
    const sql = read(`supabase/migrations/${entry.filename}`)
      .replace(/--[^\r\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const grantPositions = [...sql.matchAll(/^\s*GRANT\b/gim)].map((match) => match.index);
    const revokePositions = [...sql.matchAll(/^\s*REVOKE\b/gim)].map((match) => match.index);
    if (grantPositions.length === 0 || revokePositions.length === 0) continue;
    pairedMigrationCount += 1;
    assert.ok(
      Math.min(...revokePositions) < Math.min(...grantPositions),
      `${entry.filename} must revoke broad execution before granting the narrow consumer role`,
    );
  }
  assert.ok(pairedMigrationCount > 0, 'no migration contains a verifiable GRANT before REVOKE pair');
}

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 });
  if (result.error || result.status !== 0) throw new Error(`docker failed: ${result.error?.message || result.status}`);
  return String(result.stdout || '').trim();
}

function psqlTargetArgs(target) {
  return ['--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1', '--host', target.host, '--port', String(target.port), '--username', target.user, '--dbname', target.database];
}

function psqlResult(target, sql) {
  const result = spawnSync('psql', [...psqlTargetArgs(target), '--tuples-only', '--no-align'], {
    env: { ...SAFE_ENV, PGPASSWORD: target.password }, input: sql, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  return { status: result.status, stdout: String(result.stdout || ''), stderr: String(result.stderr || ''), error: result.error };
}

function psql(target, sql) {
  const result = psqlResult(target, sql);
  if (result.error || result.status !== 0) throw new Error(`psql failed: ${result.error?.message || result.status}: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}

function psqlFile(target, file) {
  const result = spawnSync('psql', [...psqlTargetArgs(target), '--file', file], {
    env: { ...SAFE_ENV, PGPASSWORD: target.password }, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`psql file failed: ${result.error?.message || result.status}: ${String(result.stderr || '').trim() || String(result.stdout || '').trim()}`);
  return String(result.stdout || '').trim();
}

function scalar(target, sql) { return psql(target, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || ''; }

function bootstrapRoles(target) {
  psql(target, `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;`);
}

function startRollbackTarget() {
  const name = `kurabe-release-rollback-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(24).toString('hex');
  docker(['run', '--detach', '--name', name, '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=postgres', '--publish', '127.0.0.1::5432', 'postgres:17-alpine']);
  try {
    let port;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const match = docker(['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/);
      if (match) {
        port = Number(match[1]);
        const ready = spawnSync('pg_isready', ['--host', '127.0.0.1', '--port', String(port), '--username', 'postgres'], { env: { ...SAFE_ENV, PGPASSWORD: password }, encoding: 'utf8', timeout: 2_000 });
        if (ready.status === 0) return { name, target: { host: '127.0.0.1', port, user: 'postgres', database: 'postgres', password } };
      }
      spawnSync('sleep', ['0.25']);
    }
    throw new Error('rollback disposable PostgreSQL did not become ready');
  } catch (error) {
    try { docker(['rm', '--force', name]); } catch { /* preserve original readiness failure */ }
    throw error;
  }
}

function runRollbackBoundaryChecks() {
  const cases = [];
  const container = startRollbackTarget();
  try {
    bootstrapRoles(container.target);
    psqlFile(container.target, path.join(root, 'db/bootstrap/baseline.sql'));
    psqlFile(container.target, path.join(root, PERSONNEL_HISTORY));
    psqlFile(container.target, path.join(root, PERSONNEL_FORWARD));

    const fkFailure = psqlResult(container.target, `\\set VERBOSITY verbose
INSERT INTO public.users (id, employee_code, name, role, team_id, is_active, gender) VALUES ('10000000-0000-0000-0000-000000000099', 'FK-X', 'FK failure', 'Employee', '10000000-0000-0000-0000-999999999999', true, 'Nữ');`);
    assert.notEqual(fkFailure.status, 0, 'invalid team reference must fail');
    assert.match(`${fkFailure.stdout}\n${fkFailure.stderr}`, /23503/, 'invalid team reference must expose PostgreSQL FK SQLSTATE 23503');
    cases.push('foreign-key-violation-23503');

    const unapproved = psqlResult(container.target, read(PERSONNEL_ROLLBACK));
    assert.notEqual(unapproved.status, 0, 'unapproved rollback must fail');
    assert.match(`${unapproved.stdout}\n${unapproved.stderr}`, /P99M2T02_ROLLBACK_UNAPPROVED/);
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_indexes WHERE indexname='idx_users_active_leader_team';"), '1');
    cases.push('rollback-unapproved-runtime-fail-closed');

    psql(container.target, "COMMENT ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb) IS 'foreign:unrecognized';");
    const provenance = psqlResult(container.target, `SET kurabe.p99m2t02_rollback_approved='true';\n${read(PERSONNEL_ROLLBACK)}`);
    assert.notEqual(provenance.status, 0, 'provenance mismatch rollback must fail');
    assert.match(`${provenance.stdout}\n${provenance.stderr}`, /P99M2T02_ROLLBACK_PROVENANCE_FAILED/);
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_indexes WHERE indexname='idx_users_active_leader_team';"), '1');
    cases.push('rollback-provenance-mismatch-runtime-fail-closed');

    psql(container.target, "COMMENT ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb) IS 'kurabe:p99m2t02:candidate:v1:atomic-personnel-team-evaluation-graph';");
    psql(container.target, `SET kurabe.p99m2t02_rollback_approved='true';\n${read(PERSONNEL_ROLLBACK)}`);
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_proc WHERE oid=to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb)');"), '0');
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_indexes WHERE indexname='idx_users_active_leader_team';"), '0');
    cases.push('rollback-approved-provenance-gated-runtime');

    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_indexes WHERE indexname='idx_evaluation_periods_single_active';"), '1', 'baseline must contain the P96T03 index before rollback testing');
    const p96t03Unapproved = psqlResult(container.target, read(P96T03_ROLLBACK));
    assert.notEqual(p96t03Unapproved.status, 0, 'P96T03 unapproved rollback must fail');
    assert.match(`${p96t03Unapproved.stdout}\n${p96t03Unapproved.stderr}`, /ROLLBACK_UNAPPROVED/);
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_indexes WHERE indexname='idx_evaluation_periods_single_active';"), '1');
    cases.push('p96t03-rollback-unapproved-runtime-fail-closed');

    psql(container.target, "COMMENT ON INDEX public.idx_evaluation_periods_single_active IS 'foreign:unrecognized';");
    const p96t03Provenance = psqlResult(container.target, `SET kurabe.p96t03_rollback_approved='true';\n${read(P96T03_ROLLBACK)}`);
    assert.notEqual(p96t03Provenance.status, 0, 'P96T03 provenance mismatch rollback must fail');
    assert.match(`${p96t03Provenance.stdout}\n${p96t03Provenance.stderr}`, /PROVENANCE_MISMATCH/);
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_indexes WHERE indexname='idx_evaluation_periods_single_active';"), '1');
    cases.push('p96t03-rollback-provenance-mismatch-runtime-fail-closed');

    psql(container.target, `COMMENT ON INDEX public.idx_evaluation_periods_single_active IS '${P96T03_INDEX_COMMENT}';`);
    psql(container.target, `SET kurabe.p96t03_rollback_approved='true';\n${read(P96T03_ROLLBACK)}`);
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_indexes WHERE indexname='idx_evaluation_periods_single_active';"), '0');
    cases.push('p96t03-rollback-approved-provenance-gated-runtime');
  } finally {
    try { docker(['rm', '--force', container.name]); } catch { /* preserve the first useful test failure */ }
  }
  return { real: true, passed: true, cases, target: 'disposable-postgresql-17-loopback' };
}

export async function run() {
  const proxy = read('src/proxy.ts');
  const workflow = `${read('src/data/workflow.ts')}\n${read('src/types/index.ts')}\n${read('src/lib/db/users-admin.ts')}`;
  const actions = fs.readdirSync(path.join(root, 'src/actions')).map((name) => name.endsWith('.ts') ? read(`src/actions/${name}`) : '').join('\n');
  const pages = fs.readdirSync(path.join(root, 'src/app'), { recursive: true })
    .filter((name) => String(name).endsWith('.tsx'))
    .map((name) => fs.readFileSync(path.join(root, 'src/app', name), 'utf8')).join('\n');
  const manifest = migrationManifest();

  check('five-role matrix is explicit', () => {
    for (const role of roles) assert.match(workflow, new RegExp(`['"]${role}['"]|\\b${role}\\b`), `${role} is absent from production workflow`);
  });
  check('protected route and auth boundary are production imports', () => {
    for (const route of ['/dashboard', '/reports', '/teams', '/employees', '/criteria', '/evaluations', '/settings']) assert.match(proxy, new RegExp(route.replace('/', '\\/')));
    assert.match(proxy, /isOpaqueSessionToken/);
  });
  check('personnel/config/period/evaluation/report/history/export boundaries exist', () => {
    for (const marker of ['personnel', 'criteria', 'period', 'evaluation', 'report', 'history', 'export']) {
      assert.match(actions.toLowerCase(), new RegExp(marker), `${marker} action boundary is absent`);
    }
    assert.match(pages.toLowerCase(), /report/);
  });
  check('RBAC and period scoping are not replaced by client-only checks', () => {
    assert.match(actions, /auth\.user|requireAuth|getAuth/);
    assert.match(actions, /period_id|periodId/);
    assert.match(workflow, /teamId|team_id/);
    assert.match(workflow, /canViewEvaluation|canEvaluate/);
  });
  check('AI path is stub-safe and bounded', () => {
    const ai = read('src/lib/ai.ts');
    const governance = read('src/lib/ai-governance.ts');
    assert.match(ai, /validateAIProvider|AI_HTTP_DEV_EXCEPTION/);
    assert.match(governance, /sanitizeSerializableAIValue|detectPromptInjection/);
    assert.match(ai, /if \(!apiKey\) return null/);
  });
  check('manifest is ordered, hashed, and rollback-linked', () => {
    assert.deepEqual(manifest.map((entry) => entry.order), manifest.map((_, i) => i + 1));
    for (const entry of manifest) {
      assert.match(entry.sha256, /^[a-f0-9]{64}$/);
      assert.equal(entry.forwardPath, `supabase/migrations/${entry.filename}`);
      if (entry.rollback) {
        assert.equal(entry.rollbackTarget, entry.forwardPath, `${entry.rollback} must name its exact forward migration`);
        assert.match(read(`db/${entry.rollback}`), /ROLLBACK|rollback|BEGIN/i);
      }
    }
    assert.ok(manifest.some((entry) => entry.rollback), 'no rollback mapping was discovered');
  });
  check('consumer-before-revoke and rollback approval contracts are present', () => {
    const rollbacks = buildRollbackRecords().map((record) => read(`db/${record.name}`)).join('\n');
    verifyPrivilegeOrder(manifest);
    assert.match(rollbacks, /approved|approval|ROLLBACK_UNAPPROVED/i);
    assert.match(rollbacks, /BEGIN/i);
  });
  check('historical P96T10 evidence is labelled, not overclaimed', () => {
    const evidenceCandidates = ['artifacts/p96t10', 'evidence/p96t10', 'tests/fixtures/release/p96t10'];
    const found = evidenceCandidates.some((relative) => fs.existsSync(path.join(root, relative)));
    assert.equal(found, false, 'unexpected historical evidence path requires primary review before use');
  });

  const runtime = {
    status: process.env.KURABE_RELEASE_DB_ENABLED === '1' ? 'REQUESTED' : 'NOT_RUN',
    reason: process.env.KURABE_RELEASE_DB_ENABLED === '1'
      ? 'Disposable DB execution is delegated to the explicit release preflight; no production target is permitted.'
      : 'KURABE_RELEASE_DB_ENABLED=1 was not set; no DB was contacted and no synthetic PASS was substituted.',
  };
  let database;
  let personnel;
  let rollback;
  if (runtime.status === 'REQUESTED') {
    database = await runDbBootstrap();
    personnel = await runPersonnelTransaction();
    rollback = runRollbackBoundaryChecks();
    runtime.status = 'EXECUTED';
    runtime.cases = [...database.cases, ...personnel.cases, ...rollback.cases];
    runtime.rollback = rollback;
  }
  return {
    real: runtime.status === 'EXECUTED',
    passed: runtime.status === 'EXECUTED',
    tier: runtime.status === 'EXECUTED' ? 'real-DB' : 'source-contract',
    status: runtime.status === 'EXECUTED' ? runtime.status : 'BLOCKED_CAPABILITY',
    runtime,
    database: database ? { real: database.real, passed: database.passed, target: database.target, cases: database.cases } : null,
    integration: personnel ? {
      database: database.cases,
      personnel_transaction: personnel.cases,
      rollback_boundaries: rollback.cases,
    } : null,
    roles,
    manifest,
    cases: runtime.status === 'EXECUTED' ? [...cases, ...runtime.cases] : cases,
    target: 'repository-production-boundaries-plus-disposable-runtime-gate',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    if (!result.passed) {
      console.error(`RELEASE_MATRIX BLOCKED ${result.status} reason=${result.runtime.reason}`);
      process.exitCode = 1;
    } else {
      console.log(`RELEASE_MATRIX ${result.status} cases=${result.cases.length} roles=${result.roles.join(',')} reason=${result.runtime.reason}`);
      for (const testCase of result.cases) console.log(`  CASE ${testCase}`);
    }
  }
  catch (error) { console.error(`RELEASE_MATRIX FAIL ${error?.message || error}`); process.exitCode = 1; }
}
