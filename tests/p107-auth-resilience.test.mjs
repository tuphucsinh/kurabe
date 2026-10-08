// =============================================================================
// P107M1T04 — Compatible login resilience suite
// =============================================================================
// Offline, self-contained node:test suite. No network, no database, no
// production services, no credentials. It exercises the REAL sources:
//   * src/lib/login-rate-limit.ts  (resolveClientNetwork / proxy trust / limits)
//   * src/actions/auth.ts          (loginAction credential + enumeration paths)
// through Node native TypeScript type-stripping plus a small ESM resolve hook
// that stubs server-only dependencies (Supabase admin, next/headers, audit...).
//
// Scope guarantees asserted here:
//   * Spoofed / malformed / trusted proxy headers and shared NAT ingress.
//   * Absent trust configuration fails closed for forwarded identity.
//   * The source-proven account-existence enumeration timing distinction is
//     removed (a failing bcrypt comparison runs for missing accounts too)
//     WITHOUT claiming any unproven constant-time guarantee.
//   * Account admission stays atomic (RPC) and is not weakened; untrusted
//     shared NAT keeps availability while account limits still apply.
//   * Session finalization and failed-login accounting are not weakened.
//   * The exact `KURABE_REQUIRE_PASSWORD_LOGIN === 'true'` strict path stays a
//     separate, non-activated source-contract test.
//
// Run: node --test tests/p107-auth-resilience.test.mjs
// =============================================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..');

// Re-anchor to the worktree root so relative imports/source reads are stable
// regardless of invocation directory.
const rootMarker = path.join('src', 'actions', 'auth.ts');
if (!fs.existsSync(path.join(process.cwd(), rootMarker)) && fs.existsSync(path.join(rootDir, rootMarker))) {
  process.chdir(rootDir);
}

// ----------------------------------------------------------------------------
// Shared mutable state (globalThis survives the data: stub modules)
// ----------------------------------------------------------------------------
const DUMMY_ENV_KEYS = [
  'KURABE_TRUSTED_PROXY_PEER',
  'KURABE_TRUSTED_PROXIES',
  'KURABE_TRUSTED_PROXY_HOPS',
  'KURABE_REQUIRE_PASSWORD_LOGIN',
];

globalThis.__p107_state = null;

function freshState() {
  const cookies = new Map();
  return {
    users: [],
    sessions: [],
    headers: {},
    cookieValues: cookies,
    admission: { allowed: true, error: null, lockedBy: null },
    issueResult: { success: true },
    rpcCalls: [],
    finalizeCalls: [],
    issueCalls: [],
    compareCalls: [],
    cookiesSet: [],
  };
}

globalThis.__p107_next = {
  headers() {
    const state = globalThis.__p107_state;
    return {
      get(name) {
        const key = String(name).toLowerCase();
        const value = state.headers[key];
        return value === undefined ? null : value;
      },
    };
  },
  cookies() {
    const state = globalThis.__p107_state;
    return {
      get(name) {
        return state.cookieValues.has(name) ? { value: state.cookieValues.get(name) } : undefined;
      },
      set(name, value) {
        state.cookieValues.set(name, value);
        state.cookiesSet.push({ name, value });
      },
      delete(name) {
        state.cookieValues.delete(name);
      },
    };
  },
};

globalThis.__p107_issue = (...args) => {
  const state = globalThis.__p107_state;
  state.issueCalls.push(args);
  return Promise.resolve(state.issueResult);
};

globalThis.__p107_completeSetup = async () => ({ success: true });

