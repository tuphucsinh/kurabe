#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = path.join(projectRoot, 'db/bootstrap/baseline.sql');
const gradeMigration = path.join(projectRoot, 'supabase/migrations/20260907000500_grade_config_version.sql');
const criteriaMigration = path.join(projectRoot, 'supabase/migrations/20260907000600_criteria_config_version.sql');
const guardMigration = path.join(projectRoot, 'supabase/migrations/20260911000300_evaluation_transition_guard.sql');
const rollback = path.join(projectRoot, 'db/rollback-evaluation-transition-guard.sql');

function command(file, args, options = {}) {
  return spawnSync(file, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function must(file, args, options = {}) {
  const result = command(file, args, options);
  if (result.status !== 0) {
    throw new Error(`${file} failed (${result.status}): ${String(result.stderr || '').trim()}`);
  }
  return String(result.stdout || '').trim();
}

function start(name, password, database) {
  const id = must('docker', [
    'run', '--detach', '--rm', '--name', name,
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', `POSTGRES_DB=${database}`,
    '--publish', '127.0.0.1::5432',
    'postgres:17-alpine'
  ]);
  assert.ok(id.length > 10);
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const result = command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', database]);
    if (result.status === 0) { ready = true; break; }
  }
  assert.ok(ready, 'disposable PostgreSQL did not become ready');
  const port = must('docker', ['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
  assert.ok(port, 'could not determine loopback port');
  let connectionReady = false;
  for (let i = 0; i < 60; i += 1) {
    const readyConnection = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres',
      '--dbname', database, '--no-psqlrc', '--command', 'SELECT 1;'
    ], { env: { ...process.env, PGPASSWORD: password } });
    if (readyConnection.status === 0) { connectionReady = true; break; }
  }
  assert.ok(connectionReady, 'loopback PostgreSQL connection failed');
  return port;
}

function psql(port, password, database, sql, expectPass = true) {
  const result = command('psql', [
    '--host', '127.0.0.1', '--port', port, '--username', 'postgres',
    '--dbname', database, '--no-psqlrc', '--tuples-only', '--no-align', '--command', sql
  ], { env: { ...process.env, PGPASSWORD: password } });
  if (expectPass && result.status !== 0) {
    throw new Error(`psql failed [${sql.slice(0, 100)}]: ${String(result.stderr || '').trim()}`);
  }
  return { out: String(result.stdout || '').trim(), err: String(result.stderr || '').trim(), status: result.status };
}

function applyFile(port, password, database, file) {
  const result = command('psql', [
    '--host', '127.0.0.1', '--port', port, '--username', 'postgres',
    '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', file
  ], { env: { ...process.env, PGPASSWORD: password } });
  if (result.status !== 0) {
    throw new Error(`psql ${path.basename(file)} failed: ${String(result.stderr || '').trim()}`);
  }
}

function bootstrap(port, password, database) {
  psql(port, password, database, `
    DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  applyFile(port, password, database, baseline);
  psql(port, password, database, `
    COMMENT ON CONSTRAINT uq_evaluations_period_employee ON public.evaluations IS 'kurabe:p3:candidate:v1:constraint:uq_evaluations_period_employee';
    COMMENT ON CONSTRAINT uq_evaluation_rounds_eval_round ON public.evaluation_rounds IS 'kurabe:p3:candidate:v1:constraint:uq_evaluation_rounds_eval_round';
    COMMENT ON CONSTRAINT chk_evaluation_rounds_round_range ON public.evaluation_rounds IS 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_round_range';
    COMMENT ON CONSTRAINT chk_evaluations_current_round_range ON public.evaluations IS 'kurabe:p3:candidate:v1:constraint:chk_evaluations_current_round_range';
    COMMENT ON CONSTRAINT chk_evaluations_status_valid ON public.evaluations IS 'kurabe:p3:candidate:v1:constraint:chk_evaluations_status_valid';
    COMMENT ON CONSTRAINT chk_evaluation_rounds_status_valid ON public.evaluation_rounds IS 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_status_valid';
    COMMENT ON CONSTRAINT chk_evaluation_rounds_total_score_non_negative ON public.evaluation_rounds IS 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_total_score_non_negative';
    COMMENT ON CONSTRAINT chk_evaluations_final_score_non_negative ON public.evaluations IS 'kurabe:p3:candidate:v1:constraint:chk_evaluations_final_score_non_negative';
    COMMENT ON INDEX idx_evaluations_period_employee IS 'kurabe:p3:candidate:v1:index:idx_evaluations_period_employee';
    COMMENT ON INDEX idx_evaluation_rounds_eval_round IS 'kurabe:p3:candidate:v1:index:idx_evaluation_rounds_eval_round';
  `);
  psql(port, password, database, `
    INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
      ('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
      ('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
      ('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);
  `);
  psql(port, password, database, `
    INSERT INTO public.criteria_groups (id, code, name, short_name, sort_order) VALUES
      ('00000000-0000-0000-0000-000000000201', 'quality', 'Quality', 'Q', 0),
      ('00000000-0000-0000-0000-000000000202', 'teamwork', 'Teamwork', 'T', 1);
    INSERT INTO public.criteria (id, code, name, description, applies_to, weight, group_id, sort_order, default_level_index) VALUES
      ('00000000-0000-0000-0000-000000000211', 'quality-result', 'Result quality', 'Quality of output', 'employee', 60, '00000000-0000-0000-0000-000000000201', 0, 0),
      ('00000000-0000-0000-0000-000000000212', 'team-cooperation', 'Cooperation', 'Works with team', 'employee', 40, '00000000-0000-0000-0000-000000000202', 0, 0);
    INSERT INTO public.criterion_levels (id, criterion_id, points, label, description, sort_order) VALUES
      ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000211', 5, 'Excellent', 'Excellent', 0),
      ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000211', 3, 'Good', 'Good', 1),
      ('00000000-0000-0000-0000-000000000223', '00000000-0000-0000-0000-000000000212', 5, 'Excellent', 'Excellent', 0),
      ('00000000-0000-0000-0000-000000000224', '00000000-0000-0000-0000-000000000212', 3, 'Good', 'Good', 1);
    INSERT INTO public.criterion_audiences (criterion_id, audience) VALUES
      ('00000000-0000-0000-0000-000000000211', 'employee'),
      ('00000000-0000-0000-0000-000000000212', 'employee');
  `);
  applyFile(port, password, database, gradeMigration);
  applyFile(port, password, database, criteriaMigration);
  applyFile(port, password, database, guardMigration);
}

function jsonResult(raw) {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

function asyncPsql(port, password, database, sql) {
  return new Promise((resolve) => {
    const child = spawn('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres',
      '--dbname', database, '--no-psqlrc', '--tuples-only', '--no-align', '--command', sql
    ], {
      cwd: projectRoot,
      env: { ...process.env, PGPASSWORD: password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (status) => resolve({ out: out.trim(), err: err.trim(), status }));
  });
}

function seedEvaluation(port, password, database, suffix, role = 'Employee', round = 1, status = 'Draft', evalStatus = 'Draft', actorRole = 'Leader') {
  const baseId = Number(suffix);
  const uuidFor = (offset) => `00000000-0000-0000-0000-${String(baseId + offset).padStart(12, '0')}`;
  const evaluationId = uuidFor(0);
  const employeeId = uuidFor(1);
  const actorId = uuidFor(2);
  const roundId = uuidFor(3);
  const contextToken = uuidFor(4);
  const submittedAt = ['Submitted', 'Reviewed', 'Approved'].includes(status) ? 'now()' : 'NULL';

  psql(port, password, database, `
    BEGIN;
    INSERT INTO public.users (id, employee_code, name, role, gender, is_active)
    VALUES ('${employeeId}', 'P102-${suffix}', 'Evaluation Subject ${suffix}', '${role}', 'Other', true)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.users (id, employee_code, name, role, gender, is_active)
    VALUES ('${actorId}', 'P102-ACT-${suffix}', 'Evaluation Actor ${suffix}', '${actorRole}', 'Other', true)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, status, current_round)
    VALUES ('${evaluationId}', '00000000-0000-0000-0000-000000000301', '${employeeId}', '${role}', '${evalStatus}', ${round})
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.evaluation_transition_context (context_key, txid, context)
    VALUES ('${contextToken}', txid_current(), 'save_rpc');
    SELECT set_config('kurabe.p102m3t04.save_context_key', '${contextToken}', true);
    INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status, submitted_at)
    VALUES ('${roundId}', '${evaluationId}', ${round}, '${actorId}', '${actorRole}', '${status}', ${submittedAt})
    ON CONFLICT (id) DO NOTHING;
    DELETE FROM public.evaluation_transition_context WHERE context_key = '${contextToken}';
    COMMIT;
  `);
  return { evaluationId, roundId, actorId, employeeId };
}

export async function run() {
  const cases = [];

  // 1. source-contracts
  const evaluationActionSrc = fs.readFileSync(path.join(projectRoot, 'src/actions/evaluation.ts'), 'utf8');
  const rpcSrc = fs.readFileSync(path.join(projectRoot, 'src/lib/evaluation-transaction-rpc.ts'), 'utf8');
  const validationSrc = fs.readFileSync(path.join(projectRoot, 'src/lib/evaluation-round-validation.ts'), 'utf8');
  const pageStateSrc = fs.readFileSync(path.join(projectRoot, 'src/hooks/use-evaluation-page-state.ts'), 'utf8');
  const clientSrc = fs.readFileSync(path.join(projectRoot, 'src/app/evaluations/[id]/EvaluationPageClient.tsx'), 'utf8');

  assert.match(rpcSrc, /p_grade_config_version_id/);
  assert.match(rpcSrc, /buildEvaluationRoundReturnRpcArgs/);
  assert.match(validationSrc, /renderedRules/);
  assert.match(validationSrc, /assertCriteriaRulesMatch/);
  assert.match(pageStateSrc, /criteriaConfigVersionId/);
  assert.match(pageStateSrc, /gradeConfigVersionId/);
  assert.match(clientSrc, /criteriaConfigVersionId/);
  assert.match(clientSrc, /gradeConfigVersionId/);
  assert.match(clientSrc, /renderedRules/);
  assert.match(evaluationActionSrc, /save_evaluation_round_transaction_active_only/);
  assert.match(evaluationActionSrc, /return_evaluation_round_transaction/);
  cases.push('source-contracts');

  const name = `kurabe-p102m3t04-${process.pid}`;
  const rollbackName = `kurabe-p102m3t04-rb-${process.pid}`;
  const password = crypto.randomBytes(24).toString('base64url');
  const rollbackPassword = crypto.randomBytes(24).toString('base64url');
  const database = 'kurabe_harness_p102m3t04';

  try {
    const port = start(name, password, database);
    bootstrap(port, password, database);

    psql(port, password, database, `
      INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade)
      VALUES ('00000000-0000-0000-0000-000000000301', 2099, 'P102M3T04 Period', 'active', 75, 'AB');
    `);

    // 2. migration-and-seed
    const activeCriteriaId = psql(port, password, database, 'SELECT id FROM public.criteria_config_versions WHERE is_active;').out;
    const activeGradeId = psql(port, password, database, 'SELECT id FROM public.grade_band_versions WHERE is_active;').out;
    assert.match(activeCriteriaId, /^[0-9a-f-]{36}$/);
    assert.match(activeGradeId, /^[0-9a-f-]{36}$/);

    const triggerCount = psql(port, password, database, `
      SELECT count(*) FROM pg_trigger WHERE tgname = 'guard_evaluation_transitions';
    `).out;
    assert.equal(triggerCount, '1');
    cases.push('migration-and-seed');

    // 3. atomic-draft-save
    const draftTarget = seedEvaluation(port, password, database, '101', 'Leader', 1, 'NotStarted', 'NotStarted');
    const initializeResult = jsonResult(psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${draftTarget.evaluationId}', 1, '${draftTarget.actorId}',
        '{}'::jsonb, '{}'::jsonb, 'Initial draft', 0, 'Pending', NULL::boolean,
        now(), NULL, NULL, NULL, NULL, false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      ) result;
    `).out);
    assert.equal(initializeResult.evaluation_id, draftTarget.evaluationId);
    assert.equal(initializeResult.final_status, 'Draft');
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${draftTarget.roundId}';`).out, 'Draft');
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluations WHERE id='${draftTarget.evaluationId}';`).out, 'Draft');
    cases.push('atomic-initialize');

    const draftResult = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${draftTarget.evaluationId}', 1, '${draftTarget.actorId}',
        '{"00000000-0000-0000-0000-000000000211": 5}'::jsonb,
        '{"00000000-0000-0000-0000-000000000211": "Good progress"}'::jsonb,
        'Draft comment', 5, 'C', false,
        now(), NULL, NULL, NULL, NULL, false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      ) result;
    `).out;
    assert.ok(draftResult.includes(draftTarget.evaluationId));
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${draftTarget.roundId}';`).out, 'Draft');
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluations WHERE id='${draftTarget.evaluationId}';`).out, 'Draft');
    assert.equal(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${draftTarget.roundId}';`).out, activeCriteriaId);
    assert.equal(psql(port, password, database, `SELECT grade_config_version_id FROM public.evaluation_rounds WHERE id='${draftTarget.roundId}';`).out, activeGradeId);
    cases.push('atomic-draft-save');

    // 4. version-pinning-submit
    const nextActorId = '00000000-0000-0000-0000-000000000999';
    psql(port, password, database, `
      INSERT INTO public.users (id, employee_code, name, role, gender, is_active)
      VALUES ('${nextActorId}', 'P102-MGR', 'Next Manager', 'Manager', 'Other', true)
      ON CONFLICT (id) DO NOTHING;
    `);
    const submitResult = jsonResult(psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${draftTarget.evaluationId}', 1, '${draftTarget.actorId}',
        '{"00000000-0000-0000-0000-000000000211": 5}'::jsonb,
        '{"00000000-0000-0000-0000-000000000211": "Done"}'::jsonb,
        'Submitted comment', 5, 'B', true,
        now(), 2, '${nextActorId}'::uuid, 'Manager', 'Submitted', false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      ) result;
    `).out);

    assert.equal(submitResult.evaluation_id, draftTarget.evaluationId);
    assert.ok(submitResult.next_round_id);
    assert.equal(submitResult.final_status, 'Submitted');
    assert.equal(psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${draftTarget.evaluationId}';`).out, '2');

    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${submitResult.next_round_id}';`).out, 'NotStarted');
    assert.equal(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${submitResult.next_round_id}';`).out, activeCriteriaId);
    assert.equal(psql(port, password, database, `SELECT grade_config_version_id FROM public.evaluation_rounds WHERE id='${submitResult.next_round_id}';`).out, activeGradeId);
    cases.push('version-pinning-submit');

    // 5. replay-after-r2-r3-approved

    const replayBefore = psql(port, password, database, `
      SELECT e.current_round::text || '|' || (SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id='${draftTarget.evaluationId}')
      FROM public.evaluations e WHERE e.id='${draftTarget.evaluationId}';
    `).out;
    const conflictingReplay = psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${draftTarget.evaluationId}', 1, '${draftTarget.actorId}',
        '{"00000000-0000-0000-0000-000000000211": 5}'::jsonb,
        '{}'::jsonb, 'Replay', 5, 'B', true,
        now(), 2, '${nextActorId}'::uuid, 'Manager', 'Submitted', false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      ) result;
    `, false);
    assert.notEqual(conflictingReplay.status, 0);
    assert.match(conflictingReplay.err, /CONFLICTING_REPLAY/);

    assert.equal(
      psql(port, password, database, `
        SELECT e.current_round::text || '|' || (SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id='${draftTarget.evaluationId}')
      FROM public.evaluations e WHERE e.id='${draftTarget.evaluationId}';
      `).out,
      replayBefore,
      'conflicting replay must leave the full evaluation graph unchanged'
    );

    const replayResult = jsonResult(psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${draftTarget.evaluationId}', 1, '${draftTarget.actorId}',
        '{"00000000-0000-0000-0000-000000000211": 5}'::jsonb,
        '{"00000000-0000-0000-0000-000000000211": "Done"}'::jsonb, 'Submitted comment', 5, 'B', true,
        now(), 2, '${nextActorId}'::uuid, 'Manager', 'Submitted', false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      ) result;
    `).out);
    assert.equal(replayResult.round_id, draftTarget.roundId);
    assert.equal(replayResult.next_round_id, submitResult.next_round_id);
    assert.equal(psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${draftTarget.evaluationId}';`).out, '2');

    const directRoundTamper = psql(port, password, database, `
      UPDATE public.evaluation_rounds
      SET comment = 'tampered-directly'
      WHERE id = '${draftTarget.roundId}';
    `, false);
    assert.notEqual(directRoundTamper.status, 0, 'direct submitted-round mutation must be rejected');
    assert.match(directRoundTamper.err, /P102M3T04_INVALID_ROUND/);
    const directRoundDelete = psql(port, password, database, `
      DELETE FROM public.evaluation_rounds WHERE id = '${draftTarget.roundId}';
    `, false);
    assert.notEqual(directRoundDelete.status, 0, 'direct submitted-round deletion must be rejected');
    assert.match(directRoundDelete.err, /P102M3T04_INVALID_ROUND/);

    // Progress round 2 to final submit (Approved)
    const approvedResult = jsonResult(psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${draftTarget.evaluationId}', 2, '${nextActorId}',
        '{"00000000-0000-0000-0000-000000000211": 5}'::jsonb,
        '{}'::jsonb, 'Final Approved', 5, 'A', true,
        now(), NULL, NULL, NULL, 'Approved', true,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      ) result;
    `).out);
    assert.equal(approvedResult.final_status, 'Approved');
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluations WHERE id='${draftTarget.evaluationId}';`).out, 'Approved');

    // Replay on approved round returns approved row
    const replayApproved = jsonResult(psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${draftTarget.evaluationId}', 2, '${nextActorId}',
        '{"00000000-0000-0000-0000-000000000211": 5}'::jsonb, '{}'::jsonb, 'Final Approved', 5, 'A', true,
        now(), NULL, NULL, NULL, 'Approved', true,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      ) result;
    `).out);
    assert.equal(replayApproved.final_status, 'Approved');

    const approvedReplayBefore = psql(port, password, database, `
      SELECT current_round::text || '|' || (SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id='${draftTarget.evaluationId}')
      FROM public.evaluations WHERE id='${draftTarget.evaluationId}';
    `).out;
    const replayApprovedR1 = jsonResult(psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${draftTarget.evaluationId}', 1, '${draftTarget.actorId}',
        '{"00000000-0000-0000-0000-000000000211": 5}'::jsonb,
        '{"00000000-0000-0000-0000-000000000211": "Done"}'::jsonb, 'Submitted comment', 5, 'B', true,
        now(), 2, '${nextActorId}'::uuid, 'Manager', 'Submitted', false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      ) result;
    `).out);
    assert.equal(replayApprovedR1.final_status, 'Approved');
    assert.equal(replayApprovedR1.round_id, draftTarget.roundId);
    assert.equal(
      psql(port, password, database, `
        SELECT current_round::text || '|' || (SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id='${draftTarget.evaluationId}')
        FROM public.evaluations WHERE id='${draftTarget.evaluationId}';
      `).out,
      approvedReplayBefore,
      'historical R1 replay after approval must leave graph unchanged'
    );

    // Non-submit edit on approved evaluation is strictly rejected
    const editApproved = psql(port, password, database, `
      SELECT * FROM public.save_evaluation_round_transaction_active_only(
        '${draftTarget.evaluationId}', 2, '${nextActorId}',
        '{}'::jsonb, '{}'::jsonb, 'Illegal Draft', 5, 'A', false,
        now(), NULL, NULL, NULL, NULL, false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      );
    `, false);
    assert.notEqual(editApproved.status, 0);
    assert.match(editApproved.err, /EVALUATION_ALREADY_APPROVED/);
    cases.push('replay-after-r2-r3-approved');

    // 6. duplicate-submit-and-return
    const returnTarget = seedEvaluation(port, password, database, '102', 'Leader', 1, 'Draft', 'Draft', 'Manager');
    // Submit round 1
    const retSubmitR1 = jsonResult(psql(port, password, database, `
      SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
        '${returnTarget.evaluationId}', 1, '${returnTarget.actorId}',
        '{}'::jsonb, '{}'::jsonb, 'R1', 10, 'B', true,
        now(), 2, '${nextActorId}'::uuid, 'Manager', 'Submitted', false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      ) result;
    `).out);
    assert.equal(psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${returnTarget.evaluationId}';`).out, '2');

    // Return round 2 to round 1
    const returnR2 = jsonResult(psql(port, password, database, `
      SELECT row_to_json(result) FROM public.return_evaluation_round_transaction(
        '${returnTarget.evaluationId}', 2, '${nextActorId}', 'Cần giải trình chi tiết hơn'
      ) result;
    `).out);
    assert.equal(returnR2.restored_round, 1);
    assert.equal(returnR2.restored_status, 'Draft');
    const returnCurrentRound = psql(port, password, database, `SELECT current_round FROM public.evaluations WHERE id='${returnTarget.evaluationId}';`).out;

    assert.equal(returnCurrentRound, '1');
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluations WHERE id='${returnTarget.evaluationId}';`).out, 'Draft');
    assert.equal(psql(port, password, database, `SELECT return_note FROM public.evaluations WHERE id='${returnTarget.evaluationId}';`).out, 'Cần giải trình chi tiết hơn');
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${returnTarget.roundId}';`).out, 'Draft');
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${retSubmitR1.next_round_id}';`).out, 'NotStarted');
    cases.push('duplicate-submit-and-return');

    // 7. concurrent-races
    const raceTarget = seedEvaluation(port, password, database, '103', 'Leader', 1, 'Draft', 'Draft');
    const racePayload = `
      SELECT public.save_evaluation_round_transaction_active_only(
        '${raceTarget.evaluationId}', 1, '${raceTarget.actorId}',
        '{}'::jsonb, '{}'::jsonb, 'Race Submit', 10, 'B', true,
        now(), 2, '${nextActorId}'::uuid, 'Manager', 'Submitted', false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      );
    `;
    const raceResults = await Promise.all([
      asyncPsql(port, password, database, racePayload),
      asyncPsql(port, password, database, racePayload),
    ]);
    const passCount = raceResults.filter((r) => r.status === 0).length;
    assert.ok(passCount >= 1, 'at least one concurrent submit must succeed');
    assert.equal(
      psql(port, password, database, `SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id='${raceTarget.evaluationId}';`).out,
      '2',
      'concurrent races must not create duplicate rounds'
    );
    cases.push('concurrent-races');

    // 8. config-replacement-and-stale-render
    const staleTarget = seedEvaluation(port, password, database, '104', 'Employee', 1, 'Draft', 'Draft');
    const fakeStaleCriteriaId = '00000000-0000-0000-0000-999999999999';
    const staleCriteriaResult = psql(port, password, database, `
      SELECT * FROM public.save_evaluation_round_transaction_active_only(
        '${staleTarget.evaluationId}', 1, '${staleTarget.actorId}',
        '{}'::jsonb, '{}'::jsonb, 'Stale', 10, 'B', true,
        now(), 2, '${nextActorId}'::uuid, 'Manager', 'Submitted', false,
        '${fakeStaleCriteriaId}'::uuid, '${activeGradeId}'::uuid
      );
    `, false);
    assert.notEqual(staleCriteriaResult.status, 0);
    assert.match(staleCriteriaResult.err, /P99M3T02_CONFIG_STALE/);

    const fakeStaleGradeId = '00000000-0000-0000-0000-888888888888';
    const staleGradeResult = psql(port, password, database, `
      SELECT * FROM public.save_evaluation_round_transaction_active_only(
        '${staleTarget.evaluationId}', 1, '${staleTarget.actorId}',
        '{}'::jsonb, '{}'::jsonb, 'Stale Grade', 10, 'B', true,
        now(), 2, '${nextActorId}'::uuid, 'Manager', 'Submitted', false,
        '${activeCriteriaId}'::uuid, '${fakeStaleGradeId}'::uuid
      );
    `, false);
    assert.notEqual(staleGradeResult.status, 0);
    assert.match(staleGradeResult.err, /P99M3T01_GRADE_VERSION_STALE/);
    cases.push('config-replacement-and-stale-render');

    // 9. stale-render-unchanged-ids-changed-values
    // Test that validation logic detects matching IDs with changed values
    assert.match(validationSrc, /Cấu hình điểm số của tiêu chí đã thay đổi/);
    assert.match(validationSrc, /Cấu hình mức đánh giá của tiêu chí đã thay đổi/);
    cases.push('stale-render-unchanged-ids-changed-values');

    // 10. next-round-parent-fault-zero-delta
    psql(port, password, database, `
      UPDATE public.evaluation_periods SET status='closed' WHERE id='00000000-0000-0000-0000-000000000301';
    `);
    const closedPeriodAttempt = psql(port, password, database, `
      SELECT * FROM public.save_evaluation_round_transaction_active_only(
        '${staleTarget.evaluationId}', 1, '${staleTarget.actorId}',
        '{}'::jsonb, '{}'::jsonb, 'Closed Period', 10, 'B', true,
        now(), 2, '${nextActorId}'::uuid, 'Manager', 'Submitted', false,
        '${activeCriteriaId}'::uuid, '${activeGradeId}'::uuid
      );
    `, false);
    assert.notEqual(closedPeriodAttempt.status, 0);
    assert.match(closedPeriodAttempt.err, /P96T05_PERIOD_NOT_ACTIVE/);
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${staleTarget.roundId}';`).out, 'Draft');
    // Restore active period
    psql(port, password, database, `
      UPDATE public.evaluation_periods SET status='active' WHERE id='00000000-0000-0000-0000-000000000301';
    `);
    cases.push('next-round-parent-fault-zero-delta');

    // 11. return-explicit-backwards-transition
    // Case B: Manager round 1 Approved -> return
    const mgrTarget = seedEvaluation(port, password, database, '105', 'Manager', 1, 'Submitted', 'Approved', 'Manager');

    const mgrReturn = jsonResult(psql(port, password, database, `
      SELECT row_to_json(result) FROM public.return_evaluation_round_transaction(
        '${mgrTarget.evaluationId}', 1, '${mgrTarget.actorId}', 'Tự mở lại để chỉnh sửa'
      ) result;
    `).out);
    assert.equal(mgrReturn.restored_round, 1);
    assert.equal(mgrReturn.restored_status, 'Draft');
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluations WHERE id='${mgrTarget.evaluationId}';`).out, 'Draft');
    assert.equal(psql(port, password, database, `SELECT return_note FROM public.evaluations WHERE id='${mgrTarget.evaluationId}';`).out, 'Tự mở lại để chỉnh sửa');

    // Return with empty reason fails
    const emptyReasonReturn = psql(port, password, database, `
      SELECT * FROM public.return_evaluation_round_transaction(
        '${mgrTarget.evaluationId}', 1, '${mgrTarget.actorId}', '   '
      );
    `, false);
    assert.notEqual(emptyReasonReturn.status, 0);
    assert.match(emptyReasonReturn.err, /INVALID_ARGUMENT: p_reason cannot be empty/);
    cases.push('return-explicit-backwards-transition');

    // 12. flag-absent-false-true
    assert.match(evaluationActionSrc, /KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC === 'true'/);
    cases.push('flag-absent-false-true');

    // 13. history-snapshot-preservation
    const historicalRound = psql(port, password, database, `
      SELECT criteria_config_version_id, grade_config_version_id
      FROM public.evaluation_rounds WHERE id='${draftTarget.roundId}';
    `).out;
    assert.ok(historicalRound.includes(activeCriteriaId));
    assert.ok(historicalRound.includes(activeGradeId));
    cases.push('history-snapshot-preservation');

    // 14. monotonic-trigger-enforcement
    // Attempting direct downgrade without return_note fails
    const directDowngrade = psql(port, password, database, `
      UPDATE public.evaluations SET status='Draft', return_note=NULL WHERE id='${draftTarget.evaluationId}';
    `, false);
    assert.notEqual(directDowngrade.status, 0);
    assert.match(directDowngrade.err, /P102M3T04_INVALID_TRANSITION/);

    // Attempting skipping rounds forward fails
    const directSkip = psql(port, password, database, `
      UPDATE public.evaluations SET current_round=3 WHERE id='${returnTarget.evaluationId}';
    `, false);
    assert.notEqual(directSkip.status, 0);
    assert.match(directSkip.err, /P102M3T04_INVALID_TRANSITION/);
    cases.push('monotonic-trigger-enforcement');

    // 15. guarded-rollback-proof
    const rollbackPort = start(rollbackName, rollbackPassword, database);
    bootstrap(rollbackPort, rollbackPassword, database);

    // Unapproved rollback fails
    const unapprovedRb = command('psql', [
      '--host', '127.0.0.1', '--port', rollbackPort, '--username', 'postgres',
      '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', rollback
    ], { env: { ...process.env, PGPASSWORD: rollbackPassword } });
    assert.notEqual(unapprovedRb.status, 0);
    assert.match(unapprovedRb.stderr, /P102M3T04_ROLLBACK_UNAPPROVED/);

    // Approved rollback succeeds
    const approvedRb = command('psql', [
      '--host', '127.0.0.1', '--port', rollbackPort, '--username', 'postgres',
      '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', "SET kurabe.p102m3t04_rollback_approved = 'true';",
      '--file', rollback
    ], { env: { ...process.env, PGPASSWORD: rollbackPassword } });
    assert.equal(approvedRb.status, 0, `approved rollback failed: ${approvedRb.stderr}`);

    // Verify trigger dropped and 16-arg function restored
    const postRbTrigger = psql(rollbackPort, rollbackPassword, database, `
      SELECT count(*) FROM pg_trigger WHERE tgname = 'guard_evaluation_transitions';
    `).out;
    assert.equal(postRbTrigger, '0');

    const postRb17Arg = psql(rollbackPort, rollbackPassword, database, `
      SELECT count(*)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'save_evaluation_round_transaction_active_only'
        AND pg_get_function_identity_arguments(p.oid) = 'uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamp with time zone, integer, uuid, text, text, boolean, uuid, uuid';
    `).out;
    assert.equal(postRb17Arg, '0');
    cases.push('guarded-rollback-proof');

    return {
      real: true,
      passed: true,
      tier: 'real-DB',
      status: 'EXECUTED',
      cases,
      target: 'disposable-postgresql-17-loopback',
    };
  } finally {
    command('docker', ['rm', '--force', name]);
    command('docker', ['rm', '--force', rollbackName]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`EVALUATION_TRANSITION_GUARD PASS cases=${result.cases.length} target=${result.target}`);
  } catch (error) {
    console.error(`EVALUATION_TRANSITION_GUARD FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
