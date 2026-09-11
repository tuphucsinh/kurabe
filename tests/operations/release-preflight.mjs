#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildManifest, buildRollbackManifest } from '../integration/release-matrix.mjs';

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
  const rollbackRecords = buildRollbackManifest();
  const rollbackFiles = rollbackRecords.map((record) => record.name);
  assert.ok(rollbackFiles.length > 0, 'rollback package is empty');
  for (const record of rollbackRecords) {
    const text = fs.readFileSync(path.join(rollbackDir, record.name), 'utf8');
    assert.match(text, /current_setting\([^)]*rollback[^)]*\)|rollback[^\r\n]*(?:approval|approved)/i, `${record.name} must fail closed without explicit approval`);
    assert.match(text, /BEGIN\s*;/i, `${record.name} must be transactional`);
    if (/\bDROP\s+(?:INDEX|FUNCTION)\b|\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i.test(text)) {
      assert.match(text, /pg_description|obj_description/i, `${record.name} must verify object provenance before changing an existing object`);
    }
  }
  const p96t03 = rollbackRecords.find((record) => record.name === 'rollback-p96t03-single-active-period.sql');
  assert.ok(p96t03, 'P96T03 rollback must be explicitly mapped');
  const p96t03Text = fs.readFileSync(path.join(rollbackDir, p96t03.name), 'utf8');
  assert.match(p96t03Text, /kurabe\.p96t03_rollback_approved/);
  assert.match(p96t03Text, /P96T03: Enforces at most one active evaluation period at any time/);
  for (const entry of manifest.filter((item) => item.rollback)) {
    const record = rollbackRecords.find((item) => item.name === entry.rollback);
    assert.ok(record, `missing mapped rollback ${entry.rollback}`);
    assert.equal(entry.rollbackTarget, record.targetPath, `rollback ${entry.rollback} must identify ${entry.forwardPath}`);
  }
  return rollbackFiles.length;
}

function verifyPrivilegeOrder(manifest) {
  let pairedMigrationCount = 0;
  for (const item of manifest) {
    const sql = fs.readFileSync(path.join(root, 'supabase/migrations', item.filename), 'utf8')
      .replace(/--[^\r\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const grants = [...sql.matchAll(/^\s*GRANT\b/gim)].map((match) => match.index);
    const revokes = [...sql.matchAll(/^\s*REVOKE\b/gim)].map((match) => match.index);
    if (grants.length === 0 || revokes.length === 0) continue;
    pairedMigrationCount += 1;
    assert.ok(Math.min(...revokes) < Math.min(...grants), `${item.filename} must revoke broad execution before granting the narrow consumer role`);
  }
  assert.ok(pairedMigrationCount > 0, 'no migration contains a GRANT/REVOKE ordering pair');
}

function safeOutput(value) {
  return String(value || '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}

function firstCausalFailure(child) {
  const streams = [safeOutput(child.stderr), safeOutput(child.stdout)];
  const lines = streams.flatMap((stream) => stream.split(/\r?\n/).map((line) => line.trim())).filter(Boolean);
  return lines.find((line) => /(?:\b(?:ERROR|FATAL|FAIL|BLOCKED)\b|DB_BOOTSTRAP|Error:|exit=)/i.test(line) && !/\bwarning\b/i.test(line))
    || lines[0]
    || 'no diagnostic output';
}

export async function run() {
  const manifest = buildManifest();
  check('ordered migration manifest has SHA-256 and authoritative catalog contract', () => {
    assert.equal(manifest[0].order, 1);
    for (const item of manifest) {
      assert.match(item.sha256, /^[a-f0-9]{64}$/);
      assert.equal(item.forwardPath, `supabase/migrations/${item.filename}`);
      assert.deepEqual(item.authoritativeCatalog.predicate_keys, [
        'extensions', 'schemas', 'tables', 'columns', 'constraints', 'indexes',
        'policies', 'functions', 'triggers', 'roles', 'table_privileges', 'routine_privileges',
      ]);
      assert.match(item.authoritativeCatalog.expected_catalog_sha256, /^[a-f0-9]{64}$/);
    }
  });
  check('rollback mapping and pre-approved steps are fail-closed', () => {
    assert.ok(verifyRollbackContract(manifest) > 0);
    const rollbackText = fs.readdirSync(rollbackDir).filter((name) => name.startsWith('rollback-')).map((name) => fs.readFileSync(path.join(rollbackDir, name), 'utf8')).join('\n');
    assert.match(rollbackText, /current_setting\([^)]*rollback|approved/i);
    assert.match(rollbackText, /DROP|REVOKE|ALTER|CREATE OR REPLACE/i);
  });
  check('consumer-before-revoke ordering is recorded', () => {
    verifyPrivilegeOrder(manifest);
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
    return { real: false, passed: false, tier: 'real-DB', status: runtime.status, capability: runtime.status, reason: runtime.reason, cases, manifest, target: 'preflight-no-runtime-contact' };
  }

  const child = spawnSync(process.execPath, [path.join(root, 'tests/integration/db-bootstrap.mjs')], {
    cwd: root, encoding: 'utf8', timeout: 180_000,
    env: { ...process.env, KURABE_RELEASE_DB_ENABLED: '1' },
  });
  if (child.status !== 0) {
    const firstFailure = firstCausalFailure(child);
    const exit = child.error?.code === 'ETIMEDOUT' ? 'TIMEOUT' : (child.status ?? 'NO_EXIT_STATUS');
    throw new Error(`BLOCKED_CAPABILITY: disposable DB execution failed closed (exit=${exit}); first failure=${firstFailure}`);
  }
  const stdout = safeOutput(child.stdout);
  const stderr = safeOutput(child.stderr);
  const observed = [stdout, stderr]
    .flatMap((stream) => stream.split(/\r?\n/).map((line) => line.trim()))
    .filter(Boolean);
  return {
    real: true,
    passed: true,
    tier: 'real-DB',
    status: 'EXECUTED',
    runtime: {
      ...runtime,
      child_exit_code: child.status,
      stdout,
      stderr,
      observed_lines: observed,
    },
    cases: [...cases, 'disposable PostgreSQL bootstrap and FK-safe teardown', 'db-bootstrap-output-captured'],
    manifest,
    target: 'loopback-disposable-postgresql',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    if (!result.passed) {
      console.error(`RELEASE_PREFLIGHT BLOCKED ${result.status} reason=${result.reason || result.runtime.reason}`);
      process.exitCode = 1;
    } else {
      console.log(`RELEASE_PREFLIGHT ${result.status} cases=${result.cases.length} migrations=${result.manifest.length} reason=${result.reason || result.runtime.reason}`);
      for (const testCase of result.cases) console.log(`  CASE ${testCase}`);
      for (const line of result.runtime?.observed_lines || []) console.log(`  RUNTIME ${line}`);
    }
  }
  catch (error) { console.error(`RELEASE_PREFLIGHT FAIL ${error?.message || error}`); process.exitCode = 1; }
}
