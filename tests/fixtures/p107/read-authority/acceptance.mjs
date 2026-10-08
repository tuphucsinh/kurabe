#!/usr/bin/env node
// P107M1T03 authentic local acceptance (disposable PostgreSQL, loopback only).
// Proves, against a REAL database with the candidate migrations applied:
//   1. the candidate migration's selective ACL closure (browser roles denied,
//      service_role/postgres allowed, legacy 16-arg overload revoked);
//   2. the rollback fixture restores the CAPTURED pre-migration ACL exactly
//      (no GRANT ALL) with no partial mutation;
//   3. the 17-argument save RPC enforces appointed-Leader authority on the write
//      path (unappointed primary Leader denied; appointed multi-team Leader allowed).
// Run: node tests/fixtures/p107/read-authority/acceptance.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runBootstrap } from '../../../../scripts/db-bootstrap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../../..');
const MIGRATION = 'supabase/migrations/20261008000100_p107_read_authority.sql';
const ROLLBACK = path.join(here, 'rollback-read-authority.sql');
const CORE_RPCS = [
  ['get_active_criteria_config', 'get_active_criteria_config()'],
  ['get_active_grade_config', 'get_active_grade_config()'],
];
const WRITER17 = 'save_evaluation_round_transaction_active_only(uuid,integer,uuid,jsonb,jsonb,text,numeric,text,boolean,timestamptz,integer,uuid,text,text,boolean,uuid,uuid)';
const WRITER16 = 'save_evaluation_round_transaction_active_only(uuid,integer,uuid,jsonb,jsonb,text,numeric,text,boolean,timestamptz,integer,uuid,text,text,boolean,uuid)';

