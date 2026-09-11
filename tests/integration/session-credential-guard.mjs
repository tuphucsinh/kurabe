import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const forwardPath = path.join(projectRoot, 'supabase/migrations/20260911000100_session_credential_guard.sql');
const rollbackPath = path.join(projectRoot, 'db/rollback-session-credential-guard.sql');
const BCRYPT_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoOhi55j8KPGWprDAOWfcL6NwgVB5e3EmK';

function redact(value) {
  return String(value ?? '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}
function sql(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function targetFrom(options = {}) {
  const target = {
    host: String(options.dbHost ?? process.env.KURABE_DB_HOST ?? '127.0.0.1'),
    port: Number(options.dbPort ?? process.env.KURABE_DB_PORT ?? 5432),
    database: String(options.dbName ?? process.env.KURABE_DB_NAME ?? 'kurabe_harness'),
    user: String(options.dbUser ?? process.env.KURABE_DB_USER ?? 'postgres'),
  };
  if (!['127.0.0.1', 'localhost', '::1'].includes(target.host)) throw new Error('target must be loopback');
  if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) throw new Error('target port invalid');
  if (!/^kurabe_harness(?:_[a-z0-9_]+)?$/.test(target.database)) throw new Error('database must be disposable kurabe_harness');
  return target;
}
function psqlBinary() {
  for (const candidate of ['/usr/bin/psql', '/usr/lib/postgresql/17/bin/psql', '/usr/lib/postgresql/16/bin/psql', 'psql']) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  throw new Error('psql unavailable');
}
function envForPsql() {
  const env = { ...process.env, PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGCONNECT_TIMEOUT: '5' };
  if (process.env.KURABE_DB_PASSWORD) env.PGPASSWORD = process.env.KURABE_DB_PASSWORD;
  return env;
}
function runPsql(target, statement) {
  const result = spawnSync(psqlBinary(), [
    '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--field-separator=|',
    '--host', target.host, '--port', String(target.port), '--username', target.user, '--dbname', target.database,
  ], { input: statement, encoding: 'utf8', env: envForPsql(), timeout: 30_000, maxBuffer: 512 * 1024 });
  if (result.status !== 0) throw new Error(redact(result.stderr || result.error?.message || `psql exit ${result.status}`));
  return String(result.stdout || '').trim();
}
function runPsqlAsync(target, statement) {
  return new Promise((resolve) => {
    const child = spawn(psqlBinary(), [
      '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--field-separator=|',
      '--host', target.host, '--port', String(target.port), '--username', target.user, '--dbname', target.database,
    ], { env: envForPsql(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: redact(stderr) }));
    child.stdin.end(statement);
  });
}
function expectFailure(target, statement, needle) {
  let failed = false;
  try { runPsql(target, statement); } catch (error) {
    failed = true;
    assert.match(String(error), new RegExp(needle));
  }
  assert.equal(failed, true, `expected SQL failure matching ${needle}`);
}
function schemaSql(source, schema) {
  const quoted = `"${schema.replaceAll('"', '""')}"`;
  return source
    .replaceAll('public.', `${quoted}.`)
    .replaceAll("table_schema = 'public'", `table_schema = '${schema}'`)
    .replaceAll('search_path = public', `search_path = ${quoted}`);
}
function baseSchema(schema) {
  const q = `"${schema}"`;
  return `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA ${q};
    CREATE TABLE ${q}.users (
      id uuid PRIMARY KEY, is_active boolean NOT NULL DEFAULT true,
      password_hash text, password_setup_required boolean NOT NULL DEFAULT false
    );
    CREATE TABLE ${q}.sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text NOT NULL UNIQUE,
      user_id uuid NOT NULL REFERENCES ${q}.users(id), expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE ${q}.password_setup_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES ${q}.users(id),
      token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
      used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
  `;
}
function token(seed) { return crypto.createHash('sha256').update(seed).digest('hex'); }
function call(schema, name, args) { return `SELECT * FROM "${schema}".${name}(${args.join(', ')});`; }
function gitIdentity() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' });
  const tree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: projectRoot, encoding: 'utf8' });
  if (head.status !== 0 || tree.status !== 0) throw new Error('candidate git identity unavailable');
  return { candidateSha: head.stdout.trim(), candidateTreeSha: tree.stdout.trim() };
}

