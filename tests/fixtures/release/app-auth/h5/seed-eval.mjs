import { sql } from './client.mjs';
const period='30000000-0000-0000-0000-000000000001';
const evaluation='30000000-0000-0000-0000-000000000002';
// Match the standalone H5 PASS fixture: L1 evaluates the assigned SubLeader
// on Team B, while L1's own primary membership remains Team A.
const employee='10000000-0000-0000-0000-000000000004';
const sub='10000000-0000-0000-0000-000000000004';
const leader='10000000-0000-0000-0000-000000000002';
const team='20000000-0000-0000-0000-000000000002';
const manager='10000000-0000-0000-0000-000000000001';
const cfg=JSON.parse(sql("SELECT row_to_json(x) FROM (SELECT (SELECT id FROM criteria_config_versions WHERE is_active ORDER BY version_no DESC LIMIT 1) criteria_id, (SELECT id FROM grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1) grade_id) x"));
sql(`INSERT INTO evaluation_periods(id,year,name,status,created_by) VALUES ('${period}',2026,'H5 active','active','${manager}');`);
sql(`INSERT INTO evaluations(id,period_id,employee_id,employee_role,team_id,current_round,status) VALUES ('${evaluation}','${period}','${employee}','SubLeader','${team}',1,'NotStarted');`);
sql(`INSERT INTO evaluation_rounds(id,evaluation_id,round,evaluator_id,evaluator_role,status) VALUES (gen_random_uuid(),'${evaluation}',1,'${sub}','SubLeader','NotStarted');`);
const draft=sql(`SELECT * FROM public.save_evaluation_round_transaction_active_only('${evaluation}',1,'${sub}','{\"quality-result\":3,\"team-cooperation\":3}'::jsonb,'{}'::jsonb,'fixture-valid-round-1-draft',60,'C',false,now(),NULL,NULL,NULL,NULL,false,'${cfg.criteria_id}','${cfg.grade_id}');`);
const rpc=sql(`SELECT * FROM public.save_evaluation_round_transaction_active_only('${evaluation}',1,'${sub}','{\"quality-result\":3,\"team-cooperation\":3}'::jsonb,'{}'::jsonb,'fixture-valid-round-1',60,'C',true,now(),2,'${leader}','Leader','Submitted',false,'${cfg.criteria_id}','${cfg.grade_id}');`);
console.log(JSON.stringify({period,evaluation,config:cfg,draft,rpc,evaluations:sql("SELECT id,current_round,status FROM evaluations"),rounds:sql(`SELECT evaluation_id,round,evaluator_id,status,submitted_at FROM evaluation_rounds WHERE evaluation_id='${evaluation}' ORDER BY round`)}));
