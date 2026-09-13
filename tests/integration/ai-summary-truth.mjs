import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(root, 'supabase/migrations/20260911000500_ai_summary_coverage.sql');
const rollbackPath = path.join(root, 'db/rollback-ai-summary-coverage.sql');
const summaryActionPath = path.join(root, 'src/actions/ai-summary.ts');
const minutesActionPath = path.join(root, 'src/actions/ai.ts');
const cardPath = path.join(root, 'src/components/reports/AiSummaryCard.tsx');
const minutesPath = path.join(root, 'src/components/reports/PeriodMinutesModal.tsx');
const governancePath = path.join(root, 'src/lib/ai-governance.ts');

function rewrite(sql, qualifiedSchema) {
  return sql.replaceAll('public.', `${qualifiedSchema}.`);
}

export async function run({ options = {} } = {}) {
  const env = { ...process.env, PGPASSWORD: process.env.PGPASSWORD || '' };
  const dbName = options.dbName || process.env.PGDATABASE || process.env.DB_NAME || 'postgres';
  const host = options.dbHost || process.env.PGHOST || process.env.DB_HOST || '127.0.0.1';
  const port = options.dbPort || process.env.PGPORT || process.env.DB_PORT || '5432';
  const user = options.dbUser || process.env.PGUSER || process.env.DB_USER || 'postgres';
  const schema = `p102m3t06_${process.pid}_${Date.now()}`;
  const qualifiedSchema = `"${schema}"`;
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const rollback = fs.readFileSync(rollbackPath, 'utf8');

  function psql(sql, extra = {}) {
    const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-h', host, '-p', port, '-U', user, '-d', dbName], {
      input: sql,
      encoding: 'utf8',
      env,
      ...extra,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status !== 0) throw new Error(output.trim() || `psql exited ${result.status}`);
    return (result.stdout || '').trim();
  }

  function expectRejected(sql, marker) {
    const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-h', host, '-p', port, '-U', user, '-d', dbName], {
      input: sql,
      encoding: 'utf8',
      env,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.notEqual(result.status, 0, `expected rejection: ${marker}`);
    assert.match(output, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  let cases = 0;
  try {
    psql(`CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA ${qualifiedSchema};
CREATE TABLE ${qualifiedSchema}.evaluation_periods (id uuid PRIMARY KEY, status text NOT NULL);
CREATE TABLE ${qualifiedSchema}.ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_id uuid NOT NULL UNIQUE,
  summary text NOT NULL, created_by uuid, created_at timestamptz DEFAULT now()
);
INSERT INTO ${qualifiedSchema}.evaluation_periods VALUES
  ('00000000-0000-0000-0000-000000000001', 'active'),
  ('00000000-0000-0000-0000-000000000003', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'closed');
INSERT INTO ${qualifiedSchema}.ai_summaries(period_id, summary) VALUES
  ('00000000-0000-0000-0000-000000000001', 'legacy');
${rewrite(migration, qualifiedSchema)}`);
    const columns = psql(`SELECT count(*) FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'ai_summaries' AND column_name IN ('coverage_status','coverage_total_items','coverage_fitted_items','coverage_dropped_items','coverage_truncated','coverage_fields','source_revision','source_generated_at');`);
    assert.equal(columns, '8'); cases += 1;
    assert.equal(psql(`SELECT coverage_status FROM ${qualifiedSchema}.ai_summaries WHERE summary = 'legacy';`), 'unknown'); cases += 1;
    const actor = '00000000-0000-0000-0000-000000000010';
    const result = psql(`SELECT ${qualifiedSchema}.upsert_ai_summary_if_active('00000000-0000-0000-0000-000000000003','new', '${actor}', 'partial', 4, 3, 1, true, '{"comments":{"truncated":true}}'::jsonb, repeat('a', 64), now());`);
    assert.match(result, /partial/); cases += 1;
    assert.equal(psql(`SELECT coverage_status || '|' || coverage_total_items || '|' || coverage_fitted_items || '|' || coverage_dropped_items || '|' || coverage_truncated FROM ${qualifiedSchema}.ai_summaries WHERE summary = 'new';`), 'partial|4|3|1|true'); cases += 1;
    expectRejected(`SELECT ${qualifiedSchema}.upsert_ai_summary_if_active('00000000-0000-0000-0000-000000000002','closed', '${actor}', 'complete', 1, 1, 0, false, '{}'::jsonb, repeat('b', 64), now());`, 'P102M3T06_WRITE_REJECTED'); cases += 1;
    assert.equal(psql(`SELECT has_function_privilege('anon', '${schema}.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz)', 'EXECUTE') || '|' || has_function_privilege('service_role', '${schema}.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz)', 'EXECUTE');`), 'false|true'); cases += 1;
    expectRejected(rewrite(rollback, qualifiedSchema), 'P102M3T06_ROLLBACK_UNAPPROVED'); cases += 1;
    psql(`SET kurabe.p102m3t06_rollback_approved = 'true';\n${rewrite(rollback, qualifiedSchema)}`);
    assert.equal(psql(`SELECT count(*) FROM ${qualifiedSchema}.ai_summaries WHERE summary IN ('legacy','new');`), '2'); cases += 1;
    assert.equal(psql(`SELECT count(*) FROM pg_attribute WHERE attrelid = '${schema}.ai_summaries'::regclass AND attname IN ('coverage_status','coverage_total_items','coverage_fitted_items','coverage_dropped_items','coverage_truncated','coverage_fields','source_revision','source_generated_at') AND NOT attisdropped;`), '0'); cases += 1;
    assert.equal(psql(`SELECT to_regprocedure('${schema}.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz)') IS NULL;`), 't'); cases += 1;

    const source = fs.readFileSync(summaryActionPath, 'utf8');
    const minutes = fs.readFileSync(minutesActionPath, 'utf8');
    const card = fs.readFileSync(cardPath, 'utf8');
    const modal = fs.readFileSync(minutesPath, 'utf8');
    const governance = fs.readFileSync(governancePath, 'utf8');
    assert.match(source, /status === 'Submitted'/); assert.match(source, /upsert_ai_summary_if_active/); assert.match(source, /sourceRevision/); assert.match(source, /coverage_total_items/); cases += 1;
    assert.doesNotMatch(source, /totalScore\s*>\s*0/); cases += 1;
    assert.match(minutes, /sourceSummaryCoverage/); assert.match(card, /initialCoverage|coverage\.status/); assert.match(modal, /sourceSummaryCoverage/); assert.match(governance, /fieldTruncation/); cases += 1;
    return { real: true, passed: true, tier: 'real-DB', status: 'EXECUTED', authenticated: false, cases: Array.from({ length: cases }, (_, index) => `case-${index + 1}`), target: 'isolated-local-db-ai-summary-truth' };
  } finally {
    try { psql(`DROP SCHEMA IF EXISTS ${qualifiedSchema} CASCADE;`); } catch { /* preserve original failure */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((result) => console.log(`AI_SUMMARY_TRUTH PASS cases=${result.cases.length} tier=${result.tier}`)).catch((error) => {
    console.error(`AI_SUMMARY_TRUTH FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