// Generic Supabase admin mock: enough for the read/select, session delete and
// RPC surface used by loginAction + login-rate-limit.
globalThis.__p107_supabase = {
  from(table) {
    const state = globalThis.__p107_state;
    const filters = [];
    let op = 'select';
    let countOpt = null;

    function matches(row) {
      for (const [kind, col, val] of filters) {
        if (kind === 'eq') {
          if (row[col] !== val) return false;
        } else if (kind === 'in') {
          if (!val.includes(row[col])) return false;
        } else if (kind === 'is') {
          if (val === null) {
            if (row[col] !== null && row[col] !== undefined) return false;
          } else if (row[col] !== val) {
            return false;
          }
        }
      }
      return true;
    }

    async function run() {
      if (table === 'users') {
        if (op === 'select') return state.users.filter(matches).map((r) => ({ ...r }));
        throw new Error(`__p107_supabase: unsupported users op ${op}`);
      }
      if (table === 'sessions') {
        if (op === 'select') return state.sessions.filter(matches).map((r) => ({ ...r }));
        if (op === 'delete') {
          state.sessions = state.sessions.filter((r) => !matches(r));
          return [];
        }
        throw new Error(`__p107_supabase: unsupported sessions op ${op}`);
      }
      throw new Error(`__p107_supabase: unexpected table ${table}`);
    }

    const builder = {
      select() {
        return builder;
      },
      eq(col, val) {
        filters.push(['eq', col, val]);
        return builder;
      },
      in(col, vals) {
        filters.push(['in', col, vals]);
        return builder;
      },
      is(col, val) {
        filters.push(['is', col, val]);
        return builder;
      },
      update() {
        op = 'update';
        return builder;
      },
      insert() {
        op = 'insert';
        return builder;
      },
      delete(opts) {
        op = 'delete';
        if (opts && opts.count) countOpt = opts.count;
        return builder;
      },
      async maybeSingle() {
        const rows = await run();
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = await run();
        return { data: rows[0] ?? null, error: null };
      },
      then(onFulfilled, onRejected) {
        return run().then((rows) => ({ data: rows, error: null, count: countOpt ? rows.length : null })).then(onFulfilled, onRejected);
      },
    };
    return builder;
  },

  rpc(fn, args) {
    const state = globalThis.__p107_state;
    state.rpcCalls.push({ fn, args });
    if (fn === 'acquire_login_admission') {
      const admission = state.admission;
      return Promise.resolve({
        data: [
          {
            allowed: admission.allowed,
            account_attempts: 0,
            ip_attempts: 0,
            locked_by: admission.lockedBy,
            retry_after_seconds: 0,
          },
        ],
        error: admission.error,
      });
    }
    if (fn === 'finalize_login_admission') {
      state.finalizeCalls.push(args);
      return Promise.resolve({
        data: [
          {
            finalized: true,
            allowed: false,
            account_attempts: 1,
            ip_attempts: 1,
            locked_by: 'failed',
            retry_after_seconds: 0,
          },
        ],
        error: null,
      });
    }
    if (fn === 'clear_login_attempts') {
      return Promise.resolve({ data: 0, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
  },
};

// ----------------------------------------------------------------------------
// ESM resolve hook: map '@/...' to real src/*.ts, stub unrelated server deps
// ----------------------------------------------------------------------------
const STUB_MODULES = {
  'server-only': 'export {};',
  '@/types': 'export const Role = {}; export const User = {}; export const Database = {};',
  '@/types/database': 'export const Database = {}; export const Tables = {}; export const Json = {};',
  '@/lib/supabase-admin': [
    'export const supabaseAdmin = {',
    '  from: (table) => globalThis.__p107_supabase.from(table),',
    '  rpc: (fn, args) => globalThis.__p107_supabase.rpc(fn, args),',
    '};',
  ].join('\n'),
  '@/lib/db/users': [
    'export const mapUserFromDb = (u) => ({',
    '  id: u.id, employeeCode: u.employee_code, name: u.name, role: u.role,',
    '  teamId: u.team_id, joinDate: u.join_date, avatar: u.avatar_url,',
    '  subleaderId: u.subleader_id, description: u.description, gender: u.gender,',
    '});',
  ].join('\n'),
  '@/lib/errors': 'export const toClientError = (err, fallback) => (err && err.message) || fallback;',
  '@/lib/session-token': "export const isOpaqueSessionToken = (t) => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t);",
  '@/lib/auth-password-setup': [
    'export const executeIssueSessionRpc = (...args) => globalThis.__p107_issue(...args);',
    'export const completePasswordSetupCore = (...args) => globalThis.__p107_completeSetup(...args);',
  ].join('\n'),
  'next/headers': [
    'export const headers = () => globalThis.__p107_next.headers();',
    'export const cookies = () => globalThis.__p107_next.cookies();',
  ].join('\n'),
  'next/cache': 'export const revalidatePath = () => {}; export const revalidateTag = () => {};',
  '@/lib/auth': [
    'export const requireRole = async () => ({ user: { id: "admin-1", role: "Manager", teamId: "t-1" }, error: null });',
    'export const requireManager = async () => ({ user: { id: "admin-1", role: "Manager", teamId: "t-1" }, error: null });',
    'export const requireAuth = async () => ({ user: { id: "admin-1", role: "Manager", teamId: "t-1" }, error: null });',
  ].join('\n'),
  '@/lib/audit': 'export const logAudit = async () => {}; export const logAuditBatch = async () => {};',
  '@/lib/db/teams-admin': "export const getLeaderTeamIds = async () => ['t-1'];",
  '@/lib/db/evaluations-write': 'export const applyPersonnelTransaction = async () => ({ data: null, error: null });',
};

const loaderSource = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = ${JSON.stringify(rootDir)};
const STUBS = ${JSON.stringify(STUB_MODULES)};

export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(STUBS, specifier)) {
    return {
      url: "data:text/javascript," + encodeURIComponent(STUBS[specifier]),
      shortCircuit: true,
      format: "module",
    };
  }
  if (specifier.startsWith("@/")) {
    const basePath = path.join(rootDir, "src", specifier.slice(2));
    const candidates = [
      basePath + ".ts",
      basePath + ".tsx",
      path.join(basePath, "index.ts"),
      path.join(basePath, "index.tsx"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return nextResolve(pathToFileURL(c).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
`;

register('data:text/javascript,' + encodeURIComponent(loaderSource));

// Real modules under test (imported AFTER the resolve hook is registered).
const {
  resolveClientNetwork,
  parseTrustedProxies,
  isPeerTrusted,
  isLoopbackIp,
  isPrivateIp,
  MAX_LOGIN_ATTEMPTS,
  MAX_NETWORK_ATTEMPTS,
} = await import('../src/lib/login-rate-limit.ts');
const { loginAction } = await import('../src/actions/auth.ts');

const realBcrypt = (await import('bcryptjs')).default;
const originalCompare = realBcrypt.compare.bind(realBcrypt);

// ----------------------------------------------------------------------------
// Fixture
// ----------------------------------------------------------------------------
const fixturePath = path.join(rootDir, 'tests', 'fixtures', 'p107', 'auth-resilience', 'synthetic-fixtures.json');
assert.ok(fs.existsSync(fixturePath), 'P107 auth-resilience synthetic fixture must exist');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function readSource(rel) {
  const filePath = path.join(rootDir, rel);
  assert.ok(fs.existsSync(filePath), `${rel} must exist`);
  return fs.readFileSync(filePath, 'utf8');
}

const AUTH_SOURCE = readSource('src/actions/auth.ts');
const RATE_LIMIT_SOURCE = readSource('src/lib/login-rate-limit.ts');
const USERS_SOURCE = readSource('src/actions/users.ts');
const PASSWORD_SEED_SOURCE = readSource('src/lib/db/password-seed.ts');

const GENERIC_AUTH_ERROR = 'Mã nhân viên hoặc mật khẩu không đúng.';
const THROTTLED_ERROR_MESSAGE =
  'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.';

function extractDummyHash(source) {
  const match = source.match(/const\s+DUMMY_BCRYPT_HASH\s*=\s*'([^']+)'/);
  assert.ok(match, 'auth.ts must declare a fixed DUMMY_BCRYPT_HASH constant');
  return match[1];
}
const DUMMY_BCRYPT_HASH = extractDummyHash(AUTH_SOURCE);

function resetEnv() {
  for (const key of DUMMY_ENV_KEYS) delete process.env[key];
}

function seedUser(overrides) {
  const row = {
    id: overrides.id ?? 'user-1',
    employee_code: overrides.employee_code ?? 'EMP-1',
    name: overrides.name ?? 'Test User',
    role: 'Employee',
    team_id: 'team-1',
    join_date: '2026-01-01',
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    is_active: overrides.is_active ?? true,
    subleader_id: null,
    description: null,
    gender: 'Nữ',
    password_hash: overrides.password_hash ?? null,
    password_setup_required: overrides.password_setup_required ?? false,
    credential_revision: overrides.credential_revision ?? 0,
  };
  globalThis.__p107_state.users.push(row);
  return row;
}

beforeEach(() => {
  globalThis.__p107_state = freshState();
  resetEnv();
  realBcrypt.compare = (candidate, hash) => {
    globalThis.__p107_state.compareCalls.push({ candidate, hash });
    return originalCompare(candidate, hash);
  };
});

// =============================================================================
// 1. TRUSTED PROXY / SPOOFED / MALFORMED / SHARED NAT (real resolveClientNetwork)
// =============================================================================
describe('P107M1T04 proxy trust and client-network resolution (real module)', () => {
  it('fixture scenarios resolve exactly as specified', () => {
    const scenarios = fixture.proxyScenarios;
    assert.ok(scenarios && typeof scenarios === 'object', 'fixture must define proxyScenarios');
    const keys = Object.keys(scenarios);
    assert.ok(keys.length >= 6, 'fixture must carry at least six proxy scenarios');
    for (const key of keys) {
      const scenario = scenarios[key];
      const result = resolveClientNetwork(scenario.headers, scenario.config);
      assert.strictEqual(result.clientIp, scenario.expectedClientIp, `${key}: clientIp`);
      assert.strictEqual(result.isTrustedProxy, scenario.expectedIsTrustedProxy, `${key}: isTrustedProxy`);
    }
  });

  it('absent trust configuration fails closed for every forwarded identity header', () => {
    resetEnv();
    for (const headerName of ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip']) {
      const result = resolveClientNetwork({ [headerName]: '203.0.113.195' }, {});
      assert.strictEqual(result.clientIp, '127.0.0.1', `${headerName} must not be trusted without config`);
      assert.strictEqual(result.isTrustedProxy, false, `${headerName} must fail closed without config`);
    }
  });

  it('spoofed client-supplied chains cannot select an arbitrary identity when the immediate peer is untrusted', () => {
    const result = resolveClientNetwork(
      { 'x-forwarded-for': 'spoofed.attacker.ip, 10.0.0.1' },
      { immediatePeer: '203.0.113.77', trustedProxies: ['10.0.0.1'] }
    );
    assert.strictEqual(result.clientIp, '203.0.113.77', 'untrusted peer wins; spoofed chain ignored');
    assert.strictEqual(result.isTrustedProxy, false);
  });

  it('malformed proxy configuration fails closed (hops and proxy list)', () => {
    const headers = { 'x-forwarded-for': '203.0.113.195, 10.0.0.1' };
    for (const badHops of [-1, 0, 1.5, 'not-a-number']) {
      const res = resolveClientNetwork(headers, {
        immediatePeer: '10.0.0.1',
        trustedProxies: ['10.0.0.1'],
        trustedHops: badHops,
      });
      assert.strictEqual(res.isTrustedProxy, false, `hops=${String(badHops)} must fail closed`);
      assert.strictEqual(res.clientIp, '10.0.0.1');
    }

    const malformedList = resolveClientNetwork(headers, {
      immediatePeer: '10.0.0.1',
      trustedProxies: ['10.0.0.1', 'not_a_proxy_ip'],
    });
    assert.strictEqual(malformedList.isTrustedProxy, false, 'partially invalid allow-list must fail closed');

    const shortChain = resolveClientNetwork({ 'x-forwarded-for': '1.1.1.1' }, {
      immediatePeer: '10.0.0.1',
      trustedProxies: ['10.0.0.1'],
      trustedHops: 5,
    });
    assert.strictEqual(shortChain.isTrustedProxy, false, 'chain shorter than configured hops must fail closed');

    const hopsWithoutList = resolveClientNetwork(headers, { immediatePeer: '10.0.0.1', trustedHops: 1 });
    assert.strictEqual(hopsWithoutList.isTrustedProxy, false, 'hops without an allow-list must fail closed');
  });

  it('proven trusted-proxy chains select the real client identity (single and multi hop)', () => {
    const single = resolveClientNetwork(
      { 'x-forwarded-for': '198.51.100.5, 10.0.0.1' },
      { immediatePeer: '10.0.0.1', trustedProxies: ['10.0.0.1'] }
    );
    assert.strictEqual(single.clientIp, '198.51.100.5');
    assert.strictEqual(single.isTrustedProxy, true);

    const multi = resolveClientNetwork(
      { 'x-forwarded-for': '198.51.100.50, 10.0.0.2, 10.0.0.1' },
      { immediatePeer: '10.0.0.1', trustedProxies: ['10.0.0.1', '10.0.0.2'] }
    );
    assert.strictEqual(multi.clientIp, '198.51.100.50');
    assert.strictEqual(multi.isTrustedProxy, true);
  });

  it('shared NAT stays fail-closed on one bucket when untrusted, and isolated per client behind a trusted proxy', () => {
    // Untrusted shared-NAT ingress: multiple real clients collapse to the safe
    // local fallback (they share one network bucket, which is the accepted
    // availability trade-off; account admission remains the enforcement).
    resetEnv();
    const natA = resolveClientNetwork({ 'x-forwarded-for': '203.0.113.10' }, {});
    const natB = resolveClientNetwork({ 'x-forwarded-for': '203.0.113.20' }, {});
    assert.strictEqual(natA.clientIp, '127.0.0.1');
    assert.strictEqual(natB.clientIp, '127.0.0.1');
    assert.strictEqual(natA.isTrustedProxy, false);

    // Trusted proxy in front of a shared office NAT: distinct clients keep
    // distinct identities and therefore distinct network buckets.
    const trustedA = resolveClientNetwork(
      { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
      { immediatePeer: '10.0.0.1', trustedProxies: ['10.0.0.1'] }
    );
    const trustedB = resolveClientNetwork(
      { 'x-forwarded-for': '203.0.113.20, 10.0.0.1' },
      { immediatePeer: '10.0.0.1', trustedProxies: ['10.0.0.1'] }
    );
    assert.strictEqual(trustedA.clientIp, '203.0.113.10');
    assert.strictEqual(trustedB.clientIp, '203.0.113.20');
    assert.notStrictEqual(trustedA.clientIp, trustedB.clientIp);
    assert.strictEqual(trustedA.isTrustedProxy, true);
  });

  it('proxy classification helpers stay correct', () => {
    assert.strictEqual(isLoopbackIp('127.0.0.1'), true);
    assert.strictEqual(isLoopbackIp('::ffff:127.0.0.1'), true);
    assert.strictEqual(isPrivateIp('10.1.2.3'), true);
    assert.strictEqual(isPrivateIp('192.168.5.5'), true);
    assert.strictEqual(isPrivateIp('203.0.113.5'), false);
    assert.strictEqual(isPeerTrusted('10.0.0.1', ['10.0.0.1']), true);
    assert.strictEqual(isPeerTrusted('203.0.113.5', ['10.0.0.1']), false);
    assert.deepStrictEqual(parseTrustedProxies('bad_entry'), []);
  });
});

// =============================================================================
// 2. AUTH ENUMERATION PARITY + CREDENTIAL SEMANTICS (real loginAction)
// =============================================================================
describe('P107M1T04 loginAction enumeration parity and credential semantics', () => {
  it('non-existent account performs the dummy bcrypt comparison and denies generically', async () => {
    const res = await loginAction('NO-SUCH-CODE', 'whatever');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, GENERIC_AUTH_ERROR);
    const state = globalThis.__p107_state;
    assert.strictEqual(state.compareCalls.length, 1, 'missing account must still run one bcrypt comparison');
    assert.strictEqual(state.compareCalls[0].hash, DUMMY_BCRYPT_HASH, 'missing account must compare against the fixed dummy hash');
    assert.strictEqual(state.finalizeCalls.length, 1, 'failed-login accounting must still run for missing account');
  });

  it('configured non-NULL credential denies wrong and missing passwords', async () => {
    const hash = await realBcrypt.hash('CorrectPassword', 8);
    seedUser({ employee_code: 'EMP-PWD', password_hash: hash, password_setup_required: false, credential_revision: 2 });

    const wrong = await loginAction('EMP-PWD', 'WrongPassword');
    assert.strictEqual(wrong.success, false);
    assert.strictEqual(wrong.error, GENERIC_AUTH_ERROR);
    assert.strictEqual(globalThis.__p107_state.compareCalls[0].hash, hash, 'must compare against stored hash');
    assert.strictEqual(globalThis.__p107_state.finalizeCalls.length, 1);

    globalThis.__p107_state = freshState();
    seedUser({ employee_code: 'EMP-PWD', password_hash: hash, password_setup_required: false, credential_revision: 2 });
    const missing = await loginAction('EMP-PWD', '');
    assert.strictEqual(missing.success, false);
    assert.strictEqual(missing.error, GENERIC_AUTH_ERROR);
  });

  it('configured non-NULL credential with the correct password issues a session', async () => {
    const hash = await realBcrypt.hash('CorrectPassword', 8);
    seedUser({ employee_code: 'EMP-OK', password_hash: hash, password_setup_required: false, credential_revision: 4 });

    const res = await loginAction('EMP-OK', 'CorrectPassword');
    assert.strictEqual(res.success, true, 'correct password must authenticate');
    const state = globalThis.__p107_state;
    assert.strictEqual(state.compareCalls.length, 1);
    assert.strictEqual(state.compareCalls[0].hash, hash);
    assert.strictEqual(state.issueCalls.length, 1, 'session issuance must be invoked exactly once');
    assert.strictEqual(state.cookiesSet.length, 1, 'browser cookie must be written after session commit');
    assert.strictEqual(state.cookiesSet[0].name, 'auth_session');
  });

  it('NULL optional legacy account passes with flag absent/false, while setup-pending denies', async () => {
    seedUser({ id: 'u-null-opt', employee_code: 'EMP-OPT', password_hash: null, password_setup_required: false });
    const optional = await loginAction('EMP-OPT', '');
    assert.strictEqual(optional.success, true, 'NULL hash + setup_required false must stay usable in optional mode');
    assert.strictEqual(globalThis.__p107_state.compareCalls.length, 0, 'optional pass path needs no bcrypt');

    globalThis.__p107_state = freshState();
    seedUser({ id: 'u-setup', employee_code: 'EMP-SETUP', password_hash: null, password_setup_required: true });
    const pending = await loginAction('EMP-SETUP', '');
    assert.strictEqual(pending.success, false, 'setup-pending must deny');
    assert.strictEqual(pending.error, GENERIC_AUTH_ERROR);
    assert.strictEqual(globalThis.__p107_state.compareCalls.length, 1, 'setup-pending must still run one bcrypt comparison');
    assert.strictEqual(globalThis.__p107_state.compareCalls[0].hash, DUMMY_BCRYPT_HASH);
  });

  it('account admission stays atomic and is not weakened; untrusted NAT vs trusted proxy bucket sizing', async () => {
    // Untrusted shared NAT: account limit remains 5, network bucket is the
    // explicitly large availability value (never a silent global lock).
    seedUser({ employee_code: 'EMP-LIM', password_hash: null, password_setup_required: false });
    await loginAction('EMP-LIM', '');
    let acq = globalThis.__p107_state.rpcCalls.find((c) => c.fn === 'acquire_login_admission');
    assert.ok(acq, 'admission must be reserved through the atomic RPC');
    assert.strictEqual(acq.args.p_max_account_attempts, MAX_LOGIN_ATTEMPTS);
    assert.strictEqual(acq.args.p_max_account_attempts, 5);
    assert.ok(acq.args.p_max_ip_attempts > MAX_NETWORK_ATTEMPTS, 'untrusted network bucket must be the large availability value');

    // Trusted proxy: the documented network limit applies.
    globalThis.__p107_state = freshState();
    globalThis.__p107_state.headers['x-forwarded-for'] = '198.51.100.5, 10.0.0.1';
    process.env.KURABE_TRUSTED_PROXY_PEER = '10.0.0.1';
    process.env.KURABE_TRUSTED_PROXIES = '10.0.0.1';
    seedUser({ employee_code: 'EMP-LIM2', password_hash: null, password_setup_required: false });
    await loginAction('EMP-LIM2', '');
    acq = globalThis.__p107_state.rpcCalls.find((c) => c.fn === 'acquire_login_admission');
    assert.strictEqual(acq.args.p_ip, '198.51.100.5', 'trusted proxy must admit the real client identity');
    assert.strictEqual(acq.args.p_max_ip_attempts, MAX_NETWORK_ATTEMPTS);
  });

  it('a throttled admission short-circuits before any credential work', async () => {
    globalThis.__p107_state.admission = { allowed: false, error: null, lockedBy: 'account' };
    const res = await loginAction('EMP-THROTTLED', 'x');
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, THROTTLED_ERROR_MESSAGE);
    assert.strictEqual(globalThis.__p107_state.compareCalls.length, 0, 'no bcrypt work when admission is denied');
    assert.strictEqual(globalThis.__p107_state.finalizeCalls.length, 0, 'denied admission must not double-count');
  });

  it('a failed session RPC reports failure, writes no cookie, and still accounts the failure', async () => {
    const hash = await realBcrypt.hash('CorrectPassword', 8);
    seedUser({ employee_code: 'EMP-SESS', password_hash: hash, password_setup_required: false });
    globalThis.__p107_state.issueResult = { success: false, error: 'SESSION_RPC_FAILED' };

    const res = await loginAction('EMP-SESS', 'CorrectPassword');
    assert.strictEqual(res.success, false, 'session issuance failure must not report success');
    assert.strictEqual(res.error, 'SESSION_RPC_FAILED');
    const state = globalThis.__p107_state;
    assert.strictEqual(state.finalizeCalls.length, 1, 'failure accounting must still run after session failure');
    assert.strictEqual(state.cookiesSet.length, 0, 'no browser cookie may be written when the session RPC fails');
    assert.deepStrictEqual(state.sessions, [], 'no session may remain after a failed atomic session RPC');
  });

  it('a thrown session RPC revokes the armed session hash and still accounts the failure', async () => {
    const hash = await realBcrypt.hash('CorrectPassword', 8);
    seedUser({ employee_code: 'EMP-THROW', password_hash: hash, password_setup_required: false });
    const originalIssue = globalThis.__p107_issue;
    try {
      globalThis.__p107_issue = (...args) => {
        const state = globalThis.__p107_state;
        state.issueCalls.push(args);
        // The atomic RPC persisted a session, then threw before returning.
        state.sessions.push({ id: 's-throw', token_hash: args[4] });
        throw new Error('SESSION_RPC_EXPLODED');
      };
      const res = await loginAction('EMP-THROW', 'CorrectPassword');
      assert.strictEqual(res.success, false);
      const state = globalThis.__p107_state;
      assert.deepStrictEqual(state.sessions, [], 'armed session hash must be revoked after a thrown RPC');
      assert.strictEqual(state.cookiesSet.length, 0, 'no browser cookie may be written when the RPC throws');
      assert.strictEqual(state.finalizeCalls.length, 1, 'failure accounting must run in the catch path');
    } finally {
      globalThis.__p107_issue = originalIssue;
    }
  });
});

// =============================================================================
// 3. EXACT STRICT GATE — separate, non-activated source-contract test
// =============================================================================
// This block pins the exact `=== 'true'` strict compatibility behaviour. It is
// deliberately isolated and restores the environment afterwards; it is NOT an
// activation of strict mode anywhere in the product.
describe('P107M1T04 strict compatibility gate (source contract only, not activation)', () => {
  it('exact KURABE_REQUIRE_PASSWORD_LOGIN=true fails closed for NULL-optional accounts when explicitly probed', async () => {
    const previous = process.env.KURABE_REQUIRE_PASSWORD_LOGIN;
    try {
      process.env.KURABE_REQUIRE_PASSWORD_LOGIN = 'true';
      seedUser({ id: 'u-strict', employee_code: 'EMP-STRICT', password_hash: null, password_setup_required: false });
      const res = await loginAction('EMP-STRICT', '');
      assert.strictEqual(res.success, false, 'strict gate must deny NULL-optional accounts');
      assert.strictEqual(res.error, GENERIC_AUTH_ERROR);
      assert.strictEqual(globalThis.__p107_state.compareCalls[0].hash, DUMMY_BCRYPT_HASH);
    } finally {
      if (previous === undefined) delete process.env.KURABE_REQUIRE_PASSWORD_LOGIN;
      else process.env.KURABE_REQUIRE_PASSWORD_LOGIN = previous;
    }
  });
});

// =============================================================================
// 4. STATIC SOURCE CONTRACTS (kept valid, no weak abstractions invented)
// =============================================================================
describe('P107M1T04 static source contracts', () => {
  it('auth.ts scopes the dummy hash and candidate string once, before the account lookup', () => {
    const candidateDeclarations = AUTH_SOURCE.match(/const\s+passwordCandidate\s*=/g) ?? [];
    assert.strictEqual(candidateDeclarations.length, 1, 'passwordCandidate must be declared exactly once');
    const declIndex = AUTH_SOURCE.indexOf('const passwordCandidate');
    const lookupIndex = AUTH_SOURCE.indexOf('if (!user)');
    assert.ok(declIndex > -1 && lookupIndex > -1 && declIndex < lookupIndex, 'passwordCandidate must be declared before the !user branch (no TDZ)');
    assert.match(AUTH_SOURCE, /DUMMY_BCRYPT_HASH\s*=\s*'\$2[aby]\$/);
    const dummyConstCount = (AUTH_SOURCE.match(/const\s+DUMMY_BCRYPT_HASH\s*=/g) ?? []).length;
    assert.strictEqual(dummyConstCount, 1, 'exactly one DUMMY_BCRYPT_HASH constant');
    assert.match(
      AUTH_SOURCE,
      /await\s+bcrypt\.compare\(passwordCandidate,\s*DUMMY_BCRYPT_HASH\)/,
      'missing-account branch must run the dummy bcrypt comparison'
    );
    assert.doesNotMatch(AUTH_SOURCE, /constant-?time\s*(is\s*)?(guaranteed|assured)/i, 'must not claim unproven constant-time behaviour');
  });

  it('auth.ts keeps the optional/non-NULL distinction and the exact strict gate', () => {
    assert.match(AUTH_SOURCE, /!user\.password_hash \|\| user\.password_setup_required/);
    assert.match(AUTH_SOURCE, /process\.env\.KURABE_REQUIRE_PASSWORD_LOGIN === 'true'/);
    assert.match(AUTH_SOURCE, /hasConfiguredCredential/);
    assert.match(AUTH_SOURCE, /passwordHashMissingOrSetupPending/);
  });

  it('login-rate-limit.ts keeps atomic admission and fail-closed DB handling', () => {
    assert.match(RATE_LIMIT_SOURCE, /acquire_login_admission/);
    assert.match(RATE_LIMIT_SOURCE, /finalize_login_admission/);
    assert.match(RATE_LIMIT_SOURCE, /lockedBy: 'db_error'/);
    assert.match(RATE_LIMIT_SOURCE, /hasInvalidTrustedProxyConfig/);
    assert.doesNotMatch(RATE_LIMIT_SOURCE, /from\('login_attempts'\)\.(select|insert|update|delete)/, 'no direct-table fallback');
  });

  it('users.ts seeds only committed new-user ids and redacts warning detail', () => {
    assert.match(USERS_SOURCE, /if \(isNewUser\) \{[\s\S]*?seedDefaultPasswords\(\[userId\]\)/);
    assert.match(USERS_SOURCE, /seedDefaultPasswords\(newIds\)/);
    assert.doesNotMatch(USERS_SOURCE, /seed\.failed[^\n]*employee[Cc]ode/, 'warning must not include employee code / credentials');
  });

  it('password-seed.ts keeps CAS + readback, sequential, and no credential logging', () => {
    assert.match(PASSWORD_SEED_SOURCE, /\.is\('password_hash',\s*null\)/);
    assert.match(PASSWORD_SEED_SOURCE, /\.eq\('employee_code',\s*row\.employee_code\)/);
    assert.match(PASSWORD_SEED_SOURCE, /\.select\('id'\)/);
    assert.match(PASSWORD_SEED_SOURCE, /affectedCount\s*===\s*0/);
    assert.match(PASSWORD_SEED_SOURCE, /conflict: credential changed concurrently/);
    assert.doesNotMatch(PASSWORD_SEED_SOURCE, /console\.(log|info|debug|warn|error)/);
    assert.match(PASSWORD_SEED_SOURCE, /for \(const row of rows\)/, 'seed must stay sequential');
  });

  it('no production secrets or credential values leak through logging', () => {
    for (const [name, source] of [
      ['auth.ts', AUTH_SOURCE],
      ['login-rate-limit.ts', RATE_LIMIT_SOURCE],
      ['users.ts', USERS_SOURCE],
      ['password-seed.ts', PASSWORD_SEED_SOURCE],
    ]) {
      assert.doesNotMatch(
        source,
        /console\.(log|info|debug|warn|error)\s*\([^)]*\b(password|password_hash|passwordHash|credential_revision|DUMMY_BCRYPT_HASH)\b/i,
        `${name} must not log credentials`
      );
    }
  });
});

resetEnv();
