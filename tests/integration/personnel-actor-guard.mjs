import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as runRealActorProof } from './personnel-actor-guard-real.mjs';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION_PATH = path.join(projectRoot, 'supabase/migrations/20260911000400_personnel_actor_guard.sql');
const ROLLBACK_PATH = path.join(projectRoot, 'db/rollback-personnel-actor-guard.sql');
const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/tmp', LANG: 'C', LC_ALL: 'C', PGCONNECT_TIMEOUT: '5', PGPASSWORD: process.env.PGPASSWORD || '',
};
const IDS = {
  manager: '00000000-0000-0000-0000-000000000001',
  leader: '00000000-0000-0000-0000-000000000002',
  employee: '00000000-0000-0000-0000-000000000003',
  subleader: '00000000-0000-0000-0000-000000000004',
  employeeTwo: '00000000-0000-0000-0000-000000000005',
  teamOne: '00000000-0000-0000-0000-000000000011',
  teamTwo: '00000000-0000-0000-0000-000000000012',
};

function redact(value) {
  return String(value ?? '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}
function targetFrom(options = {}) {
  const target = {
    host: options.dbHost ?? '127.0.0.1', port: Number(options.dbPort ?? 5432),
    database: options.dbName ?? 'kurabe_harness', user: options.dbUser ?? 'postgres',
  };
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(target.host), 'database must be loopback');
  assert.ok(Number.isInteger(target.port) && target.port > 0 && target.port < 65536, 'database port must be valid');
  assert.match(target.database, /^kurabe_harness(?:_[a-z0-9_]+)?$/, 'database must be disposable');
  assert.equal(target.user, 'postgres', 'database user must be postgres');
  return target;
}
function runPsql(target, sql, { expectPass = true } = {}) {
  const result = spawnSync('psql', [
    '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--field-separator=|',
    '--host', target.host, '--port', String(target.port), '--username', target.user, '--dbname', target.database,
  ], { env: SAFE_ENV, input: sql, encoding: 'utf8', timeout: 20_000, maxBuffer: 256 * 1024 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (expectPass && (result.error || result.status !== 0)) throw new Error(`psql failed: ${redact(output || result.error?.message)}`);
  if (!expectPass && result.status === 0) throw new Error(`expected SQL failure but it passed: ${redact(output)}`);
  return output;
}
function qid(value) { return `"${value.replaceAll('"', '""')}"`; }
function q(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function rewrite(sql, schema) { return sql.replaceAll('public.', `${qid(schema)}.`); }
function fixture(schema) {
  const s = qid(schema);
  return `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE TABLE ${s}.users (
  id uuid PRIMARY KEY, employee_code text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', role text NOT NULL,
  team_id uuid, join_date date, avatar_url text, is_active boolean NOT NULL DEFAULT true,
  subleader_id uuid, description text, gender text NOT NULL DEFAULT 'Nữ'
);
CREATE TABLE ${s}.teams (id uuid PRIMARY KEY, name text NOT NULL, leader_id uuid, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE ${s}.evaluations (id uuid PRIMARY KEY, employee_id uuid, evaluator_id uuid);
CREATE TABLE ${s}.evaluation_rounds (id uuid PRIMARY KEY, evaluation_id uuid, evaluator_id uuid);
CREATE TABLE ${s}.executor_calls (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, users_payload jsonb, team_payload jsonb);
CREATE FUNCTION ${s}.apply_personnel_transaction(p_users jsonb, p_team jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
BEGIN
  INSERT INTO ${s}.executor_calls(users_payload, team_payload) VALUES (p_users, p_team);
  RETURN jsonb_build_object('users', p_users, 'team', p_team);
END;
$fn$;
INSERT INTO ${s}.teams(id, name) VALUES
  (${q(IDS.teamOne)}, 'One'), (${q(IDS.teamTwo)}, 'Two');
INSERT INTO ${s}.users(id, employee_code, name, role, team_id) VALUES
  (${q(IDS.manager)}, 'M', 'Manager', 'Manager', NULL),
  (${q(IDS.leader)}, 'L', 'Leader', 'Leader', ${q(IDS.teamOne)}),
  (${q(IDS.employee)}, 'E', 'Employee', 'Employee', ${q(IDS.teamOne)}),
  (${q(IDS.subleader)}, 'S', 'SubLeader', 'SubLeader', ${q(IDS.teamOne)}),
  (${q(IDS.employeeTwo)}, 'E2', 'Employee Two', 'Employee', ${q(IDS.teamTwo)});
`;
}
function call(schema, users, team, actor) {
  const s = qid(schema);
  return `SELECT ${s}.apply_personnel_transaction(${q(JSON.stringify(users))}::jsonb, ${team === null ? 'NULL' : `${q(JSON.stringify(team))}::jsonb`}, ${q(actor)}::uuid);`;
}
function countCalls(target, schema) { return Number(runPsql(target, `SELECT count(*) FROM ${qid(schema)}.executor_calls;`)); }

export async function run({ options = {} } = {}) {
  const target = targetFrom(options);
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const rollback = fs.readFileSync(ROLLBACK_PATH, 'utf8');
  assert.match(migration, /CANDIDATE|P102M3T05/, 'migration must identify candidate');
  assert.match(rollback, /P102M3T05_ROLLBACK_PREFLIGHT/, 'rollback must be fail-closed');
  const schema = `p102m3t05_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const s = qid(schema);
  let created = false;
  try {
    runPsql(target, `CREATE SCHEMA ${s};${fixture(schema)}`); created = true;
    runPsql(target, rewrite(migration, schema));

    const metadata = runPsql(target, `
SELECT p.prosecdef || '|' || COALESCE(array_to_string(p.proconfig, ','), '') || '|' ||
       COALESCE(obj_description(p.oid, 'pg_proc'), '') || '|' ||
       has_function_privilege('anon', '${schema}.apply_personnel_transaction(jsonb,jsonb,uuid)', 'EXECUTE') || '|' ||
       has_function_privilege('service_role', '${schema}.apply_personnel_transaction(jsonb,jsonb,uuid)', 'EXECUTE')
FROM pg_proc p WHERE p.oid = to_regprocedure('${schema}.apply_personnel_transaction(jsonb,jsonb,uuid)');`);
    const [securityDefiner, config, provenance, anonExecute, serviceExecute] = metadata.split('|');
    assert.equal(securityDefiner, 'true', `security/provenance/ACL contract mismatch metadata=${metadata}`);
    assert.ok(config.includes('search_path=public'), `search_path contract mismatch metadata=${metadata}`);
    assert.equal(provenance, 'kurabe:p102m3t05:candidate:v1:authoritative-actor-scope-and-safe-personnel-graph', `provenance mismatch metadata=${metadata}`);
    assert.equal(anonExecute, 'false', `anon ACL mismatch metadata=${metadata}`);
    assert.equal(serviceExecute, 'true', `service_role ACL mismatch metadata=${metadata}`);

    runPsql(target, call(schema, [{ id: IDS.employee, role: 'Employee', team_id: IDS.teamOne, name: 'Scoped' }], null, IDS.leader));
    assert.equal(countCalls(target, schema), 1, 'same-team Leader mutation must reach executor');
    runPsql(target, call(schema, [{ id: IDS.employeeTwo, role: 'Employee', team_id: IDS.teamTwo }], null, IDS.leader), { expectPass: false });
    assert.equal(countCalls(target, schema), 1, 'cross-team Leader mutation must not reach executor');
    runPsql(target, call(schema, [{ id: IDS.employee, role: 'Manager', team_id: IDS.teamOne }], null, IDS.leader), { expectPass: false });
    runPsql(target, call(schema, [{ id: IDS.employee, role: 'Employee', team_id: IDS.teamOne }], null, IDS.employee), { expectPass: false });
    runPsql(target, call(schema, [{ id: IDS.employee, is_active: false }], null, IDS.manager), { expectPass: true });
    assert.equal(countCalls(target, schema), 2, 'unreferenced Manager deletion must reach executor');

    runPsql(target, `UPDATE ${s}.teams SET leader_id = ${q(IDS.leader)} WHERE id = ${q(IDS.teamOne)};`);
    runPsql(target, call(schema, [{ id: IDS.leader, is_active: false }], null, IDS.manager), { expectPass: false });
    runPsql(target, `UPDATE ${s}.teams SET leader_id = NULL WHERE id = ${q(IDS.teamOne)}; UPDATE ${s}.users SET subleader_id = ${q(IDS.subleader)} WHERE id = ${q(IDS.employee)};`);
    runPsql(target, call(schema, [{ id: IDS.subleader, is_active: false }], null, IDS.manager), { expectPass: false });
    runPsql(target, `UPDATE ${s}.users SET subleader_id = NULL WHERE id = ${q(IDS.employee)}; INSERT INTO ${s}.evaluation_rounds(id, evaluator_id) VALUES ('00000000-0000-0000-0000-000000000099', ${q(IDS.employee)});`);
    runPsql(target, call(schema, [{ id: IDS.employee, is_active: false }], null, IDS.manager), { expectPass: false });
    runPsql(target, call(schema, [{ id: IDS.manager, is_active: false }], null, IDS.manager), { expectPass: false });
    runPsql(target, call(schema, [], { id: IDS.teamOne, is_active: false }, IDS.manager), { expectPass: false });
    assert.equal(countCalls(target, schema), 2, 'rejected deletion paths must not reach executor');

    runPsql(target, call(schema, [], { id: IDS.teamTwo, name: 'Two renamed' }, IDS.manager));
    assert.equal(countCalls(target, schema), 3, 'Manager team mutation must reach executor');

    const unapprovedRollback = rewrite(rollback, schema);
    runPsql(target, unapprovedRollback, { expectPass: false });
    const approvedRollback = unapprovedRollback.replace(
      /^BEGIN;/,
      "BEGIN;\nSET LOCAL kurabe.p102m3t05_rollback_approved = 'true';",
    );
    runPsql(target, approvedRollback);
    const postRollback = runPsql(target, `
SELECT (to_regprocedure('${schema}.apply_personnel_transaction(jsonb,jsonb,uuid)') IS NULL) || '|' ||
       (to_regprocedure('${schema}.apply_personnel_transaction(jsonb,jsonb)') IS NOT NULL);`);
    assert.equal(postRollback, 'true|true', 'rollback must remove only actor-aware overload');

    // Keep the small contract fixture for ACL/source checks, but also execute
    // the actor RPC against the real baseline graph and legacy executor.
    const realProof = await runRealActorProof({ options });
    assert.equal(realProof.passed, true, 'real graph executor proof must pass');

    return {
      real: true, passed: true, tier: 'real-DB', status: 'EXECUTED',
      cases: [
        'authoritative actor role and active-state guard', 'same-team Leader allow', 'cross-team Leader deny',
        'role escalation deny', 'unauthorized actor deny', 'authorized Manager user mutation',
        'referenced leader deletion deny', 'referenced subleader deletion deny', 'historical evaluator deletion deny',
        'self deletion deny', 'non-empty team deletion deny', 'Manager team mutation allow',
        'SECURITY DEFINER/search_path/ACL/provenance catalog proof', 'fail-closed overload rollback and legacy retention',
        'real baseline graph executor and transaction proof',
      ],
      target: `loopback:${target.port}/${target.database}`,
    };
  } finally {
    if (created) {
      runPsql(target, `DROP SCHEMA IF EXISTS ${s} CASCADE;`);
      assert.equal(runPsql(target, `SELECT count(*) FROM pg_namespace WHERE nspname = ${q(schema)};`), '0', 'schema residue');
    }
  }
}
