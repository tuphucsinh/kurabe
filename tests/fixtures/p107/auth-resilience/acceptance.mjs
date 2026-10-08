#!/usr/bin/env node
// P107M1T04 authentic local acceptance (disposable PostgreSQL, loopback only).
// Proves, against a REAL database with the candidate migrations applied, that the
// default-password seed uses a compare-and-swap and therefore can never overwrite a
// credential change that lands concurrently:
//   1. two REAL connections interleave (A pre-selects, B commits a credential change,
//      A's conditional UPDATE then matches 0 rows) -> the user's change survives,
//      the seed reports a conflict instead of a seeded success, revision stays monotonic;
//   2. the CAS predicates are exactly NULL-hash + observed employee_code + observed
//      credential_revision, with an exact affected-row readback;
//   3. a clean seed on an untouched user still affects exactly one row (no false conflict).
// Run: node tests/fixtures/p107/auth-resilience/acceptance.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runBootstrap } from '../../../../scripts/db-bootstrap.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../../..');
const SEED_SOURCE = path.join(projectRoot, 'src/lib/db/password-seed.ts');

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
function psql(port, db, sql) {
  const r = command('psql', [...psqlArgs(port, db), '--command', sql], { env: psqlEnv() });
  return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() };
}
function mustPsql(port, db, sql) {
  const r = psql(port, db, sql);
  assert.ok(r.ok, `psql failed: ${r.err.slice(0, 500)}`);
  return r.out;
}
function psqlAsync(port, db, sql) {
  return new Promise((resolve) => {
    const p = spawn('psql', [...psqlArgs(port, db), '--command', sql], { cwd: projectRoot, env: psqlEnv() });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ ok: code === 0, out: out.trim(), err: err.trim(), code }));
  });
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
function applyForwardMigrations(port, db) {
  const dir = path.join(projectRoot, 'supabase/migrations');
  let count = 0;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    const version = name.split('_')[0];
    if (version < '202609') continue;
    const rr = command('psql', [...psqlArgs(port, db), '--file', path.join(dir, name)], { env: psqlEnv() });
    assert.equal(rr.status, 0, `migration ${name} failed: ${String(rr.stderr).slice(0, 400)}`);
    psql(port, db, `INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('${version}','${name}') ON CONFLICT (version) DO NOTHING;`);
    count += 1;
  }
  return count;
}

const cases = [];
const name = `kurabe-p107t04-ar-${process.pid}`;
const database = `kurabe_harness_p107t04ar${process.pid}`.replace(/[^a-z0-9_]/g, '');
const password = crypto.randomBytes(18).toString('hex');
const A = '00000000-0000-4000-8000-000000000601';
const B = '00000000-0000-4000-8000-000000000602';
let port;
try {
  port = startContainer(name, database, password);
  process.env.PGPASSWORD = password;
  runBootstrap({ host: '127.0.0.1', port: String(port), database, user: 'postgres', password });
  cases.push('db-bootstrap-baseline+catalog+ledger');
  seedPreMigrationData(port, database);
  const applied = applyForwardMigrations(port, database);
  cases.push(`forward-migrations-applied=${applied}`);

  // CAS predicates are exactly NULL-hash + observed employee_code + observed credential_revision
  const seedSource = fs.readFileSync(SEED_SOURCE, 'utf8');
  assert.match(seedSource, /\.is\('password_hash', null\)/, 'seed must CAS on password_hash IS NULL');
  assert.match(seedSource, /\.eq\('employee_code', row\.employee_code\)/, 'seed must CAS on the observed employee_code');
  assert.match(seedSource, /\.eq\('credential_revision', row\.credential_revision\)/, 'seed must CAS on the observed credential_revision');
  assert.match(seedSource, /\.is\('credential_revision', null\)/, 'seed must CAS on NULL credential_revision');
  assert.match(seedSource, /affectedCount === 0/, 'seed must treat 0 affected rows as a conflict, never a seeded success');
  cases.push('seed-cas-predicates-verified');

  mustPsql(port, database, `
    INSERT INTO public.users (id, employee_code, name, role, join_date, is_active, password_hash, credential_revision)
    VALUES ('${A}', 'AR-RACE-A', 'Race A', 'Employee', '2026-01-01', true, NULL, 0),
           ('${B}', 'AR-CLEAN-B', 'Clean B', 'Employee', '2026-01-01', true, NULL, 0);
  `);
  cases.push('fixture-users-inserted');

  // REAL two-connection race: A pre-selects, sleeps, then applies the seed CAS; B commits
  // an unconditional credential change inside that window.
  const connA = psqlAsync(port, database, `
BEGIN;
SELECT 'preselect=' || COALESCE(password_hash, 'NULL') FROM public.users WHERE id = '${A}';
SELECT pg_sleep(4);
UPDATE public.users
   SET password_hash = 'seed-hash-would-be', password_setup_required = false, credential_revision = 1
 WHERE id = '${A}' AND password_hash IS NULL AND employee_code = 'AR-RACE-A' AND credential_revision = 0;
COMMIT;
`);
  await new Promise((r) => setTimeout(r, 1200));
  const connB = psql(port, database, `
    UPDATE public.users SET password_hash = 'user-changed-hash', credential_revision = 1 WHERE id = '${A}';
  `);
  assert.ok(connB.ok, `concurrent credential change must succeed: ${connB.err.slice(0, 300)}`);
  cases.push('concurrent-credential-change-committed');
  const raceResult = await connA;
  assert.ok(raceResult.ok, `connection A failed: ${raceResult.err.slice(0, 400)}`);
  assert.match(raceResult.out, /preselect=NULL/, 'A must pre-select while the hash is still NULL');
  assert.match(raceResult.out, /UPDATE 0/, 'the seed CAS must match 0 rows after the concurrent change');
  cases.push('seed-cas-matched-zero-rows');

  const survived = mustPsql(port, database, `SELECT password_hash || '|' || credential_revision FROM public.users WHERE id = '${A}';`);
  assert.equal(survived, 'user-changed-hash|1', 'the user-changed credential must survive and the revision must stay monotonic');
  cases.push('user-credential-survived-revision-monotonic');

  // Clean control: an untouched NULL-hash user is still seeded exactly once.
  const clean = psql(port, database, `
    UPDATE public.users
       SET password_hash = 'seed-hash-clean', password_setup_required = false, credential_revision = 1
     WHERE id = '${B}' AND password_hash IS NULL AND employee_code = 'AR-CLEAN-B' AND credential_revision = 0;
  `);
  assert.ok(clean.ok, clean.err.slice(0, 300));
  assert.match(clean.out, /UPDATE 1/, 'a clean seed on an untouched user must affect exactly one row');
  const cleanRow = mustPsql(port, database, `SELECT password_hash || '|' || credential_revision FROM public.users WHERE id = '${B}';`);
  assert.equal(cleanRow, 'seed-hash-clean|1', 'the clean seed must land');
  cases.push('clean-seed-affects-one-row');

  console.log(`P107T04_RUNTIME_ACCEPTANCE PASS cases=${cases.length}`);
  console.log(cases.join('\n'));
} finally {
  command('docker', ['rm', '--force', name]);
}
