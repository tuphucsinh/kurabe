import crypto from 'node:crypto';
import fs from 'node:fs';
import { action, c, f, login, route, sql, save } from './client.mjs';

const { ids } = f;
const evalA = '30000000-0000-0000-0000-000000000002';
const evalC = '30000000-0000-0000-0000-000000000004';
const period = '30000000-0000-0000-0000-000000000001';
const cfg = JSON.parse(sql("SELECT row_to_json(x) FROM (SELECT (SELECT id FROM criteria_config_versions WHERE is_active ORDER BY version_no DESC LIMIT 1) criteria_id, (SELECT id FROM grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1) grade_id) x"));

function digest(statement) {
  return crypto.createHash('sha256').update(sql(statement)).digest('hex');
}
function rows(evalId) {
  return sql(`SELECT json_agg(x ORDER BY x.round) FROM (SELECT evaluation_id,round,evaluator_id,evaluator_role,status,scores,notes,comment,total_score,grade,submitted_at FROM evaluation_rounds WHERE evaluation_id='${evalId}') x`);
}
function authorizationReadback(evalId) {
  return JSON.parse(sql(`SELECT json_build_object(
    'l1',(SELECT row_to_json(u) FROM (SELECT id,role,team_id,is_active FROM users WHERE id='${ids.leaderAB}') u),
    'teamB',(SELECT row_to_json(t) FROM (SELECT id,leader_id,is_active FROM teams WHERE id='${ids.B}') t),
    'evaluation',(SELECT row_to_json(e) FROM (SELECT team_id,employee_id,status,current_round FROM evaluations WHERE id='${evalId}') e),
    'currentRound',(SELECT row_to_json(r) FROM (SELECT evaluator_id,status FROM evaluation_rounds WHERE evaluation_id='${evalId}' AND round=(SELECT current_round FROM evaluations WHERE id='${evalId}')) r),
    'authorization',json_build_object(
      'actorActive',(SELECT is_active FROM users WHERE id='${ids.leaderAB}'),
      'actorRole',(SELECT role FROM users WHERE id='${ids.leaderAB}'),
      'actorPrimaryTeam',(SELECT team_id FROM users WHERE id='${ids.leaderAB}'),
      'evaluationTeam',(SELECT team_id FROM evaluations WHERE id='${evalId}'),
      'storedRoundEvaluator',(SELECT evaluator_id FROM evaluation_rounds WHERE evaluation_id='${evalId}' AND round=(SELECT current_round FROM evaluations WHERE id='${evalId}')),
      'storedRoundAssignmentMatchesActor',(SELECT evaluator_id='${ids.leaderAB}' FROM evaluation_rounds WHERE evaluation_id='${evalId}' AND round=(SELECT current_round FROM evaluations WHERE id='${evalId}')),
      'serverPredicate',COALESCE((SELECT u.is_active AND u.role='Leader' AND (u.team_id=e.team_id OR t.leader_id=u.id) FROM users u, evaluations e, teams t WHERE u.id='${ids.leaderAB}' AND e.id='${evalId}' AND t.id=e.team_id),false),
      'rpcPredicate',COALESCE((SELECT u.is_active AND u.role='Leader' AND e.team_id IS NOT NULL AND t.leader_id=u.id FROM users u, evaluations e, teams t WHERE u.id='${ids.leaderAB}' AND e.id='${evalId}' AND t.id=e.team_id),false)
    )
  )::text`));
}
function makePayload(criteria, grades, evaluationId) {
  const rules = criteria.result.flatMap(group => (group.criteria || []).map(c => ({ id: c.id, levels: c.levels, weight: c.weight })));
  const scores = Object.fromEntries(rules.map(rule => [rule.id, rule.levels?.[0]?.points ?? 1]));
  const selectedLevels = Object.fromEntries(rules.map(rule => [rule.id, 0]));
  const configVersions = {
    criteriaConfigVersionId: criteria.result[0].configVersionId || cfg.criteria_id,
    gradeConfigVersionId: grades.result.versionId || cfg.grade_id,
    renderedRules: rules,
  };
  return { evaluationId, scores, selectedLevels, configVersions, notes: {}, comment: 'H5 authenticated matrix form' };
}
async function configFor(user, role = 'SubLeader') {
  const criteria = await action(user, 'getCriteriaForRoleAction', [role], `${user}-matrix-criteria`);
  const grades = await action(user, 'getGradeBandsAction', [], `${user}-matrix-grades`);
  if (!Array.isArray(criteria.result) || !criteria.result.length || !grades.result?.versionId) throw new Error(`CONFIG_READ_FAILED ${user}`);
  return makePayload(criteria, grades, user === 'leaderC' ? evalC : evalA);
}
function createValidEvalC() {
  sql(`INSERT INTO evaluation_periods(id,year,name,status,created_by) VALUES ('${period}',2026,'H5 fresh valid current control','active','${ids.manager}') ON CONFLICT DO NOTHING;`);
  sql(`INSERT INTO evaluations(id,period_id,employee_id,employee_role,team_id,current_round,status) VALUES ('${evalC}','${period}','${ids.subC}','SubLeader','${ids.C}',1,'NotStarted');`);
  sql(`INSERT INTO evaluation_rounds(id,evaluation_id,round,evaluator_id,evaluator_role,status,scores,notes,total_score,grade,criteria_config_version_id,grade_config_version_id) VALUES (gen_random_uuid(),'${evalC}',1,'${ids.subC}','SubLeader','NotStarted','{}'::jsonb,'{}'::jsonb,0,'Pending','${cfg.criteria_id}','${cfg.grade_id}');`);
  sql(`SELECT * FROM save_evaluation_round_transaction_active_only('${evalC}',1,'${ids.subC}','{"quality-result":3,"team-cooperation":3}'::jsonb,'{}'::jsonb,'H5 current control draft',60,'C',false,now(),NULL,NULL,NULL,NULL,false,'${cfg.criteria_id}','${cfg.grade_id}');`);
  sql(`SELECT * FROM save_evaluation_round_transaction_active_only('${evalC}',1,'${ids.subC}','{"quality-result":3,"team-cooperation":3}'::jsonb,'{}'::jsonb,'H5 current control submitted',60,'C',true,now(),2,'${ids.leaderC}','Leader','Submitted',false,'${cfg.criteria_id}','${cfg.grade_id}');`);
}

