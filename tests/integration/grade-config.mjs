#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = path.join(projectRoot, 'supabase/migrations/20260907000500_grade_config_version.sql');
const aclMigration = path.join(projectRoot, 'supabase/migrations/20261019000100_grade_band_versions_acl.sql');
const digestMigration = path.join(projectRoot, 'supabase/migrations/20261019000200_grade_config_digest_resolution.sql');
const rollback = path.join(projectRoot, 'db/rollback-grade-config-version.sql');
const baseline = path.join(projectRoot, 'db/bootstrap/baseline.sql');

const POSTGRES_IMAGE = 'postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929';

function command(file, args, options = {}) {
  return spawnSync(file, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function must(file, args, options = {}) {
  const result = command(file, args, options);
  if (result.status !== 0) throw new Error(`${file} failed (${result.status}): ${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}
function start(name, password, database) {
  const id = must('docker', ['run', '--detach', '--rm', '--name', name, '--env', `POSTGRES_PASSWORD=${password}`, '--env', `POSTGRES_DB=${database}`, '--publish', '127.0.0.1::5432', POSTGRES_IMAGE]);
  assert.ok(id.length > 10);
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const result = command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', 'postgres']);
    if (result.status === 0) { ready = true; break; }
  }
  assert.ok(ready, 'disposable PostgreSQL did not become ready');
  const port = must('docker', ['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
  assert.ok(port, 'could not determine loopback port');
  let targetReady = false;
  for (let i = 0; i < 60; i += 1) {
    const result = command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', database]);
    if (result.status === 0) { targetReady = true; break; }
  }
  assert.ok(targetReady, 'target PostgreSQL database did not become ready');
  let connectionReady = false;
  for (let i = 0; i < 60; i += 1) {
    const result = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--command', 'SELECT 1;',
    ], { env: { ...process.env, PGPASSWORD: password } });
    if (result.status === 0) { connectionReady = true; break; }
  }
  assert.ok(connectionReady, 'target PostgreSQL connection did not stabilize');
  return port;
}
function psql(port, password, sql, expectPass = true) {
  const result = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', 'kurabe_harness_p99m3', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--command', sql], { env: { ...process.env, PGPASSWORD: password } });
  if (expectPass && result.status !== 0) throw new Error(`psql failed [${sql.slice(0, 80)}]: ${String(result.stderr || '').trim()}`);
  return { out: String(result.stdout || '').trim(), err: String(result.stderr || '').trim(), status: result.status };
}
function applyFile(port, password, file) {
  const result = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', 'kurabe_harness_p99m3', '--no-psqlrc', '--file', file], { env: { ...process.env, PGPASSWORD: password } });
  if (result.status !== 0) throw new Error(`psql ${path.basename(file)} failed: ${String(result.stderr || '').trim()}`);
}
function bootstrap(port, password) {
  psql(port, password, 'SELECT 1;');
  psql(port, password, "DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
  psql(port, password, "REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;");
  applyFile(port, password, baseline);
  psql(port, password, `INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
    ('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
    ('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
    ('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);`);
  applyFile(port, password, migration);
}
function jsonResult(raw) {
  return JSON.parse(raw.split('\n').filter(Boolean).at(-1));
}

function verifySaveWithRollback(port, password, bands, expectedVersion, role = 'service_role') {
  const preVersion = psql(port, password, 'SELECT version_no FROM public.grade_band_versions WHERE is_active;').out;
  const preChecksum = psql(port, password, 'SELECT checksum FROM public.grade_band_versions WHERE is_active;').out;
  const preVersionsCount = psql(port, password, 'SELECT count(*) FROM public.grade_band_versions;').out;
  const preBandsCount = psql(port, password, 'SELECT count(*) FROM public.grade_bands;').out;

  const txSql = `
    BEGIN;
    SET ROLE "${role}";
    SELECT public.save_grade_config($json$${JSON.stringify(bands)}$json$::jsonb, ${expectedVersion});
    SELECT public.get_active_grade_config();
    ROLLBACK;
  `;
  const txResult = psql(port, password, txSql);
  const lines = txResult.out.split('\n').filter(Boolean);
  assert.equal(lines.length, 2, 'expected two output rows from rollback transaction');
  const saved = JSON.parse(lines[0]);
  const activeDuringTx = JSON.parse(lines[1]);

  assert.equal(saved.version, Number(expectedVersion) + 1);
  assert.equal(saved.bands.length, 18);
  assert.match(saved.checksum, /^[0-9a-f]{64}$/);
  assert.equal(activeDuringTx.version, Number(expectedVersion) + 1);
  assert.equal(activeDuringTx.checksum, saved.checksum);

  const postVersion = psql(port, password, 'SELECT version_no FROM public.grade_band_versions WHERE is_active;').out;
  const postChecksum = psql(port, password, 'SELECT checksum FROM public.grade_band_versions WHERE is_active;').out;
  const postVersionsCount = psql(port, password, 'SELECT count(*) FROM public.grade_band_versions;').out;
  const postBandsCount = psql(port, password, 'SELECT count(*) FROM public.grade_bands;').out;

  assert.equal(postVersion, preVersion, 'active version must not change after rolled-back save');
  assert.equal(postChecksum, preChecksum, 'active checksum must not change after rolled-back save');
  assert.equal(postVersionsCount, preVersionsCount, 'grade_band_versions count must not change after rolled-back save');
  assert.equal(postBandsCount, preBandsCount, 'grade_bands count must not change after rolled-back save');

  return saved;
}

function verifyFunctionHardeningAndAcl(port, password) {
  const procInfo = psql(port, password, `
    SELECT p.proowner::regrole::text, p.prosecdef, array_to_string(p.proconfig, ', ')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_grade_config';
  `).out;
  const [proOwner, proSecDef, proConfig] = procInfo.split('|');
  assert.equal(proOwner, 'postgres', 'save_grade_config owner must be postgres');
  assert.equal(proSecDef, 't', 'save_grade_config must be SECURITY DEFINER');

  assert.ok(
    proConfig.includes('search_path=pg_catalog, pg_temp') || proConfig.includes('search_path=pg_catalog,pg_temp'),
    `proconfig must pin search_path to pg_catalog, pg_temp; found: ${proConfig}`
  );
  assert.ok(!proConfig.includes('public'), 'proconfig must not contain public schema');
  assert.ok(!proConfig.includes('extensions'), 'proconfig must not contain extensions schema');

  assert.equal(psql(port, password, "SELECT has_function_privilege('anon', 'public.save_grade_config(jsonb, bigint)', 'EXECUTE');").out, 'f', 'anon must not have EXECUTE on save_grade_config');
  assert.equal(psql(port, password, "SELECT has_function_privilege('authenticated', 'public.save_grade_config(jsonb, bigint)', 'EXECUTE');").out, 'f', 'authenticated must not have EXECUTE on save_grade_config');
  assert.equal(psql(port, password, "SELECT has_function_privilege('probe_role', 'public.save_grade_config(jsonb, bigint)', 'EXECUTE');").out, 'f', 'probe_role must not have EXECUTE on save_grade_config');

  assert.equal(psql(port, password, "SELECT has_function_privilege('service_role', 'public.save_grade_config(jsonb, bigint)', 'EXECUTE');").out, 't', 'service_role must have EXECUTE on save_grade_config');
  assert.equal(psql(port, password, "SELECT has_function_privilege('postgres', 'public.save_grade_config(jsonb, bigint)', 'EXECUTE');").out, 't', 'postgres must have EXECUTE on save_grade_config');

  const funcAcl = psql(port, password, `
    SELECT grantee, CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE grantee::regrole::text END, privilege_type
    FROM pg_proc p, aclexplode(p.proacl)
    WHERE p.proname = 'save_grade_config' AND p.pronamespace = 'public'::regnamespace;
  `).out.split('\n').filter(Boolean);
  for (const line of funcAcl) {
    const [granteeOid, granteeName, priv] = line.split('|');
    if (priv === 'EXECUTE') {
      assert.notEqual(Number(granteeOid), 0, 'PUBLIC (OID 0) must not have EXECUTE on save_grade_config');
      assert.notEqual(granteeName, 'anon', 'anon must not have direct EXECUTE in proacl');
      assert.notEqual(granteeName, 'authenticated', 'authenticated must not have direct EXECUTE in proacl');
    }
  }

  for (const role of ['anon', 'authenticated', 'probe_role']) {
    const pubCreate = psql(port, password, `SELECT has_schema_privilege('${role}', 'public', 'CREATE');`).out;
    assert.equal(pubCreate, 'f', `role ${role} must not have CREATE on public schema`);

    const hasExt = psql(port, password, "SELECT count(*) FROM pg_namespace WHERE nspname = 'extensions';").out;
    if (Number(hasExt) > 0) {
      const extCreate = psql(port, password, `SELECT has_schema_privilege('${role}', 'extensions', 'CREATE');`).out;
      assert.equal(extCreate, 'f', `role ${role} must not have CREATE on extensions schema`);
    }
  }
}

async function run() {
  const first = `kurabe-p99m3t01-a-${process.pid}`;
  const second = `kurabe-p99m3t01-b-${process.pid}`;
  const third = `kurabe-p99m3t01-c-${process.pid}`;
  const firstPassword = crypto.randomBytes(24).toString('base64url');
  const secondPassword = crypto.randomBytes(24).toString('base64url');
  const thirdPassword = crypto.randomBytes(24).toString('base64url');
  const cases = [];
  try {
    // Setup 1: Independent fresh setup with pgcrypto in 'public' schema
    const port = start(first, firstPassword, 'kurabe_harness_p99m3');
    bootstrap(port, firstPassword);
    const initial = jsonResult(psql(port, firstPassword, 'SELECT public.get_active_grade_config();').out);
    assert.equal(initial.version, 1);
    assert.equal(initial.bands.length, 18);
    assert.equal(psql(port, firstPassword, "SELECT count(*) FROM public.grade_bands WHERE version_id = (SELECT id FROM public.grade_band_versions WHERE is_active);").out, '18');
    cases.push('migration-seeds-authoritative-version');

    const valid = initial.bands.map((band) => ({ ...band }));
    valid.find((band) => band.role_group === 'leader' && band.grade === 'S').min_score = 171;
    valid.find((band) => band.role_group === 'leader' && band.grade === 'A').max_score = 170;
    const saved = jsonResult(psql(port, firstPassword, `SELECT public.save_grade_config($json$${JSON.stringify(valid)}$json$::jsonb, 1);`).out);
    assert.equal(saved.version, 2);
    assert.equal(saved.bands.length, 18);
    cases.push('atomic-versioned-replace');

    const stale = psql(port, firstPassword, `SELECT public.save_grade_config($json$${JSON.stringify(valid)}$json$::jsonb, 1);`, false);
    assert.notEqual(stale.status, 0);
    assert.match(stale.err, /P99M3T01_CONFIG_STALE/);
    assert.equal(psql(port, firstPassword, 'SELECT version_no FROM public.grade_band_versions WHERE is_active;').out, '2');
    cases.push('stale-writer-rejected');

    const invalid = valid.map((band) => ({ ...band }));
    invalid.find((band) => band.role_group === 'leader' && band.grade === 'A').max_score = 168;
    const bad = psql(port, firstPassword, `SELECT public.save_grade_config($json$${JSON.stringify(invalid)}$json$::jsonb, 2);`, false);
    assert.notEqual(bad.status, 0);
    assert.match(bad.err, /P99M3T01_INVALID_CONFIG/);
    assert.equal(psql(port, firstPassword, 'SELECT count(*) FROM public.grade_band_versions;').out, '2');
    cases.push('gap-overlap-rejected-without-partial-write');

    const initialId = psql(port, firstPassword, "SELECT id FROM public.grade_band_versions WHERE version_no=1;").out;
    psql(port, firstPassword, `INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade) VALUES ('00000000-0000-0000-0000-000000000101', 2099, 'P99M3', 'Active', 75, 'AB');`);
    psql(port, firstPassword, `INSERT INTO public.users (id, employee_code, name, role, gender) VALUES ('00000000-0000-0000-0000-000000000102', 'P99M3-EMP', 'P99M3 Employee', 'Employee', 'Other');`);
    psql(port, firstPassword, `INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, status) VALUES ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', 'Employee', 'NotStarted');`);
    const pinned = psql(port, firstPassword, "INSERT INTO public.evaluation_rounds (evaluation_id, round, evaluator_role, status) VALUES ('00000000-0000-0000-0000-000000000103', 1, 'Employee', 'Submitted') RETURNING grade_config_version_id;").out.split(String.fromCharCode(10))[0];
    assert.match(pinned, /^[0-9a-f-]{36}$/);
    assert.equal(pinned, psql(port, firstPassword, 'SELECT id FROM public.grade_band_versions WHERE is_active;').out);
    cases.push('submit-pins-active-version');

    const staleSubmit = psql(port, firstPassword, `INSERT INTO public.evaluation_rounds (evaluation_id, round, evaluator_role, status, grade_config_version_id) VALUES ('00000000-0000-0000-0000-000000000103', 2, 'Employee', 'Submitted', '${initialId}');`, false);
    assert.notEqual(staleSubmit.status, 0);
    assert.match(staleSubmit.err, /P99M3T01_GRADE_VERSION_STALE/);
    cases.push('stale-submit-rejected');

    // P108M1T11: Grade-version ACL closure regression suite
    // Synthetic grants on public.grade_band_versions established inside disposable container
    // to model pre-ACL baseline state with relevant privileges to exercise revocation and SELECT preservation.
    psql(port, firstPassword, `
      GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON TABLE public.grade_band_versions
      TO PUBLIC, anon, authenticated, service_role;
    `);

    // Set up a disposable probe role with NO direct grants to detect inherited PUBLIC privileges
    psql(port, firstPassword, `
      DO $$ BEGIN
        CREATE ROLE probe_role NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END $$;
      REVOKE ALL ON TABLE public.grade_band_versions FROM probe_role;
      REVOKE CREATE ON SCHEMA public FROM probe_role;
    `);

    // Explicitly inspect and prove before-state privileges
    const preAclRows = psql(port, firstPassword, `
      SELECT grantee, CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE grantee::regrole::text END, privilege_type
      FROM pg_class c, aclexplode(c.relacl)
      WHERE c.relname = 'grade_band_versions' AND c.relnamespace = 'public'::regnamespace;
    `).out.split('\n').filter(Boolean).map((line) => {
      const [granteeOid, granteeName, priv] = line.split('|');
      return { granteeOid: Number(granteeOid), granteeName, priv };
    });

    // Probe role has NO direct raw ACL entries
    assert.ok(
      !preAclRows.some((r) => r.granteeName === 'probe_role'),
      'probe_role must have no direct raw ACL entries before ACL migration'
    );

    // PUBLIC (OID 0) has raw DML
    for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      assert.ok(
        preAclRows.some((r) => r.granteeOid === 0 && r.priv === priv),
        `PUBLIC (OID 0) must have raw ${priv} before ACL migration`
      );
    }

    // anon and authenticated have raw DML
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        assert.ok(
          preAclRows.some((r) => r.granteeName === role && r.priv === priv),
          `${role} must have raw ${priv} before ACL migration`
        );
      }
    }

    // service_role has direct raw DML grant
    for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      assert.ok(
        preAclRows.some((r) => r.granteeName === 'service_role' && r.priv === priv),
        `service_role must have raw direct ${priv} before ACL migration`
      );
    }

    // Explicitly prove before-state effective DML for PUBLIC inheritance/anon/auth and direct service_role
    for (const role of ['probe_role', 'anon', 'authenticated', 'service_role']) {
      for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const hasPriv = psql(port, firstPassword, `SELECT has_table_privilege('${role}', 'public.grade_band_versions', '${priv}');`).out;
        assert.equal(hasPriv, 't', `before migration, ${role} must have effective ${priv} privilege`);
      }
      for (const priv of ['SELECT', 'REFERENCES', 'TRIGGER']) {
        const hasPriv = psql(port, firstPassword, `SELECT has_table_privilege('${role}', 'public.grade_band_versions', '${priv}');`).out;
        assert.equal(hasPriv, 't', `before migration, ${role} must have effective ${priv} privilege`);
      }
    }
    cases.push('before-state-proves-effective-dml-and-probe-inheritance');

    // 1. Data/history fingerprints before forward ACL migration
    const preVersionsCount = psql(port, firstPassword, 'SELECT count(*) FROM public.grade_band_versions;').out;
    const preBandsCount = psql(port, firstPassword, 'SELECT count(*) FROM public.grade_bands;').out;
    const preActiveChecksum = psql(port, firstPassword, 'SELECT checksum FROM public.grade_band_versions WHERE is_active;').out;
    const preVersionsFingerprint = psql(port, firstPassword, "SELECT encode(digest(coalesce(string_agg(to_jsonb(v)::text, chr(10) ORDER BY v.version_no), ''), 'sha256'), 'hex') FROM public.grade_band_versions v;").out;
    const preBandsFingerprint = psql(port, firstPassword, "SELECT encode(digest(coalesce(string_agg(to_jsonb(b)::text, chr(10) ORDER BY b.version_id, b.role_group, b.sort_order, b.id), ''), 'sha256'), 'hex') FROM public.grade_bands b;").out;
    assert.match(preVersionsFingerprint, /^[0-9a-f]{64}$/, 'pre-migration versions fingerprint must be a 64-character hex hash');
    assert.match(preBandsFingerprint, /^[0-9a-f]{64}$/, 'pre-migration bands fingerprint must be a 64-character hex hash');

    // Apply forward ACL migration in order
    applyFile(port, firstPassword, aclMigration);

    // Verify data, active configuration, and content fingerprints are strictly preserved across migration
    const postVersionsCount = psql(port, firstPassword, 'SELECT count(*) FROM public.grade_band_versions;').out;
    const postBandsCount = psql(port, firstPassword, 'SELECT count(*) FROM public.grade_bands;').out;
    const postActiveChecksum = psql(port, firstPassword, 'SELECT checksum FROM public.grade_band_versions WHERE is_active;').out;
    const postVersionsFingerprint = psql(port, firstPassword, "SELECT encode(digest(coalesce(string_agg(to_jsonb(v)::text, chr(10) ORDER BY v.version_no), ''), 'sha256'), 'hex') FROM public.grade_band_versions v;").out;
    const postBandsFingerprint = psql(port, firstPassword, "SELECT encode(digest(coalesce(string_agg(to_jsonb(b)::text, chr(10) ORDER BY b.version_id, b.role_group, b.sort_order, b.id), ''), 'sha256'), 'hex') FROM public.grade_bands b;").out;

    assert.equal(postVersionsCount, preVersionsCount, 'grade_band_versions count must be preserved across ACL migration');
    assert.equal(postBandsCount, preBandsCount, 'grade_bands count must be preserved across ACL migration');
    assert.equal(postActiveChecksum, preActiveChecksum, 'active grade config checksum must be preserved across ACL migration');
    assert.equal(postVersionsFingerprint, preVersionsFingerprint, 'grade_band_versions deterministic fingerprint must be preserved across ACL migration');
    assert.equal(postBandsFingerprint, preBandsFingerprint, 'grade_bands deterministic fingerprint must be preserved across ACL migration');
    cases.push('acl-migration-preserves-data-and-history');

    // 2. Inspect post-migration raw table ACL grantees using aclexplode (including PUBLIC OID 0)
    const postAclRows = psql(port, firstPassword, `
      SELECT grantee, CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE grantee::regrole::text END, privilege_type
      FROM pg_class c, aclexplode(c.relacl)
      WHERE c.relname = 'grade_band_versions' AND c.relnamespace = 'public'::regnamespace;
    `).out.split('\n').filter(Boolean).map((line) => {
      const [granteeOid, granteeName, priv] = line.split('|');
      return { granteeOid: Number(granteeOid), granteeName, priv };
    });

    for (const forbidden of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      assert.ok(
        !postAclRows.some((r) => r.granteeOid === 0 && r.priv === forbidden),
        `PUBLIC (OID 0) must not have raw ${forbidden} in aclexplode`
      );
      assert.ok(
        !postAclRows.some((r) => (r.granteeName === 'anon' || r.granteeName === 'authenticated') && r.priv === forbidden),
        `anon/authenticated must not have raw ${forbidden} in aclexplode`
      );
    }
    cases.push('aclexplode-verifies-no-dml-for-public-anon-auth');

    // 3. Inspect post-migration effective privileges: denial of DML for anon, auth, probe_role
    for (const role of ['anon', 'authenticated', 'probe_role']) {
      for (const forbidden of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        const hasPriv = psql(port, firstPassword, `SELECT has_table_privilege('${role}', 'public.grade_band_versions', '${forbidden}');`).out;
        assert.equal(hasPriv, 'f', `effective privilege ${forbidden} must be false for ${role}`);
      }
    }

    // Direct DML remains available to service_role (both raw ACL and effective)
    for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      assert.ok(
        postAclRows.some((r) => r.granteeName === 'service_role' && r.priv === priv),
        `service_role must retain raw direct ${priv} in aclexplode`
      );
      const hasPriv = psql(port, firstPassword, `SELECT has_table_privilege('service_role', 'public.grade_band_versions', '${priv}');`).out;
      assert.equal(hasPriv, 't', `service_role must retain effective ${priv} privilege`);
    }

    // SELECT and non-target table privileges such as REFERENCES/TRIGGER remain unchanged
    for (const preserved of ['SELECT', 'REFERENCES', 'TRIGGER']) {
      assert.ok(
        postAclRows.some((r) => r.granteeOid === 0 && r.priv === preserved),
        `PUBLIC (OID 0) must retain raw ${preserved} in aclexplode`
      );
      assert.ok(
        postAclRows.some((r) => r.granteeName === 'anon' && r.priv === preserved),
        `anon must retain raw ${preserved} in aclexplode`
      );
      assert.ok(
        postAclRows.some((r) => r.granteeName === 'authenticated' && r.priv === preserved),
        `authenticated must retain raw ${preserved} in aclexplode`
      );
      assert.ok(
        postAclRows.some((r) => r.granteeName === 'service_role' && r.priv === preserved),
        `service_role must retain raw ${preserved} in aclexplode`
      );
    }
    for (const role of ['anon', 'authenticated', 'probe_role', 'service_role']) {
      for (const priv of ['SELECT', 'REFERENCES', 'TRIGGER']) {
        const hasPriv = psql(port, firstPassword, `SELECT has_table_privilege('${role}', 'public.grade_band_versions', '${priv}');`).out;
        assert.equal(hasPriv, 't', `effective non-target privilege ${priv} must remain true for ${role}`);
      }
    }
    for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      const gbPriv = psql(port, firstPassword, `SELECT has_table_privilege('service_role', 'public.grade_bands', '${priv}');`).out;
      assert.equal(gbPriv, 't', `non-target table grade_bands privilege ${priv} must remain true for service_role`);
    }
    cases.push('effective-privileges-enforce-read-only');

    // 4. Prove direct INSERT/UPDATE/DELETE/TRUNCATE fail for probe_role, anon, authenticated
    for (const role of ['probe_role', 'anon', 'authenticated']) {
      const ins = psql(port, firstPassword, `SET ROLE "${role}"; INSERT INTO public.grade_band_versions (version_no, checksum, is_active) VALUES (999, 'evil', false); RESET ROLE;`, false);
      assert.notEqual(ins.status, 0, `direct INSERT must fail for ${role}`);
      assert.match(ins.err, /permission denied/i);

      const upd = psql(port, firstPassword, `SET ROLE "${role}"; UPDATE public.grade_band_versions SET checksum = 'evil' WHERE version_no = 1; RESET ROLE;`, false);
      assert.notEqual(upd.status, 0, `direct UPDATE must fail for ${role}`);
      assert.match(upd.err, /permission denied/i);

      const del = psql(port, firstPassword, `SET ROLE "${role}"; DELETE FROM public.grade_band_versions WHERE version_no = 1; RESET ROLE;`, false);
      assert.notEqual(del.status, 0, `direct DELETE must fail for ${role}`);
      assert.match(del.err, /permission denied/i);

      const trc = psql(port, firstPassword, `SET ROLE "${role}"; TRUNCATE TABLE public.grade_band_versions; RESET ROLE;`, false);
      assert.notEqual(trc.status, 0, `direct TRUNCATE must fail for ${role}`);
      assert.match(trc.err, /permission denied/i);
    }
    cases.push('direct-dml-rejected-for-probe-anon-auth');

    // Prove direct DML remains functional for service_role
    const srDml = psql(port, firstPassword, `SET ROLE "service_role"; INSERT INTO public.grade_band_versions (version_no, checksum, is_active) VALUES (9999, 'sr_test', false); UPDATE public.grade_band_versions SET checksum = 'sr_test_upd' WHERE version_no = 9999; DELETE FROM public.grade_band_versions WHERE version_no = 9999; RESET ROLE;`);
    assert.equal(srDml.status, 0, `direct DML must succeed for service_role: ${srDml.err}`);
    cases.push('service-role-direct-dml-succeeds');

    // 5. Prove direct SELECT works for anon, authenticated, and probe_role (inherited PUBLIC SELECT)
    const anonSelect = psql(port, firstPassword, 'SET ROLE "anon"; SELECT count(*) FROM public.grade_band_versions; RESET ROLE;');
    assert.equal(anonSelect.status, 0);
    assert.equal(anonSelect.out, postVersionsCount);

    const authSelect = psql(port, firstPassword, 'SET ROLE "authenticated"; SELECT count(*) FROM public.grade_band_versions; RESET ROLE;');
    assert.equal(authSelect.status, 0);
    assert.equal(authSelect.out, postVersionsCount);

    const probeSelect = psql(port, firstPassword, 'SET ROLE "probe_role"; SELECT count(*) FROM public.grade_band_versions; RESET ROLE;');
    assert.equal(probeSelect.status, 0);
    assert.equal(probeSelect.out, postVersionsCount);

    // Admin flow direct historical version-ID read
    const histRead = psql(port, firstPassword, 'SET ROLE "authenticated"; SELECT id FROM public.grade_band_versions WHERE version_no = 1; RESET ROLE;');
    assert.equal(histRead.status, 0);
    assert.match(histRead.out, /^[0-9a-f-]{36}$/);
    cases.push('direct-select-and-admin-historical-read-succeed');

    // Capture save_grade_config metadata before digest resolution migration
    const preProcOwner = psql(port, firstPassword, "SELECT proowner::regrole::text FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const preProcSecDef = psql(port, firstPassword, "SELECT prosecdef FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const preProcAcl = psql(port, firstPassword, "SELECT array_to_string(proacl, ', ') FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const preProcComment = psql(port, firstPassword, "SELECT obj_description(p.oid, 'pg_proc') FROM pg_proc p WHERE p.proname = 'save_grade_config' AND p.pronamespace = 'public'::regnamespace;").out;

    // Apply supplemental digest resolution migration in task order
    applyFile(port, firstPassword, digestMigration);
    cases.push('digest-migration-applied-in-task-order');

    // Verify owner, SECURITY DEFINER, EXECUTE ACL/grantees remain unchanged after CREATE OR REPLACE
    const postProcOwner = psql(port, firstPassword, "SELECT proowner::regrole::text FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const postProcSecDef = psql(port, firstPassword, "SELECT prosecdef FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const postProcAcl = psql(port, firstPassword, "SELECT array_to_string(proacl, ', ') FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const postProcComment = psql(port, firstPassword, "SELECT obj_description(p.oid, 'pg_proc') FROM pg_proc p WHERE p.proname = 'save_grade_config' AND p.pronamespace = 'public'::regnamespace;").out;

    assert.equal(postProcOwner, preProcOwner, 'owner must remain unchanged after CREATE OR REPLACE');
    assert.equal(postProcSecDef, preProcSecDef, 'SECURITY DEFINER must remain unchanged after CREATE OR REPLACE');
    assert.equal(postProcAcl, preProcAcl, 'EXECUTE ACL must remain unchanged after CREATE OR REPLACE');
    assert.equal(postProcComment, preProcComment, 'function comment must remain unchanged after CREATE OR REPLACE');

    // Verify function hardening, proconfig, and schema CREATE denials
    verifyFunctionHardeningAndAcl(port, firstPassword);
    cases.push('function-metadata-and-proconfig-hardened');

    // 6. Prove authorized SECURITY DEFINER get_active_grade_config/save_grade_config route still reads/saves
    const anonActive = jsonResult(psql(port, firstPassword, 'SET ROLE "anon"; SELECT public.get_active_grade_config(); RESET ROLE;').out);
    assert.equal(anonActive.version, 2);
    assert.equal(anonActive.bands.length, 18);

    const authActive = jsonResult(psql(port, firstPassword, 'SET ROLE "authenticated"; SELECT public.get_active_grade_config(); RESET ROLE;').out);
    assert.equal(authActive.version, 2);
    assert.equal(authActive.bands.length, 18);

    // Save RPC success run within explicit rollback-only transaction asserting no mutation persists
    const validV3 = authActive.bands.map((band) => ({ ...band }));
    const savedV3 = verifySaveWithRollback(port, firstPassword, validV3, 2, 'service_role');
    assert.equal(savedV3.version, 3);
    assert.equal(savedV3.bands.length, 18);
    const directPublicHash = psql(port, firstPassword, `SELECT encode(public.digest($json$${JSON.stringify(validV3)}$json$::jsonb::text, 'sha256'), 'hex');`).out;
    assert.equal(savedV3.checksum, directPublicHash, 'public-schema checksum must match the installed pgcrypto digest');
    cases.push('public-schema-digest-resolution-verified');

    // Prove active version remains 2 after rollback
    const activeAfterRollback = jsonResult(psql(port, firstPassword, 'SET ROLE "anon"; SELECT public.get_active_grade_config(); RESET ROLE;').out);
    assert.equal(activeAfterRollback.version, 2, 'active version must remain 2 after rolled-back save');
    cases.push('security-definer-rpc-routes-preserve-read-write');

    // Stop and remove first container before proceeding
    command('docker', ['rm', '--force', first]);

    // Container 2: Approved rollback test
    const rollbackPort = start(second, secondPassword, 'kurabe_harness_p99m3');
    bootstrap(rollbackPort, secondPassword);
    const before = psql(rollbackPort, secondPassword, 'SELECT count(*) FROM public.grade_bands;').out;
    const rollbackResult = command('psql', ['--host', '127.0.0.1', '--port', rollbackPort, '--username', 'postgres', '--dbname', 'kurabe_harness_p99m3', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--command', "SET kurabe.p99m3t01_rollback_approved='true';", '--file', rollback], { env: { ...process.env, PGPASSWORD: secondPassword } });
    if (rollbackResult.status !== 0) throw new Error(`rollback failed: ${String(rollbackResult.stderr || '').trim()}`);
    assert.equal(psql(rollbackPort, secondPassword, 'SELECT count(*) FROM public.grade_bands;').out, before);
    assert.equal(psql(rollbackPort, secondPassword, "SELECT count(*) FROM information_schema.columns WHERE table_name='grade_band_versions';").out, '0');
    cases.push('approved-rollback-preserves-baseline-data');

    // Stop and remove second container before proceeding
    command('docker', ['rm', '--force', second]);

    // Container 3: Setup 2 with pgcrypto installed in 'extensions' schema
    const thirdPort = start(third, thirdPassword, 'kurabe_harness_p99m3');
    psql(thirdPort, thirdPassword, 'SELECT 1;');
    psql(thirdPort, thirdPassword, `
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE probe_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // Create schema 'extensions' and install pgcrypto there
    psql(thirdPort, thirdPassword, `
      CREATE SCHEMA IF NOT EXISTS extensions;
      GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role, postgres;
      REVOKE CREATE ON SCHEMA extensions FROM PUBLIC, anon, authenticated, probe_role;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, probe_role;
      CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
    `);

    // Set database search_path to include extensions so session DDL during bootstrap can resolve pgcrypto functions
    psql(thirdPort, thirdPassword, `
      ALTER DATABASE kurabe_harness_p99m3 SET search_path TO public, extensions;
    `);

    // Verify pgcrypto is indeed installed in extensions schema
    const extNsp = psql(thirdPort, thirdPassword, `
      SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto';
    `).out;
    assert.equal(extNsp, 'extensions', 'pgcrypto must be in extensions schema');

    // Bootstrap baseline and seed 18 bands
    applyFile(thirdPort, thirdPassword, baseline);
    psql(thirdPort, thirdPassword, `INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
      ('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
      ('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
      ('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);`);

    // Apply historical migration
    applyFile(thirdPort, thirdPassword, migration);

    // Verify historical save_grade_config was created with SET search_path = public
    const preProConfig = psql(thirdPort, thirdPassword, `
      SELECT array_to_string(proconfig, ', ')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'save_grade_config';
    `).out;
    assert.ok(preProConfig.includes('search_path=public'), 'historical save_grade_config must have search_path=public');

    // Historical RPC pre-fix failure:
    // Calling historical save_grade_config fails with SQLSTATE 42883 (digest not found) because pgcrypto is in extensions, not public
    const initialExtConfig = jsonResult(psql(thirdPort, thirdPassword, 'SELECT public.get_active_grade_config();').out);
    assert.equal(initialExtConfig.version, 1);
    const testBands = initialExtConfig.bands.map((band) => ({ ...band }));
    testBands.find((band) => band.role_group === 'leader' && band.grade === 'S').min_score = 171;
    testBands.find((band) => band.role_group === 'leader' && band.grade === 'A').max_score = 170;

    const preFixFailure = psql(thirdPort, thirdPassword, `SELECT public.save_grade_config($json$${JSON.stringify(testBands)}$json$::jsonb, 1);`, false);
    assert.notEqual(preFixFailure.status, 0, 'historical save_grade_config must fail with pgcrypto in extensions schema');
    assert.match(preFixFailure.err, /42883|digest\(unknown, unknown\)|function digest.*does not exist/i, 'must fail with SQLSTATE 42883 (digest not found)');
    cases.push('pre-fix-regression-42883-asserted');

    const preExtProcOwner = psql(thirdPort, thirdPassword, "SELECT proowner::regrole::text FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const preExtProcSecDef = psql(thirdPort, thirdPassword, "SELECT prosecdef FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const preExtProcAcl = psql(thirdPort, thirdPassword, "SELECT array_to_string(proacl, ', ') FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const preExtProcComment = psql(thirdPort, thirdPassword, "SELECT obj_description(p.oid, 'pg_proc') FROM pg_proc p WHERE p.proname = 'save_grade_config' AND p.pronamespace = 'public'::regnamespace;").out;

    // Apply ACL migration and supplemental digest resolution migration in task order
    applyFile(thirdPort, thirdPassword, aclMigration);
    applyFile(thirdPort, thirdPassword, digestMigration);
    cases.push('extensions-setup-migrations-applied-in-task-order');

    const postExtProcOwner = psql(thirdPort, thirdPassword, "SELECT proowner::regrole::text FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const postExtProcSecDef = psql(thirdPort, thirdPassword, "SELECT prosecdef FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const postExtProcAcl = psql(thirdPort, thirdPassword, "SELECT array_to_string(proacl, ', ') FROM pg_proc WHERE proname = 'save_grade_config' AND pronamespace = 'public'::regnamespace;").out;
    const postExtProcComment = psql(thirdPort, thirdPassword, "SELECT obj_description(p.oid, 'pg_proc') FROM pg_proc p WHERE p.proname = 'save_grade_config' AND p.pronamespace = 'public'::regnamespace;").out;
    assert.equal(postExtProcOwner, preExtProcOwner, 'extensions setup owner must remain unchanged after CREATE OR REPLACE');
    assert.equal(postExtProcSecDef, preExtProcSecDef, 'extensions setup SECURITY DEFINER must remain unchanged');
    assert.equal(postExtProcAcl, preExtProcAcl, 'extensions setup EXECUTE ACL must remain unchanged');
    assert.equal(postExtProcComment, preExtProcComment, 'extensions setup function comment must remain unchanged');

    // Verify function hardening, proconfig, and ACL
    verifyFunctionHardeningAndAcl(thirdPort, thirdPassword);
    cases.push('extensions-setup-function-hardening-and-acl-verified');

    // Add a public.digest shadow probe:
    // If save_grade_config incorrectly resolves digest from public, this probe will be called and throw.
    psql(thirdPort, thirdPassword, `
      CREATE OR REPLACE FUNCTION public.digest(data text, type text)
      RETURNS bytea
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'SHADOW_DIGEST_PROBE_CALLED';
      END;
      $$;
    `);

    // Prove the shadow probe itself is active and throws when invoked directly from public
    const probeDirect = psql(thirdPort, thirdPassword, "SELECT public.digest('test'::text, 'sha256'::text);", false);
    assert.notEqual(probeDirect.status, 0);
    assert.match(probeDirect.err, /SHADOW_DIGEST_PROBE_CALLED/);
    cases.push('shadow-digest-probe-verified');

    // Now prove the fixed SECURITY DEFINER RPC works and uses the extension-qualified digest rather than the public shadow.
    // Run within an explicit rollback-only transaction, assert no mutation persists.
    const savedExt = verifySaveWithRollback(thirdPort, thirdPassword, testBands, 1, 'service_role');
    assert.equal(savedExt.version, 2);
    assert.equal(savedExt.bands.length, 18);
    const directExtHash = psql(thirdPort, thirdPassword, `SELECT encode(extensions.digest($json$${JSON.stringify(testBands)}$json$::jsonb::text, 'sha256'), 'hex');`).out;
    assert.equal(savedExt.checksum, directExtHash, 'saved checksum must match genuine extension digest');
    cases.push('fixed-rpc-uses-extension-qualified-digest-avoiding-shadow');

    // Clean up shadow probe
    psql(thirdPort, thirdPassword, 'DROP FUNCTION public.digest(text, text);');

    // Test missing pgcrypto fails closed:
    // Drop extension inside a rollback-only transaction and prove save_grade_config fails closed
    const missingExtResult = psql(thirdPort, thirdPassword, `
      BEGIN;
      DROP EXTENSION pgcrypto CASCADE;
      SELECT public.save_grade_config($json$${JSON.stringify(testBands)}$json$::jsonb, 1);
      ROLLBACK;
    `, false);
    assert.notEqual(missingExtResult.status, 0, 'save_grade_config must fail when pgcrypto is missing');
    assert.match(missingExtResult.err, /P99M3T01_CONFIG_UNAVAILABLE.*pgcrypto/i, 'must fail closed with missing pgcrypto error');
    cases.push('missing-pgcrypto-fails-closed');

    command('docker', ['rm', '--force', third]);

    return { real: true, passed: true, tier: 'real-DB', status: 'EXECUTED', cases, target: 'disposable-postgresql-17' };
  } finally {
    command('docker', ['rm', '--force', first]);
    command('docker', ['rm', '--force', second]);
    command('docker', ['rm', '--force', third]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`GRADE_CONFIG_VERSION PASS cases=${result.cases.length} target=${result.target}`);
  } catch (error) {
    console.error(`GRADE_CONFIG_VERSION FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
