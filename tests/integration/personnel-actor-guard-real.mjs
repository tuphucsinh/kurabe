import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE_PATH = path.join(projectRoot, 'db/bootstrap/baseline.sql');
const FUNCTIONS_PATH = path.join(projectRoot, 'db/bootstrap/functions.sql');
const HISTORY_PATH = path.join(projectRoot, 'supabase/migrations/20260907000300_personnel_history_guard.sql');
const PERSONNEL_PATH = path.join(projectRoot, 'supabase/migrations/20260907000400_personnel_transaction.sql');
const ACTOR_PATH = path.join(projectRoot, 'supabase/migrations/20260911000400_personnel_actor_guard.sql');
const ROLLBACK_PATH = path.join(projectRoot, 'db/rollback-personnel-actor-guard.sql');
const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/tmp', LANG: 'C', LC_ALL: 'C',
  PGCONNECT_TIMEOUT: '5', PGPASSWORD: process.env.PGPASSWORD || '',
};
const IDS = Object.freeze({
  activePeriod: '20000000-0000-0000-0000-000000000001',
  closedPeriod: '20000000-0000-0000-0000-000000000002',
  teamA: '20000000-0000-0000-0000-000000000010',
  teamB: '20000000-0000-0000-0000-000000000011',
  manager: '20000000-0000-0000-0000-000000000020',
  leaderA: '20000000-0000-0000-0000-000000000021',
  leaderB: '20000000-0000-0000-0000-000000000022',
  subA: '20000000-0000-0000-0000-000000000023',
  subB: '20000000-0000-0000-0000-000000000024',
  employee: '20000000-0000-0000-0000-000000000030',
  employeeTwo: '20000000-0000-0000-0000-000000000031',
  inactiveEvaluator: '20000000-0000-0000-0000-000000000033',
});
function redact(value) { return String(value ?? '').replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]'); }
function targetFrom(options = {}) {
  const target = { host: options.dbHost ?? '127.0.0.1', port: Number(options.dbPort ?? 5432), database: options.dbName ?? 'kurabe_harness', user: options.dbUser ?? 'postgres' };
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(target.host));
  assert.ok(Number.isInteger(target.port) && target.port > 0 && target.port < 65536);
  assert.match(target.database, /^kurabe_harness(?:_[a-z0-9_]+)?$/);
  assert.equal(target.user, 'postgres');
  return target;
}
function qid(value) { return `"${value.replaceAll('"', '""')}"`; }
function q(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function rewrite(sql, schema) {
  const isolatedSearchPath = `SET search_path = ${qid(schema)}, public;`;
  const expanded = sql.replaceAll('\\ir functions.sql', fs.readFileSync(FUNCTIONS_PATH, 'utf8'));
  return `${isolatedSearchPath}\n${expanded
    .replaceAll('SET search_path = public;', isolatedSearchPath)
    .replaceAll("SET search_path TO 'public'", `SET search_path TO '${schema}'`)
    .replaceAll('public.', `${qid(schema)}.`)}`;
}
function runPsql(target, sql, { expectPass = true } = {}) {
  const result = spawnSync('psql', ['--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--field-separator=|', '--host', target.host, '--port', String(target.port), '--username', target.user, '--dbname', target.database], { env: SAFE_ENV, input: sql, encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (expectPass && (result.error || result.status !== 0)) throw new Error(`psql failed: ${redact(output || result.error?.message)}`);
  if (!expectPass && result.status === 0) throw new Error(`expected SQL failure but it passed: ${redact(output)}`);
  return output;
}
function scalar(target, sql) { return runPsql(target, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || ''; }
function expectFailure(target, sql, marker) {
  const result = spawnSync('psql', ['--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--host', target.host, '--port', String(target.port), '--username', target.user, '--dbname', target.database], { env: SAFE_ENV, input: sql, encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 });
  assert.notEqual(result.status, 0, `expected failure ${marker}`);
  assert.match(redact(`${result.stdout ?? ''}\n${result.stderr ?? ''}`), new RegExp(marker));
}
function callUsers(schema, users, actor) { return `SELECT ${qid(schema)}.apply_personnel_transaction(${q(JSON.stringify(users))}::jsonb, NULL, ${q(actor)}::uuid);`; }
function callTeam(schema, team, actor) { return `SELECT ${qid(schema)}.apply_personnel_transaction('[]'::jsonb, ${q(JSON.stringify(team))}::jsonb, ${q(actor)}::uuid);`; }
function seed(target, schema) {
  const s = qid(schema);
  runPsql(target, `
INSERT INTO ${s}.evaluation_periods (id, year, name, status) VALUES
  (${q(IDS.activePeriod)}, 2026, 'Active', 'active'), (${q(IDS.closedPeriod)}, 2025, 'Closed', 'closed');
INSERT INTO ${s}.teams (id, name, is_active) VALUES
  (${q(IDS.teamA)}, 'A', true), (${q(IDS.teamB)}, 'B', true);
INSERT INTO ${s}.users (id, employee_code, name, role, team_id, is_active, gender) VALUES
  (${q(IDS.manager)}, 'M-1', 'Manager', 'Manager', NULL, true, 'Nữ'),
  (${q(IDS.leaderA)}, 'L-A', 'Leader A', 'Leader', ${q(IDS.teamA)}, true, 'Nữ'),
  (${q(IDS.leaderB)}, 'L-B', 'Leader B', 'Leader', ${q(IDS.teamB)}, true, 'Nữ'),
  (${q(IDS.subA)}, 'S-A', 'Sub A', 'SubLeader', ${q(IDS.teamA)}, true, 'Nữ'),
  (${q(IDS.subB)}, 'S-B', 'Sub B', 'SubLeader', ${q(IDS.teamB)}, true, 'Nữ'),
  (${q(IDS.inactiveEvaluator)}, 'I-E', 'Inactive Evaluator', 'SubLeader', ${q(IDS.teamA)}, false, 'Nữ');
UPDATE ${s}.teams SET leader_id = ${q(IDS.leaderA)} WHERE id = ${q(IDS.teamA)};
UPDATE ${s}.teams SET leader_id = ${q(IDS.leaderB)} WHERE id = ${q(IDS.teamB)};
`);
}

export async function run({ options = {} } = {}) {
  const target = targetFrom(options);
  const actor = fs.readFileSync(ACTOR_PATH, 'utf8');
  const rollback = fs.readFileSync(ROLLBACK_PATH, 'utf8');
  assert.match(actor, /LOCK TABLE public\.teams, public\.users, public\.evaluation_rounds/);
  assert.match(actor, /guard_personnel_evaluator_reference/);
  assert.match(rollback, /P102M3T05_ROLLBACK_PREFLIGHT/);
  const schema = `p102m3t05real_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const s = qid(schema);
  let created = false;
  const cases = [];
  try {
    runPsql(target, `CREATE SCHEMA ${s};`); created = true;
    runPsql(target, rewrite(fs.readFileSync(BASELINE_PATH, 'utf8'), schema));
    runPsql(target, rewrite(fs.readFileSync(HISTORY_PATH, 'utf8'), schema));
    runPsql(target, rewrite(fs.readFileSync(PERSONNEL_PATH, 'utf8'), schema));
    seed(target, schema);
    runPsql(target, rewrite(actor, schema));
    cases.push('real-baseline-and-migrations');

    runPsql(target, callUsers(schema, [{ id: IDS.employee, employee_code: 'E-1', name: 'Employee', role: 'Employee', team_id: IDS.teamA, subleader_id: IDS.subA }], IDS.leaderA));
    assert.equal(scalar(target, `SELECT count(*) FROM ${s}.evaluations WHERE employee_id=${q(IDS.employee)};`), '1');
    assert.equal(scalar(target, `SELECT evaluator_id FROM ${s}.evaluation_rounds r JOIN ${s}.evaluations e ON e.id=r.evaluation_id WHERE e.employee_id=${q(IDS.employee)};`), IDS.subA);
    cases.push('actual-graph-executor-new-user');

    runPsql(target, callUsers(schema, [{ id: IDS.employeeTwo, employee_code: 'E-2', name: 'Employee Two', role: 'Employee', team_id: IDS.teamB, subleader_id: IDS.subB }], IDS.manager));
    expectFailure(target, callUsers(schema, [{ id: IDS.employeeTwo, name: 'cross-team' }], IDS.leaderA), 'P102M3T05_SCOPE_FORBIDDEN');
    expectFailure(target, callUsers(schema, [{ id: IDS.employee, role: 'Manager', team_id: IDS.teamA }], IDS.leaderA), 'P102M3T05_SCOPE_FORBIDDEN');
    expectFailure(target, callUsers(schema, [{ id: IDS.employee, name: 'unauthorized' }], IDS.employee), 'P102M3T05_ACTOR_FORBIDDEN');
    cases.push('actual-actor-scope-and-role-guards');

    runPsql(target, callUsers(schema, [
      { id: IDS.employee, name: 'Employee batch' },
      { id: IDS.employeeTwo, name: 'Employee Two batch' },
    ], IDS.manager));
    assert.equal(scalar(target, `SELECT name FROM ${s}.users WHERE id=${q(IDS.employee)};`), 'Employee batch');
    assert.equal(scalar(target, `SELECT name FROM ${s}.users WHERE id=${q(IDS.employeeTwo)};`), 'Employee Two batch');
    expectFailure(target, callUsers(schema, [
      { id: IDS.employee, name: 'must rollback' },
      { id: IDS.leaderB, role: 'Leader', team_id: IDS.teamA },
    ], IDS.manager), 'P99M2T02_DUPLICATE_LEADER');
    assert.equal(scalar(target, `SELECT name FROM ${s}.users WHERE id=${q(IDS.employee)};`), 'Employee batch');
    cases.push('actual-batch-atomicity');

    expectFailure(target, callUsers(schema, [{ id: IDS.subA, is_active: false }], IDS.manager), 'P102M3T05_DELETE_REFERENCED_SUBLEADER');
    // Deliberately create an impossible legacy state to exercise the actor
    // guard's fail-closed branch; the baseline graph trigger normally rejects
    // this transition before the actor-aware RPC can observe it.
    runPsql(target, `SET session_replication_role = replica; UPDATE ${s}.teams SET is_active=false WHERE id=${q(IDS.teamA)}; SET session_replication_role = origin;`);
    expectFailure(target, callUsers(schema, [{ id: IDS.employee, name: 'inactive-team' }], IDS.leaderA), 'P102M3T05_ACTOR_TEAM_INACTIVE');
    runPsql(target, `SET session_replication_role = replica; UPDATE ${s}.teams SET is_active=true WHERE id=${q(IDS.teamA)}; SET session_replication_role = origin;`);
    cases.push('referenced-delete-and-inactive-team-guard');

    expectFailure(target, `INSERT INTO ${s}.evaluation_rounds (id, evaluation_id, evaluator_id, round, status) VALUES (${q('20000000-0000-0000-0000-000000000099')}, (SELECT id FROM ${s}.evaluations WHERE employee_id=${q(IDS.employee)}), ${q(IDS.inactiveEvaluator)}, 2, 'NotStarted');`, 'P102M3T05_INACTIVE_EVALUATOR');
    cases.push('post-deactivation-reference-guard');

    runPsql(target, `UPDATE ${s}.evaluations SET status='Submitted' WHERE employee_id=${q(IDS.employee)}; UPDATE ${s}.evaluation_rounds r SET status='Submitted', submitted_at=now() FROM ${s}.evaluations e WHERE r.evaluation_id=e.id AND e.employee_id=${q(IDS.employee)};`);
    const beforeSnapshot = scalar(target, `SELECT employee_role || '|' || coalesce(team_id::text,'') FROM ${s}.evaluations WHERE employee_id=${q(IDS.employee)};`);
    runPsql(target, callUsers(schema, [{ id: IDS.employee, role: 'Worker', team_id: IDS.teamB, subleader_id: IDS.subB }], IDS.manager));
    assert.equal(scalar(target, `SELECT employee_role || '|' || coalesce(team_id::text,'') FROM ${s}.evaluations WHERE employee_id=${q(IDS.employee)};`), beforeSnapshot);
    cases.push('submitted-history-preserved');

    runPsql(target, callTeam(schema, { id: IDS.teamB, name: 'B renamed' }, IDS.manager));
    assert.equal(scalar(target, `SELECT name FROM ${s}.teams WHERE id=${q(IDS.teamB)};`), 'B renamed');
    cases.push('actual-team-mutation');

    const approvedRollback = rewrite(rollback, schema).replace(
      /\bBEGIN;\s*/,
      "BEGIN;\nSET LOCAL kurabe.p102m3t05_rollback_approved = 'true';\n",
    );
    runPsql(target, approvedRollback);
    assert.equal(scalar(target, `SELECT (to_regprocedure('${schema}.apply_personnel_transaction(jsonb,jsonb,uuid)') IS NULL) || '|' || (to_regprocedure('${schema}.apply_personnel_transaction(jsonb,jsonb)') IS NOT NULL) || '|' || (to_regprocedure('${schema}.guard_personnel_evaluator_reference()') IS NULL);`), 'true|true|true');
    cases.push('fail-closed-rollback-and-legacy-retention');
    return { real: true, passed: true, tier: 'real-DB', status: 'EXECUTED', cases, target: `loopback:${target.port}/${target.database}` };
  } finally {
    if (created) {
      runPsql(target, `DROP SCHEMA IF EXISTS ${s} CASCADE;`);
      assert.equal(scalar(target, `SELECT count(*) FROM pg_namespace WHERE nspname=${q(schema)};`), '0');
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`PERSONNEL_ACTOR_REAL PASS cases=${result.cases.length}`);
  } catch (error) {
    console.error(`PERSONNEL_ACTOR_REAL FAIL ${redact(error?.stack || error)}`);
    process.exitCode = 1;
  }
}