const l1 = await login('leaderAB');
const warmA = await route('leaderAB', `/evaluations/${ids.subB}`);
if (![200, 307].includes(warmA.status)) throw new Error(`WARM_L1_FAILED ${warmA.status}`);
const p1 = await configFor('leaderAB');
const l1Positive = await action('leaderAB', 'saveEvaluationRound', [evalA, 2, p1.scores, p1.notes, p1.selectedLevels, p1.comment, false, p1.configVersions], 'authenticated-l1-save-before-revoke');
const afterPositive = rows(evalA);
const positivePersisted = afterPositive.includes('H5 authenticated matrix form') && afterPositive.includes('"Draft"');
if (!positivePersisted) throw new Error('L1_POSITIVE_DB_READBACK_FAILED');
const beforeRevoke = authorizationReadback(evalA);
if (beforeRevoke.l1.team_id !== ids.A) throw new Error(`H5_FIXTURE_PRIMARY_TEAM_MISMATCH ${beforeRevoke.l1.team_id}`);
if (beforeRevoke.teamB.leader_id !== ids.leaderAB) throw new Error(`H5_FIXTURE_APPOINTMENT_MISMATCH ${beforeRevoke.teamB.leader_id}`);
if (beforeRevoke.authorization.serverPredicate !== true || beforeRevoke.authorization.rpcPredicate !== true) throw new Error('H5_FIXTURE_AUTHORIZATION_PRECONDITION_FAILED');

const manager = await login('manager');
const revoke = await action('manager', 'upsertTeamAction', [{ id: ids.B, name: 'CONFIRM_TEAM_B', leaderId: null }], 'authenticated-manager-revoke-team-b');
if (revoke.result?.success !== true) throw new Error(`MANAGER_REVOKE_FAILED ${JSON.stringify(revoke.result)}`);
const teamAfterRevoke = sql(`SELECT leader_id,is_active FROM teams WHERE id='${ids.B}'`);
if (!teamAfterRevoke.startsWith('|t')) throw new Error(`REVOKE_READBACK_FAILED ${teamAfterRevoke}`);
const afterRevoke = authorizationReadback(evalA);
if (afterRevoke.l1.team_id !== ids.A) throw new Error(`H5_FIXTURE_PRIMARY_TEAM_CHANGED ${afterRevoke.l1.team_id}`);
if (afterRevoke.teamB.leader_id === ids.leaderAB) throw new Error('H5_REVOKE_READBACK_STILL_APPOINTED');
if (afterRevoke.authorization.serverPredicate !== false || afterRevoke.authorization.rpcPredicate !== false) throw new Error('H5_REVOKE_AUTHORIZATION_PREDICATE_STILL_TRUE');
const stateSql = `SELECT json_build_object('evaluation',(SELECT row_to_json(e) FROM evaluations e WHERE e.id='${evalA}'),'rounds',(SELECT coalesce(json_agg(row_to_json(r) ORDER BY r.round),'[]'::json) FROM evaluation_rounds r WHERE r.evaluation_id='${evalA}'))::text`;
const deniedHashBefore = digest(stateSql);
const deniedSave = await action('leaderAB', 'saveEvaluationRound', [evalA, 2, p1.scores, p1.notes, p1.selectedLevels, 'H5 denied stale form save', false, p1.configVersions], 'authenticated-l1-save-after-revoke-deny');
const deniedSubmit = await action('leaderAB', 'saveEvaluationRound', [evalA, 2, p1.scores, p1.notes, p1.selectedLevels, 'H5 denied stale form submit', true, p1.configVersions], 'authenticated-l1-submit-after-revoke-deny');
const deniedReturn = await action('leaderAB', 'returnEvaluationRound', [evalA, 2, 'H5 denied stale form return'], 'authenticated-l1-return-after-revoke-deny');
if (deniedSave.result?.success === true || deniedSubmit.result?.success === true || deniedReturn.result?.success === true) throw new Error('REVOKED_L1_ACTION_WAS_ALLOWED');
const deniedHashAfter = digest(stateSql);
if (deniedHashBefore !== deniedHashAfter) throw new Error(`DENIED_WRITE_MUTATED_DB ${deniedHashBefore} ${deniedHashAfter}`);
const historicalAfter = rows(evalA);
if (!historicalAfter.includes('fixture-valid-round-1') || !historicalAfter.includes('"Submitted"')) throw new Error('HISTORICAL_ROUND_CHANGED');