function command(file, args, options = {}) {
  return spawnSync(file, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function must(file, args, options = {}) {
  const r = command(file, args, options);
  assert.equal(r.status, 0, `${file} failed: ${String(r.stderr || '').slice(0, 400)}`);
  return String(r.stdout || '').trim();
}
function startContainer(name, database, password) {
  must('docker', ['run', '--detach', '--rm', '--name', name, '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw',
    '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', `POSTGRES_DB=${database}`,
    '--publish', '127.0.0.1::5432', 'postgres:17-alpine']);
  for (let i = 0; i < 90; i += 1) {
    if (command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', database]).status === 0) break;
    command('sleep', ['1']);
  }
  const port = must('docker', ['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
  for (let i = 0; i < 60; i += 1) {
    const probe = command('psql', ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', database, '-tAc', 'SELECT 1'], { env: { ...process.env, PGPASSFILE: '/dev/null' } });
    if (probe.status === 0 && String(probe.stdout).trim() === '1') return port;
    command('sleep', ['1']);
  }
  throw new Error('loopback PostgreSQL connection failed');
}
function psql(port, db, sql, options = {}) {
  const args = ['-X', '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--field-separator=|',
    '--host', '127.0.0.1', '--port', String(port), '--username', 'postgres', '--dbname', db];
  if (options.file) args.push('--file', options.file);
  else args.push('--command', `${options.role ? `SET ROLE ${options.role}; ` : ''}${sql}`);
  const r = command('psql', args, { env: { ...process.env, PGPASSWORD: 'x', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null' } });
  return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() };
}
function mustPsql(port, db, sql, options = {}) {
  const r = psql(port, db, sql, options);
  assert.ok(r.ok, `psql failed: ${r.err.slice(0, 500)}`);
  return r.out;
}
function aclSnapshot(port, db) {
  const rows = [];
  for (const [, ident] of CORE_RPCS) for (const role of ['anon', 'authenticated', 'service_role']) {
    rows.push(`criteria:${ident}:${role}=${mustPsql(port, db, `SELECT has_function_privilege('${role}', 'public.${ident}', 'EXECUTE');`)}`);
  }
  rows.push(`writer17:service_role=${mustPsql(port, db, `SELECT has_function_privilege('service_role', 'public.${WRITER17}', 'EXECUTE');`)}`);
  rows.push(`writer16:service_role=${mustPsql(port, db, `SELECT has_function_privilege('service_role', 'public.${WRITER16}', 'EXECUTE');`)}`);
  rows.push(`writer16:anon=${mustPsql(port, db, `SELECT has_function_privilege('anon', 'public.${WRITER16}', 'EXECUTE');`)}`);
  rows.push(`publicGrants=${mustPsql(port, db, `SELECT count(*) FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name IN ('get_active_criteria_config','get_active_grade_config') AND grantee='PUBLIC';`)}`);
  return rows.join('\n');
}
function seedPreMigrationData(port, db) {
  mustPsql(port, db, `
INSERT INTO public.grade_bands(role_group,grade,min_score,max_score,sort_order) VALUES
('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);
INSERT INTO public.criteria_groups(id,code,name,short_name,sort_order)
VALUES ('00000000-0000-4000-8000-000000000201','A','Confirmation quality','Q',0);
INSERT INTO public.criteria(id,code,name,description,applies_to,weight,group_id,sort_order,default_level_index)
VALUES ('00000000-0000-4000-8000-000000000211','A1','Confirmation criterion V1','Synthetic','employee',100,'00000000-0000-4000-8000-000000000201',0,0);
INSERT INTO public.criterion_levels(criterion_id,points,label,description,sort_order)
VALUES ('00000000-0000-4000-8000-000000000211',170,'Excellent','V1 excellent',0),('00000000-0000-4000-8000-000000000211',100,'Standard','V1 standard',1);
INSERT INTO public.criterion_audiences(criterion_id,audience)
VALUES ('00000000-0000-4000-8000-000000000211','employee'),('00000000-0000-4000-8000-000000000211','worker'),('00000000-0000-4000-8000-000000000211','management');
`);
}

function applyForwardMigrations(port, db, exclude) {
  const dir = path.join(projectRoot, 'supabase/migrations');
  let count = 0;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    const version = name.split('_')[0];
    if (version < '202609') continue;
    if (exclude && name === exclude) continue;
    const r = psql(port, db, null, { file: path.join(dir, name) });
    assert.ok(r.ok, `migration ${name} failed: ${r.err.slice(0, 400)}`);
    psql(port, db, `INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('${version}','${name}') ON CONFLICT (version) DO NOTHING;`);
    count += 1;
  }
  return count;
}

const cases = [];
const name = `kurabe-p107t03-ra-${process.pid}`;
const database = `kurabe_harness_p107t03ra${process.pid}`.replace(/[^a-z0-9_]/g, '');
const password = crypto.randomBytes(18).toString('hex');
let port;
try {
  port = startContainer(name, database, password);
  const target = { host: '127.0.0.1', port: String(port), database, user: 'postgres', password };
  process.env.PGPASSWORD = password;
  runBootstrap(target);
  cases.push('db-bootstrap-baseline+catalog+ledger');

  seedPreMigrationData(port, database);
  cases.push('pre-migration-seed');
  const preCount = applyForwardMigrations(port, database, path.basename(MIGRATION));
  cases.push(`pre-candidate-migrations-applied=${preCount}`);
  const aclBefore = aclSnapshot(port, database);

  const mig = psql(port, database, null, { file: path.join(projectRoot, MIGRATION) });
  assert.ok(mig.ok, `candidate migration failed: ${mig.err.slice(0, 500)}`);
  cases.push('candidate-migration-applied');
  const aclApplied = aclSnapshot(port, database);
  assert.notEqual(aclApplied, aclBefore, 'candidate migration must change the ACL');
  assert.match(aclApplied, /criteria:get_active_criteria_config\(\):anon=f/, 'anon criteria EXECUTE must be revoked');
  assert.match(aclApplied, /criteria:get_active_grade_config\(\):authenticated=f/, 'authenticated grade EXECUTE must be revoked');
  assert.match(aclApplied, /criteria:get_active_criteria_config\(\):service_role=t/, 'service_role criteria EXECUTE must remain');
  assert.match(aclApplied, /writer16:anon=f/, 'legacy 16-arg overload must be revoked from browser roles');
  assert.match(aclApplied, /publicGrants=0/, 'PUBLIC must hold no EXECUTE on the config readers');
  cases.push('acl-closure-verified');
  console.log('ACL_BEFORE\n' + aclBefore);
  console.log('ACL_APPLIED\n' + aclApplied);

  const rollbackSql = fs.readFileSync(ROLLBACK, 'utf8');
  assert.doesNotMatch(rollbackSql.replace(/--[^\n]*/g, ''), /GRANT\s+ALL/i, 'rollback must not contain an executable GRANT ALL');
  const blocked = psql(port, database, rollbackSql);
  assert.equal(blocked.ok, false, 'rollback must fail closed without the approval setting');
  cases.push('rollback-requires-approval');
  const approved = psql(port, database, `BEGIN; SET LOCAL kurabe.p107m1t03_rollback='approved'; ${rollbackSql}`);
  assert.ok(approved.ok, `approved rollback failed: ${approved.err.slice(0, 500)}`);
  const aclRestored = aclSnapshot(port, database);
  assert.equal(aclRestored, aclBefore, 'rollback must restore the captured pre-migration ACL exactly');
  cases.push('rollback-restores-captured-acl');

  // --- 17-arg save RPC appointed-Leader authority (driven through the RPC) ----
  const ids = {
    team: '00000000-0000-4000-8000-000000000501', employee: '00000000-0000-4000-8000-000000000502',
    sub: '00000000-0000-4000-8000-000000000503', leader: '00000000-0000-4000-8000-000000000504',
    manager: '00000000-0000-4000-8000-000000000505', period: '00000000-0000-4000-8000-000000000506',
    evaluation: '00000000-0000-4000-8000-000000000507', r1: '00000000-0000-4000-8000-000000000508',
  };
  mustPsql(port, database, `
    INSERT INTO public.teams (id, name, is_active, leader_id) VALUES ('${ids.team}', 'P107T03 Team', true, NULL);
    INSERT INTO public.users (id, employee_code, name, role, team_id, join_date, is_active, password_hash, gender) VALUES
      ('${ids.employee}', 'RA-EMP', 'RA Employee', 'Employee', '${ids.team}', '2026-01-01', true, NULL, 'Nam'),
      ('${ids.sub}', 'RA-SUB', 'RA SubLeader', 'SubLeader', '${ids.team}', '2026-01-01', true, NULL, 'Nam'),
      ('${ids.leader}', 'RA-LDR', 'RA Leader', 'Leader', '${ids.team}', '2026-01-01', true, NULL, 'Nam'),
      ('${ids.manager}', 'RA-MGR', 'RA Manager', 'Manager', '${ids.team}', '2026-01-01', true, NULL, 'Nam');
    UPDATE public.users SET subleader_id = '${ids.sub}' WHERE id = '${ids.employee}';
    INSERT INTO public.evaluation_periods (id, year, name, status, created_by) VALUES ('${ids.period}', 2099, 'P107T03 Period', 'active', '${ids.manager}');
    INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, current_round, status)
      VALUES ('${ids.evaluation}', '${ids.period}', '${ids.employee}', 'Employee', '${ids.team}', 1, 'Draft');
    INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status)
      VALUES ('${ids.r1}', '${ids.evaluation}', 1, '${ids.sub}', 'SubLeader', 'NotStarted');
  `);
  const writer = WRITER17.replace(/\(.*/, '');
  const activeCriteria = mustPsql(port, database, `SELECT id FROM public.criteria_config_versions WHERE is_active ORDER BY version_no DESC LIMIT 1;`);
  const activeGrade = mustPsql(port, database, `SELECT id FROM public.grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1;`);
  assert.ok(activeCriteria && activeGrade, 'active criteria/grade config versions must exist');
  const submitRound1 = (nextLeaderId) => `SELECT * FROM public.${writer}('${ids.evaluation}'::uuid, 1, '${ids.sub}'::uuid, '{}'::jsonb, '{}'::jsonb, '', 0, 'Pending', true, now(), 2, '${nextLeaderId}'::uuid, 'Leader', 'Submitted', false, '${activeCriteria}'::uuid, '${activeGrade}'::uuid);`;
  const saveRound2 = () => `SELECT * FROM public.${writer}('${ids.evaluation}'::uuid, 2, '${ids.leader}'::uuid, '{}'::jsonb, '{}'::jsonb, '', 0, 'Pending', false, now(), NULL::integer, NULL::uuid, NULL::text, NULL::text, false, '${activeCriteria}'::uuid, '${activeGrade}'::uuid);`;

  // A. an unappointed team Leader may not be appointed as the next evaluator
  const denyNext = psql(port, database, `SET ROLE service_role; ${submitRound1(ids.leader)}`);
  assert.equal(denyNext.ok, false, 'unappointed team Leader must be rejected as next evaluator');
  assert.match(denyNext.err, /appointed Leader/i, 'next-evaluator deny must cite the appointed-Leader rule');
  cases.push('rpc-unappointed-next-leader-denied');

  // B. the appointed Leader is accepted as next evaluator (independent of primary team)
  mustPsql(port, database, `UPDATE public.teams SET leader_id = '${ids.leader}' WHERE id = '${ids.team}';`);
  const allowNext = psql(port, database, `SET ROLE service_role; ${submitRound1(ids.leader)}`);
  assert.ok(allowNext.ok, `appointed Leader must be accepted as next evaluator: ${allowNext.err.slice(0, 400)}`);
  cases.push('rpc-appointed-next-leader-allowed');

  // C. the appointed Leader may act on the round-2 save path
  const allowAct = psql(port, database, `SET ROLE service_role; ${saveRound2()}`);
  assert.ok(allowAct.ok, `appointed Leader must be allowed to save round 2: ${allowAct.err.slice(0, 400)}`);
  cases.push('rpc-appointed-leader-save-allowed');

  // D. removing the teams.leader_id pointer denies the same actor (no primary fallback)
  mustPsql(port, database, `UPDATE public.teams SET leader_id = NULL WHERE id = '${ids.team}';`);
  const denyAct = psql(port, database, `SET ROLE service_role; ${saveRound2()}`);
  assert.equal(denyAct.ok, false, 'unappointed Leader must be denied on the save path');
  assert.match(denyAct.err, /appointed Leader/i, 'actor deny must cite the appointed-Leader rule');
  cases.push('rpc-unappointed-leader-save-denied');

  // E. a revoked/inactive actor is denied on the save path (same-session revocation)
  mustPsql(port, database, `UPDATE public.teams SET leader_id = NULL WHERE id = '${ids.team}';`);
  mustPsql(port, database, `UPDATE public.users SET is_active = false WHERE id = '${ids.leader}';`);
  const denyRevoked = psql(port, database, `SET ROLE service_role; ${saveRound2()}`);
  assert.equal(denyRevoked.ok, false, 'revoked/inactive actor must be denied on the save path');
  assert.match(denyRevoked.err, /missing or inactive/i, 'deny must cite the inactive-actor rule');
  cases.push('rpc-revoked-actor-save-denied');
  const stillRevoked = mustPsql(port, database, `SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id='${ids.evaluation}' AND round=2 AND submitted_at IS NOT NULL;`);
  assert.equal(stillRevoked, '0', 'a denied actor must leave the DB graph unchanged');
  cases.push('rpc-revoked-actor-left-db-unchanged');

  console.log(`P107T03_RUNTIME_ACCEPTANCE PASS cases=${cases.length}`);
  console.log(cases.join('\n'));
} finally {
  command('docker', ['rm', '--force', name]);
}
