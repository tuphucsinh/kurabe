#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, buildRollbackManifest } from '../integration/release-matrix.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readBuffer = (file) => fs.readFileSync(path.join(root, file));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const cases = [];
const check = (name, fn) => { fn(); cases.push(name); };

function assertRelativePath(relativePath, prefixes) {
  const allowedPrefixes = Array.isArray(prefixes) ? prefixes : [prefixes];
  assert.equal(path.isAbsolute(relativePath), false, `${relativePath} must be repository-relative`);
  assert.ok(allowedPrefixes.some((prefix) => relativePath.startsWith(prefix)), `${relativePath} is outside the expected release package`);
  assert.equal(path.normalize(relativePath), relativePath, `${relativePath} must not contain path traversal`);
  assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} is missing`);
}

function verifyMigrationHashes(manifest) {
  const filenames = manifest.map((entry) => entry.filename);
  assert.deepEqual(filenames, [...filenames].sort(), 'migration order must be deterministic and lexical');
  assert.equal(new Set(filenames).size, filenames.length, 'migration filenames must be unique');
  assert.deepEqual(manifest.map((entry) => entry.order), filenames.map((_, index) => index + 1), 'migration order must be contiguous');

  for (const entry of manifest) {
    assertRelativePath(entry.forwardPath, 'supabase/migrations/');
    assert.equal(entry.forwardPath, `supabase/migrations/${entry.filename}`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(entry.sha256, sha256(readBuffer(entry.forwardPath)), `${entry.forwardPath} hash drifted from the generated manifest`);
    assert.ok(entry.authoritativeCatalog);
    assert.match(entry.authoritativeCatalog.expected_catalog_sha256, /^[a-f0-9]{64}$/);
  }
}

function verifyRollbackMappings(manifest, rollbackRecords) {
  const byName = new Map(rollbackRecords.map((record) => [record.name, record]));
  const targets = new Map();
  for (const record of rollbackRecords) {
    assertRelativePath(`db/${record.name}`, 'db/');
    assertRelativePath(record.targetPath, ['supabase/migrations/', 'db/migration-']);
    assert.match(record.sha256, /^[a-f0-9]{64}$/);
    assert.equal(record.sha256, sha256(readBuffer(`db/${record.name}`)), `${record.name} hash drifted`);
    assert.equal(targets.has(record.targetPath), false, `multiple rollback files target ${record.targetPath}`);
    targets.set(record.targetPath, record.name);

    const rollbackText = read(`db/${record.name}`);
    assert.match(rollbackText, /BEGIN\s*;/i, `${record.name} must be transactional`);
    assert.match(rollbackText, /current_setting\([^)]*rollback[^)]*\)|rollback[^\r\n]*(?:approval|approved)/i, `${record.name} must fail closed without approval`);
    if (/\bDROP\s+(?:INDEX|FUNCTION)\b|\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i.test(rollbackText)) {
      assert.match(rollbackText, /pg_description|obj_description/i, `${record.name} must verify object provenance before changing an existing object`);
    }
  }

  for (const entry of manifest) {
    if (entry.rollback === null) {
      assert.equal(entry.rollbackTarget, null, `${entry.filename} has a rollback target without a rollback file`);
      continue;
    }
    const record = byName.get(entry.rollback);
    assert.ok(record, `${entry.filename} references missing rollback ${entry.rollback}`);
    assert.equal(entry.rollbackTarget, record.targetPath, `${entry.rollback} must target ${entry.forwardPath}`);
    assert.equal(record.targetPath, entry.forwardPath, `${entry.rollback} target must match its forward migration`);
  }
}

function verifySheetJsProvenance() {
  const packageJson = JSON.parse(read('package.json'));
  const lockfile = JSON.parse(read('package-lock.json'));
  const declared = packageJson.dependencies?.xlsx;
  const locked = lockfile.packages?.['node_modules/xlsx'];
  assert.equal(declared, 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz', 'SheetJS must use the approved external vendor tarball');
  assert.ok(locked, 'package-lock.json must contain the SheetJS package entry');
  assert.equal(locked.version, '0.20.3');
  assert.equal(locked.resolved, declared, 'lockfile resolution must match the declared SheetJS vendor URL');
  assert.match(locked.integrity, /^sha512-[A-Za-z0-9+/]+=*$/);
  assert.equal(/registry\.npmjs\.org|npmjs\.org/i.test(locked.resolved), false, 'SheetJS evidence must not silently use npm registry provenance');
  return { declared, version: locked.version, resolved: locked.resolved, integrity: locked.integrity };
}

export async function run() {
  const manifest = buildManifest();
  const rollbackRecords = buildRollbackManifest();
  check('ordered migration hashes are reproducible and current', () => {
    verifyMigrationHashes(manifest);
    assert.deepEqual(manifest, buildManifest(), 'migration manifest must be deterministic across independent reads');
  });
  check('rollback files are complete, paired, transactional, and fail-closed', () => {
    assert.ok(rollbackRecords.length > 0, 'rollback package must not be empty');
    verifyRollbackMappings(manifest, rollbackRecords);
  });
  const vendor = verifySheetJsProvenance();
  check('external SheetJS vendor provenance is explicit and separately auditable', () => {
    assert.equal(vendor.version, '0.20.3');
    assert.match(vendor.integrity, /^sha512-/);
  });
  check('authoritative bootstrap catalog remains hashed', () => {
    const bootstrap = manifest[0].authoritativeCatalog;
    assert.deepEqual(bootstrap.predicate_keys, [
      'extensions', 'schemas', 'tables', 'columns', 'constraints', 'indexes',
      'policies', 'functions', 'triggers', 'roles', 'table_privileges', 'routine_privileges',
    ]);
  });

  return {
    real: true,
    passed: true,
    tier: 'source-contract',
    status: 'EXECUTED',
    cases,
    migrations: manifest.length,
    rollbacks: rollbackRecords.length,
    vendor: { source: vendor.resolved, version: vendor.version, integrity: vendor.integrity },
    target: 'repository-release-manifest-and-vendor-provenance',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`RELEASE_MANIFEST_INTEGRITY ${result.status} cases=${result.cases.length} migrations=${result.migrations} rollbacks=${result.rollbacks}`);
  } catch (error) {
    console.error(`RELEASE_MANIFEST_INTEGRITY FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
