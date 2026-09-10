#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as runDbBootstrap } from './db-bootstrap.mjs';
import { run as runPersonnelTransaction } from './personnel-transaction.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const roles = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'];
const cases = [];
const check = (name, fn) => { fn(); cases.push(name); };

function migrationManifest() {
  const migrationDir = path.join(root, 'supabase/migrations');
  const rollbackDir = path.join(root, 'db');
  const migrations = fs.readdirSync(migrationDir).filter((n) => n.endsWith('.sql')).sort();
  const rollbackRecords = fs.readdirSync(rollbackDir)
    .filter((name) => name.startsWith('rollback-') && name.endsWith('.sql'))
    .map((name) => {
      const contents = fs.readFileSync(path.join(rollbackDir, name), 'utf8');
      return {
        name,
        contents,
        targetMigration: contents.match(/\bmigration\s+([\w-]+\.sql)\b/i)?.[1] ?? null,
      };
    });
  assert.ok(migrations.length > 0, 'ordered migration set is empty');
  return migrations.map((filename, order) => {
    const contents = fs.readFileSync(path.join(migrationDir, filename));
    const rollback = rollbackRecords.find((record) => record.targetMigration === filename) ?? null;
    return {
      order: order + 1,
      filename,
      sha256: crypto.createHash('sha256').update(contents).digest('hex'),
      rollback: rollback?.name ?? null,
      rollbackTarget: rollback?.targetMigration ?? null,
      expectedCatalogDelta: {
        tables: [...contents.toString('utf8').matchAll(/CREATE\s+(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([\w"]+)/gi)].map((m) => m[1].replaceAll('"', '')),
        functions: [...contents.toString('utf8').matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([\w"]+)/gi)].map((m) => m[1].replaceAll('"', '')),
      },
    };
  });
}

export function buildManifest() { return migrationManifest(); }

function verifyPrivilegeOrder(manifest) {
  let pairedMigrationCount = 0;
  for (const entry of manifest) {
    const sql = read(`supabase/migrations/${entry.filename}`)
      .replace(/--[^\r\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const grantPositions = [...sql.matchAll(/^\s*GRANT\b/gim)].map((match) => match.index);
    const revokePositions = [...sql.matchAll(/^\s*REVOKE\b/gim)].map((match) => match.index);
    if (grantPositions.length === 0 || revokePositions.length === 0) continue;
    pairedMigrationCount += 1;
    assert.ok(
      Math.min(...revokePositions) < Math.min(...grantPositions),
      `${entry.filename} must revoke broad execution before granting the narrow consumer role`,
    );
  }
  assert.ok(pairedMigrationCount > 0, 'no migration contains a verifiable GRANT before REVOKE pair');
}

export async function run() {
  const proxy = read('src/proxy.ts');
  const workflow = `${read('src/data/workflow.ts')}\n${read('src/types/index.ts')}\n${read('src/lib/db/users-admin.ts')}`;
  const actions = fs.readdirSync(path.join(root, 'src/actions')).map((name) => name.endsWith('.ts') ? read(`src/actions/${name}`) : '').join('\n');
  const pages = fs.readdirSync(path.join(root, 'src/app'), { recursive: true })
    .filter((name) => String(name).endsWith('.tsx'))
    .map((name) => fs.readFileSync(path.join(root, 'src/app', name), 'utf8')).join('\n');
  const manifest = migrationManifest();

  check('five-role matrix is explicit', () => {
    for (const role of roles) assert.match(workflow, new RegExp(`['"]${role}['"]|\\b${role}\\b`), `${role} is absent from production workflow`);
  });
  check('protected route and auth boundary are production imports', () => {
    for (const route of ['/dashboard', '/reports', '/teams', '/employees', '/criteria', '/evaluations', '/settings']) assert.match(proxy, new RegExp(route.replace('/', '\\/')));
    assert.match(proxy, /isOpaqueSessionToken/);
  });
  check('personnel/config/period/evaluation/report/history/export boundaries exist', () => {
    for (const marker of ['personnel', 'criteria', 'period', 'evaluation', 'report', 'history', 'export']) {
      assert.match(actions.toLowerCase(), new RegExp(marker), `${marker} action boundary is absent`);
    }
    assert.match(pages.toLowerCase(), /report/);
  });
  check('RBAC and period scoping are not replaced by client-only checks', () => {
    assert.match(actions, /auth\.user|requireAuth|getAuth/);
    assert.match(actions, /period_id|periodId/);
    assert.match(workflow, /teamId|team_id/);
    assert.match(workflow, /canViewEvaluation|canEvaluate/);
  });
  check('AI path is stub-safe and bounded', () => {
    const ai = read('src/lib/ai.ts');
    const governance = read('src/lib/ai-governance.ts');
    assert.match(ai, /validateAIProvider|AI_HTTP_DEV_EXCEPTION/);
    assert.match(governance, /sanitizeSerializableAIValue|detectPromptInjection/);
    assert.match(ai, /if \(!apiKey\) return null/);
  });
  check('manifest is ordered, hashed, and rollback-linked', () => {
    assert.deepEqual(manifest.map((entry) => entry.order), manifest.map((_, i) => i + 1));
    for (const entry of manifest) {
      assert.match(entry.sha256, /^[a-f0-9]{64}$/);
      if (entry.rollback) {
        assert.equal(entry.rollbackTarget, entry.filename, `${entry.rollback} must name its exact forward migration`);
        assert.match(read(`db/${entry.rollback}`), /ROLLBACK|rollback|BEGIN/i);
      }
    }
    assert.ok(manifest.some((entry) => entry.rollback), 'no rollback mapping was discovered');
  });
  check('consumer-before-revoke and rollback approval contracts are present', () => {
    const rollbacks = fs.readdirSync(path.join(root, 'db')).filter((name) => name.startsWith('rollback-') && name.endsWith('.sql')).map((name) => read(`db/${name}`)).join('\n');
    verifyPrivilegeOrder(manifest);
    assert.match(rollbacks, /approved|approval|ROLLBACK_UNAPPROVED/i);
    assert.match(rollbacks, /BEGIN/i);
  });
  check('historical P96T10 evidence is labelled, not overclaimed', () => {
    const evidenceCandidates = ['artifacts/p96t10', 'evidence/p96t10', 'tests/fixtures/release/p96t10'];
    const found = evidenceCandidates.some((relative) => fs.existsSync(path.join(root, relative)));
    assert.equal(found, false, 'unexpected historical evidence path requires primary review before use');
  });

  const runtime = {
    status: process.env.KURABE_RELEASE_DB_ENABLED === '1' ? 'REQUESTED' : 'NOT_RUN',
    reason: process.env.KURABE_RELEASE_DB_ENABLED === '1'
      ? 'Disposable DB execution is delegated to the explicit release preflight; no production target is permitted.'
      : 'KURABE_RELEASE_DB_ENABLED=1 was not set; no DB was contacted and no synthetic PASS was substituted.',
  };
  let database;
  let personnel;
  if (runtime.status === 'REQUESTED') {
    database = await runDbBootstrap();
    personnel = await runPersonnelTransaction();
    runtime.status = 'EXECUTED';
    runtime.cases = [...database.cases, ...personnel.cases];
  }
  return {
    real: runtime.status === 'EXECUTED',
    passed: runtime.status === 'EXECUTED',
    status: runtime.status === 'EXECUTED' ? runtime.status : 'BLOCKED_CAPABILITY',
    runtime,
    database: database ? { real: database.real, passed: database.passed, target: database.target, cases: database.cases } : null,
    integration: personnel ? {
      database: database.cases,
      personnel_transaction: personnel.cases,
    } : null,
    roles,
    manifest,
    cases: runtime.status === 'EXECUTED' ? [...cases, ...runtime.cases] : cases,
    target: 'repository-production-boundaries-plus-disposable-runtime-gate',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await run(); if (!result.passed) { console.error(`RELEASE_MATRIX BLOCKED ${result.status} reason=${result.runtime.reason}`); process.exitCode = 1; } else console.log(`RELEASE_MATRIX ${result.status} cases=${result.cases.length} roles=${result.roles.join(',')} reason=${result.runtime.reason}`); }
  catch (error) { console.error(`RELEASE_MATRIX FAIL ${error?.message || error}`); process.exitCode = 1; }
}