export async function run({ options = {} } = {}) {
  const target = targetFrom(options);
  const identity = gitIdentity();

  assert.ok(fs.existsSync(forwardPath), 'T02 forward migration must exist');
  assert.ok(fs.existsSync(rollbackPath), 'T02 rollback candidate must exist');
  const forward = fs.readFileSync(forwardPath, 'utf8');
  const rollback = fs.readFileSync(rollbackPath, 'utf8');
  assert.match(forward, /CANDIDATE ONLY/);
  assert.match(forward, /issue_session_transaction/);
  assert.match(forward, /credential_revision/);
  assert.match(rollback, /kurabe\.p102m3t02_rollback_approved/);
  assert.match(rollback, /provenance mismatch/);
  const cases = ['source migration and guarded rollback contract'];
  const schema = `kurabe_guard_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const q = `"${schema}"`;
  try {
    runPsql(target, baseSchema(schema));
    const candidateForward = schemaSql(forward, schema);
    const candidateRollback = schemaSql(rollback, schema);
    runPsql(target, `ALTER TABLE ${q}.users ADD COLUMN credential_revision text;`);
    expectFailure(target, candidateForward, 'provenance collision');
    cases.push('migration refuses a pre-existing unowned revision column');
    runPsql(target, `DROP SCHEMA ${q} CASCADE;`);
    runPsql(target, baseSchema(schema));
    runPsql(target, candidateForward);
    runPsql(target, candidateForward);
    const columns = runPsql(target, `
      SELECT table_name || '|' || column_name || '|' || data_type
      FROM information_schema.columns
      WHERE table_schema=${sql(schema)} AND column_name='credential_revision'
      ORDER BY table_name;
    `);
    assert.equal(columns, 'sessions|credential_revision|bigint\nusers|credential_revision|bigint');
    cases.push('clean and applied-like migration replay adds non-null bigint revisions');

    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '22222222-2222-4222-8222-222222222222';
    const u3 = '33333333-3333-4333-8333-333333333333';
    const u4 = '44444444-4444-4444-8444-444444444444';
    const u5 = '55555555-5555-4555-8555-555555555555';
    runPsql(target, `
      INSERT INTO ${q}.users (id, is_active, password_hash, password_setup_required) VALUES
        (${sql(u1)}, true, 'configured-hash-a', false),
        (${sql(u2)}, true, NULL, false),
        (${sql(u3)}, true, 'configured-hash-c', false),
        (${sql(u4)}, true, 'configured-hash-d', false),
        (${sql(u5)}, true, NULL, true);
      INSERT INTO ${q}.sessions (id, user_id, token_hash, expires_at) VALUES
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ${sql(u1)}, ${sql(token('u1-current'))}, now()+interval '1 hour'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ${sql(u1)}, ${sql(token('u1-other'))}, now()+interval '1 hour'),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', ${sql(u1)}, ${sql(token('u1-third'))}, now()+interval '1 hour');
      INSERT INTO ${q}.password_setup_tokens (user_id, token_hash, expires_at)
      VALUES (${sql(u1)}, ${sql(token('u1-pending'))}, now()+interval '1 hour'),
        (${sql(u5)}, ${sql(token('u5-setup'))}, now()+interval '1 hour');
    `);
    const currentHash = token('u1-current');
    const changed = runPsql(target, call(schema, 'change_password_transaction', [sql(u1), sql('configured-hash-a'), sql(BCRYPT_HASH), sql(currentHash), '0']));
    assert.match(changed, new RegExp(`${u1}\\|2`));
    assert.equal(runPsql(target, `SELECT credential_revision || '|' || password_setup_required FROM ${q}.users WHERE id=${sql(u1)};`), '1|false');
    assert.equal(runPsql(target, `SELECT count(*) FROM ${q}.sessions WHERE user_id=${sql(u1)} AND token_hash=${sql(currentHash)};`), '1');
    assert.equal(runPsql(target, `SELECT credential_revision FROM ${q}.sessions WHERE user_id=${sql(u1)} AND token_hash=${sql(currentHash)};`), '1');
    assert.equal(runPsql(target, `SELECT count(*) FROM ${q}.password_setup_tokens WHERE user_id=${sql(u1)} AND used_at IS NULL;`), '0');
    cases.push('configured change updates revision, preserves current session, revokes other sessions/tokens');

    expectFailure(target, call(schema, 'change_password_transaction', [sql(u1), sql('configured-hash-a'), sql(BCRYPT_HASH), sql(currentHash), '0']), 'CREDENTIAL_MISMATCH');
    cases.push('stale change proof and revision are rejected atomically');

    const resetHash = token('u1-reset');
    const reset = runPsql(target, call(schema, 'reset_password_transaction', [sql(u1), sql(resetHash), "now()+interval '30 minutes'", '1']));
    assert.match(reset, new RegExp(u1));
    assert.equal(runPsql(target, `SELECT credential_revision || '|' || password_setup_required || '|' || (password_hash IS NULL) FROM ${q}.users WHERE id=${sql(u1)};`), '2|true|true');
    assert.equal(runPsql(target, `SELECT count(*) FROM ${q}.sessions WHERE user_id=${sql(u1)};`), '0');
    expectFailure(target, call(schema, 'issue_session_transaction', [sql(u1), 'NULL', 'false', '1', sql(token('stale-reset')), "now()+interval '1 hour'"]), 'AUTH_STATE_CHANGED');
    cases.push('reset atomically invalidates revision, password, sessions and stale login issuance');

    runPsql(target, call(schema, 'complete_password_setup_transaction', [sql(resetHash), sql(BCRYPT_HASH), '2']));
    assert.equal(runPsql(target, `SELECT credential_revision || '|' || password_setup_required || '|' || (password_hash IS NOT NULL) FROM ${q}.users WHERE id=${sql(u1)};`), '3|false|true');
    expectFailure(target, call(schema, 'complete_password_setup_transaction', [sql(resetHash), sql(BCRYPT_HASH), '3']), 'TOKEN_(ALREADY_USED|NOT_ALLOWED)');
    cases.push('setup token is one-time, expiry/state checked, and completion increments revision');

    const legacySession = token('legacy-session');
    runPsql(target, call(schema, 'issue_session_transaction', [sql(u2), 'NULL', 'false', '0', sql(legacySession), "now()+interval '1 hour'"]));
    assert.equal(runPsql(target, `SELECT count(*) FROM ${q}.sessions WHERE user_id=${sql(u2)} AND credential_revision=0;`), '1');
    cases.push('never-configured NULL legacy account remains issuable in optional mode');

    async function assertConcurrentInvalidation(mutator, issueArgs, label) {
      const raceA = runPsqlAsync(target, `BEGIN; SELECT id FROM ${q}.users WHERE id=${sql(issueArgs.userId)} FOR UPDATE; SELECT pg_sleep(0.35); ${mutator} COMMIT;`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const raceB = runPsqlAsync(target, call(schema, 'issue_session_transaction', [
        sql(issueArgs.userId), issueArgs.passwordHash, issueArgs.setupRequired, String(issueArgs.revision),
        sql(token(`${label}-login`)), "now()+interval '1 hour'",
      ]));
      const [mutation, issuance] = await Promise.all([raceA, raceB]);
      assert.equal(mutation.code, 0, `${label} mutation failed: ${mutation.stderr}`);
      assert.notEqual(issuance.code, 0, `${label} stale concurrent issuance must fail`);
      assert.match(issuance.stderr, /AUTH_STATE_CHANGED/);
      cases.push(`concurrent ${label} invalidation blocks stale session issuance`);
    }

    await assertConcurrentInvalidation(
      `SELECT * FROM ${q}.change_password_transaction(${sql(u3)}, ${sql('configured-hash-c')}, ${sql(BCRYPT_HASH)}, NULL, 0);`,
      { userId: u3, passwordHash: sql('configured-hash-c'), setupRequired: 'false', revision: 0 },
      'change_password_transaction'
    );
    await assertConcurrentInvalidation(
      `SELECT * FROM ${q}.reset_password_transaction(${sql(u4)}, ${sql(token('u4-reset'))}, now()+interval '30 minutes', 0);`,
      { userId: u4, passwordHash: sql('configured-hash-d'), setupRequired: 'false', revision: 0 },
      'reset_password_transaction'
    );
    await assertConcurrentInvalidation(
      `SELECT * FROM ${q}.complete_password_setup_transaction(${sql(token('u5-setup'))}, ${sql(BCRYPT_HASH)}, 0);`,
      { userId: u5, passwordHash: 'NULL', setupRequired: 'true', revision: 0 },
      'complete_password_setup_transaction'
    );

    expectFailure(target, candidateRollback, 'ROLLBACK_UNAPPROVED');
    assert.equal(runPsql(target, `SELECT count(*) FROM information_schema.columns WHERE table_schema=${sql(schema)} AND column_name='credential_revision';`), '2');
    cases.push('rollback requires explicit external approval and leaves catalog unchanged when absent');

    runPsql(target, `SET kurabe.p102m3t02_rollback_approved = 'true';\n${candidateRollback}`);
    assert.equal(runPsql(target, `SELECT count(*) FROM information_schema.columns WHERE table_schema=${sql(schema)} AND column_name='credential_revision';`), '0');
    cases.push('approved rollback removes only T02 revision columns and overloads');
  } finally {
    try { runPsql(target, `DROP SCHEMA IF EXISTS ${q} CASCADE;`); } catch { /* preserve primary failure */ }
  }
  return {
    real: true,
    passed: true,
    tier: 'real-DB',
    authenticated: false,
    status: 'EXECUTED',
    target: 'loopback-disposable-postgresql',
    dbIdentity: target,
    candidateSha: identity.candidateSha,
    candidateTreeSha: identity.candidateTreeSha,
    cases,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run({ options: {} }).then((result) => {
    const evidencePath = process.env.KURABE_INTEGRATION_EVIDENCE_PATH;
    if (evidencePath) {
      const evidence = {
        evidenceType: 'real-db-session-credential-guard',
        status: result.status,
        tier: result.tier,
        candidateSha: result.candidateSha,
        candidateTreeSha: result.candidateTreeSha,
        caseCount: result.cases.length,
        cases: result.cases,
        target: result.target,
        dbIdentity: result.dbIdentity,
        artifactPath: evidencePath,
      };
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
      const readback = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      assert.equal(readback.candidateSha, result.candidateSha);
      assert.equal(readback.candidateTreeSha, result.candidateTreeSha);
      assert.equal(readback.caseCount, result.cases.length);
      assert.ok(readback.caseCount > 0 && readback.cases.length === readback.caseCount);
    }
    console.log(`SESSION_CREDENTIAL_GUARD_INTEGRATION EXECUTED cases=${result.cases.length} tier=${result.tier} candidate_sha=${result.candidateSha} tree_sha=${result.candidateTreeSha}`);
  }).catch((error) => {
    console.error(`SESSION_CREDENTIAL_GUARD_INTEGRATION FAIL ${redact(error.message)}`);
    process.exitCode = 1;
  });
}
