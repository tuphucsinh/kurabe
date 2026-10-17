#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');

const baseline = path.join(projectRoot, 'db/bootstrap/baseline.sql');
const p108Migration = path.join(projectRoot, 'supabase/migrations/20261017093100_p108_criteria_sets.sql');
const p108Rollback = path.join(projectRoot, 'db/rollback-p108-criteria-sets.sql');

export function redact(text) {
  return String(text || '')
    .replace(/(\b(?:POSTGRES_PASSWORD|PGPASSWORD|password|secret|key)\b\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^\s,"';]+)/gi, '$1[redacted]');
}

function command(file, args, options = {}) {
  const timeoutMs = options.timeout ?? 30000;
  const stdio = [options.input ? 'pipe' : 'ignore', 'pipe', 'pipe'];
  const result = spawnSync(file, args, { cwd: projectRoot, encoding: 'utf8', timeout: timeoutMs, ...options, stdio });
  result.out = String(result.stdout || '').trim();
  result.err = redact(String(result.stderr || '').trim());
  return result;
}

function must(file, args, options = {}) {
  const result = command(file, args, options);
  if (result.status !== 0) throw new Error(`${file} failed (${result.status}): ${redact(String(result.stderr || '').trim())}`);
  return String(result.stdout || '').trim();
}

function cleanupContainer(containerId) {
  if (!containerId) return;
  const rmResult = command('docker', ['rm', '--force', '--volumes', containerId]);
  if (rmResult.status !== 0) {
    throw new Error(`docker rm failed (${rmResult.status}) for ${containerId}: ${rmResult.err}`);
  }
  const psResult = command('docker', ['ps', '-a', '--filter', `id=${containerId}`, '--format', '{{.ID}}']);
  if (psResult.status !== 0) {
    throw new Error(`docker ps check failed (${psResult.status}) for ${containerId}: ${psResult.err}`);
  }
  const remaining = String(psResult.stdout || psResult.out || '').trim();
  if (remaining !== '') {
    throw new Error(`container ${containerId} still exists after teardown: ${remaining}`);
  }
}

async function start(name, password, database, onCreated) {
  const id = must('docker', [
    'run', '--detach', '--rm', '--name', name,
    '--memory', '512m',
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '--env', `POSTGRES_DB=${database}`,
    '--publish', '127.0.0.1::5432',
    'postgres:17-alpine',
  ]);
  assert.ok(id.length > 10);
  if (typeof onCreated === 'function') {
    onCreated(id);
  }
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const result = command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', database]);
    if (result.status === 0) { ready = true; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(ready, 'disposable PostgreSQL did not become ready');
  const port = must('docker', ['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
  assert.ok(port, 'could not determine loopback port');
  let connectionReady = false;
  for (let i = 0; i < 60; i += 1) {
    const readyConn = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--command', 'SELECT 1;'], { env: { ...process.env, PGPASSWORD: password } });
    if (readyConn.status === 0) { connectionReady = true; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(connectionReady, 'loopback PostgreSQL connection failed');
  return { port, id };
}

function psql(port, password, database, sql, expectPass = true) {
  const result = command('psql', [
    '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
    '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--command', sql,
  ], { env: { ...process.env, PGPASSWORD: password } });
  if (expectPass && result.status !== 0) {
    throw new Error(`psql failed [${sql.slice(0, 100)}]: ${redact(String(result.stderr || '').trim())}`);
  }
  return { out: String(result.stdout || '').trim(), err: redact(String(result.stderr || '').trim()), status: result.status };
}

function applyFile(port, password, database, file) {
  const result = command('psql', [
    '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
    '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', file,
  ], { env: { ...process.env, PGPASSWORD: password } });
  if (result.status !== 0) throw new Error(`psql ${path.basename(file)} failed: ${redact(String(result.stderr || '').trim())}`);
}

const PSQL_COMMAND_TAG_REGEX = /^(?:SET|RESET|BEGIN|COMMIT|ROLLBACK|DO|LOCK TABLE|LISTEN|NOTIFY|SHOW|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|CREATE \w+|DROP \w+|ALTER \w+|TRUNCATE TABLE)$/i;

export function isCommandTag(line) {
  return PSQL_COMMAND_TAG_REGEX.test(String(line || '').trim());
}

export function extractScalar(raw) {
  const lines = String(raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isCommandTag(l));
  if (lines.length === 0) {
    throw new Error(`No scalar found in output: ${JSON.stringify(raw)}`);
  }
  if (lines.length > 1) {
    throw new Error(`Expected single scalar output, got ${lines.length} rows: ${JSON.stringify(lines)}`);
  }
  return lines[0];
}

export function jsonResult(raw) {
  const lines = String(raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isCommandTag(l));
  if (lines.length === 0) {
    throw new Error(`No JSON content found in output: ${JSON.stringify(raw)}`);
  }
  if (lines.length > 1) {
    throw new Error(`Expected single JSON result line, got ${lines.length} rows: ${JSON.stringify(lines)}`);
  }
  return JSON.parse(lines[0]);
}

function spawnPsql(port, password, database, sql, appName = 'p108_worker') {
  const wrappedSql = `SET statement_timeout = '15s'; SET lock_timeout = '10s'; ${sql}`;
  const child = spawn('psql', [
    '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
    '--no-psqlrc', '--quiet', '--tuples-only', '--no-align',
    '--set', 'ON_ERROR_STOP=1',
  ], {
    cwd: projectRoot,
    env: { ...process.env, PGPASSWORD: password, PGAPPNAME: appName },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let out = '';
  let err = '';
  let exited = false;

  const timer = setTimeout(() => {
    if (!exited) {
      try { child.kill('SIGKILL'); } catch {}
    }
  }, 20000);

  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  child.on('error', (e) => { err += `\n${e.message}`; });

  child.stdin.end(wrappedSql);

  const promise = new Promise((resolve) => {
    child.on('close', (status) => {
      exited = true;
      clearTimeout(timer);
      resolve({ out: out.trim(), err: redact(err.trim()), status });
    });
  });

  return { child, promise };
}

function spawnInteractivePsql(port, password, database, appName = 'p108_interactive') {
  const child = spawn('psql', [
    '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
    '--no-psqlrc', '--quiet', '--tuples-only', '--no-align',
    '--set', 'ON_ERROR_STOP=1',
  ], {
    cwd: projectRoot,
    env: { ...process.env, PGPASSWORD: password, PGAPPNAME: appName },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let out = '';
  let err = '';
  let exited = false;

  const timer = setTimeout(() => {
    if (!exited) {
      try { child.kill('SIGKILL'); } catch {}
    }
  }, 25000);

  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  child.on('error', (e) => { err += `\n${e.message}`; });

  const promise = new Promise((resolve) => {
    child.on('close', (status) => {
      exited = true;
      clearTimeout(timer);
      resolve({ out: out.trim(), err: redact(err.trim()), status });
    });
  });

  function send(sql) {
    child.stdin.write(`${sql}\n`);
  }

  function end() {
    child.stdin.end();
  }

  return { child, promise, send, end };
}

async function waitForLockHeld(port, password, database, appName, lockType, tableName = null, maxWaitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    let sql = `
      SELECT count(*)
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE a.application_name = '${appName}'
        AND l.granted = true
    `;
    if (lockType === 'relation' && tableName) {
      sql += ` AND l.locktype = 'relation' AND l.relation = 'public.${tableName}'::regclass`;
    } else if (lockType === 'advisory') {
      sql += ` AND l.locktype = 'advisory'`;
    }
    const res = psql(port, password, database, sql, false);
    if (res.status === 0 && Number(extractScalar(res.out)) >= 1) {
      return Number(extractScalar(res.out));
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timeout waiting for ${appName} to hold lock (lockType=${lockType}, tableName=${tableName})`);
}

async function waitForBlockedBy(port, password, database, waiterAppName, blockerAppName, lockType, tableName = null, maxWaitMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    let sql = `
      SELECT json_build_object(
        'waiter_pid', waiter.pid,
        'blocker_pid', blocker.pid,
        'locktype', l.locktype,
        'mode', l.mode,
        'granted', l.granted
      )
      FROM pg_locks l
      JOIN pg_stat_activity waiter ON waiter.pid = l.pid
      JOIN pg_stat_activity blocker ON blocker.application_name = '${blockerAppName}'
      WHERE waiter.application_name = '${waiterAppName}'
        AND NOT l.granted
        AND blocker.pid = ANY(pg_blocking_pids(waiter.pid))
    `;
    if (lockType === 'relation' && tableName) {
      sql += ` AND l.locktype = 'relation' AND l.relation = 'public.${tableName}'::regclass`;
    } else if (lockType === 'advisory') {
      sql += ` AND l.locktype = 'advisory'`;
    }
    sql += ' LIMIT 1;';

    const res = psql(port, password, database, sql, false);
    if (res.status === 0 && res.out.length > 0) {
      try {
        const info = jsonResult(res.out);
        if (info && info.waiter_pid && info.blocker_pid) {
          return info;
        }
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timeout waiting for ${waiterAppName} to be blocked by ${blockerAppName} (lockType=${lockType}, tableName=${tableName})`);
}

const CRITERIA_TABLES = [
  'criteria',
  'criteria_groups',
  'criterion_audiences',
  'criterion_levels',
  'criteria_config_versions',
  'criteria_group_versions',
  'criterion_versions',
  'criterion_level_versions',
  'criterion_audience_versions',
];

const CRITERIA_FUNCTIONS = [
  'validate_criteria_config(jsonb)',
  'get_active_criteria_config()',
  'save_criteria_config(jsonb,bigint)',
];

function captureFunctionAcls(port, password, database) {
  const lines = [];
  for (const fn of CRITERIA_FUNCTIONS) {
    const proacl = psql(port, password, database, `SELECT COALESCE(p.proacl::text, 'DEFAULT') FROM pg_proc p WHERE p.oid = 'public.${fn}'::regprocedure;`).out;
    lines.push(`fn:${fn}:proacl=${proacl}`);
    for (const role of ['anon', 'authenticated', 'service_role', 'postgres']) {
      const hasPriv = psql(port, password, database, `SELECT has_function_privilege('${role}', 'public.${fn}', 'EXECUTE');`).out;
      lines.push(`fn:${fn}:${role}=${hasPriv}`);
    }
    const publicPriv = psql(port, password, database, `
      SELECT (EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      ))::text FROM pg_proc p WHERE p.oid = 'public.${fn}'::regprocedure;
    `).out;
    lines.push(`fn:${fn}:PUBLIC=${publicPriv}`);
  }
  return lines.sort().join('\n');
}

function captureTableAclsJson(port, password, database) {
  const sql = `
    SELECT COALESCE(json_agg(json_build_object(
      'table_name', table_name,
      'privilege_type', privilege_type,
      'grantee', grantee
    ) ORDER BY table_name, grantee, privilege_type), '[]'::json)
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = ANY(ARRAY['${CRITERIA_TABLES.join("','")}'])
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC');
  `;
  return psql(port, password, database, sql).out;
}

function criteriaDigest(port, password, database) {
  const parts = [];
  // Row content of all 9 criteria tables
  for (const tbl of CRITERIA_TABLES) {
    const rows = psql(port, password, database, `
      SELECT COALESCE(string_agg(row_data, E'\\n' ORDER BY row_data), '') FROM (
        SELECT md5(t::text) AS row_data FROM public.${tbl} t
      ) s;
    `).out;
    parts.push(`tbl:${tbl}=${rows}`);
  }
  // Routine definitions & comments
  for (const fn of CRITERIA_FUNCTIONS) {
    const fnDef = psql(port, password, database, `
      SELECT md5(pg_get_functiondef(p.oid)) || '|' || COALESCE(obj_description(p.oid, 'pg_proc'), 'none')
      FROM pg_proc p WHERE p.oid = 'public.${fn}'::regprocedure;
    `).out;
    parts.push(`fn:${fn}=${fnDef}`);
  }
  // Function ACLs
  parts.push(captureFunctionAcls(port, password, database));
  // Table ACLs
  parts.push(captureTableAclsJson(port, password, database));
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}

function bootstrap(port, password, database) {
  psql(port, password, database, `
    DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    ALTER ROLE service_role BYPASSRLS;
  `);
  applyFile(port, password, database, baseline);

  // Seed baseline comments and grade bands
  psql(port, password, database, `
    INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
      ('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
      ('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
      ('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);
    INSERT INTO public.criteria_groups (id, code, name, short_name, sort_order) VALUES
      ('00000000-0000-0000-0000-000000000201', 'quality', 'Quality', 'Q', 0),
      ('00000000-0000-0000-0000-000000000202', 'teamwork', 'Teamwork', 'T', 1);
    INSERT INTO public.criteria (id, code, name, description, applies_to, weight, group_id, sort_order, default_level_index) VALUES
      ('00000000-0000-0000-0000-000000000211', 'A1', 'Result quality', 'Quality of output', 'employee', 60, '00000000-0000-0000-0000-000000000201', 0, 0),
      ('00000000-0000-0000-0000-000000000212', 'A2', 'Cooperation', 'Works with team', 'employee', 40, '00000000-0000-0000-0000-000000000202', 0, 0);
    INSERT INTO public.criterion_levels (id, criterion_id, points, label, description, sort_order) VALUES
      ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000211', 5, 'Excellent', 'Excellent', 0),
      ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000211', 3, 'Good', 'Good', 1),
      ('00000000-0000-0000-0000-000000000223', '00000000-0000-0000-0000-000000000212', 5, 'Excellent', 'Excellent', 0),
      ('00000000-0000-0000-0000-000000000224', '00000000-0000-0000-0000-000000000212', 3, 'Good', 'Good', 1);
    INSERT INTO public.criterion_audiences (criterion_id, audience) VALUES
      ('00000000-0000-0000-0000-000000000211', 'employee'),
      ('00000000-0000-0000-0000-000000000212', 'employee');
  `);

  // Apply forward migrations from 202609 up to P107
  const dir = path.join(projectRoot, 'supabase/migrations');
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    const version = name.split('_')[0];
    if (version < '202609') continue;
    if (version >= '20261017') continue; // Stop before P108
    applyFile(port, password, database, path.join(dir, name));
  }

  // Configure Supabase-like default privileges on version tables to test evidence-driven closure
  psql(port, password, database, `
    GRANT ALL ON TABLE
      public.criteria_config_versions,
      public.criteria_group_versions,
      public.criterion_versions,
      public.criterion_level_versions,
      public.criterion_audience_versions
    TO authenticated, service_role;
  `);
}

export async function run() {
  const name = `kurabe-p108-sets-${process.pid}`;
  const password = crypto.randomBytes(24).toString('base64url');
  const database = `kurabe_harness_p108_${process.pid}`;
  const cases = [];
  const activeChildren = [];
  let containerId = null;
  let primaryError = null;

  try {
    const started = await start(name, password, database, (id) => { containerId = id; });
    containerId = started.id;
    const port = started.port;
    bootstrap(port, password, database);

    // ========================================================
    // SECTION 1: Baseline Pre-Write Vulnerability & Function ACL Capture
    // ========================================================
    const preMigrationFnAcl = captureFunctionAcls(port, password, database);
    const preMigrationTableAcl = captureTableAclsJson(port, password, database);
    assert.ok(preMigrationTableAcl.length > 10, 'expected non-empty pre-migration table ACL');

    // H6: Capture complete legacy snapshot and historical version 1 rows before migration
    const legacyConfigBeforeMigration = jsonResult(psql(port, password, database, 'SELECT public.get_active_criteria_config();').out);
    assert.equal(legacyConfigBeforeMigration.version, 1);
    const legacyV1ConfigRowBefore = psql(port, password, database, 'SELECT id, version_no, checksum FROM public.criteria_config_versions WHERE version_no = 1;').out;
    const legacyV1GroupsBefore = psql(port, password, database, 'SELECT group_id, code, name, short_name, sort_order FROM public.criteria_group_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY code;').out;
    const legacyV1CriteriaBefore = psql(port, password, database, 'SELECT criterion_id, group_id, code, name, description, applies_to, weight, default_level_index, sort_order FROM public.criterion_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY code;').out;
    const legacyV1LevelsBefore = psql(port, password, database, 'SELECT level_id, criterion_id, points, label, description, sort_order FROM public.criterion_level_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY level_id;').out;
    const legacyV1AudiencesBefore = psql(port, password, database, 'SELECT criterion_id, audience FROM public.criterion_audience_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY criterion_id, audience;').out;

    // H5: Prove pre-write vulnerability on baseline via rollback-safe operations on valid seeded rows:
    // service_role can update live criteria table directly
    const vulnLive = psql(port, password, database, `
      BEGIN;
      SET ROLE service_role;
      UPDATE public.criteria SET name = name WHERE id = '00000000-0000-0000-0000-000000000211';
      ROLLBACK;
    `);
    assert.equal(vulnLive.status, 0, 'service_role direct write should be vulnerable pre-migration on live table');

    // service_role can update version tables directly
    const vulnVersion = psql(port, password, database, `
      BEGIN;
      SET ROLE service_role;
      UPDATE public.criteria_config_versions SET checksum = checksum WHERE version_no = 1;
      ROLLBACK;
    `);
    assert.equal(vulnVersion.status, 0, 'service_role version table write should be vulnerable pre-migration');
    cases.push('pre-write-vulnerability-proven');

    // ========================================================
    // SECTION 2: apply → schema rollback (b) → reapply pass
    // ========================================================
    applyFile(port, password, database, p108Migration);
    assert.equal(extractScalar(psql(port, password, database, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='criteria' AND column_name='set_key';").out), '1');
    cases.push('p108-migration-first-apply');

    // Prove RPC ACL parity before & after forward migration
    const postApplyFnAcl = captureFunctionAcls(port, password, database);
    assert.equal(postApplyFnAcl, preMigrationFnAcl, 'RPC EXECUTE ACL parity must be byte-identical before and after migration');
    cases.push('rpc-acl-parity-preserved-after-migration');

    // Schema rollback (b) before import: requires explicit approval AND captured ACL
    // Test 1: missing captured ACL fails closed
    const rbNoAcl = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', "SET kurabe.p108_rollback_approved = 'true'; SET kurabe.p108_rollback_action = 'schema-rollback';",
      '--file', p108Rollback,
    ], { env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(rbNoAcl.status, 0, 'rollback without captured ACL must fail closed');
    assert.match(redact(rbNoAcl.stderr), /P108_SCHEMA_ROLLBACK_REFUSED/);
    cases.push('schema-rollback-without-captured-acl-refused');

    // Test 2: with captured ACL succeeds and restores exact captured table ACL
    const rbResult = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', `SET kurabe.p108_rollback_approved = 'true'; SET kurabe.p108_rollback_action = 'schema-rollback'; SET kurabe.p108_pre_migration_acl = '${preMigrationTableAcl}';`,
      '--file', p108Rollback,
    ], { env: { ...process.env, PGPASSWORD: password } });
    assert.equal(rbResult.status, 0, `schema rollback failed: ${redact(rbResult.stderr)}`);
    assert.equal(extractScalar(psql(port, password, database, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='criteria' AND column_name='set_key';").out), '0');
    assert.equal(extractScalar(psql(port, password, database, "SELECT count(*) FROM pg_constraint WHERE conrelid='public.criteria_groups'::regclass AND conname='criteria_groups_code_key';").out), '1');

    // Prove RPC ACL parity and Table ACL restoration after schema rollback
    const postRollbackFnAcl = captureFunctionAcls(port, password, database);
    assert.equal(postRollbackFnAcl, preMigrationFnAcl, 'RPC EXECUTE ACL parity must be byte-identical after schema rollback');
    const postRollbackTableAcl = captureTableAclsJson(port, password, database);
    assert.equal(postRollbackTableAcl, preMigrationTableAcl, 'schema rollback must restore exact captured table ACL');
    cases.push('p108-schema-rollback-b-pass');

    // Reapply P108 migration
    applyFile(port, password, database, p108Migration);
    assert.equal(extractScalar(psql(port, password, database, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='criteria' AND column_name='set_key';").out), '1');
    const postReapplyFnAcl = captureFunctionAcls(port, password, database);
    assert.equal(postReapplyFnAcl, preMigrationFnAcl, 'RPC EXECUTE ACL parity must be preserved after reapply');
    cases.push('p108-reapply-pass');

    // ========================================================
    // SECTION 3: Legacy Catalog Fixture & Preservation Verification (H6)
    // ========================================================
    const legacyConfig = jsonResult(psql(port, password, database, 'SELECT public.get_active_criteria_config();').out);
    assert.equal(legacyConfig.version, 1);
    assert.equal(legacyConfig.groups.length, legacyConfigBeforeMigration.groups.length);
    for (let i = 0; i < legacyConfigBeforeMigration.groups.length; i++) {
      assert.equal(legacyConfig.groups[i].id, legacyConfigBeforeMigration.groups[i].id);
      assert.equal(legacyConfig.groups[i].code, legacyConfigBeforeMigration.groups[i].code);
      assert.equal(legacyConfig.groups[i].name, legacyConfigBeforeMigration.groups[i].name);
      assert.equal(legacyConfig.groups[i].set_key, null);
      for (let j = 0; j < legacyConfigBeforeMigration.groups[i].criteria.length; j++) {
        assert.equal(legacyConfig.groups[i].criteria[j].id, legacyConfigBeforeMigration.groups[i].criteria[j].id);
        assert.equal(legacyConfig.groups[i].criteria[j].code, legacyConfigBeforeMigration.groups[i].criteria[j].code);
        assert.equal(legacyConfig.groups[i].criteria[j].name, legacyConfigBeforeMigration.groups[i].criteria[j].name);
        assert.equal(legacyConfig.groups[i].criteria[j].set_key, null);
      }
    }

    // Historical version 1 rows in version tables are identical to pre-migration baseline
    const legacyV1ConfigRowAfter = psql(port, password, database, 'SELECT id, version_no, checksum FROM public.criteria_config_versions WHERE version_no = 1;').out;
    const legacyV1GroupsAfter = psql(port, password, database, 'SELECT group_id, code, name, short_name, sort_order FROM public.criteria_group_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY code;').out;
    const legacyV1CriteriaAfter = psql(port, password, database, 'SELECT criterion_id, group_id, code, name, description, applies_to, weight, default_level_index, sort_order FROM public.criterion_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY code;').out;
    const legacyV1LevelsAfter = psql(port, password, database, 'SELECT level_id, criterion_id, points, label, description, sort_order FROM public.criterion_level_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY level_id;').out;
    const legacyV1AudiencesAfter = psql(port, password, database, 'SELECT criterion_id, audience FROM public.criterion_audience_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY criterion_id, audience;').out;

    assert.equal(legacyV1ConfigRowAfter, legacyV1ConfigRowBefore, 'legacy version 1 config row unchanged');
    assert.equal(extractScalar(psql(port, password, database, 'SELECT is_active::text FROM public.criteria_config_versions WHERE version_no = 1;').out), 'true', 'legacy version 1 remains active after migration');
    assert.equal(legacyV1GroupsAfter, legacyV1GroupsBefore, 'legacy version 1 groups unchanged');
    assert.equal(legacyV1CriteriaAfter, legacyV1CriteriaBefore, 'legacy version 1 criteria unchanged');
    assert.equal(legacyV1LevelsAfter, legacyV1LevelsBefore, 'legacy version 1 levels unchanged');
    assert.equal(legacyV1AudiencesAfter, legacyV1AudiencesBefore, 'legacy version 1 audiences unchanged');
    cases.push('legacy-catalog-reads-unchanged');

    // Legacy duplicate active code rejected by active unique index
    const dupLegacyCode = psql(port, password, database, `
      INSERT INTO public.criteria (id, group_id, code, name, applies_to, is_active)
      VALUES (gen_random_uuid(), '${legacyConfig.groups[0].id}', 'A1', 'Duplicate active A1', 'employee', true);
    `, false);
    assert.notEqual(dupLegacyCode.status, 0);
    assert.match(dupLegacyCode.err, /criteria_active_set_code_uidx|unique constraint/i);
    cases.push('legacy-duplicate-active-code-rejected');

    // ========================================================
    // SECTION 4: Direct-Write ACL Negative Tests Across App Roles (H5)
    // ========================================================
    // Verify complete closure across all 9 criteria tables and all 4 DML verbs for all 3 app roles
    for (const tbl of CRITERIA_TABLES) {
      for (const verb of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
        for (const role of ['anon', 'authenticated', 'service_role']) {
          const hasPriv = extractScalar(psql(port, password, database, `SELECT has_table_privilege('${role}', 'public.${tbl}', '${verb}')::text;`).out);
          assert.equal(hasPriv, 'false', `expected no ${verb} privilege on ${tbl} for ${role}`);
        }
      }
    }

    // Direct write negative tests across app roles on valid existing seeded rows (avoiding FK/constraint confusion)
    for (const role of ['anon', 'authenticated', 'service_role']) {
      // Live table DML denial
      const updateLive = psql(port, password, database, `SET ROLE ${role}; UPDATE public.criteria SET name = name WHERE id = '00000000-0000-0000-0000-000000000211'; RESET ROLE;`, false);
      assert.notEqual(updateLive.status, 0);
      assert.match(updateLive.err, /permission denied for table/i);

      const deleteLive = psql(port, password, database, `SET ROLE ${role}; DELETE FROM public.criteria WHERE id = '00000000-0000-0000-0000-000000000211'; RESET ROLE;`, false);
      assert.notEqual(deleteLive.status, 0);
      assert.match(deleteLive.err, /permission denied for table/i);

      const truncLive = psql(port, password, database, `SET ROLE ${role}; TRUNCATE public.criteria; RESET ROLE;`, false);
      assert.notEqual(truncLive.status, 0);
      assert.match(truncLive.err, /permission denied for table/i);

      // Version table DML denial
      const updateVer = psql(port, password, database, `SET ROLE ${role}; UPDATE public.criteria_config_versions SET checksum = checksum WHERE version_no = 1; RESET ROLE;`, false);
      assert.notEqual(updateVer.status, 0);
      assert.match(updateVer.err, /permission denied for table/i);

      const deleteVer = psql(port, password, database, `SET ROLE ${role}; DELETE FROM public.criteria_config_versions WHERE version_no = 1; RESET ROLE;`, false);
      assert.notEqual(deleteVer.status, 0);
      assert.match(deleteVer.err, /permission denied for table/i);

      const truncVer = psql(port, password, database, `SET ROLE ${role}; TRUNCATE public.criteria_config_versions; RESET ROLE;`, false);
      assert.notEqual(truncVer.status, 0);
      assert.match(truncVer.err, /permission denied for table/i);
    }

    // SELECT on live tables is preserved for app roles
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const selectLive = psql(port, password, database, `SET ROLE ${role}; SELECT count(*) FROM public.criteria; RESET ROLE;`);
      assert.equal(selectLive.status, 0);
      assert.ok(Number(extractScalar(selectLive.out)) >= 2);
    }

    // Direct write negative tests also while period is active
    psql(port, password, database, "INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade) VALUES ('00000000-0000-0000-0000-000000000301', 2099, 'P108-ACL', 'active', 80, 'A');");
    const srActiveUpdate = psql(port, password, database, "SET ROLE service_role; UPDATE public.criteria SET name = name WHERE id = '00000000-0000-0000-0000-000000000211'; RESET ROLE;", false);
    assert.notEqual(srActiveUpdate.status, 0);
    assert.match(srActiveUpdate.err, /permission denied for table/i);

    // Direct RPC while active is rejected with P108_PERIOD_ACTIVE
    const rpcWhileActive = psql(port, password, database, "SELECT public.save_criteria_config('{\"groups\":[]}'::jsonb, 1);", false);
    assert.notEqual(rpcWhileActive.status, 0);
    assert.match(rpcWhileActive.err, /P108_PERIOD_ACTIVE/);
    cases.push('direct-write-negative-tests-passed');

    // Close period to continue testing save RPC
    psql(port, password, database, "UPDATE public.evaluation_periods SET status = 'closed';");

    // ========================================================
    // SECTION 5: Three-Set Schema & RPC Contract (H8 Transactional Assertions)
    // ========================================================
    const leaderGroupId = '00000000-0000-0000-0000-000000000501';
    const staffGroupId = '00000000-0000-0000-0000-000000000502';
    const workerGroupId = '00000000-0000-0000-0000-000000000503';

    const leaderCritId = '00000000-0000-0000-0000-000000000511';
    const staffCritId = '00000000-0000-0000-0000-000000000512';
    const workerCritId = '00000000-0000-0000-0000-000000000513';

    const threeSetPayload = {
      groups: [
        {
          id: leaderGroupId, set_key: 'leader', code: 'A', name: 'Leader Group A', sort_order: 0,
          criteria: [
            {
              id: leaderCritId, set_key: 'leader', code: 'A1', name: 'Leader Criterion A1',
              default_level_index: 0, sort_order: 0,
              levels: [
                { id: '00000000-0000-0000-0000-000000000521', points: 10, label: 'High', sort_order: 0 },
                { id: '00000000-0000-0000-0000-000000000522', points: 5, label: 'Mid', sort_order: 1 },
              ],
            },
          ],
        },
        {
          id: staffGroupId, set_key: 'staff', code: 'A', name: 'Staff Group A', sort_order: 1,
          criteria: [
            {
              id: staffCritId, set_key: 'staff', code: 'A1', name: 'Staff Criterion A1',
              default_level_index: 0, sort_order: 0,
              levels: [
                { id: '00000000-0000-0000-0000-000000000523', points: 8, label: 'High', sort_order: 0 },
                { id: '00000000-0000-0000-0000-000000000524', points: 4, label: 'Mid', sort_order: 1 },
              ],
            },
          ],
        },
        {
          id: workerGroupId, set_key: 'worker', code: 'A', name: 'Worker Group A', sort_order: 2,
          criteria: [
            {
              id: workerCritId, set_key: 'worker', code: 'A1', name: 'Worker Criterion A1',
              default_level_index: 0, sort_order: 0,
              levels: [
                { id: '00000000-0000-0000-0000-000000000525', points: 6, label: 'High', sort_order: 0 },
                { id: '00000000-0000-0000-0000-000000000526', points: 3, label: 'Mid', sort_order: 1 },
              ],
            },
          ],
        },
      ],
    };

    // Save three-set payload (same code 'A1' across leader, staff, worker accepted!)
    const savedV2 = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(threeSetPayload)}$json$::jsonb, 1);`).out);
    assert.equal(savedV2.version, 2);
    assert.equal(savedV2.group_count, 3);
    assert.equal(savedV2.criterion_count, 3);
    assert.equal(savedV2.level_count, 6);
    assert.equal(savedV2.audience_count, 3);
    cases.push('same-code-across-sets-accepted');

    // Server-derived audience verification
    assert.deepEqual(savedV2.groups[0].criteria[0].audiences, ['management']);
    assert.deepEqual(savedV2.groups[1].criteria[0].audiences, ['employee']);
    assert.deepEqual(savedV2.groups[2].criteria[0].audiences, ['worker']);
    cases.push('server-derived-audiences-verified');

    // Duplicate inside set rejected (case/space normalized) + zero partial writes via digest
    const digestBeforeDup = criteriaDigest(port, password, database);
    const dupInsideSet = structuredClone(threeSetPayload);
    dupInsideSet.groups[0].criteria.push({
      id: '00000000-0000-0000-0000-000000000514', set_key: 'leader', code: ' a1 ', name: 'Duplicate Leader A1',
      default_level_index: 0, sort_order: 1,
      levels: [{ id: '00000000-0000-0000-0000-000000000527', points: 10, label: 'High', sort_order: 0 }],
    });
    const dupInsideResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(dupInsideSet)}$json$::jsonb, 2);`, false);
    assert.notEqual(dupInsideResult.status, 0);
    assert.match(dupInsideResult.err, /P99M3T02_INVALID_CONFIG/);
    assert.equal(criteriaDigest(port, password, database), digestBeforeDup, 'zero mutation on duplicate code inside set');
    cases.push('duplicate-code-inside-set-rejected');

    // Re-created deleted code accepted
    const withoutWorker = structuredClone(threeSetPayload);
    withoutWorker.groups[2].criteria = [];
    const savedV3 = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(withoutWorker)}$json$::jsonb, 2);`).out);
    assert.equal(savedV3.version, 3);

    const reAddWorker = structuredClone(threeSetPayload);
    reAddWorker.groups[2].criteria[0].id = '00000000-0000-0000-0000-000000000515';
    reAddWorker.groups[2].criteria[0].levels[0].id = '00000000-0000-0000-0000-000000000528';
    reAddWorker.groups[2].criteria[0].levels[1].id = '00000000-0000-0000-0000-000000000529';
    const savedV4 = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(reAddWorker)}$json$::jsonb, 3);`).out);
    assert.equal(savedV4.version, 4);
    cases.push('recreated-deleted-code-accepted');

    // Cross-set group link rejected in validator + zero mutation via digest
    const digestBeforeCrossSet = criteriaDigest(port, password, database);
    const crossSetPayload = structuredClone(reAddWorker);
    crossSetPayload.groups[0].criteria[0].set_key = 'worker';
    const crossSetResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(crossSetPayload)}$json$::jsonb, 4);`, false);
    assert.notEqual(crossSetResult.status, 0);
    assert.match(crossSetResult.err, /P99M3T02_INVALID_CONFIG/);
    assert.equal(criteriaDigest(port, password, database), digestBeforeCrossSet, 'zero mutation on cross-set group link payload');
    cases.push('cross-set-group-link-rejected');

    // Immutable set per UUID rejected + zero mutation via digest
    const digestBeforeImmutable = criteriaDigest(port, password, database);
    const immutableSetPayload = structuredClone(reAddWorker);
    immutableSetPayload.groups[0].set_key = 'staff';
    immutableSetPayload.groups[0].criteria[0].set_key = 'staff';
    const immutableResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(immutableSetPayload)}$json$::jsonb, 4);`, false);
    assert.notEqual(immutableResult.status, 0);
    assert.match(immutableResult.err, /P108_SET_IMMUTABLE/);
    assert.equal(criteriaDigest(port, password, database), digestBeforeImmutable, 'zero mutation on immutable set violation');
    cases.push('uuid-cannot-change-set-rejected');

    // Canonical checksum no-op: unchanged save returns active without creating version
    const noopResult = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(reAddWorker)}$json$::jsonb, 4);`).out);
    assert.equal(noopResult.version, 4);
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '4');
    cases.push('unchanged-save-creates-no-version');

    // Adding Leader criterion leaves Staff/Worker content & hashes unchanged
    const addLeaderCritPayload = structuredClone(reAddWorker);
    addLeaderCritPayload.groups[0].criteria.push({
      id: '00000000-0000-0000-0000-000000000516', set_key: 'leader', code: 'A2', name: 'Leader Criterion A2',
      default_level_index: 0, sort_order: 1,
      levels: [{ id: '00000000-0000-0000-0000-000000000530', points: 5, label: 'Mid', sort_order: 0 }],
    });
    const savedV5 = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(addLeaderCritPayload)}$json$::jsonb, 4);`).out);
    assert.equal(savedV5.version, 5);
    assert.deepEqual(savedV5.groups[1], savedV4.groups[1]);
    assert.deepEqual(savedV5.groups[2], savedV4.groups[2]);
    cases.push('adding-leader-criterion-leaves-staff-worker-unchanged');

    // H8.1: Actual non-READ-COMMITTED call refused with P108_INVALID_ISOLATION when period is closed (zero mutation)
    const digestBeforeIsolation = criteriaDigest(port, password, database);
    const nonReadCommittedResult = psql(port, password, database, `
      BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
      SELECT public.save_criteria_config($json$${JSON.stringify(addLeaderCritPayload)}$json$::jsonb, 5);
      COMMIT;
    `, false);
    assert.notEqual(nonReadCommittedResult.status, 0);
    assert.match(nonReadCommittedResult.err, /P108_INVALID_ISOLATION/);
    assert.equal(criteriaDigest(port, password, database), digestBeforeIsolation, 'zero mutation on rejected isolation level');
    cases.push('non-read-committed-isolation-rejected-zero-mutation');

    // H8.2: Explicit BEGIN -> valid changed config save -> ROLLBACK on SAME connection -> unchanged state
    const digestBeforeRollbackTest = criteriaDigest(port, password, database);
    const validChangedPayload = structuredClone(addLeaderCritPayload);
    validChangedPayload.groups[0].name = 'Valid Changed For Transactional Rollback';
    const txRollbackResult = psql(port, password, database, `
      BEGIN;
      SELECT public.save_criteria_config($json$${JSON.stringify(validChangedPayload)}$json$::jsonb, 5);
      ROLLBACK;
    `);
    assert.equal(txRollbackResult.status, 0);
    assert.equal(criteriaDigest(port, password, database), digestBeforeRollbackTest, 'zero mutation after transactional rollback');
    cases.push('transactional-rollback-preserves-unchanged-state');

    // H8.4: Behavioral cross-set composite FK test under postgres on live table directly (separate from JSON validator)
    const digestBeforeFkTest = criteriaDigest(port, password, database);
    const fkMismatchResult = psql(port, password, database, `
      BEGIN;
      INSERT INTO public.criteria (id, group_id, set_key, code, name, applies_to)
      VALUES (
        '00000000-0000-0000-0000-000000000599',
        '${staffGroupId}',
        'leader',
        'FK_TEST',
        'FK Test',
        'management'
      );
      COMMIT;
    `, false);
    assert.notEqual(fkMismatchResult.status, 0);
    assert.match(fkMismatchResult.err, /criteria_group_id_set_key_fkey|foreign key/i);
    assert.equal(criteriaDigest(port, password, database), digestBeforeFkTest, 'zero mutation on cross-set FK violation');
    cases.push('cross-set-composite-fk-enforced-at-database-level');

    // H6: Verify historical version 1 rows remain immutable after all P108 version 2-5 saves
    const legacyV1ConfigRowAfterSaves = psql(port, password, database, 'SELECT id, version_no, checksum FROM public.criteria_config_versions WHERE version_no = 1;').out;
    const legacyV1GroupsAfterSaves = psql(port, password, database, 'SELECT group_id, code, name, short_name, sort_order FROM public.criteria_group_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY code;').out;
    const legacyV1CriteriaAfterSaves = psql(port, password, database, 'SELECT criterion_id, group_id, code, name, description, applies_to, weight, default_level_index, sort_order FROM public.criterion_versions WHERE version_id = (SELECT id FROM public.criteria_config_versions WHERE version_no = 1) ORDER BY code;').out;
    assert.equal(legacyV1ConfigRowAfterSaves, legacyV1ConfigRowBefore, 'legacy version 1 config row immutable after saves');
    assert.equal(extractScalar(psql(port, password, database, 'SELECT is_active::text FROM public.criteria_config_versions WHERE version_no = 1;').out), 'false', 'legacy version 1 deactivated as active pointer moved');
    assert.equal(legacyV1GroupsAfterSaves, legacyV1GroupsBefore, 'legacy version 1 groups immutable after saves');
    assert.equal(legacyV1CriteriaAfterSaves, legacyV1CriteriaBefore, 'legacy version 1 criteria immutable after saves');
    cases.push('historical-version-1-rows-preserved-and-immutable');

    // ========================================================
    // SECTION 6: Concurrency on Real Connections with pg_locks Wait Proof (H4)
    // ========================================================
    const racePeriodId = '00000000-0000-0000-0000-000000000303';
    const racePayloadJson = JSON.stringify(addLeaderCritPayload);

    // Case 1: create period ↔ save (race)
    // Conn 1 holds RowExclusiveLock on evaluation_periods via interactive open transaction.
    // Conn 2 attempts save_criteria_config (SHARE lock on evaluation_periods -> genuine table conflict).
    const conn1 = spawnInteractivePsql(port, password, database, 'p108_create_period');
    activeChildren.push(conn1.child);
    conn1.send(`
      BEGIN;
      INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade)
      VALUES ('${racePeriodId}', 2099, 'RacePeriod1', 'active', 80, 'A');
    `);

    // Observer proves Conn 1 holds lock on evaluation_periods
    await waitForLockHeld(port, password, database, 'p108_create_period', 'relation', 'evaluation_periods');

    // Conn 2 executes save_criteria_config
    const conn2 = spawnPsql(port, password, database, `SELECT public.save_criteria_config($json$${racePayloadJson}$json$::jsonb, 5);`, 'p108_save_waiter');
    activeChildren.push(conn2.child);

    // Observer proves Conn 2 is blocked by Conn 1 on evaluation_periods
    const waitProof1 = await waitForBlockedBy(port, password, database, 'p108_save_waiter', 'p108_create_period', 'relation', 'evaluation_periods');
    assert.ok(waitProof1.waiter_pid && waitProof1.blocker_pid, 'observed exact waiter and blocker relationship');
    cases.push('concurrency-create-period-wait-proven-by-pg-locks');

    // Conn 1 commits -> Conn 2 unblocks and fails closed with P108_PERIOD_ACTIVE
    conn1.send('COMMIT;');
    conn1.end();

    const [res1, res2] = await Promise.all([conn1.promise, conn2.promise]);
    assert.equal(res1.status, 0);
    assert.notEqual(res2.status, 0);
    assert.match(res2.err, /P108_PERIOD_ACTIVE/);
    cases.push('concurrency-create-period-fails-closed-after-commit');

    // Case 2: close period ↔ save (race)
    // Conn 1 holds RowExclusiveLock via UPDATE in open transaction.
    // Conn 2 attempts save_criteria_config (SHARE lock -> genuine table conflict).
    const closeConn1 = spawnInteractivePsql(port, password, database, 'p108_close_period');
    activeChildren.push(closeConn1.child);
    closeConn1.send(`
      BEGIN;
      UPDATE public.evaluation_periods SET status = 'closed' WHERE id = '${racePeriodId}';
    `);

    await waitForLockHeld(port, password, database, 'p108_close_period', 'relation', 'evaluation_periods');

    const closeConn2 = spawnPsql(port, password, database, `SELECT public.save_criteria_config($json$${racePayloadJson}$json$::jsonb, 5);`, 'p108_close_save_waiter');
    activeChildren.push(closeConn2.child);

    const waitProof2 = await waitForBlockedBy(port, password, database, 'p108_close_save_waiter', 'p108_close_period', 'relation', 'evaluation_periods');
    assert.ok(waitProof2.waiter_pid && waitProof2.blocker_pid, 'observed close period lock wait proof');
    cases.push('concurrency-close-period-wait-proven-by-pg-locks');

    closeConn1.send('COMMIT;');
    closeConn1.end();

    const [cRes1, cRes2] = await Promise.all([closeConn1.promise, closeConn2.promise]);
    assert.equal(cRes1.status, 0);
    assert.equal(cRes2.status, 0);
    cases.push('concurrency-close-period-allows-save-after-commit');

    // Case 3: evaluation writer ↔ save concurrency (H4)
    // Evaluation writer executes actual P107 save_evaluation_round_transaction_active_only RPC.
    // P107 takes RowShareLock on periods (compatible with SHARE) AND advisory lock hashtext('kurabe:p99m3t02:criteria-config').
    // save_criteria_config P108 takes SHARE on periods AND advisory lock hashtext('kurabe:p99m3t02:criteria-config').
    // Genuine ADVISORY CONFLICT! Conn 2 blocks on advisory lock held by Conn 1.
    const evalPeriodForRace = '00000000-0000-0000-0000-000000000305';
    const raceTeamId = '00000000-0000-0000-0000-000000000810';
    const raceLeaderId = '00000000-0000-0000-0000-000000000801';
    const raceSubLeaderId = '00000000-0000-0000-0000-000000000800';
    const raceStaffId = '00000000-0000-0000-0000-000000000802';
    const raceEvalId = '00000000-0000-0000-0000-000000000811';
    const raceRoundId = '00000000-0000-0000-0000-000000000821';

    const activeCriteriaVersionId = savedV5.version_id;
    const raceGradeVersionId = extractScalar(psql(port, password, database, 'SELECT id FROM public.grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1;').out);
    assert.ok(raceGradeVersionId && /^[0-9a-f-]{36}$/.test(raceGradeVersionId));

    psql(port, password, database, `
      INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade)
      VALUES ('${evalPeriodForRace}', 2099, 'EvalWriterRacePeriod', 'active', 80, 'A');

      INSERT INTO public.teams (id, name, is_active, leader_id)
      VALUES ('${raceTeamId}', 'Race Team', true, NULL);

      INSERT INTO public.users (id, employee_code, name, role, team_id, subleader_id, is_active, gender) VALUES
        ('${raceLeaderId}', 'RACE_LEAD1', 'Race Leader', 'Leader', '${raceTeamId}', NULL, true, 'Other'),
        ('${raceSubLeaderId}', 'RACE_SUB1', 'Race SubLeader', 'SubLeader', '${raceTeamId}', NULL, true, 'Other'),
        ('${raceStaffId}', 'RACE_EMP1', 'Race Staff', 'Employee', '${raceTeamId}', '${raceSubLeaderId}', true, 'Other');

      UPDATE public.teams SET leader_id = '${raceLeaderId}' WHERE id = '${raceTeamId}';

      INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status, current_round)
      VALUES ('${raceEvalId}', '${evalPeriodForRace}', '${raceStaffId}', 'Employee', '${raceTeamId}', 'Draft', 1);

      INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status, criteria_config_version_id, grade_config_version_id)
      VALUES ('${raceRoundId}', '${raceEvalId}', 1, '${raceSubLeaderId}', 'SubLeader', 'NotStarted', '${activeCriteriaVersionId}', '${raceGradeVersionId}');
    `);

    const digestBeforeWriterRace = criteriaDigest(port, password, database);

    // Conn 1: actual P107 evaluation writer RPC inside open interactive transaction
    const writerConn1 = spawnInteractivePsql(port, password, database, 'p108_writer');
    activeChildren.push(writerConn1.child);
    writerConn1.send(`
      BEGIN;
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${raceEvalId}', 1, '${raceSubLeaderId}', '{"A1":1}'::jsonb, '{"A1":"race draft"}'::jsonb, 'Race draft',
        80, 'B', false, NULL, NULL, NULL, NULL, NULL, false, '${activeCriteriaVersionId}'::uuid, '${raceGradeVersionId}'::uuid
      ) result;
    `);

    // Observer proves writer holds advisory lock on criteria-config
    await waitForLockHeld(port, password, database, 'p108_writer', 'advisory');

    // Conn 2: concurrent save_criteria_config
    const saveConnUnderWriter = spawnPsql(port, password, database, `SELECT public.save_criteria_config($json$${racePayloadJson}$json$::jsonb, 5);`, 'p108_save_under_writer');
    activeChildren.push(saveConnUnderWriter.child);

    // Observer proves save is blocked by writer on advisory lock
    const advisoryWait = await waitForBlockedBy(port, password, database, 'p108_save_under_writer', 'p108_writer', 'advisory');
    assert.ok(advisoryWait.waiter_pid && advisoryWait.blocker_pid, 'observed advisory lock conflict and blocking relationship');
    cases.push('concurrency-eval-writer-overlap-proven-by-pg-locks');

    // Commit writer transaction -> saver unblocks and evaluates active period check
    writerConn1.send('COMMIT;');
    writerConn1.end();

    const [wRes1, wRes2] = await Promise.all([writerConn1.promise, saveConnUnderWriter.promise]);
    assert.doesNotMatch(wRes1.err, /deadlock/i, 'no deadlock on writer connection');
    assert.doesNotMatch(wRes2.err, /deadlock/i, 'no deadlock on save connection');
    assert.equal(wRes1.status, 0, `writer transaction must succeed: ${wRes1.err}`);

    // Verify actual writer response
    const writerOutput = jsonResult(wRes1.out);
    assert.equal(writerOutput.round_id, raceRoundId, 'actual evaluation response round_id');
    assert.equal(writerOutput.evaluation_id, raceEvalId, 'actual evaluation response evaluation_id');
    assert.equal(writerOutput.final_status, 'Draft', 'actual evaluation response final_status');

    // Verify round data and snapshot consistency in database
    const savedRound = jsonResult(psql(port, password, database, `
      SELECT row_to_json(r) FROM (
        SELECT status, total_score, grade, criteria_config_version_id, grade_config_version_id, scores, notes, comment
        FROM public.evaluation_rounds WHERE id = '${raceRoundId}'
      ) r;
    `).out);
    assert.equal(savedRound.status, 'Draft', 'round status must be Draft');
    assert.equal(savedRound.total_score, 80, 'round total_score must be 80');
    assert.equal(savedRound.grade, 'B', 'round grade must be B');
    assert.equal(savedRound.criteria_config_version_id, activeCriteriaVersionId, 'round criteria version pinned');
    assert.equal(savedRound.grade_config_version_id, raceGradeVersionId, 'round grade version pinned');
    assert.deepEqual(savedRound.scores, { A1: 1 }, 'round scores match');
    assert.deepEqual(savedRound.notes, { A1: 'race draft' }, 'round notes match');
    assert.equal(savedRound.comment, 'Race draft', 'round comment matches');

    // Verify Active-period config refusal with unchanged config digest and version identity/count (no partial writes)
    assert.notEqual(wRes2.status, 0, 'save under active period must fail closed');
    assert.match(wRes2.err, /P108_PERIOD_ACTIVE/, 'save rejected with P108_PERIOD_ACTIVE');

    const digestAfterWriterRace = criteriaDigest(port, password, database);
    assert.equal(digestBeforeWriterRace, digestAfterWriterRace, 'zero mutation verified on evaluation writer vs save race');
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '5', 'version count unchanged');
    assert.equal(extractScalar(psql(port, password, database, 'SELECT id FROM public.criteria_config_versions WHERE is_active;').out), activeCriteriaVersionId, 'active version identity unchanged');
    cases.push('concurrency-eval-writer-save-fails-closed-zero-mutation');

    psql(port, password, database, `UPDATE public.evaluation_periods SET status = 'closed' WHERE id = '${evalPeriodForRace}';`);

    // Case 4: CAS concurrent Managers: two calls with same expected version
    const changedA = structuredClone(addLeaderCritPayload);
    changedA.groups[0].name = 'Leader Group A - Mgr 1';
    const jsonA = JSON.stringify(changedA);

    const changedB = structuredClone(addLeaderCritPayload);
    changedB.groups[0].name = 'Leader Group A - Mgr 2';
    const jsonB = JSON.stringify(changedB);

    const casPromiseA = spawnPsql(port, password, database, `SELECT public.save_criteria_config($json$${jsonA}$json$::jsonb, 5);`, 'p108_cas_mgr_1');
    const casPromiseB = spawnPsql(port, password, database, `SELECT public.save_criteria_config($json$${jsonB}$json$::jsonb, 5);`, 'p108_cas_mgr_2');
    activeChildren.push(casPromiseA.child, casPromiseB.child);

    const casResults = await Promise.all([casPromiseA.promise, casPromiseB.promise]);
    assert.equal(casResults.filter((r) => r.status === 0).length, 1);
    assert.equal(casResults.filter((r) => r.status !== 0 && /P99M3T02_CONFIG_STALE/.test(r.err)).length, 1);
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '6');

    // H4/H8: Prove winner's payload committed, and loser's payload left ZERO records in live and version tables
    const activeConfigAfterCas = jsonResult(psql(port, password, database, 'SELECT public.get_active_criteria_config();').out);
    assert.equal(activeConfigAfterCas.version, 6);
    const isWinnerA = activeConfigAfterCas.groups[0].name === 'Leader Group A - Mgr 1';
    const isWinnerB = activeConfigAfterCas.groups[0].name === 'Leader Group A - Mgr 2';
    assert.ok(isWinnerA || isWinnerB, 'active config must match exactly one manager payload');
    assert.notEqual(isWinnerA, isWinnerB, 'cannot match both payloads');
    const loserName = isWinnerA ? 'Leader Group A - Mgr 2' : 'Leader Group A - Mgr 1';
    assert.equal(extractScalar(psql(port, password, database, `SELECT count(*) FROM public.criteria_groups WHERE name = '${loserName}';`).out), '0', 'loser payload left no live records');
    assert.equal(extractScalar(psql(port, password, database, `SELECT count(*) FROM public.criteria_group_versions WHERE name = '${loserName}';`).out), '0', 'loser payload left no version records');
    cases.push('concurrency-cas-two-managers-one-commit-one-stale');

    // ========================================================
    // SECTION 7: P107 Save/Submit/Return on Three-Set Catalog (H1 FK Ordering Fix)
    // ========================================================
    const evalPeriodId = '00000000-0000-0000-0000-000000000304';
    psql(port, password, database, `
      INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade)
      VALUES ('${evalPeriodId}', 2099, 'P108-Eval', 'active', 80, 'A');
    `);

    const activeConfigV6 = jsonResult(psql(port, password, database, 'SELECT public.get_active_criteria_config();').out);
    const activeVersionId = activeConfigV6.version_id;
    const activeGradeVersionId = extractScalar(psql(port, password, database, 'SELECT id FROM public.grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1;').out);
    assert.ok(activeGradeVersionId && /^[0-9a-f-]{36}$/.test(activeGradeVersionId));

    const teamId = '00000000-0000-0000-0000-000000000710';
    const managerUserId = '00000000-0000-0000-0000-000000000704';
    const leaderUserId = '00000000-0000-0000-0000-000000000701';
    const subLeaderUserId = '00000000-0000-0000-0000-000000000700';
    const staffUserId = '00000000-0000-0000-0000-000000000702';
    const workerUserId = '00000000-0000-0000-0000-000000000703';

    // H1: Seed team with NULL leader first to prevent FK ordering hazard
    psql(port, password, database, `
      INSERT INTO public.teams (id, name, is_active, leader_id)
      VALUES ('${teamId}', 'P108 Acceptance Team', true, NULL);
    `);

    // Seed users with valid appointments (Manager, Leader, SubLeader, Employee, Worker)
    psql(port, password, database, `
      INSERT INTO public.users (id, employee_code, name, role, team_id, subleader_id, is_active, gender) VALUES
        ('${managerUserId}', 'MGR1', 'Manager Actor', 'Manager', NULL, NULL, true, 'Other'),
        ('${leaderUserId}', 'LEADER1', 'Leader Appointed', 'Leader', '${teamId}', NULL, true, 'Other'),
        ('${subLeaderUserId}', 'SUB1', 'SubLeader Actor', 'SubLeader', '${teamId}', NULL, true, 'Other'),
        ('${staffUserId}', 'STAFF1', 'Staff Subject', 'Employee', '${teamId}', '${subLeaderUserId}', true, 'Other'),
        ('${workerUserId}', 'WORKER1', 'Worker Subject', 'Worker', '${teamId}', '${subLeaderUserId}', true, 'Other');
    `);

    // Appoint leader to team after user exists
    psql(port, password, database, `
      UPDATE public.teams SET leader_id = '${leaderUserId}' WHERE id = '${teamId}';
    `);

    // --------------------------------------------------------
    // Set 1: Staff (Employee subject, evaluated by SubLeader -> Leader)
    // --------------------------------------------------------
    const evalId = '00000000-0000-0000-0000-000000000711';
    const round1Id = '00000000-0000-0000-0000-000000000721';
    psql(port, password, database, `
      INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status, current_round)
      VALUES ('${evalId}', '${evalPeriodId}', '${staffUserId}', 'Employee', '${teamId}', 'Draft', 1);

      INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status, criteria_config_version_id, grade_config_version_id)
      VALUES ('${round1Id}', '${evalId}', 1, '${subLeaderUserId}', 'SubLeader', 'NotStarted', '${activeVersionId}', '${activeGradeVersionId}');
    `);

    // Staff save draft
    const staffSave = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${evalId}', 1, '${subLeaderUserId}', '{"A1":1}'::jsonb, '{"A1":"staff draft"}'::jsonb, 'Staff draft',
        80, 'B', false, NULL, NULL, NULL, NULL, NULL, false, '${activeVersionId}'::uuid, '${activeGradeVersionId}'::uuid
      ) result;
    `);
    assert.equal(staffSave.status, 0, `P107 staff save failed: ${staffSave.err}`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${round1Id}';`).out), 'Draft');

    // Staff submit round 1 -> round 2 created as NotStarted
    const staffSubmit = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${evalId}', 1, '${subLeaderUserId}', '{"A1":1}'::jsonb, '{"A1":"staff submit"}'::jsonb, 'Staff submit',
        80, 'B', true, now(), 2, '${leaderUserId}'::uuid, 'Leader', 'Submitted', false, '${activeVersionId}'::uuid, '${activeGradeVersionId}'::uuid
      ) result;
    `);
    assert.equal(staffSubmit.status, 0, `P107 staff submit failed: ${staffSubmit.err}`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${round1Id}';`).out), 'Submitted');
    assert.equal(extractScalar(psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${evalId}';`).out), '2');

    // Staff return round 2 -> unlocks round 1 back to Draft
    const staffReturn = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.return_evaluation_round_transaction(
        '${evalId}', 2, '${leaderUserId}', 'Needs staff revision'
      ) result;
    `);
    assert.equal(staffReturn.status, 0, `P107 staff return failed: ${staffReturn.err}`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${round1Id}';`).out), 'Draft');
    assert.equal(extractScalar(psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${evalId}';`).out), '1');

    // --------------------------------------------------------
    // Set 2: Worker (Worker subject, evaluated by SubLeader -> Leader)
    // --------------------------------------------------------
    const evalWorkerId = '00000000-0000-0000-0000-000000000712';
    const roundWorker1Id = '00000000-0000-0000-0000-000000000722';
    psql(port, password, database, `
      INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status, current_round)
      VALUES ('${evalWorkerId}', '${evalPeriodId}', '${workerUserId}', 'Worker', '${teamId}', 'Draft', 1);

      INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status, criteria_config_version_id, grade_config_version_id)
      VALUES ('${roundWorker1Id}', '${evalWorkerId}', 1, '${subLeaderUserId}', 'SubLeader', 'NotStarted', '${activeVersionId}', '${activeGradeVersionId}');
    `);

    // Worker save draft
    const workerSave = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${evalWorkerId}', 1, '${subLeaderUserId}', '{"A1":1}'::jsonb, '{"A1":"worker draft"}'::jsonb, 'Worker draft',
        80, 'B', false, NULL, NULL, NULL, NULL, NULL, false, '${activeVersionId}'::uuid, '${activeGradeVersionId}'::uuid
      ) result;
    `);
    assert.equal(workerSave.status, 0, `P107 worker save failed: ${workerSave.err}`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${roundWorker1Id}';`).out), 'Draft');

    // Worker submit round 1 -> round 2 created
    const workerSubmit = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${evalWorkerId}', 1, '${subLeaderUserId}', '{"A1":1}'::jsonb, '{"A1":"worker submit"}'::jsonb, 'Worker submit',
        80, 'B', true, now(), 2, '${leaderUserId}'::uuid, 'Leader', 'Submitted', false, '${activeVersionId}'::uuid, '${activeGradeVersionId}'::uuid
      ) result;
    `);
    assert.equal(workerSubmit.status, 0, `P107 worker submit failed: ${workerSubmit.err}`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${roundWorker1Id}';`).out), 'Submitted');
    assert.equal(extractScalar(psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${evalWorkerId}';`).out), '2');

    // Worker return round 2 -> unlocks round 1 back to Draft
    const workerReturn = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.return_evaluation_round_transaction(
        '${evalWorkerId}', 2, '${leaderUserId}', 'Needs worker revision'
      ) result;
    `);
    assert.equal(workerReturn.status, 0, `P107 worker return failed: ${workerReturn.err}`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${roundWorker1Id}';`).out), 'Draft');
    assert.equal(extractScalar(psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${evalWorkerId}';`).out), '1');

    // --------------------------------------------------------
    // Set 3: Leader (Leader subject, evaluated by SELF -> Manager)
    // --------------------------------------------------------
    const evalLeaderId = '00000000-0000-0000-0000-000000000713';
    const roundLeader1Id = '00000000-0000-0000-0000-000000000723';
    psql(port, password, database, `
      INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status, current_round)
      VALUES ('${evalLeaderId}', '${evalPeriodId}', '${leaderUserId}', 'Leader', '${teamId}', 'Draft', 1);

      INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status, criteria_config_version_id, grade_config_version_id)
      VALUES ('${roundLeader1Id}', '${evalLeaderId}', 1, '${leaderUserId}', 'Leader', 'NotStarted', '${activeVersionId}', '${activeGradeVersionId}');
    `);

    // Leader save draft
    const leaderSave = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${evalLeaderId}', 1, '${leaderUserId}', '{"A1":1}'::jsonb, '{"A1":"leader draft"}'::jsonb, 'Leader draft',
        120, 'AB', false, NULL, NULL, NULL, NULL, NULL, false, '${activeVersionId}'::uuid, '${activeGradeVersionId}'::uuid
      ) result;
    `);
    assert.equal(leaderSave.status, 0, `P107 leader save failed: ${leaderSave.err}`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${roundLeader1Id}';`).out), 'Draft');

    // Leader submit round 1 -> round 2 created for Manager
    const leaderSubmit = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${evalLeaderId}', 1, '${leaderUserId}', '{"A1":1}'::jsonb, '{"A1":"leader submit"}'::jsonb, 'Leader submit',
        120, 'AB', true, now(), 2, '${managerUserId}'::uuid, 'Manager', 'Submitted', false, '${activeVersionId}'::uuid, '${activeGradeVersionId}'::uuid
      ) result;
    `);
    assert.equal(leaderSubmit.status, 0, `P107 leader submit failed: ${leaderSubmit.err}`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${roundLeader1Id}';`).out), 'Submitted');
    assert.equal(extractScalar(psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${evalLeaderId}';`).out), '2');

    // Leader return round 2 by Manager -> unlocks round 1 back to Draft
    const leaderReturn = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.return_evaluation_round_transaction(
        '${evalLeaderId}', 2, '${managerUserId}', 'Needs leader revision'
      ) result;
    `);
    assert.equal(leaderReturn.status, 0, `P107 leader return failed: ${leaderReturn.err}`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${roundLeader1Id}';`).out), 'Draft');
    assert.equal(extractScalar(psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${evalLeaderId}';`).out), '1');

    cases.push('p107-save-on-three-set-catalog-pass');
    cases.push('p107-submit-on-three-set-catalog-pass');
    cases.push('p107-return-on-three-set-catalog-pass');
    cases.push('p107-three-set-save-submit-return-pass');

    // ========================================================
    // SECTION 8: Apply → Import → Revert-Import (a) → (b) Refused with Zero Mutation (H2, H7)
    // ========================================================
    // Close evaluation periods before import
    psql(port, password, database, "UPDATE public.evaluation_periods SET status = 'closed';");

    // H7: Capture predecessor config and live projection before synthetic import
    const predecessorConfig = jsonResult(psql(port, password, database, 'SELECT public.get_active_criteria_config();').out);
    assert.equal(predecessorConfig.version, 6);
    const predecessorActiveGroups = psql(port, password, database, 'SELECT id, set_key, code, name, sort_order FROM public.criteria_groups WHERE is_active ORDER BY id;').out;
    const predecessorActiveCriteria = psql(port, password, database, 'SELECT id, group_id, set_key, code, name, sort_order FROM public.criteria WHERE is_active ORDER BY id;').out;
    const predecessorActiveLevels = psql(port, password, database, 'SELECT id, criterion_id, points, label, sort_order FROM public.criterion_levels WHERE is_active ORDER BY id;').out;

    // Perform synthetic import save (creating version 7)
    const importPayload = structuredClone(addLeaderCritPayload);
    importPayload.groups[0].name = 'Imported Leader Group';
    const importedConfig = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(importPayload)}$json$::jsonb, 6);`).out);
    assert.equal(importedConfig.version, 7);
    const importVersionId = importedConfig.version_id;
    cases.push('p108-synthetic-import-saved');

    const digestBeforeNegativeReverts = criteriaDigest(port, password, database);

    // Negative 1: Wrong expected import version id rejected with zero mutation
    const negWrongId = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', `
        SET kurabe.p108_rollback_approved = 'true';
        SET kurabe.p108_rollback_action = 'revert-import';
        SET kurabe.p108_expected_import_version_id = '00000000-0000-0000-0000-000000000000';
        SET kurabe.p108_expected_previous_version_no = 6;
      `,
      '--file', p108Rollback,
    ], { env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(negWrongId.status, 0);
    assert.match(redact(negWrongId.stderr), /P108_REVERT_IMPORT_BLOCKED/);
    assert.equal(criteriaDigest(port, password, database), digestBeforeNegativeReverts, 'zero mutation on wrong import id');
    cases.push('revert-import-wrong-id-rejected-zero-mutation');

    // Negative 2: Missing expected version settings rejected with zero mutation
    const negMissingSettings = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', "SET kurabe.p108_rollback_approved = 'true'; SET kurabe.p108_rollback_action = 'revert-import';",
      '--file', p108Rollback,
    ], { env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(negMissingSettings.status, 0);
    assert.match(redact(negMissingSettings.stderr), /P108_REVERT_IMPORT_BLOCKED/);
    assert.equal(criteriaDigest(port, password, database), digestBeforeNegativeReverts, 'zero mutation on missing settings');
    cases.push('revert-import-missing-settings-rejected-zero-mutation');

    // Negative 3: Period created after import rejects revert-import with zero mutation
    psql(port, password, database, `
      INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade, created_at)
      VALUES ('00000000-0000-0000-0000-000000000309', 2099, 'AfterImportPeriod', 'closed', 80, 'A', now() + interval '1 hour');
    `);
    const negNewPeriod = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', `
        SET kurabe.p108_rollback_approved = 'true';
        SET kurabe.p108_rollback_action = 'revert-import';
        SET kurabe.p108_expected_import_version_id = '${importVersionId}';
        SET kurabe.p108_expected_previous_version_no = 6;
      `,
      '--file', p108Rollback,
    ], { env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(negNewPeriod.status, 0);
    assert.match(redact(negNewPeriod.stderr), /evaluation periods created after/i);
    // Remove the after-import period to test next negative
    psql(port, password, database, "DELETE FROM public.evaluation_periods WHERE id = '00000000-0000-0000-0000-000000000309';");
    assert.equal(criteriaDigest(port, password, database), digestBeforeNegativeReverts, 'zero mutation on after-import period');
    cases.push('revert-import-after-import-period-rejected-zero-mutation');

    // H2: Negative 4: Round pinned to import version rejects revert-import with zero mutation
    // Transient fixture executed in the SAME connection/transaction:
    // BEGIN; INSERT round; \i rollback.
    // The DO block in rollback fails closed with P108_REVERT_IMPORT_BLOCKED and aborts.
    // Disconnect/abort automatically rolls back the entire transaction including the transient round,
    // leaving zero mutation without attempting direct DELETE (which is forbidden by transition guard).
    const negPinnedScript = `
      SET kurabe.p108_rollback_approved = 'true';
      SET kurabe.p108_rollback_action = 'revert-import';
      SET kurabe.p108_expected_import_version_id = '${importVersionId}';
      SET kurabe.p108_expected_previous_version_no = 6;
      BEGIN;
      INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status, criteria_config_version_id, grade_config_version_id)
      VALUES ('00000000-0000-0000-0000-000000000729', '${evalId}', 3, '${leaderUserId}', 'Leader', 'NotStarted', '${importVersionId}', '${activeGradeVersionId}');
      \\i ${p108Rollback}
    `;
    const negPinnedRound = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
    ], { input: negPinnedScript, env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(negPinnedRound.status, 0);
    assert.match(negPinnedRound.err, /pin the import version/i);
    assert.equal(extractScalar(psql(port, password, database, "SELECT count(*) FROM public.evaluation_rounds WHERE id = '00000000-0000-0000-0000-000000000729';").out), '0', 'pinned round was rolled back and never persisted');
    assert.equal(criteriaDigest(port, password, database), digestBeforeNegativeReverts, 'zero mutation on pinned round');
    cases.push('revert-import-pinned-round-rejected-zero-mutation');

    // Positive: Revert-import (a) with explicit expected import identity succeeds
    const revertResult = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', `
        SET kurabe.p108_rollback_approved = 'true';
        SET kurabe.p108_rollback_action = 'revert-import';
        SET kurabe.p108_expected_import_version_id = '${importVersionId}';
        SET kurabe.p108_expected_previous_version_no = 6;
      `,
      '--file', p108Rollback,
    ], { env: { ...process.env, PGPASSWORD: password } });
    assert.equal(revertResult.status, 0, `revert-import failed: ${redact(revertResult.stderr)}`);

    // H7: Successful revert readback: assert version pointer, active config content, and active live projection
    const activeAfterRevert = jsonResult(psql(port, password, database, 'SELECT public.get_active_criteria_config();').out);
    assert.equal(activeAfterRevert.version, 6);
    assert.equal(activeAfterRevert.version_id, predecessorConfig.version_id);
    assert.deepEqual(activeAfterRevert, predecessorConfig, 'active criteria config matches predecessor config after revert');

    const activeGroupsAfterRevert = psql(port, password, database, 'SELECT id, set_key, code, name, sort_order FROM public.criteria_groups WHERE is_active ORDER BY id;').out;
    const activeCriteriaAfterRevert = psql(port, password, database, 'SELECT id, group_id, set_key, code, name, sort_order FROM public.criteria WHERE is_active ORDER BY id;').out;
    const activeLevelsAfterRevert = psql(port, password, database, 'SELECT id, criterion_id, points, label, sort_order FROM public.criterion_levels WHERE is_active ORDER BY id;').out;

    assert.equal(activeGroupsAfterRevert, predecessorActiveGroups, 'active live groups match predecessor projection');
    assert.equal(activeCriteriaAfterRevert, predecessorActiveCriteria, 'active live criteria match predecessor projection');
    assert.equal(activeLevelsAfterRevert, predecessorActiveLevels, 'active live levels match predecessor projection');

    // Retained immutable history: version 7 rows are preserved but inactive
    assert.equal(extractScalar(psql(port, password, database, `SELECT is_active::text FROM public.criteria_config_versions WHERE id = '${importVersionId}';`).out), 'false', 'reverted version 7 is inactive');
    assert.equal(extractScalar(psql(port, password, database, `SELECT is_active::text FROM public.criteria_config_versions WHERE id = '${predecessorConfig.version_id}';`).out), 'true', 'predecessor version 6 is active');
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '7', 'version 7 history retained in database');
    cases.push('p108-revert-import-a-pass');

    // Schema rollback (b) after import is refused with zero mutation
    const digestBeforeRefusedSchema = criteriaDigest(port, password, database);
    const schemaRefused = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', `
        SET kurabe.p108_rollback_approved = 'true';
        SET kurabe.p108_rollback_action = 'schema-rollback';
        SET kurabe.p108_pre_migration_acl = '${preMigrationTableAcl}';
      `,
      '--file', p108Rollback,
    ], { env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(schemaRefused.status, 0);
    assert.match(redact(schemaRefused.stderr), /P108_SCHEMA_ROLLBACK_REFUSED/);
    const digestAfterRefusedSchema = criteriaDigest(port, password, database);
    assert.equal(digestBeforeRefusedSchema, digestAfterRefusedSchema, 'zero mutation verified on refused schema rollback');
    cases.push('p108-schema-rollback-b-refused-after-import-zero-mutation');

    return { real: true, passed: true, tier: 'real-DB', status: 'EXECUTED', cases, target: 'disposable-postgresql-17' };
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    // H11: Clean up active test-owned child sessions first
    for (const ch of activeChildren) {
      try {
        if (!ch.killed) ch.kill('SIGKILL');
      } catch {}
    }

    // H10: Robust container cleanup requiring docker rm and docker ps exit status, preserving primary error
    const cleanupErrors = [];
    try {
      cleanupContainer(containerId);
    } catch (cleanupErr) {
      cleanupErrors.push(cleanupErr);
    }

    if (cleanupErrors.length > 0) {
      for (const err of cleanupErrors) {
        console.error(`Container cleanup failed${primaryError ? ' after primary error' : ''}: ${err.message || err}`);
      }
      if (primaryError) {
        try {
          primaryError.cleanupErrors = cleanupErrors;
        } catch {}
      } else {
        if (cleanupErrors.length === 1) {
          throw cleanupErrors[0];
        }
        throw new AggregateError(cleanupErrors, `Container cleanup failed: ${cleanupErrors.map((e) => e.message || e).join('; ')}`);
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`P108_CRITERIA_SETS PASS cases=${result.cases.length} target=${result.target}`);
    for (const c of result.cases) {
      console.log(`  ${c}`);
    }
  } catch (error) {
    console.error(`P108_CRITERIA_SETS FAIL ${redact(error?.message || error)}`);
    process.exitCode = 1;
  }
}
