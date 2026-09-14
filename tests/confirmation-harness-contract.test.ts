import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Use dynamicImport to load ESM modules from CJS without tsc rewriting import() to require()
const dynamicImport = new Function('url', 'return import(url)');

type ErrorLike = { code?: string; message?: string; missing?: string[] };

interface ConfirmationRuntimeModule {
  validateConfirmationTarget: (target: Record<string, unknown>) => Record<string, unknown>;
  validateRuntimeEnvironment: (env?: Record<string, string | undefined>) => Record<string, unknown>;
}

interface ConfirmationFixturesModule {
  cleanupConfirmationFixtures: (target: Record<string, unknown>, options?: Record<string, unknown>) => Record<string, unknown>;
  FIXTURE_ACTORS: Record<string, { id: string; employeeCode: string; name: string; role: string; teamId: string }>;
  FIXTURE_TEAMS: Record<string, { id: string; name: string; leaderId: string }>;
  FIXTURE_PERIODS: Record<string, { id: string; status: string }>;
}

async function run() {
  const runtimePath = path.resolve(process.cwd(), 'tests/support/confirmation-runtime.mjs');
  const fixturesPath = path.resolve(process.cwd(), 'tests/support/confirmation-fixtures.mjs');

  const runtimeMod = (await dynamicImport(pathToFileURL(runtimePath).href)) as ConfirmationRuntimeModule;
  const {
    validateConfirmationTarget,
    validateRuntimeEnvironment,
  } = runtimeMod;

  const fixturesMod = (await dynamicImport(pathToFileURL(fixturesPath).href)) as ConfirmationFixturesModule;
  const {
    cleanupConfirmationFixtures,
    FIXTURE_ACTORS,
    FIXTURE_TEAMS,
    FIXTURE_PERIODS,
  } = fixturesMod;

  console.log('[P103M1T01] Running confirmation harness contract unit tests...');

  // Every database fixture identifier must be a real UUID before a disposable
  // PostgreSQL insert is attempted. This prevents source-only tests from
  // passing with placeholder IDs that the database would reject.
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const [name, value] of Object.entries(fixturesMod)) {
    if (!name.startsWith('FIXTURE_') || !name.endsWith('_ID')) continue;
    assert.equal(typeof value, 'string', `${name} must be a string UUID`);
    assert.match(value as string, uuidPattern, `${name} must be a canonical UUID`);
  }

  // 1. Negative host cases
  // Non-loopback DB host rejected
  assert.throws(
    () => {
      validateConfirmationTarget({
        host: '192.168.1.10',
        port: 5432,
        database: 'kurabe_harness_disposable_1',
        user: 'postgres',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_NON_LOOPBACK_HOST' || /REFUSE_NON_LOOPBACK_HOST/.test(e?.message || '');
    },
    'Non-loopback IP host must be rejected with REFUSE_NON_LOOPBACK_HOST'
  );

  assert.throws(
    () => {
      validateConfirmationTarget({
        host: 'prod.database.internal',
        port: 5432,
        database: 'kurabe_harness_disposable_1',
        user: 'postgres',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_NON_LOOPBACK_HOST' || /REFUSE_NON_LOOPBACK_HOST/.test(e?.message || '');
    },
    'External domain host must be rejected with REFUSE_NON_LOOPBACK_HOST'
  );

  // Non-loopback and cloud Supabase URLs rejected
  assert.throws(
    () => {
      validateConfirmationTarget({
        host: '127.0.0.1',
        port: 5432,
        database: 'kurabe_harness_disposable_1',
        user: 'postgres',
        supabaseUrl: 'https://example.supabase.co',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_PRODUCTION_URL' || /REFUSE_PRODUCTION_URL|REFUSE_NON_LOOPBACK_URL/.test(e?.message || '');
    },
    'Cloud Supabase URL must be rejected'
  );

  assert.throws(
    () => {
      validateConfirmationTarget({
        host: '127.0.0.1',
        port: 5432,
        database: 'kurabe_harness_disposable_1',
        user: 'postgres',
        supabaseUrl: 'http://192.168.1.50:54321',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_NON_LOOPBACK_URL' || /REFUSE_NON_LOOPBACK_URL/.test(e?.message || '');
    },
    'Non-loopback Supabase URL must be rejected'
  );

  // 2. Negative DB-name cases
  // Production / non-disposable database names rejected
  assert.throws(
    () => {
      validateConfirmationTarget({
        host: '127.0.0.1',
        port: 5432,
        database: 'kurabe_production',
        user: 'postgres',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_PRODUCTION_DATABASE' || /REFUSE_PRODUCTION_DATABASE/.test(e?.message || '');
    },
    'Production database name must be rejected with REFUSE_PRODUCTION_DATABASE'
  );

  assert.throws(
    () => {
      validateConfirmationTarget({
        host: '127.0.0.1',
        port: 5432,
        database: 'kurabe_prod_db',
        user: 'postgres',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_PRODUCTION_DATABASE' || /REFUSE_PRODUCTION_DATABASE/.test(e?.message || '');
    },
    'Database name with prod must be rejected with REFUSE_PRODUCTION_DATABASE'
  );

  assert.throws(
    () => {
      validateConfirmationTarget({
        host: '127.0.0.1',
        port: 5432,
        database: 'postgres',
        user: 'postgres',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_NON_DISPOSABLE_DATABASE' || /REFUSE_NON_DISPOSABLE_DATABASE/.test(e?.message || '');
    },
    'Default postgres database must be rejected with REFUSE_NON_DISPOSABLE_DATABASE'
  );

  assert.throws(
    () => {
      validateConfirmationTarget({
        host: '127.0.0.1',
        port: 5432,
        database: 'test_db',
        user: 'postgres',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_NON_DISPOSABLE_DATABASE' || /REFUSE_NON_DISPOSABLE_DATABASE/.test(e?.message || '');
    },
    'Database not matching kurabe_harness_* pattern must be rejected'
  );

  // 3. Missing-env cases
  // Empty or incomplete env fails with MISSING_RUNTIME_CAPABILITY
  assert.throws(
    () => {
      validateRuntimeEnvironment({});
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'MISSING_RUNTIME_CAPABILITY' && /MISSING_RUNTIME_CAPABILITY/.test(e?.message || '');
    },
    'Empty env must fail with MISSING_RUNTIME_CAPABILITY'
  );

  assert.throws(
    () => {
      validateRuntimeEnvironment({
        KURABE_LOCAL_STACK_OWNED: '1',
        KURABE_DB_HOST: '127.0.0.1',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'MISSING_RUNTIME_CAPABILITY' && Array.isArray(e?.missing) && e.missing.length > 0;
    },
    'Partial env must report missing variables'
  );

  assert.throws(
    () => {
      validateRuntimeEnvironment({
        KURABE_LOCAL_STACK_OWNED: '0',
        KURABE_SUPABASE_URL: 'http://127.0.0.1:54321',
        KURABE_SUPABASE_ANON_KEY: 'anon',
        KURABE_SUPABASE_SERVICE_ROLE_KEY: 'service',
        KURABE_DB_HOST: '127.0.0.1',
        KURABE_DB_PORT: '5432',
        KURABE_DB_NAME: 'kurabe_harness_test',
        KURABE_DB_USER: 'postgres',
        KURABE_DB_PASSWORD: 'password',
        KURABE_SUPABASE_STACK_NAME: 'stack',
        KURABE_SUPABASE_NETWORK_ID: 'net',
      });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'MISSING_RUNTIME_CAPABILITY';
    },
    'KURABE_LOCAL_STACK_OWNED != 1 must fail closed'
  );

  // 4. Unknown-ownership cleanup cases
  // Refuses cleanup if ownership is explicitly not owned or unverified
  const dummyTarget = {
    host: '127.0.0.1',
    port: 5432,
    database: 'kurabe_harness_test',
    user: 'postgres',
  };

  assert.throws(
    () => {
      cleanupConfirmationFixtures(dummyTarget, { ownership: { owned: false } });
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_UNKNOWN_OWNERSHIP_CLEANUP' || /REFUSE_UNKNOWN_OWNERSHIP_CLEANUP/.test(e?.message || '');
    },
    'cleanupConfirmationFixtures must refuse cleanup for unowned target'
  );

  assert.throws(
    () => {
      const origEnv = process.env.KURABE_LOCAL_STACK_OWNED;
      try {
        delete process.env.KURABE_LOCAL_STACK_OWNED;
        cleanupConfirmationFixtures(dummyTarget, {});
      } finally {
        if (origEnv !== undefined) {
          process.env.KURABE_LOCAL_STACK_OWNED = origEnv;
        }
      }
    },
    (err: unknown) => {
      const e = err as ErrorLike;
      return e?.code === 'REFUSE_UNKNOWN_OWNERSHIP_CLEANUP' || /REFUSE_UNKNOWN_OWNERSHIP_CLEANUP/.test(e?.message || '');
    },
    'cleanupConfirmationFixtures must refuse cleanup when ownership flag is missing from environment'
  );

  // 5. Verify fixture actor structure contracts
  assert.equal(Object.keys(FIXTURE_ACTORS).length, 6, 'Must have exactly six synthetic actors');
  assert.ok(FIXTURE_ACTORS.manager);
  assert.ok(FIXTURE_ACTORS.leader_a);
  assert.ok(FIXTURE_ACTORS.leader_c);
  assert.ok(FIXTURE_ACTORS.subleader_b);
  assert.ok(FIXTURE_ACTORS.employee_b);
  assert.ok(FIXTURE_ACTORS.worker_b);

  assert.equal(Object.keys(FIXTURE_TEAMS).length, 3, 'Must have exactly three teams (A, B, C)');
  assert.equal(FIXTURE_TEAMS.team_a.leaderId, FIXTURE_ACTORS.leader_a.id, 'Team A leader must be Leader A');
  assert.equal(FIXTURE_TEAMS.team_b.leaderId, FIXTURE_ACTORS.leader_a.id, 'Team B leader must be appointed Leader A');
  assert.equal(FIXTURE_TEAMS.team_c.leaderId, FIXTURE_ACTORS.leader_c.id, 'Team C leader must be unrelated Leader C');

  assert.equal(Object.keys(FIXTURE_PERIODS).length, 2, 'Must have exactly two periods (active + closed)');
  assert.equal(FIXTURE_PERIODS.active.status, 'active');
  assert.equal(FIXTURE_PERIODS.closed.status, 'closed');

  console.log('confirmation-harness-contract unit tests: ALL PASS');
}

run().catch((err) => {
  console.error('confirmation-harness-contract test FAILED:', err);
  process.exit(1);
});
