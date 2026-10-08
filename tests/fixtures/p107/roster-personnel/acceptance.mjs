#!/usr/bin/env node
// P107M1T05 authentic local acceptance (disposable PostgreSQL, loopback only).
// Proves, against a REAL database with the prior migrations applied, that the candidate
// roster/personnel migration:
//   1. applies cleanly and yields exactly the declared object graph (functions, the new
//      3-argument overload, the bounded immutable label table with RLS + immutable
//      trigger, and a closed ACL for anon/authenticated);
//   2. can be rolled back to the EXACT captured pre-migration catalog graph (digest equal)
//      and re-applied to the EXACT post-apply catalog graph (digest equal).
// Run: node tests/fixtures/p107/roster-personnel/acceptance.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runBootstrap } from '../../../../scripts/db-bootstrap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../../..');
const MIGRATION = 'supabase/migrations/20261008000200_p107_roster_personnel.sql';
const NEW_OVERLOAD = 'apply_personnel_transaction(jsonb,jsonb,uuid)';

function command(file, args, options = {}) {
  return spawnSync(file, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function must(file, args, options = {}) {
  const r = command(file, args, options);
  assert.equal(r.status, 0, `${file} failed: ${String(r.stderr || '').slice(0, 400)}`);
  return String(r.stdout || '').trim();
}
function psqlEnv() { return { ...process.env, PGPASSWORD: 'x', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null' }; }
function psqlArgs(port, db) {
  return ['-X', '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--field-separator=|',
    '--host', '127.0.0.1', '--port', String(port), '--username', 'postgres', '--dbname', db];
}
function psql(port, db, sql, opts = {}) {
  const r = command('psql', [...psqlArgs(port, db), ...(opts.file ? ['--file', opts.file] : ['--command', sql])], { env: psqlEnv() });
  return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() };
}
function mustPsql(port, db, sql) {
  const r = psql(port, db, sql);
  assert.ok(r.ok, `psql failed: ${r.err.slice(0, 500)}`);
  return r.out;
}
function startContainer(name, database, password) {
  must('docker', ['run', '--detach', '--rm', '--name', name, '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw',
    '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', `POSTGRES_DB=${database}`,
    '--publish', '127.0.0.1::5432', 'postgres:17-alpine']);
  const port = must('docker', ['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
  for (let i = 0; i < 60; i += 1) {
    const probe = command('psql', ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', database, '-tAc', 'SELECT 1'],
      { env: { ...process.env, PGPASSFILE: '/dev/null' } });
    if (probe.status === 0 && String(probe.stdout).trim() === '1') return port;
    command('sleep', ['1']);
  }
  throw new Error('loopback PostgreSQL connection failed');
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
    const rr = command('psql', [...psqlArgs(port, db), '--file', path.join(dir, name)], { env: psqlEnv() });
    assert.equal(rr.status, 0, `migration ${name} failed: ${String(rr.stderr).slice(0, 400)}`);
    psql(port, db, `INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('${version}','${name}') ON CONFLICT (version) DO NOTHING;`);
    count += 1;
  }
  return count;
}
const GRAPH_SQL = `
SELECT COALESCE(string_agg(line, E'\\n' ORDER BY line), '') FROM (
  SELECT 'fn:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')=' || md5(pg_get_functiondef(p.oid)) AS line
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('create_evaluation_period_atomic','validate_personnel_graph_trigger','apply_personnel_transaction','reject_history_label_mutation')
  UNION ALL
  SELECT 'tbl:' || c.relname || '|rls=' || c.relrowsecurity::text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'evaluation_history_labels'
  UNION ALL
  SELECT 'trg:' || t.tgname || '|' || c.relname
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND NOT t.tgisinternal AND c.relname = 'evaluation_history_labels'
  UNION ALL
  SELECT 'acl:' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || r
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
   WHERE n.nspname = 'public' AND p.proname IN ('create_evaluation_period_atomic','apply_personnel_transaction','reject_history_label_mutation')
     AND has_function_privilege(r, p.oid, 'EXECUTE')
  UNION ALL
  SELECT 'acl:table:' || c.relname || ':' || r
    FROM pg_class c
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
   WHERE c.oid = to_regclass('public.evaluation_history_labels')
     AND has_table_privilege(r, c.oid, 'SELECT')
) s;
`;
function graphDigest(port, db) {
  return crypto.createHash('sha256').update(mustPsql(port, db, GRAPH_SQL)).digest('hex');
}

// ---------------------------------------------------------------- race helpers
// FINDING B: real two-connection race cases. One connection holds a window via
// `BEGIN; <write>; SELECT pg_sleep(2); COMMIT;` while the other executes its call
// inside that window. Every denied call is checked for ZERO PARTIAL WRITE by
// comparing the relevant row counts / row-graph digest before and after.
function psqlAsync(port, db, sql) {
  return new Promise((resolve) => {
    const child = spawn('psql', [...psqlArgs(port, db)], { env: psqlEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.stdin.end(sql);
    child.once('close', (status) => resolve({ status, out: stdout.trim(), err: stderr.trim() }));
    child.once('error', (error) => resolve({ status: null, out: stdout.trim(), err: String(error?.message || error) }));
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function raceFail(err) { return String(err || '').replace(/\s+/g, ' ').slice(0, 400); }

const RACE = Object.freeze({
  actor: '00000000-0000-4000-a000-00000000a001',
  target: '00000000-0000-4000-a000-00000000a002',
  leader: '00000000-0000-4000-a000-00000000a003',
  sub: '00000000-0000-4000-a000-00000000a004',
  emp: '00000000-0000-4000-a000-00000000a005',
  worker: '00000000-0000-4000-a000-00000000a006',
  teamA: '00000000-0000-4000-a000-00000000a00a',
  teamB: '00000000-0000-4000-a000-00000000a00b',
});

// Row-graph digest over the personnel/evaluation rows (content based, no
// timestamps) so a denied call can be proven to leave the graph byte-identical.
const ROW_GRAPH_SQL = `
SELECT COALESCE(string_agg(line, E'\\n' ORDER BY line), '') FROM (
  SELECT 'p:'||id||'|'||year||'|'||name||'|'||status||'|'||COALESCE(created_by::text,'') AS line FROM public.evaluation_periods
  UNION ALL SELECT 'e:'||id||'|'||period_id||'|'||employee_id||'|'||employee_role||'|'||COALESCE(team_id::text,'')||'|'||status FROM public.evaluations
  UNION ALL SELECT 'r:'||id||'|'||evaluation_id||'|'||round||'|'||COALESCE(evaluator_id::text,'')||'|'||evaluator_role||'|'||status||'|'||COALESCE(submitted_at::text,'') FROM public.evaluation_rounds
  UNION ALL SELECT 'u:'||id||'|'||employee_code||'|'||name||'|'||role||'|'||COALESCE(team_id::text,'')||'|'||is_active||'|'||COALESCE(subleader_id::text,'') FROM public.users
  UNION ALL SELECT 't:'||id||'|'||name||'|'||COALESCE(leader_id::text,'')||'|'||is_active FROM public.teams
) s;
`;
function raceRowDigest(port, db) {
  return crypto.createHash('sha256').update(mustPsql(port, db, ROW_GRAPH_SQL)).digest('hex');
}
function raceRowCounts(port, db) {
  return mustPsql(port, db, `
    SELECT (SELECT count(*) FROM public.evaluation_periods)::text || '|' ||
           (SELECT count(*) FROM public.evaluations)::text || '|' ||
           (SELECT count(*) FROM public.evaluation_rounds)::text || '|' ||
           (SELECT count(*) FROM public.evaluation_history_labels)::text || '|' ||
           (SELECT count(*) FROM public.users)::text || '|' ||
           (SELECT count(*) FROM public.teams)::text;`);
}
function raceReset(port, db) {
  // TRUNCATE bypasses the row-level round-transition guards (which deny direct
  // row deletes); it is the supported way to clear the evaluation graph here.
  mustPsql(port, db, `
TRUNCATE public.evaluation_history_labels, public.evaluation_responses, public.evaluation_rounds, public.evaluations, public.evaluation_periods CASCADE;
DROP TABLE IF EXISTS public.p107_race_payload;`);
}
function raceSeedRoster(port, db) {
  const R = RACE;
  mustPsql(port, db, `
BEGIN;
INSERT INTO public.teams (id, name, is_active) VALUES
  ('${R.teamA}','Race Team A', true),
  ('${R.teamB}','Race Team B', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active;
INSERT INTO public.users (id, employee_code, name, role, team_id, is_active, subleader_id, gender) VALUES
  ('${R.actor}','RACE-ACTOR','Race Actor','Manager', NULL, true, NULL, 'Nữ'),
  ('${R.target}','RACE-TARGET','Race Target Manager','Manager', NULL, true, NULL, 'Nữ'),
  ('${R.leader}','RACE-LEAD','Race Leader','Leader','${R.teamA}', true, NULL, 'Nữ'),
  ('${R.sub}','RACE-SUB','Race SubLeader','SubLeader','${R.teamA}', true, NULL, 'Nữ'),
  ('${R.emp}','RACE-EMP','Race Employee','Employee','${R.teamA}', true, '${R.sub}', 'Nữ'),
  ('${R.worker}','RACE-WRK','Race Worker','Worker','${R.teamA}', true, '${R.sub}', 'Nữ')
ON CONFLICT (id) DO UPDATE SET
  employee_code = EXCLUDED.employee_code, name = EXCLUDED.name, role = EXCLUDED.role,
  team_id = EXCLUDED.team_id, is_active = EXCLUDED.is_active,
  subleader_id = EXCLUDED.subleader_id, gender = EXCLUDED.gender;
UPDATE public.teams SET leader_id = '${R.leader}' WHERE id = '${R.teamA}';
COMMIT;`);
}
function raceActiveRosterCount(port, db) {
  return Number(mustPsql(port, db, 'SELECT count(*) FROM public.users WHERE is_active;'));
}
// Builds the period payload (evaluations + authoritative round-1 rounds) for the
// CURRENT active roster into a table so both race connections share one snapshot.
function raceBuildPayload(port, db) {
  mustPsql(port, db, `
DROP TABLE IF EXISTS public.p107_race_payload;
CREATE TABLE public.p107_race_payload AS
SELECT
  jsonb_agg(jsonb_build_object(
    'employee_id', u.id, 'employee_role', u.role, 'team_id', u.team_id,
    'status','NotStarted','current_round',1,'created_at', now(), 'updated_at', now()
  ) ORDER BY u.id) AS evals,
  jsonb_agg(jsonb_build_object(
    'employee_id', u.id, 'round', 1, 'evaluator_id', r.evaluator_id,
    'evaluator_role', r.evaluator_role, 'scores','{}'::jsonb, 'notes','{}'::jsonb,
    'total_score',0,'grade','Pending','status','NotStarted','created_at', now()
  ) ORDER BY u.id) AS rounds
FROM public.users u
LEFT JOIN LATERAL public.resolve_personnel_evaluator(u.id, u.role, u.team_id, 1) r ON TRUE
WHERE u.is_active;`);
}
function raceCreateCall(year, periodName) {
  return `SELECT public.create_evaluation_period_atomic('${periodName}'::text, ${year}, '${RACE.actor}'::uuid, now(), p.evals, p.rounds) FROM public.p107_race_payload p;`;
}
function countOne(port, db, sql) {
  return Number(mustPsql(port, db, sql));
}

const cases = [];
const name = `kurabe-p107t05-rp-${process.pid}`;
const database = `kurabe_harness_p107t05rp${process.pid}`.replace(/[^a-z0-9_]/g, '');
const password = crypto.randomBytes(18).toString('hex');
let port;
try {
  port = startContainer(name, database, password);
  process.env.PGPASSWORD = password;
  runBootstrap({ host: '127.0.0.1', port: String(port), database, user: 'postgres', password });
  cases.push('db-bootstrap-baseline+catalog+ledger');
  seedPreMigrationData(port, database);
  const applied = applyForwardMigrations(port, database, path.basename(MIGRATION));
  cases.push(`prior-migrations-applied=${applied}`);

  const preDigest = graphDigest(port, database);
  const preSigs = mustPsql(port, database, `
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('create_evaluation_period_atomic','validate_personnel_graph_trigger','apply_personnel_transaction','reject_history_label_mutation')
     ORDER BY 1;`).split('\n').filter(Boolean);
  const preDefs = preSigs.map((sig) => ({ sig, def: mustPsql(port, database, `SELECT pg_get_functiondef('${sig}'::regprocedure);`) }));
  const preAcl = preDefs.map(({ sig }) => ({ sig, roles: mustPsql(port, database, `SELECT string_agg(r, ',' ORDER BY r) FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_function_privilege(r, '${sig}'::regprocedure, 'EXECUTE');`) }));
  // The 3-argument overload is a DECLARED PREREQUISITE of this migration: its preflight
  // raises P107M1T05_PREFLIGHT_MISSING_RPC when `apply_personnel_transaction(jsonb,jsonb,uuid)`
  // is absent. It must therefore pre-exist, and it is captured/restored like every other
  // replaced function. Compare signature text with whitespace normalised (regprocedure
  // rendering of the argument list is not guaranteed to include spaces).
  const normSig = (s) => s.replace(/\s+/g, '');
  assert.ok(preSigs.map(normSig).includes(normSig(NEW_OVERLOAD)), 'the 3-argument overload must pre-exist (migration preflight requires it)');
  cases.push(`pre-state-captured-functions=${preDefs.length}`);

  const applyResult = psql(port, database, null, { file: path.join(projectRoot, MIGRATION) });
  assert.ok(applyResult.ok, `candidate migration failed: ${applyResult.err.slice(0, 600)}`);
  cases.push('candidate-migration-applied');
  const postDigest = graphDigest(port, database);
  assert.notEqual(postDigest, preDigest, 'apply must change the catalog graph');
  assert.ok(mustPsql(port, database, `SELECT to_regprocedure('public.${NEW_OVERLOAD}') IS NOT NULL;`) === 't', '3-arg overload must exist');
  assert.ok(mustPsql(port, database, `SELECT to_regclass('public.evaluation_history_labels') IS NOT NULL;`) === 't', 'label table must exist');
  assert.ok(mustPsql(port, database, `SELECT relrowsecurity FROM pg_class WHERE oid = 'public.evaluation_history_labels'::regclass;`) === 't', 'RLS must be enabled');
  assert.ok(mustPsql(port, database, `SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='evaluation_history_labels' AND t.tgname='evaluation_history_labels_immutable' AND NOT t.tgisinternal;`) === '1', 'immutable trigger must exist');
  for (const fn of ['create_evaluation_period_atomic', 'validate_personnel_graph_trigger', 'apply_personnel_transaction', 'reject_history_label_mutation']) {
    assert.ok(mustPsql(port, database, `SELECT count(*) FROM pg_description d JOIN pg_proc p ON p.oid=d.objoid WHERE p.proname='${fn}' AND d.description LIKE 'kurabe:p107m1t05:%';`) !== '0', `${fn} must carry the P107M1T05 provenance comment`);
  }
  assert.ok(mustPsql(port, database, `SELECT has_function_privilege('anon', 'public.${NEW_OVERLOAD}', 'EXECUTE');`) === 'f', 'anon must not execute the new overload');
  assert.ok(mustPsql(port, database, `SELECT has_function_privilege('authenticated', 'public.${NEW_OVERLOAD}', 'EXECUTE');`) === 'f', 'authenticated must not execute the new overload');
  assert.ok(mustPsql(port, database, `SELECT has_function_privilege('service_role', 'public.${NEW_OVERLOAD}', 'EXECUTE');`) === 't', 'service_role must execute the new overload');
  assert.ok(mustPsql(port, database, `SELECT has_table_privilege('anon', 'public.evaluation_history_labels', 'SELECT');`) === 'f', 'anon must not read the label table');
  cases.push('post-apply-graph-and-acl-verified');

  const rollback = [
    `DROP TRIGGER IF EXISTS evaluation_history_labels_immutable ON public.evaluation_history_labels;`,
    `DROP FUNCTION IF EXISTS public.reject_history_label_mutation();`,
    `DROP TABLE IF EXISTS public.evaluation_history_labels;`,
    `DROP FUNCTION IF EXISTS public.${NEW_OVERLOAD};`,
    ...preDefs.map(({ def }) => (def.trimEnd().endsWith(';') ? def : `${def};`)),
    ...preAcl.flatMap(({ sig, roles }) => [
      `REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated, service_role, postgres;`,
      ...(roles ? [`GRANT EXECUTE ON FUNCTION ${sig} TO ${roles};`] : []),
    ]),
  ].join('\n');
  const rb = psql(port, database, `BEGIN;\n${rollback}\nCOMMIT;`);
  assert.ok(rb.ok, `rollback failed: ${rb.err.slice(0, 600)}`);
  const rolledDigest = graphDigest(port, database);
  assert.equal(rolledDigest, preDigest, 'rollback must restore the exact captured pre-migration graph');
  cases.push('rollback-restores-captured-graph');

  const reapply = psql(port, database, null, { file: path.join(projectRoot, MIGRATION) });
  assert.ok(reapply.ok, `reapply failed: ${reapply.err.slice(0, 600)}`);
  const reappliedDigest = graphDigest(port, database);
  assert.equal(reappliedDigest, postDigest, 'reapply must reproduce the exact post-apply graph');
  cases.push('reapply-reproduces-post-apply-graph');

  // ---------------------------------------------------------------- FINDING B
  // Real two-connection race cases against the freshly re-applied migration.
  // One connection holds a window (BEGIN; <write>; SELECT pg_sleep(2); COMMIT;)
  // while the other call executes inside it. Every denied call is proven to have
  // written nothing (relevant row counts / row-graph digest before vs after).

  // Control: a single create with the snapshot payload must succeed, so the race
  // outcomes below are attributable to concurrency and not to a malformed payload.
  raceReset(port, database);
  raceSeedRoster(port, database);
  raceBuildPayload(port, database);
  const rosterN = raceActiveRosterCount(port, database);
  assert.ok(rosterN > 0, 'race control roster must be non-empty');
  const controlCreate = psql(port, database, raceCreateCall(2091, 'Kỳ 2091'));
  assert.ok(controlCreate.ok, `p107 race control create failed: ${raceFail(controlCreate.err)}`);
  assert.equal(countOne(port, database, "SELECT count(*) FROM public.evaluation_periods WHERE status='active';"), 1, 'control create => one Active period');
  assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluations;'), rosterN, 'control create => one evaluation per active user');
  assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluation_rounds;'), rosterN, 'control create => one round per active user');
  cases.push(`p107-race-control-single-create roster=${rosterN}`);

  // B1: create/create for the same period. Exactly one Active period survives;
  // the other call is denied by the single-active guard and writes nothing.
  raceReset(port, database);
  raceSeedRoster(port, database);
  raceBuildPayload(port, database);
  const before1 = raceRowCounts(port, database);
  const holder1 = psqlAsync(port, database, `BEGIN;\n${raceCreateCall(2092, 'Kỳ 2092')}\nSELECT pg_sleep(2);\nCOMMIT;`);
  await sleep(300);
  const contender1 = psqlAsync(port, database, raceCreateCall(2092, 'Kỳ 2092'));
  const [h1, c1] = await Promise.all([holder1, contender1]);
  const createRuns1 = [h1, c1];
  assert.equal(createRuns1.filter((r) => r.status === 0).length, 1, 'B1 exactly one create commits');
  const denied1 = createRuns1.filter((r) => r.status !== 0);
  assert.equal(denied1.length, 1, 'B1 exactly one create is denied');
  assert.match(`${denied1[0].out}\n${denied1[0].err}`, /idx_evaluation_periods_single_active|duplicate key|23505/, 'B1 denial must be the single-active guard');
  const guard1 = (`${denied1[0].out}\n${denied1[0].err}`.match(/idx_evaluation_periods_single_active|duplicate key|23505/) || ['single-active'])[0];
  assert.equal(countOne(port, database, "SELECT count(*) FROM public.evaluation_periods WHERE status='active';"), 1, 'B1 exactly one Active period');
  assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluation_periods;'), 1, 'B1 the denied create wrote no period');
  assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluations;'), rosterN, 'B1 the denied create wrote no evaluation');
  assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluation_rounds;'), rosterN, 'B1 the denied create wrote no round');
  cases.push(`p107-race-create-create-single-active guard=${guard1} roster=${rosterN} before=${before1} after=${raceRowCounts(port, database)}`);

  // B2: roster churn committed inside the create RPC's validation window. Either
  // the create denies against the changed roster (zero partial write), or it
  // serializes and commits exactly one valid graph — never a partial write.
  raceReset(port, database);
  raceSeedRoster(port, database);
  raceBuildPayload(port, database);
  const before2 = raceRowCounts(port, database);
  const churn2 = psqlAsync(port, database, `BEGIN;\nUPDATE public.users SET is_active = false WHERE id = '${RACE.emp}';\nSELECT pg_sleep(2);\nCOMMIT;`);
  await sleep(300);
  const create2 = psqlAsync(port, database, raceCreateCall(2093, 'Kỳ 2093'));
  const [ch2, c2] = await Promise.all([churn2, create2]);
  assert.equal(ch2.status, 0, `B2 roster churn must commit: ${raceFail(ch2.err)}`);
  assert.equal(mustPsql(port, database, `SELECT is_active FROM public.users WHERE id='${RACE.emp}';`), 'f', 'B2 churn is durably committed');
  if (c2.status === 0) {
    assert.equal(countOne(port, database, "SELECT count(*) FROM public.evaluation_periods WHERE status='active';"), 1, 'B2 serialized create => one Active period');
    assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluations;'), rosterN, 'B2 serialized create => complete evaluation graph');
    assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluation_rounds;'), rosterN, 'B2 serialized create => complete round graph');
    cases.push(`p107-race-roster-churn-vs-create committed-one-valid-graph roster=${rosterN}`);
  } else {
    assert.match(`${c2.out}\n${c2.err}`, /P107_ROSTER_(COUNT_MISMATCH|ID_MISMATCH|ATTR_MISMATCH|SUBLEADER_INVALID|ASSIGNMENT_MISMATCH)/, 'B2 denial must be a roster graph guard');
    const guard2 = (`${c2.out}\n${c2.err}`.match(/P107_ROSTER_[A-Z_]+/) || ['P107_ROSTER_GUARD'])[0];
    assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluation_periods;'), 0, 'B2 denied create wrote no period');
    assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluations;'), 0, 'B2 denied create wrote no evaluation');
    assert.equal(countOne(port, database, 'SELECT count(*) FROM public.evaluation_rounds;'), 0, 'B2 denied create wrote no round');
    cases.push(`p107-race-roster-churn-vs-create denied-zero-partial-write guard=${guard2} before=${before2} after=${raceRowCounts(port, database)}`);
  }

  // B3: deactivate a user who holds a live actionable evaluator assignment, while
  // a concurrent graph write holds the window. The deactivation must deny and
  // leave the entire row graph byte-identical (digest + counts unchanged).
  raceReset(port, database);
  raceSeedRoster(port, database);
  raceBuildPayload(port, database);
  const seedCreate3 = psql(port, database, raceCreateCall(2094, 'Kỳ 2094'));
  assert.ok(seedCreate3.ok, `B3 seed create failed: ${raceFail(seedCreate3.err)}`);
  assert.equal(
    countOne(port, database, `SELECT count(*) FROM public.evaluation_rounds r JOIN public.evaluations e ON e.id=r.evaluation_id JOIN public.evaluation_periods p ON p.id=e.period_id WHERE r.evaluator_id='${RACE.target}' AND p.status='active' AND e.status IN ('NotStarted','Draft') AND r.status IN ('NotStarted','Draft') AND r.submitted_at IS NULL;`),
    1,
    'B3 target holds exactly one live actionable assignment'
  );
  const before3digest = raceRowDigest(port, database);
  const before3counts = raceRowCounts(port, database);
  const holder3 = psqlAsync(port, database, `BEGIN;\nUPDATE public.teams SET is_active = is_active WHERE id = '${RACE.teamB}';\nSELECT pg_sleep(2);\nCOMMIT;`);
  await sleep(300);
  const deactivate3 = psqlAsync(port, database, `SELECT public.apply_personnel_transaction(jsonb_build_array(jsonb_build_object('id','${RACE.target}','is_active', false)), NULL, '${RACE.actor}'::uuid);`);
  const [h3, d3] = await Promise.all([holder3, deactivate3]);
  assert.equal(h3.status, 0, `B3 holder must commit: ${raceFail(h3.err)}`);
  assert.notEqual(d3.status, 0, 'B3 deactivation of a live actionable evaluator must be denied');
  assert.match(`${d3.out}\n${d3.err}`, /P107_DELETE_LIVE_EVALUATOR/, 'B3 denial must be the live-evaluator guard');
  const guard3 = (`${d3.out}\n${d3.err}`.match(/P107_DELETE_LIVE_EVALUATOR/) || ['P107_DELETE_LIVE_EVALUATOR'])[0];
  assert.equal(mustPsql(port, database, `SELECT is_active FROM public.users WHERE id='${RACE.target}';`), 't', 'B3 target stays active');
  const after3digest = raceRowDigest(port, database);
  const after3counts = raceRowCounts(port, database);
  assert.equal(after3digest, before3digest, 'B3 denied deactivation left the row graph unchanged (zero partial write)');
  assert.equal(after3counts, before3counts, 'B3 denied deactivation left row counts unchanged (zero partial write)');
  cases.push(`p107-race-deactivate-live-evaluator guard=${guard3} counts=${after3counts} digest=${after3digest.slice(0, 12)}`);

  console.log(`P107T05_RUNTIME_ACCEPTANCE PASS cases=${cases.length}`);
  console.log(cases.join('\n'));
  console.log(`PRE_DIGEST=${preDigest}`);
  console.log(`POST_DIGEST=${postDigest}`);
} finally {
  command('docker', ['rm', '--force', name]);
}
