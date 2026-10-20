#!/usr/bin/env node
// P107M1T07 authentic local acceptance (disposable PostgreSQL, loopback only).
// Proves, against a REAL database with the prior migrations applied, that the candidate
// lifecycle-coherence migration:
//   1. applies cleanly and yields exactly the declared object graph (the replaced
//      return/save RPCs with their P107M1T07 provenance comments and a closed ACL for
//      PUBLIC/anon/authenticated while service_role keeps EXECUTE);
//   2. can be rolled back to the EXACT captured pre-migration catalog graph (digest equal)
//      and re-applied to the EXACT post-apply catalog graph (digest equal);
//   3. DRIVES the real replaced RPCs on a seeded personnel/evaluation graph to assert the
//      central claim end-to-end: V1 submit -> return -> V2 config change -> resubmit
//      succeeds WITHOUT CONFLICTING_NEXT_ROUND and reconciles the mutable next round,
//      a genuine concurrent edit is denied with the guard, no evaluation_transition_context
//      row leaks on any success path, and committed history is never rewritten.
// Run: node tests/fixtures/p107/lifecycle-coherence/db-acceptance.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runBootstrap } from '../../../../scripts/db-bootstrap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../../..');
export const MIGRATION = 'supabase/migrations/20261008000300_p107_lifecycle_coherence.sql';
const RETURN_RPC = 'return_evaluation_round_transaction(uuid,integer,uuid,text)';
const SAVE_RPC = 'save_evaluation_round_transaction_active_only(uuid,integer,uuid,jsonb,jsonb,text,numeric,text,boolean,timestamptz,integer,uuid,text,text,boolean,uuid,uuid)';
const FUNCS = "'return_evaluation_round_transaction','save_evaluation_round_transaction_active_only'";

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
export function filterPredecessorMigrations(files, candidate = path.basename(MIGRATION)) {
  const candidateName = path.basename(candidate);
  const candidateVersion = candidateName.split('_')[0];
  return files
    .filter((n) => n.endsWith('.sql'))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
    .filter((file) => {
      const name = path.basename(file);
      const version = name.split('_')[0];
      if (version < '202609') return false;
      if (candidateName && (name >= candidateName || version >= candidateVersion)) return false;
      return true;
    });
}

export function applyForwardMigrations(port, db, candidate = path.basename(MIGRATION)) {
  const dir = path.join(projectRoot, 'supabase/migrations');
  const files = filterPredecessorMigrations(fs.readdirSync(dir), candidate);
  let count = 0;
  for (const name of files) {
    const version = name.split('_')[0];
    const rr = command('psql', [...psqlArgs(port, db), '--file', path.join(dir, name)], { env: psqlEnv() });
    assert.equal(rr.status, 0, `migration ${name} failed: ${String(rr.stderr).slice(0, 400)}`);
    psql(port, db, `INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('${version}','${name}') ON CONFLICT (version) DO NOTHING;`);
    count += 1;
  }
  return count;
}
// ACL digest now covers PUBLIC (grantee 0) as well as the named Supabase roles, so a
// re-grant to PUBLIC cannot hide behind a closed-role-only digest.
const PUBLIC_ACL_EXPR = `(EXISTS (
      SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ))::text`;
const GRAPH_SQL = `
SELECT COALESCE(string_agg(line, E'\\n' ORDER BY line), '') FROM (
  SELECT 'fn:' || p.oid::regprocedure::text || '=' || md5(pg_get_functiondef(p.oid)) AS line
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN (${FUNCS})
  UNION ALL
  SELECT 'cmt:' || p.proname || '=' || COALESCE(obj_description(p.oid, 'pg_proc'), 'none')
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN (${FUNCS})
  UNION ALL
  SELECT 'acl:' || p.oid::regprocedure::text || ':' || r || '=' || has_function_privilege(r, p.oid, 'EXECUTE')::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
   WHERE n.nspname = 'public' AND p.proname IN (${FUNCS})
  UNION ALL
  SELECT 'acl:' || p.oid::regprocedure::text || ':PUBLIC=' || ${PUBLIC_ACL_EXPR}
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN (${FUNCS})
) s;
`;
function graphDigest(port, db) {
  return crypto.createHash('sha256').update(mustPsql(port, db, GRAPH_SQL)).digest('hex');
}
function publicHasExecute(port, db, sig) {
  return mustPsql(port, db, `SELECT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') FROM pg_proc p WHERE p.oid = 'public.${sig}'::regprocedure;`);
}