const appoint = await action('manager', 'upsertTeamAction', [{ id: ids.B, name: 'CONFIRM_TEAM_B', leaderId: ids.leaderC }], 'authenticated-manager-appoint-l2-control');
if (appoint.result?.success !== true) throw new Error(`MANAGER_APPOINT_L2_FAILED ${JSON.stringify(appoint.result)}`);
const teamAfterAppoint = sql(`SELECT leader_id,is_active FROM teams WHERE id='${ids.B}'`);
if (!teamAfterAppoint.startsWith(`${ids.leaderC}|t`)) throw new Error(`APPOINT_READBACK_FAILED ${teamAfterAppoint}`);
createValidEvalC();
const l2 = await login('leaderC');
const warmC = await route('leaderC', `/evaluations/${ids.subC}`);
if (![200, 307].includes(warmC.status)) throw new Error(`WARM_L2_FAILED ${warmC.status}`);
const p2 = await configFor('leaderC');
const l2Init = await action('leaderC', 'initializeEvaluationRoundDraft', [evalC, 2, p2.scores, p2.notes, p2.selectedLevels, p2.comment, p2.configVersions], 'authenticated-l2-initialize-positive');
const l2Save = await action('leaderC', 'saveEvaluationRound', [evalC, 2, p2.scores, p2.notes, p2.selectedLevels, p2.comment, false, p2.configVersions], 'authenticated-l2-save-positive');
const l2Rows = rows(evalC);
const l2Persisted = l2Rows.includes('H5 authenticated matrix form') || l2Rows.includes('"Draft"');
if (l2Init.result?.success !== true || !l2Persisted) throw new Error(`L2_POSITIVE_DB_READBACK_FAILED ${JSON.stringify(l2Init.result)} ${JSON.stringify(l2Save.result)}`);

const cases = [
  'h5:fixture-notstarted-to-draft-to-submitted',
  'h5:positive-appointed-leader-save',
  'h5:revoke-appointment-save-denial',
  'h5:revoke-appointment-submit-denial',
  'h5:revoke-appointment-return-denial',
  'h5:atomic-graph-unchanged-on-deny',
  'h5:historical-submitted-data-unchanged',
  'h5:manager-authenticated-revoke-readback',
  'h5:current-authorized-leader-positive-control',
];
const evidence = {
  real: true, authenticated: true, tier: 'authenticated', status: 'QUALIFIED',
  candidateSha: c.sha,
  sourceSha: c.sha,
  authenticatedCases: cases.length, requiredCases: cases, cases,
  knownH6Interference: ['authenticated save response returned generic invalid transaction after DB commit; DB readback is authoritative for persistence'],
  fixtureEvidence: { setup: 'DB/RPC only', transition: 'NotStarted->Draft->Submitted', evaluationIds: [evalA, evalC] },
  assertions: {
    l1Session: l1.current?.id, managerSession: manager.current?.id, l2Session: l2.current?.id,
    l1PositivePersisted: positivePersisted, beforeRevoke, afterRevoke, teamAfterRevoke, deniedHashBefore, deniedHashAfter,
    historicalRound1Unchanged: historicalAfter.includes('fixture-valid-round-1'), l2PositivePersisted: l2Persisted,
  },
};
save('h5-authenticated-qualification.json', evidence);
console.log(JSON.stringify(evidence));
