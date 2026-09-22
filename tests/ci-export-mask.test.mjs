import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportEnv, getSensitiveValues } from '../.github/ci/confirmation-runtime.mjs';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const cases = [];

// Case 1: getSensitiveValues extracts all explicitly named keys and state credential fields
{
  const mockState = {
    password: 'db_password_dummy_hex_value',
    fixturePassword: 'KurabeCI-fixture_password_dummy',
    jwtSecret: 'jwt_secret_token_dummy_value',
    customSecretKey: 'custom_secret_dummy_value',
    dbPort: 5432,
    db: 'kurabe_harness_ci_test',
    name: 'kurabe-ci-test',
    sha: '0123456789abcdef0123456789abcdef01234567',
  };
  const mockValues = {
    KURABE_DB_PASSWORD: mockState.password,
    KURABE_FIXTURE_PASSWORD: mockState.fixturePassword,
    KURABE_SUPABASE_ANON_KEY: 'anon_jwt_token_dummy_value',
    KURABE_SUPABASE_SERVICE_ROLE_KEY: 'service_role_jwt_token_dummy_value',
    KURABE_DB_HOST: '127.0.0.1',
    KURABE_DB_PORT: '5432',
    KURABE_DB_NAME: 'kurabe_harness_ci_test',
  };

  const sensitive = getSensitiveValues(mockState, mockValues);
  assert.ok(sensitive.includes('db_password_dummy_hex_value'), 'must include KURABE_DB_PASSWORD');
  assert.ok(sensitive.includes('KurabeCI-fixture_password_dummy'), 'must include KURABE_FIXTURE_PASSWORD');
  assert.ok(sensitive.includes('anon_jwt_token_dummy_value'), 'must include KURABE_SUPABASE_ANON_KEY');
  assert.ok(sensitive.includes('service_role_jwt_token_dummy_value'), 'must include KURABE_SUPABASE_SERVICE_ROLE_KEY');
  assert.ok(sensitive.includes('jwt_secret_token_dummy_value'), 'must include state.jwtSecret');
  assert.ok(sensitive.includes('custom_secret_dummy_value'), 'must include state field matching secret');

  // Must not include non-sensitive data
  assert.ok(!sensitive.includes('127.0.0.1'), 'must not mask host');
  assert.ok(!sensitive.includes('5432'), 'must not mask port');
  assert.ok(!sensitive.includes('kurabe_harness_ci_test'), 'must not mask db name');
  assert.ok(!sensitive.includes(mockState.sha), 'must not mask sha');

  cases.push('getSensitiveValues correctly extracts sensitive credentials and excludes non-sensitive data');
}

// Case 2: getSensitiveValues never emits empty string, undefined, or null
{
  const mockState = {
    password: '',
    fixturePassword: null,
    jwtSecret: undefined,
    emptySecret: '',
  };
  const mockValues = {
    KURABE_DB_PASSWORD: '',
    KURABE_FIXTURE_PASSWORD: undefined,
    KURABE_SUPABASE_ANON_KEY: null,
    KURABE_SUPABASE_SERVICE_ROLE_KEY: '',
  };

  const sensitive = getSensitiveValues(mockState, mockValues);
  assert.equal(sensitive.length, 0, 'must not extract empty or non-string values');
  cases.push('getSensitiveValues never extracts empty string, null, or undefined');
}

// Case 3: getSensitiveValues deduplicates values
{
  const sharedPassword = 'shared_credential_dummy_value';
  const mockState = {
    password: sharedPassword,
    fixturePassword: sharedPassword,
  };
  const mockValues = {
    KURABE_DB_PASSWORD: sharedPassword,
    KURABE_FIXTURE_PASSWORD: sharedPassword,
    KURABE_SUPABASE_ANON_KEY: 'token_anon_value',
    KURABE_SUPABASE_SERVICE_ROLE_KEY: 'token_service_value',
  };

  const sensitive = getSensitiveValues(mockState, mockValues);
  const occurrences = sensitive.filter((v) => v === sharedPassword).length;
  assert.equal(occurrences, 1, 'duplicate sensitive values must be deduplicated');
  cases.push('getSensitiveValues deduplicates identical secret values');
}

// Case 4: exportEnv emits ::add-mask:: to stdout and writes identical env lines
{
  const tmpEnvFile = path.join(os.tmpdir(), `ci-mask-test-${Date.now()}-${Math.random().toString(36).slice(2)}.env`);
  const mockState = {
    supabaseUrl: 'http://127.0.0.1:8000',
    anonKey: 'anon_synthetic_key_dummy',
    serviceRoleKey: 'service_role_synthetic_key_dummy',
    dbPort: 5432,
    db: 'kurabe_harness_ci_test',
    password: 'db_password_dummy_48hexchars_value',
    fixtureRunId: '00000000-0000-4000-8000-000000000001',
    name: 'kurabe-ci-test',
    networkId: 'kurabe-ci-test-net',
    sha: 'abcdef0123456789abcdef0123456789abcdef01',
    fixturePassword: 'fixture_password_dummy_value',
    nextPort: 3000,
    jwtSecret: 'jwt_secret_dummy_value',
    bootstrapResult: '/tmp/bootstrap.json',
  };

  const loggedLines = [];
  const origLog = console.log;
  try {
    console.log = (msg) => {
      loggedLines.push(String(msg));
    };
    exportEnv({ state: mockState, envPath: tmpEnvFile });
  } finally {
    console.log = origLog;
  }

  // Check mask lines in logged output
  const maskLines = loggedLines.filter((l) => l.startsWith('::add-mask::'));
  assert.ok(maskLines.length >= 5, 'must emit mask lines for all secrets');
  assert.ok(maskLines.includes(`::add-mask::${mockState.password}`), 'must mask db password');
  assert.ok(maskLines.includes(`::add-mask::${mockState.fixturePassword}`), 'must mask fixture password');
  assert.ok(maskLines.includes(`::add-mask::${mockState.anonKey}`), 'must mask anon key');
  assert.ok(maskLines.includes(`::add-mask::${mockState.serviceRoleKey}`), 'must mask service role key');
  assert.ok(maskLines.includes(`::add-mask::${mockState.jwtSecret}`), 'must mask jwt secret');

  // Verify no empty masks
  assert.ok(!maskLines.some((l) => l === '::add-mask::'), 'must not emit empty mask');

  // Check written env file content
  assert.ok(fs.existsSync(tmpEnvFile), 'env file must exist');
  const envContent = fs.readFileSync(tmpEnvFile, 'utf8');
  assert.match(envContent, new RegExp(`KURABE_DB_PASSWORD=${mockState.password}`));
  assert.match(envContent, new RegExp(`KURABE_FIXTURE_PASSWORD=${mockState.fixturePassword}`));
  assert.match(envContent, new RegExp(`KURABE_SUPABASE_ANON_KEY=${mockState.anonKey}`));
  assert.match(envContent, new RegExp(`KURABE_SUPABASE_SERVICE_ROLE_KEY=${mockState.serviceRoleKey}`));
  assert.match(envContent, /KURABE_DB_HOST=127\.0\.0\.1/);
  assert.match(envContent, /KURABE_LOCAL_STACK_OWNED=1/);

  // Clean up
  try { fs.unlinkSync(tmpEnvFile); } catch {}
  cases.push('exportEnv emits ::add-mask:: for all sensitive values and preserves env file integrity');
}

console.log(`CI_EXPORT_MASK PASS cases=${cases.length}`);
for (const c of cases) {
  console.log(`  ✓ ${c}`);
}