// ---------------------------------------------------------------------------
// Seeded lifecycle graph + real-RPC driver (F2).
// ---------------------------------------------------------------------------
const ID = {
  period: '00000000-0000-4000-8000-000000001001',
  team: '00000000-0000-4000-8000-000000001101',
  manager: '00000000-0000-4000-8000-000000001201',
  leader: '00000000-0000-4000-8000-000000001202',
  subleader: '00000000-0000-4000-8000-000000001203',
  empA: '00000000-0000-4000-8000-000000001204',
  empB: '00000000-0000-4000-8000-000000001205',
  empC: '00000000-0000-4000-8000-000000001206',
  evalA: '00000000-0000-4000-8000-000000001301',
  evalB: '00000000-0000-4000-8000-000000001302',
  evalC: '00000000-0000-4000-8000-000000001303',
  roundA1: '00000000-0000-4000-8000-000000001401',
  roundB1: '00000000-0000-4000-8000-000000001402',
  roundB2: '00000000-0000-4000-8000-000000001403',
  roundC1: '00000000-0000-4000-8000-000000001404',
  roundC2: '00000000-0000-4000-8000-000000001405',
  ccvV2: '00000000-0000-4000-8000-000000002001',
  gbvV2: '00000000-0000-4000-8000-000000002002',
};
function activeConfigIds(port, db) {
  return {
    c1: mustPsql(port, db, `SELECT id FROM public.criteria_config_versions WHERE is_active ORDER BY version_no DESC LIMIT 1;`),
    g1: mustPsql(port, db, `SELECT id FROM public.grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1;`),
  };
}
function seedLifecycleGraph(port, db, { c1, g1 }) {
  // Directly-seeded progressed rounds (Submitted/Draft) are only permitted through
  // the same transaction-local transition context the RPC uses — mirroring the
  // established evaluation-transition harness. One context covers the seed tx.
  const transitionCtxKey = '00000000-0000-4000-8000-000000009999';
  const r = psql(port, db, `
BEGIN;
INSERT INTO public.evaluation_periods(id, year, name, status, created_by, created_at, target_rate, target_grade)
VALUES ('${ID.period}', 2026, 'P107M1T07 seed period', 'active', NULL, now(), 75, 'AB');

INSERT INTO public.teams(id, name, leader_id, is_active)
VALUES ('${ID.team}', 'P107M1T07 seed team', NULL, true);

INSERT INTO public.users(id, employee_code, name, role, team_id, subleader_id, is_active)
VALUES
 ('${ID.manager}','P107MGR','Seed Manager','Manager',NULL,NULL,true),
 ('${ID.leader}','P107LDR','Seed Leader','Leader','${ID.team}',NULL,true),
 ('${ID.subleader}','P107SUB','Seed SubLeader','SubLeader','${ID.team}',NULL,true),
 ('${ID.empA}','P107EA','Seed Employee A','Employee','${ID.team}','${ID.subleader}',true),
 ('${ID.empB}','P107EB','Seed Worker B','Worker','${ID.team}','${ID.subleader}',true),
 ('${ID.empC}','P107EC','Seed Employee C','Employee','${ID.team}','${ID.subleader}',true);

UPDATE public.teams SET leader_id='${ID.leader}' WHERE id='${ID.team}';

-- Evaluation A (draft round 1): drives V1 submit -> return -> V2 config change -> resubmit.
INSERT INTO public.evaluations(id, period_id, employee_id, employee_role, team_id, current_round, status, created_at, updated_at)
VALUES ('${ID.evalA}','${ID.period}','${ID.empA}','Employee','${ID.team}',1,'Draft', now(), now());

-- Evaluation B: seeded WITH a submitted round 1 (immutable-history witness).
INSERT INTO public.evaluations(id, period_id, employee_id, employee_role, team_id, current_round, status, created_at, updated_at)
VALUES ('${ID.evalB}','${ID.period}','${ID.empB}','Worker','${ID.team}',2,'Submitted', now(), now());

-- Evaluation C: drives the genuine concurrent-edit denial (next round already Draft).
INSERT INTO public.evaluations(id, period_id, employee_id, employee_role, team_id, current_round, status, created_at, updated_at)
VALUES ('${ID.evalC}','${ID.period}','${ID.empC}','Employee','${ID.team}',1,'Draft', now(), now());

INSERT INTO public.evaluation_transition_context(context_key, txid, context)
VALUES ('${transitionCtxKey}', txid_current(), 'save_rpc');
SELECT set_config('kurabe.p102m3t04.save_context_key', '${transitionCtxKey}', true);

INSERT INTO public.evaluation_rounds(id, evaluation_id, round, evaluator_id, evaluator_role, scores, notes, total_score, grade, status, created_at, criteria_config_version_id, grade_config_version_id)
VALUES ('${ID.roundA1}','${ID.evalA}',1,'${ID.subleader}','SubLeader','{}'::jsonb,'{}'::jsonb,0,'Pending','Draft', now(), '${c1}', '${g1}');
INSERT INTO public.evaluation_rounds(id, evaluation_id, round, evaluator_id, evaluator_role, scores, notes, total_score, grade, status, submitted_at, created_at, criteria_config_version_id, grade_config_version_id)
VALUES ('${ID.roundB1}','${ID.evalB}',1,'${ID.subleader}','SubLeader','{"A1":1}'::jsonb,'{"A1":"seed"}'::jsonb,170,'S','Submitted', now(), now(), '${c1}', '${g1}');
INSERT INTO public.evaluation_rounds(id, evaluation_id, round, evaluator_id, evaluator_role, scores, notes, total_score, grade, status, created_at, criteria_config_version_id, grade_config_version_id)
VALUES ('${ID.roundB2}','${ID.evalB}',2,'${ID.leader}','Leader','{}'::jsonb,'{}'::jsonb,0,'Pending','NotStarted', now(), '${c1}', '${g1}');
INSERT INTO public.evaluation_rounds(id, evaluation_id, round, evaluator_id, evaluator_role, scores, notes, total_score, grade, status, created_at, criteria_config_version_id, grade_config_version_id)
VALUES ('${ID.roundC1}','${ID.evalC}',1,'${ID.subleader}','SubLeader','{}'::jsonb,'{}'::jsonb,0,'Pending','Draft', now(), '${c1}', '${g1}');
INSERT INTO public.evaluation_rounds(id, evaluation_id, round, evaluator_id, evaluator_role, scores, notes, total_score, grade, status, created_at, criteria_config_version_id, grade_config_version_id)
VALUES ('${ID.roundC2}','${ID.evalC}',2,'${ID.leader}','Leader','{}'::jsonb,'{}'::jsonb,0,'Pending','Draft', now(), '${c1}', '${g1}');

DELETE FROM public.evaluation_transition_context WHERE context_key = '${transitionCtxKey}';
COMMIT;`);
  assert.ok(r.ok, `seed graph failed: ${r.err.slice(0, 600)}`);
}
function saveRpcSql({ evalId, round, actor, scores, notes, comment, total, grade, isSubmit, nextRound, nextEvaluator, nextRole, nextStatus, isFinal, ccv, gbv, label }) {
  const u = (v) => (v === null ? 'NULL' : `'${v}'::uuid`);
  const t = (v) => (v === null ? 'NULL' : `'${v}'`);
  return `SELECT '${label}|' || round_id || '|' || COALESCE(next_round_id::text,'') || '|' || final_status FROM public.save_evaluation_round_transaction_active_only(
  '${evalId}'::uuid, ${round}, '${actor}'::uuid,
  '${scores}'::jsonb, '${notes}'::jsonb, ${t(comment)}, ${total}, ${t(grade)},
  ${isSubmit}, now(), ${nextRound}, ${u(nextEvaluator)}, ${t(nextRole)}, ${t(nextStatus)}, ${isFinal},
  ${u(ccv)}, ${u(gbv)});`;
}
function returnRpcSql({ evalId, round, actor, reason }) {
  return `SELECT 'RET|' || evaluation_id || '|' || restored_round || '|' || restored_status FROM public.return_evaluation_round_transaction('${evalId}'::uuid, ${round}, '${actor}'::uuid, '${reason}');`;
}
function transitionContextCount(port, db) {
  return mustPsql(port, db, `SELECT count(*) FROM public.evaluation_transition_context;`);
}
function assertNoTransitionContext(port, db, label) {
  assert.equal(transitionContextCount(port, db), '0', `${label}: evaluation_transition_context must be empty after a success path`);
}
function evalRow(port, db, evalId) {
  return mustPsql(port, db, `SELECT status || '|' || COALESCE(current_round::text,'') FROM public.evaluations WHERE id='${evalId}';`);
}
function roundRow(port, db, roundId) {
  return mustPsql(port, db, `SELECT status || '|' || COALESCE(evaluator_id::text,'') || '|' || COALESCE(criteria_config_version_id::text,'') || '|' || COALESCE(grade_config_version_id::text,'') || '|' || scores::text FROM public.evaluation_rounds WHERE id='${roundId}';`);
}
function rowsDigest(port, db, evalId) {
  const out = mustPsql(port, db, `
    SELECT COALESCE(string_agg(line, E'\\n' ORDER BY line), '') FROM (
      SELECT 'e|' || id || '|' || period_id || '|' || employee_id || '|' || employee_role || '|' || COALESCE(team_id::text,'') || '|' || COALESCE(current_round::text,'') || '|' || status || '|' || COALESCE(final_grade,'') || '|' || COALESCE(final_score::text,'') || '|' || COALESCE(return_note,'') AS line
        FROM public.evaluations WHERE id = '${evalId}'
      UNION ALL
      SELECT 'r|' || id || '|' || round || '|' || COALESCE(evaluator_id::text,'') || '|' || evaluator_role || '|' || scores::text || '|' || notes::text || '|' || COALESCE(total_score::text,'') || '|' || COALESCE(grade,'') || '|' || COALESCE(submitted_at::text,'') || '|' || status || '|' || COALESCE(criteria_config_version_id::text,'') || '|' || COALESCE(grade_config_version_id::text,'') AS line
        FROM public.evaluation_rounds WHERE evaluation_id = '${evalId}'
    ) s;`);
  return crypto.createHash('sha256').update(out).digest('hex');
}
function driveLifecycleRPCs(port, db, { c1, g1 }) {
  const cases = [];
  // Committed history witness: evaluation B must be byte-identical before/after every drive.
  const historyBefore = rowsDigest(port, db, ID.evalB);

  // ---- (a) V1 submit (round 1, SubLeader, config V1) -> creates mutable round 2. ----
  const v1 = psql(port, db, saveRpcSql({
    evalId: ID.evalA, round: 1, actor: ID.subleader, scores: '{"A1":1}', notes: '{"A1":"v1"}', comment: 'V1 submit',
    total: 170, grade: 'S', isSubmit: 'true', nextRound: 2, nextEvaluator: ID.leader, nextRole: 'Leader',
    nextStatus: 'Submitted', isFinal: 'false', ccv: c1, gbv: g1, label: 'SAVE1',
  }));
  assert.ok(v1.ok, `V1 submit failed: ${v1.err.slice(0, 600)}`);
  assert.match(v1.out, /^SAVE1\|[0-9a-f-]{36}\|[0-9a-f-]{36}\|Submitted$/m, `unexpected V1 submit output: ${v1.out}`);
  assertNoTransitionContext(port, db, 'V1 submit');
  assert.equal(evalRow(port, db, ID.evalA), 'Submitted|2', 'after V1 submit evaluation must be Submitted at round 2');
  const round2Id = v1.out.split('|')[2];
  assert.equal(roundRow(port, db, round2Id).split('|')[0], 'NotStarted', 'V1 submit must create a NotStarted next round');
  assert.equal(roundRow(port, db, round2Id).split('|')[2], c1, 'next round must carry the V1 criteria pin');
  // The V1 submission itself is a committed snapshot pinned to the V1 config.
  assert.deepEqual(roundRow(port, db, ID.roundA1).split('|').slice(0, 3), ['Submitted', ID.subleader, c1], 'V1 submit must commit round 1 as Submitted with the V1 pin');
  assert.equal(mustPsql(port, db, `SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id='${ID.evalA}';`), '2', 'V1 submit must yield exactly two rounds');
  cases.push('v1-submit-creates-mutable-next-round');

  // ---- return round 2 (Leader): resets the returned round + unlocks round 1. ----
  const ret = psql(port, db, returnRpcSql({ evalId: ID.evalA, round: 2, actor: ID.leader, reason: 'return for V2 config' }));
  assert.ok(ret.ok, `return failed: ${ret.err.slice(0, 600)}`);
  assert.equal(ret.out, `RET|${ID.evalA}|1|Draft`, `unexpected return output: ${ret.out}`);
  assertNoTransitionContext(port, db, 'return');
  assert.equal(roundRow(port, db, round2Id).split('|')[2], '', 'returned round must clear its stale criteria pin');
  assert.equal(roundRow(port, db, ID.roundA1).split('|')[0], 'Draft', 'return must unlock round 1 to Draft');
  cases.push('return-resets-returned-round-and-unlocks-previous');

  // ---- V2 config change: new active criteria/grade versions. ----
  const cfg = psql(port, db, `
BEGIN;
UPDATE public.criteria_config_versions SET is_active = false WHERE is_active;
INSERT INTO public.criteria_config_versions(id, version_no, checksum, is_active) VALUES ('${ID.ccvV2}', 2, 'seed-v2-checksum', true);
UPDATE public.grade_band_versions SET is_active = false WHERE is_active;
INSERT INTO public.grade_band_versions(id, version_no, checksum, is_active) VALUES ('${ID.gbvV2}', 2, 'seed-v2-checksum', true);
COMMIT;`);
  assert.ok(cfg.ok, `V2 config change failed: ${cfg.err.slice(0, 600)}`);
  cases.push('v2-config-activated');

  // ---- (a) resubmit round 1 (config V2): must reconcile the NotStarted next round. ----
  const v2 = psql(port, db, saveRpcSql({
    evalId: ID.evalA, round: 1, actor: ID.subleader, scores: '{"A1":2}', notes: '{"A1":"v2"}', comment: 'V2 resubmit',
    total: 100, grade: 'A', isSubmit: 'true', nextRound: 2, nextEvaluator: ID.leader, nextRole: 'Leader',
    nextStatus: 'Submitted', isFinal: 'false', ccv: ID.ccvV2, gbv: ID.gbvV2, label: 'SAVE2',
  }));
  assert.ok(v2.ok, `V2 resubmit must succeed, got: ${v2.err.slice(0, 600)}`);
  assert.doesNotMatch(v2.err, /CONFLICTING_NEXT_ROUND/, 'resubmit must not raise CONFLICTING_NEXT_ROUND');
  assert.match(v2.out, new RegExp(`^SAVE2\\|[0-9a-f-]{36}\\|${round2Id}\\|Submitted$`, 'm'), `resubmit must reuse the reconciled next round: ${v2.out}`);
  assertNoTransitionContext(port, db, 'V2 resubmit');
  // Reconciled next round keeps its identity/status/payload, only its version pins change.
  const next2 = roundRow(port, db, round2Id).split('|');
  assert.deepEqual([next2[0], next2[1], next2[2], next2[3], next2[4]], ['NotStarted', ID.leader, ID.ccvV2, ID.gbvV2, '{}'], 'next round must be reconciled in place to the V2 pins without rewriting status/evaluator/payload');
  // The resubmitted round 1 carries the V2 pins.
  const r1 = roundRow(port, db, ID.roundA1).split('|');
  assert.deepEqual([r1[0], r1[2], r1[3]], ['Submitted', ID.ccvV2, ID.gbvV2], 'resubmitted round 1 must be Submitted with the V2 pins');
  assert.equal(evalRow(port, db, ID.evalA), 'Submitted|2', 'evaluation must return to Submitted at round 2');
  assert.equal(mustPsql(port, db, `SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id='${ID.evalA}';`), '2', 'resubmit must reconcile in place, never creating a third round');
  cases.push('v1-return-v2-resubmit-reconciled-without-conflict');

  // ---- (b) genuine concurrent edit: next round already progressed (Draft) -> denied. ----
  const concurrent = psql(port, db, saveRpcSql({
    evalId: ID.evalC, round: 1, actor: ID.subleader, scores: '{}', notes: '{}', comment: 'concurrent edit',
    total: 100, grade: 'A', isSubmit: 'true', nextRound: 2, nextEvaluator: ID.leader, nextRole: 'Leader',
    nextStatus: 'Submitted', isFinal: 'false', ccv: ID.ccvV2, gbv: ID.gbvV2, label: 'SAVE3',
  }));
  assert.equal(concurrent.ok, false, 'a genuine concurrent edit must fail closed');
  assert.match(concurrent.err, /CONFLICTING_NEXT_ROUND/, `expected the CONFLICTING_NEXT_ROUND guard, got: ${concurrent.err.slice(0, 600)}`);
  // The failed transaction rolls back entirely: evaluation C is untouched.
  assert.equal(evalRow(port, db, ID.evalC), 'Draft|1', 'denied concurrent edit must leave evaluation C at Draft/1');
  assert.equal(roundRow(port, db, ID.roundC1).split('|')[0], 'Draft', 'denied concurrent edit must leave round C1 Draft');
  assert.equal(roundRow(port, db, ID.roundC2).split('|')[0], 'Draft', 'denied concurrent edit must leave round C2 Draft');
  assertNoTransitionContext(port, db, 'denied concurrent edit');
  cases.push('genuine-concurrent-edit-denied-and-rolled-back');

  // ---- immutable history: the untouched committed evaluation B is byte-identical. ----
  assert.equal(rowsDigest(port, db, ID.evalB), historyBefore, 'committed history (evaluation B) must never be rewritten');
  cases.push('committed-history-immutable');

  return cases;
}

