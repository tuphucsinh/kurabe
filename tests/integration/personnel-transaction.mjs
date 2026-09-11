#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FORWARD_PATH = path.join(projectRoot, 'supabase/migrations/20260907000400_personnel_transaction.sql');
const P99M1_PATH = path.join(projectRoot, 'supabase/migrations/20260907000300_personnel_history_guard.sql');
const ROLLBACK_PATH = path.join(projectRoot, 'db/rollback-personnel-transaction.sql');
const USERS_PATH = path.join(projectRoot, 'src/actions/users.ts');
const TEAMS_PATH = path.join(projectRoot, 'src/actions/teams.ts');
const WRITE_PATH = path.join(projectRoot, 'src/lib/db/evaluations-write.ts');
const RESOLVER_PATH = path.join(projectRoot, 'src/lib/evaluator-resolver.ts');
const ADMIN_PATH = path.join(projectRoot, 'src/lib/db/evaluations-admin.ts');
const WORKFLOW_PATH = path.join(projectRoot, 'src/data/workflow.ts');

const IDS = Object.freeze({
  activePeriod: '10000000-0000-0000-0000-000000000001',
  closedPeriod: '10000000-0000-0000-0000-000000000002',
  teamA: '10000000-0000-0000-0000-000000000010',
  teamB: '10000000-0000-0000-0000-000000000011',
  teamC: '10000000-0000-0000-0000-000000000012',
  teamD: '10000000-0000-0000-0000-000000000013',
  manager: '10000000-0000-0000-0000-000000000020',
  leaderA: '10000000-0000-0000-0000-000000000021',
  leaderB: '10000000-0000-0000-0000-000000000022',
  subA: '10000000-0000-0000-0000-000000000023',
  subB: '10000000-0000-0000-0000-000000000024',
  unassignedLeader: '10000000-0000-0000-0000-000000000025',
  employee: '10000000-0000-0000-0000-000000000030',
  invalidSubleaderUser: '10000000-0000-0000-0000-000000000031',
  noPeriodUser: '10000000-0000-0000-0000-000000000032',
  duplicateLeaderUser: '10000000-0000-0000-0000-000000000033',
  secondSubleader: '10000000-0000-0000-0000-000000000034',
  submittedEmployee: '10000000-0000-0000-0000-000000000035',
  raceLeaderA: '10000000-0000-0000-0000-000000000036',
  raceLeaderB: '10000000-0000-0000-0000-000000000037',
  employeeEval: '10000000-0000-0000-0000-000000000040',
  employeeRound: '10000000-0000-0000-0000-000000000041',
});

const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/tmp', LANG: 'C', LC_ALL: 'C', PGPASSFILE: '/dev/null',
  PGSERVICEFILE: '/dev/null', PGCONNECT_TIMEOUT: '5',
};

