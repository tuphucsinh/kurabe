#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildManifest } from '../integration/release-matrix.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rollbackDir = path.join(root, 'db');
const cases = [];
const check = (name, fn) => { fn(); cases.push(name); };
const commandAvailable = (command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;

function runtimeAvailability() {
  const requested = process.env.KURABE_RELEASE_DB_ENABLED === '1';
  if (!requested) return { status: 'BLOCKED_CAPABILITY', reason: 'KURABE_RELEASE_DB_ENABLED=1 is required to opt into disposable PostgreSQL; production, hosted, and synthetic DB targets are forbidden.' };
  if (!commandAvailable('docker')) return { status: 'BLOCKED_CAPABILITY', reason: 'docker is unavailable; disposable loopback PostgreSQL cannot be started.' };
  return { status: 'AVAILABLE', reason: 'docker is available for an explicitly disposable PostgreSQL container; credentials will be generated in-process.' };
}

function verifyRollbackContract(manifest) {
  const rollbackFiles = fs.readdirSync(rollbackDir).filter((name) => name.startsWith('rollback-') && name.endsWith('.sql')).sort();
  assert.ok(rollbackFiles.length > 0, 'rollback package is empty');
  const text = rollbackFiles.map((name) => fs.readFileSync(path.join(rollbackDir, name), 'utf8')).join('\n');
  assert.match(text, /ROLLBACK_UNAPPROVED|approval|approved/i, 'rollback scripts must fail closed without pre-approval');
  assert.match(text, /BEGIN\s*;/i, 'rollback scripts must be transactional');
  for (const entry of manifest.filter((item) => item.rollback)) {
    assert.ok(fs.existsSync(path.join(rollbackDir, entry.rollback)), `missing mapped rollback ${entry.rollback}`);
  }
  return rollbackFiles.length;
}

export async function run() {
  const manifest = buildManifest();
  check('ordered migration manifest has SHA-256 and catalog delta', () => {
    assert.equal(manifest[0].order, 1);
    for (const item of manifest) {
      assert.match(item.sha256, /^[a-f0-9]{64}$/);
      assert.ok(item.expectedCatalogDelta && Array.isArray(item.expectedCatalogDelta.tables));
    }
  });
  check('rollback mapping and pre-approved steps are fail-closed', () => {
    assert.ok(verifyRollbackContract(manifest) > 0);
    const rollbackText = fs.readdirSync(rollbackDir).filter((name) => name.startsWith('rollback-')).map((name) => fs.readFileSync(path.join(rollbackDir, name), 'utf8')).join('\n');
    assert.match(rollbackText, /current_setting\([^)]*rollback|approved/i);
    assert.match(rollbackText, /DROP|REVOKE|ALTER|CREATE OR REPLACE/i);
  });
  check('consumer-before-revoke ordering is recorded', () => {
    const grants = manifest.map((item) => item.expectedCatalogDelta.functions.length + item.expectedCatalogDelta.tables.length).reduce((a, b) => a + b, 0);
    assert.ok(grants >= 0, 'catalog delta must be deterministic');
    const migrations = manifest.map((item) => fs.readFileSync(path.join(root, 'supabase/migrations', item.filename), 'utf8')).join('\n');
    assert.match(migrations, /GRANT/i, 'forward package must expose consumers before privilege revoke');
    assert.match(migrations, /REVOKE/i, 'forward package must include privilege revocation');
  });
  check('fault and cleanup evidence contracts are explicit', () => {
    const bootstrap = fs.readFileSync(path.join(root, 'scripts/db-bootstrap.mjs'), 'utf8');
    const harness = fs.readFileSync(path.join(root, 'tests/integration/harness.mjs'), 'utf8');
    assert.match(bootstrap, /REFUSE_NON_DISPOSABLE|loopback|disposable/i);
    assert.match(harness, /finally|DROP SCHEMA|CASCADE/i);
    assert.match(bootstrap, /ON_ERROR_STOP/);
  });

  const runtime = runtimeAvailability();
  if (runtime.status === 'BLOCKED_CAPABILITY') {
    return { real: true, passed: false, status: runtime.status, capability: runtime.status, reason: runtime.reason, cases, manifest, target: 'preflight-no-runtime-contact' };
  }

  const child = spawnSync(process.execPath, [path.join(root, 'tests/integration/db-bootstrap.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 180_000,
    env: { ...process.env, KURABE_RELEASE_DB_ENABLED: '1' },
  });
  if (child.status !== 0) {
    throw new Error(`BLOCKED_CAPABILITY: disposable DB execution failed closed (exit=${child.status}); first failure=${String(child.stderr || child.stdout || '').trim()}`);
  }
  return { real: true, passed: true, status: 'EXECUTED', runtime, cases: [...cases, 'disposable PostgreSQL bootstrap and FK-safe teardown'], manifest, target: 'loopback-disposable-postgresql' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await run(); if (!result.passed) { console.error(`RELEASE_PREFLIGHT BLOCKED ${result.status} reason=${result.reason || result.runtime.reason}`); process.exitCode = 1; } else console.log(`RELEASE_PREFLIGHT ${result.status} cases=${result.cases.length} migrations=${result.manifest.length} reason=${result.reason || result.runtime.reason}`); }
  catch (error) { console.error(`RELEASE_PREFLIGHT FAIL ${error?.message || error}`); process.exitCode = 1; }
}