const cases = [];
const name = `kurabe-p107t07-lc-${process.pid}`;
const database = `kurabe_harness_p107t07lc${process.pid}`.replace(/[^a-z0-9_]/g, '');
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
    SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname IN (${FUNCS}) ORDER BY 1;`).split('\n').filter(Boolean);
  assert.ok(preSigs.length >= 2, `both replaced RPCs must pre-exist (found ${preSigs.length})`);
  const preDefs = preSigs.map((sig) => ({ sig, def: mustPsql(port, database, `SELECT pg_get_functiondef('${sig}'::regprocedure);`) }));
  const preAcl = preDefs.map(({ sig }) => ({ sig, roles: mustPsql(port, database, `SELECT string_agg(r, ',' ORDER BY r) FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_function_privilege(r, '${sig}'::regprocedure, 'EXECUTE');`) }));
  const prePub = preDefs.map(({ sig }) => ({ sig, pub: publicHasExecute(port, database, sig) }));
  const preCmt = preDefs.map(({ sig }) => ({ sig, cmt: mustPsql(port, database, `SELECT COALESCE(obj_description('${sig}'::regprocedure, 'pg_proc'), '');`) }));
  cases.push(`pre-state-captured-functions=${preDefs.length}`);

  const applyResult = psql(port, database, null, { file: path.join(projectRoot, MIGRATION) });
  assert.ok(applyResult.ok, `candidate migration failed: ${applyResult.err.slice(0, 600)}`);
  cases.push('candidate-migration-applied');
  const postDigest = graphDigest(port, database);
  assert.notEqual(postDigest, preDigest, 'apply must change the catalog graph');
  for (const fn of ['return_evaluation_round_transaction', 'save_evaluation_round_transaction_active_only']) {
    assert.ok(mustPsql(port, database, `SELECT count(*) FROM pg_description d JOIN pg_proc p ON p.oid=d.objoid WHERE p.proname='${fn}' AND d.description LIKE 'kurabe:p107m1t07:%';`) !== '0', `${fn} must carry the P107M1T07 provenance comment`);
  }
  for (const sig of [RETURN_RPC, SAVE_RPC]) {
    assert.ok(mustPsql(port, database, `SELECT has_function_privilege('anon', 'public.${sig}', 'EXECUTE');`) === 'f', `anon must not execute ${sig}`);
    assert.ok(mustPsql(port, database, `SELECT has_function_privilege('authenticated', 'public.${sig}', 'EXECUTE');`) === 'f', `authenticated must not execute ${sig}`);
    assert.ok(mustPsql(port, database, `SELECT has_function_privilege('service_role', 'public.${sig}', 'EXECUTE');`) === 't', `service_role must execute ${sig}`);
    assert.ok(publicHasExecute(port, database, sig) === 'f', `PUBLIC must not execute ${sig}`);
  }
  cases.push('post-apply-graph-and-acl-verified-including-public');

  const rollback = [
    ...preDefs.map(({ def }) => (def.trimEnd().endsWith(';') ? def : `${def};`)),
    ...preAcl.flatMap(({ sig, roles }) => [
      `REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated, service_role, postgres;`,
      ...(roles ? [`GRANT EXECUTE ON FUNCTION ${sig} TO ${roles};`] : []),
    ]),
    ...prePub.filter(({ pub }) => pub === 't').map(({ sig }) => `GRANT EXECUTE ON FUNCTION ${sig} TO PUBLIC;`),
    ...preCmt.map(({ sig, cmt }) => (cmt ? `COMMENT ON FUNCTION ${sig} IS '${cmt.replace(/'/g, "''")}';` : `COMMENT ON FUNCTION ${sig} IS NULL;`)),
  ].join('\n');
  const rb = psql(port, database, `BEGIN;\n${rollback}\nCOMMIT;`);
  assert.ok(rb.ok, `rollback failed: ${rb.err.slice(0, 600)}`);
  assert.equal(graphDigest(port, database), preDigest, 'rollback must restore the exact captured pre-migration graph');
  cases.push('rollback-restores-captured-graph');

  const reapply = psql(port, database, null, { file: path.join(projectRoot, MIGRATION) });
  assert.ok(reapply.ok, `reapply failed: ${reapply.err.slice(0, 600)}`);
  assert.equal(graphDigest(port, database), postDigest, 'reapply must reproduce the exact post-apply graph');
  cases.push('reapply-reproduces-post-apply-graph');

  // ---- F2: seed a real graph and DRIVE the replaced RPCs. ----
  const config = activeConfigIds(port, database);
  seedLifecycleGraph(port, database, config);
  cases.push('seeded-personnel-evaluation-graph');
  cases.push(...driveLifecycleRPCs(port, database, config));

  console.log(`P107T07_RUNTIME_ACCEPTANCE PASS cases=${cases.length}`);
  console.log(cases.join('\n'));
  console.log(`PRE_DIGEST=${preDigest}`);
  console.log(`POST_DIGEST=${postDigest}`);
} finally {
  command('docker', ['rm', '--force', name]);
}
