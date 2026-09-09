#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runBootstrap, validateDisposableIdentity } from '../../scripts/db-bootstrap.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function command(file, args, options = {}) {
  return spawnSync(file, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function mustCommand(file, args, options = {}) {
  const result = command(file, args, options);
  if (result.status !== 0) {
    throw new Error(`${file} failed (${result.status}): ${String(result.stderr || '').trim()}`);
  }
  return String(result.stdout || '').trim();
}

function expectRefusal(callback, marker) {
  assert.throws(callback, (error) => String(error?.message || error).includes(marker));
}

function startPostgres(containerName, password, database) {
  const id = mustCommand('docker', [
    'run', '--detach', '--rm', '--name', containerName,
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', `POSTGRES_DB=${database}`,
    '--publish', '127.0.0.1::5432',
    'postgres:17-alpine',
  ]);
  assert.ok(id.length > 10, 'docker must return a container id');
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = command('docker', ['exec', containerName, 'pg_isready', '--username', 'postgres', '--dbname', 'postgres']);
    if (ready.status === 0) break;
    if (attempt === 59) throw new Error('disposable PostgreSQL did not become ready');
  }
  const portText = mustCommand('docker', ['port', containerName, '5432/tcp']);
  const match = portText.match(/127\.0\.0\.1:(\d+)/);
  if (!match) throw new Error('could not determine loopback PostgreSQL port');
  return Number(match[1]);
}

export async function run() {
  const firstContainer = `kurabe-p99m1t01-a-${process.pid}`;
  const secondContainer = `kurabe-p99m1t01-b-${process.pid}`;
  const firstPassword = crypto.randomBytes(24).toString('base64url');
  const secondPassword = crypto.randomBytes(24).toString('base64url');
  const oldPassword = process.env.PGPASSWORD;
  process.env.PGPASSWORD = firstPassword;
  const cases = [];
  try {
    const firstPort = startPostgres(firstContainer, firstPassword, 'kurabe_harness_p99m1t01_a');
    process.env.PGPASSWORD = secondPassword;
    const secondPort = startPostgres(secondContainer, secondPassword, 'kurabe_harness_p99m1t01_b');

    expectRefusal(() => validateDisposableIdentity({ host: '10.0.0.8', port: String(firstPort), database: 'kurabe_harness_bad', user: 'postgres' }), 'REFUSE_NON_DISPOSABLE_HOST');
    cases.push('remote-host-refusal');
    expectRefusal(() => validateDisposableIdentity({ host: '127.0.0.1', port: String(firstPort), database: 'postgres', user: 'postgres' }), 'REFUSE_NON_DISPOSABLE_DATABASE');
    cases.push('production-database-name-refusal');

    process.env.PGPASSWORD = firstPassword;
    const first = runBootstrap({ host: '127.0.0.1', port: String(firstPort), database: 'kurabe_harness_p99m1t01_a', user: 'postgres', rootDir: projectRoot });
    assert.equal(first.real, true);
    assert.equal(first.passed, true);
    assert.equal(first.ledgerCount, 16);
    cases.push('empty-to-full-schema');
    cases.push('ordered-forward-ledger-replay');
    cases.push('normalized-expected-catalog-match');

    process.env.PGPASSWORD = secondPassword;
    const second = runBootstrap({ host: '127.0.0.1', port: String(secondPort), database: 'kurabe_harness_p99m1t01_b', user: 'postgres', rootDir: projectRoot });
    assert.equal(second.catalogHash, first.catalogHash, 'repeated fresh setup must produce the same catalog fingerprint');
    cases.push('repeat-setup-determinism');

    process.env.PGPASSWORD = firstPassword;
    expectRefusal(() => runBootstrap({ host: '127.0.0.1', port: String(firstPort), database: 'kurabe_harness_p99m1t01_a', user: 'postgres', rootDir: projectRoot }), 'REFUSE_NON_EMPTY_PUBLIC_SCHEMA');
    cases.push('non-empty-target-refusal');

    return {
      real: true,
      passed: true,
      cases,
      target: 'disposable-postgresql-17',
    };
  } finally {
    if (oldPassword === undefined) delete process.env.PGPASSWORD;
    else process.env.PGPASSWORD = oldPassword;
    command('docker', ['rm', '--force', firstContainer]);
    command('docker', ['rm', '--force', secondContainer]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`DB_BOOTSTRAP_INTEGRATION PASS cases=${result.cases.length} target=${result.target}`);
  } catch (error) {
    console.error(`DB_BOOTSTRAP_INTEGRATION FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