function redact(value) {
  return String(value ?? '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}
function docker(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 });
  if (r.error || r.status !== 0) throw new Error(`docker failed: ${redact(r.stderr || r.error?.message || r.status)}`);
  return String(r.stdout || '').trim();
}
function targetArgs(t) { return ['--no-password', '--set=ON_ERROR_STOP=1', '--host', t.host, '--port', String(t.port), '--username', t.user, '--dbname', t.database]; }
function psqlResult(t, sql, timeout = 60_000) {
  const r = spawnSync('psql', [...targetArgs(t), '--tuples-only', '--no-align'], { env: { ...SAFE_ENV, PGPASSWORD: t.password }, input: sql, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });
  return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || ''), error: r.error };
}
function runPsql(t, sql) {
  const r = psqlResult(t, sql);
  if (r.error || r.status !== 0) throw new Error(`psql failed: ${redact(r.stderr || r.error?.message || r.status)}`);
  return r.stdout.trim();
}
function runPsqlFile(t, file) {
  const r = spawnSync('psql', [...targetArgs(t), '--file', file], { env: { ...SAFE_ENV, PGPASSWORD: t.password }, encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`psql file failed: ${redact(r.stderr || r.error?.message || r.status)}`);
  return String(r.stdout || '').trim();
}
function psqlAsync(t, sql) {
  const child = spawn('psql', [...targetArgs(t), '--tuples-only', '--no-align'], { env: { ...SAFE_ENV, PGPASSWORD: t.password }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (c) => { stdout += String(c); });
  child.stderr.on('data', (c) => { stderr += String(c); });
  child.stdin.end(sql);
  return new Promise((resolve) => {
    child.once('close', (status) => resolve({ status, stdout, stderr, error: null }));
    child.once('error', (error) => resolve({ status: null, stdout, stderr, error }));
  });
}
function scalar(t, sql) { return runPsql(t, sql).split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || ''; }
function expectFailure(t, sql, marker) {
  const r = psqlResult(t, sql);
  assert.notEqual(r.status, 0, `expected failure ${marker}`);
  assert.match(redact(`${r.stdout}\n${r.stderr}`), new RegExp(marker));
}
function startContainer() {
  const name = `kurabe-p99m2t02-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(24).toString('hex');
  docker(['run', '--detach', '--name', name, '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=postgres', '--publish', '127.0.0.1::5432', 'postgres:17-alpine']);
  try {
    let port;
    for (let i = 0; i < 40; i += 1) {
      const match = docker(['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/);
      if (match) {
        port = Number(match[1]);
        const ready = spawnSync('pg_isready', ['--host', '127.0.0.1', '--port', String(port), '--username', 'postgres'], { env: { ...SAFE_ENV, PGPASSWORD: password }, encoding: 'utf8', timeout: 2_000 });
        if (ready.status === 0) return { name, target: { host: '127.0.0.1', port, user: 'postgres', database: 'postgres', password } };
      }
      spawnSync('sleep', ['0.25']);
    }
    throw new Error('postgres did not become ready');
  } catch (error) { docker(['rm', '--force', name]); throw error; }
}
function stopContainer(c) { docker(['rm', '--force', c.name]); }
function callUsers(users) {
  const json = JSON.stringify(users).replaceAll("'", "''");
  return `SELECT public.apply_personnel_transaction('${json}'::jsonb, NULL);`;
}
function callTeam(team) {
  const json = JSON.stringify(team).replaceAll("'", "''");
  return `SELECT public.apply_personnel_transaction('[]'::jsonb, '${json}'::jsonb);`;
}
function bootstrapRoles(target) {
  runPsql(target, `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;`);
}
function seed(t) {
  runPsql(t, `
TRUNCATE public.evaluation_rounds, public.evaluations, public.users, public.teams, public.evaluation_periods CASCADE;
INSERT INTO public.evaluation_periods (id, year, name, status) VALUES
 ('${IDS.activePeriod}', 2026, 'Active', 'active'), ('${IDS.closedPeriod}', 2025, 'Closed', 'closed');
INSERT INTO public.teams (id, name, is_active) VALUES
 ('${IDS.teamA}', 'A', true), ('${IDS.teamB}', 'B', true), ('${IDS.teamC}', 'C', true), ('${IDS.teamD}', 'D', true);
INSERT INTO public.users (id, employee_code, name, role, team_id, is_active, gender) VALUES
 ('${IDS.manager}', 'M-1', 'Manager', 'Manager', NULL, true, 'Nữ'),
 ('${IDS.leaderA}', 'L-A', 'Leader A', 'Leader', '${IDS.teamA}', true, 'Nữ'),
 ('${IDS.leaderB}', 'L-B', 'Leader B', 'Leader', '${IDS.teamB}', true, 'Nữ'),
 ('${IDS.subA}', 'S-A', 'Sub A', 'SubLeader', '${IDS.teamA}', true, 'Nữ'),
 ('${IDS.subB}', 'S-B', 'Sub B', 'SubLeader', '${IDS.teamB}', true, 'Nữ'),
 ('${IDS.unassignedLeader}', 'L-U', 'Unassigned Leader', 'Leader', NULL, true, 'Nữ');
UPDATE public.teams SET leader_id = '${IDS.leaderA}' WHERE id = '${IDS.teamA}';
UPDATE public.teams SET leader_id = '${IDS.leaderB}' WHERE id = '${IDS.teamB}';
`);
}

export async function run() {
  const cases = [];
  const forward = fs.readFileSync(FORWARD_PATH, 'utf8');
  const rollback = fs.readFileSync(ROLLBACK_PATH, 'utf8');
  const users = fs.readFileSync(USERS_PATH, 'utf8');
  const teams = fs.readFileSync(TEAMS_PATH, 'utf8');
  const write = fs.readFileSync(WRITE_PATH, 'utf8');
  const resolver = fs.readFileSync(RESOLVER_PATH, 'utf8');
  const admin = fs.readFileSync(ADMIN_PATH, 'utf8');
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(forward, /apply_personnel_transaction/);
  assert.match(forward, /LOCK TABLE public\.teams, public\.users/);
  assert.match(forward, /CREATE UNIQUE INDEX idx_users_active_leader_team/);
  assert.match(forward, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(forward, /P99M2T02_INIT_FAILED/);
  assert.match(rollback, /P99M2T02_ROLLBACK_UNAPPROVED/);
  assert.match(rollback, /kurabe\.p99m2t02_rollback_approved/);
  assert.match(users, /applyPersonnelTransaction/);
  assert.doesNotMatch(users, /ensureEvaluationsForUsers/);
  assert.match(teams, /applyPersonnelTransaction/);
  assert.match(write, /supabaseAdmin\.rpc\('apply_personnel_transaction'/);
  assert.match(resolver, /\.eq\('team_id', subject\.teamId\)/);
  assert.match(admin, /\.eq\('team_id', user\.teamId\)/);
  assert.match(workflow, /evaluator\.teamId === targetTeamId/);
  cases.push('source-contract');

  const c = startContainer();
  try {
    bootstrapRoles(c.target);
    runPsqlFile(c.target, path.join(projectRoot, 'db/bootstrap/baseline.sql'));
    runPsqlFile(c.target, P99M1_PATH);
    runPsqlFile(c.target, FORWARD_PATH);
    seed(c.target);
    cases.push('migration-and-seed');

    runPsql(c.target, callUsers([{ id: IDS.employee, employee_code: 'E-1', name: 'Employee', role: 'Employee', team_id: IDS.teamA, subleader_id: IDS.subA }]));
    assert.equal(scalar(c.target, `SELECT count(*) FROM public.users WHERE id='${IDS.employee}';`), '1');
    assert.equal(scalar(c.target, `SELECT count(*) FROM public.evaluations WHERE employee_id='${IDS.employee}';`), '1');
    assert.equal(scalar(c.target, `SELECT evaluator_id FROM public.evaluation_rounds r JOIN public.evaluations e ON e.id=r.evaluation_id WHERE e.employee_id='${IDS.employee}';`), IDS.subA);
    cases.push('atomic-new-user-init');

    runPsql(c.target, callUsers([{ id: IDS.employee, employee_code: 'E-1', name: 'Employee updated', role: 'Employee', team_id: IDS.teamA, subleader_id: IDS.subA }]));
    assert.equal(scalar(c.target, `SELECT count(*) FROM public.evaluations WHERE employee_id='${IDS.employee}';`), '1');
    cases.push('idempotent-replay');

    expectFailure(c.target, callUsers([{ id: IDS.invalidSubleaderUser, employee_code: 'E-X', name: 'Bad', role: 'Employee', team_id: IDS.teamA, subleader_id: IDS.subB }]), 'P99M2T02_INVALID_SUBLEADER');
    assert.equal(scalar(c.target, `SELECT count(*) FROM public.users WHERE id='${IDS.invalidSubleaderUser}';`), '0');
    cases.push('cross-team-subleader-rollback');

    runPsql(c.target, `UPDATE public.evaluation_periods SET status='closed' WHERE id='${IDS.activePeriod}';`);
    expectFailure(c.target, callUsers([{ id: IDS.noPeriodUser, employee_code: 'E-N', name: 'No period', role: 'SubLeader', team_id: IDS.teamA }]), 'P99M2T02_INIT_FAILED');
    assert.equal(scalar(c.target, `SELECT count(*) FROM public.users WHERE id='${IDS.noPeriodUser}';`), '0');
    runPsql(c.target, `UPDATE public.evaluation_periods SET status='active' WHERE id='${IDS.activePeriod}';`);
    cases.push('zero-active-init-rollback');

    expectFailure(c.target, callUsers([{ id: IDS.duplicateLeaderUser, employee_code: 'L-X', name: 'Duplicate', role: 'Leader', team_id: IDS.teamA }]), 'P99M2T02_DUPLICATE_LEADER');
    assert.equal(scalar(c.target, `SELECT count(*) FROM public.users WHERE id='${IDS.duplicateLeaderUser}';`), '0');
    cases.push('duplicate-leader-rollback');

    runPsql(c.target, callUsers([{ id: IDS.secondSubleader, employee_code: 'S-A2', name: 'Sub A2', role: 'SubLeader', team_id: IDS.teamA }]));
    assert.equal(scalar(c.target, `SELECT count(*) FROM public.users WHERE role='SubLeader' AND team_id='${IDS.teamA}' AND is_active;`), '2');
    cases.push('multiple-subleaders-allowed');

    runPsql(c.target, callTeam({ id: IDS.teamC, name: 'C', leader_id: IDS.unassignedLeader }));
    assert.equal(scalar(c.target, `SELECT team_id FROM public.users WHERE id='${IDS.unassignedLeader}';`), IDS.teamC);
    assert.equal(scalar(c.target, `SELECT leader_id FROM public.teams WHERE id='${IDS.teamC}';`), IDS.unassignedLeader);
    cases.push('atomic-team-leader-appointment');

    runPsql(c.target, callUsers([{ id: IDS.employee, team_id: IDS.teamB, subleader_id: IDS.subB }]));
    assert.equal(scalar(c.target, `SELECT team_id FROM public.evaluations WHERE employee_id='${IDS.employee}' AND status='NotStarted';`), IDS.teamB);
    cases.push('role-team-move-sync');

    runPsql(c.target, callUsers([{ id: IDS.submittedEmployee, employee_code: 'E-S', name: 'Submitted', role: 'Employee', team_id: IDS.teamA, subleader_id: IDS.subA }]));
    runPsql(c.target, `UPDATE public.evaluations SET status='Submitted' WHERE employee_id='${IDS.submittedEmployee}'; UPDATE public.evaluation_rounds r SET status='Submitted', submitted_at=now() FROM public.evaluations e WHERE r.evaluation_id=e.id AND e.employee_id='${IDS.submittedEmployee}';`);
    runPsql(c.target, callUsers([{ id: IDS.submittedEmployee, role: 'Worker', team_id: IDS.teamB, subleader_id: IDS.subB }]));
    assert.equal(scalar(c.target, `SELECT employee_role || '|' || team_id FROM public.evaluations WHERE employee_id='${IDS.submittedEmployee}';`), `Employee|${IDS.teamA}`);
    cases.push('submitted-snapshot-preserved');

    const [raceA, raceB] = await Promise.all([
      psqlAsync(c.target, callUsers([{ id: IDS.raceLeaderA, employee_code: 'R-A', name: 'Race A', role: 'Leader', team_id: IDS.teamD }])),
      psqlAsync(c.target, callUsers([{ id: IDS.raceLeaderB, employee_code: 'R-B', name: 'Race B', role: 'Leader', team_id: IDS.teamD }])),
    ]);
    assert.equal([raceA.status, raceB.status].filter((status) => status === 0).length, 1, 'exactly one concurrent Leader mutation must commit');
    assert.equal([raceA.status, raceB.status].filter((status) => status !== 0).length, 1, 'exactly one concurrent Leader mutation must fail');
    assert.equal(scalar(c.target, `SELECT count(*) FROM public.users WHERE role='Leader' AND team_id='${IDS.teamD}' AND is_active;`), '1');
    cases.push('concurrent-leader-serialization');

    const beforeUsers = scalar(c.target, 'SELECT count(*) FROM public.users;');
    runPsql(c.target, `SET kurabe.p99m2t02_rollback_approved='true';\n${rollback}`);
    assert.equal(scalar(c.target, "SELECT count(*) FROM pg_class WHERE relname='idx_users_active_leader_team';"), '0');
    assert.equal(scalar(c.target, 'SELECT count(*) FROM public.users;'), beforeUsers);
    cases.push('rollback-preserves-data');
  } finally {
    stopContainer(c);
  }

  const complete = startContainer();
  try {
    bootstrapRoles(complete.target);
    runPsqlFile(complete.target, path.join(projectRoot, 'db/bootstrap/baseline.sql'));
    runPsqlFile(complete.target, P99M1_PATH);
    runPsqlFile(complete.target, FORWARD_PATH);
    assert.equal(scalar(complete.target, "SELECT count(*) FROM pg_tables WHERE schemaname='public';"), '18');
    assert.equal(scalar(complete.target, "SELECT count(*) FROM pg_indexes WHERE indexname='idx_users_active_leader_team';"), '1');
    runPsql(complete.target, `SET kurabe.p99m2t02_rollback_approved='true';\n${rollback}`);
    assert.equal(scalar(complete.target, "SELECT count(*) FROM pg_indexes WHERE indexname='idx_users_active_leader_team';"), '0');
    cases.push('complete-baseline-replay');
  } finally {
    stopContainer(complete);
  }
  return { real: true, passed: true, tier: 'real-DB', status: 'EXECUTED', cases, target: 'disposable-postgresql-17-loopback' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`PERSONNEL_TRANSACTION PASS cases=${result.cases.length}`);
  } catch (error) {
    console.error(`PERSONNEL_TRANSACTION FAIL ${redact(error?.stack || error)}`);
    process.exitCode = 1;
  }
}
