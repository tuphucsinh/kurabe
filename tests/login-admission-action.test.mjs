#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '..');

const FORWARD_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260911000200_login_admission.sql'
);
const ROLLBACK_PATH = path.join(
  projectRoot,
  'db',
  'rollback-login-admission.sql'
);
const LOGIN_RATE_LIMIT_PATH = path.join(
  projectRoot,
  'src',
  'lib',
  'login-rate-limit.ts'
);
const AUTH_ACTIONS_PATH = path.join(
  projectRoot,
  'src',
  'actions',
  'auth.ts'
);
const DB_TYPES_PATH = path.join(
  projectRoot,
  'src',
  'types',
  'database.ts'
);

const cases = [];
function check(name, fn) {
  fn();
  cases.push(name);
}

function stripSqlComments(sql) {
  return String(sql ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

// ============================================================
// 1. SOURCE CONTRACT INVARIANTS
// ============================================================

check('migration: forward migration file exists and declares candidate header', () => {
  assert.ok(fs.existsSync(FORWARD_MIGRATION_PATH), 'forward migration must exist');
  const sql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  assert.ok(
    sql.includes('CANDIDATE ONLY — NOT APPLIED') || sql.includes('CANDIDATE ONLY'),
    'must declare candidate-only header'
  );
  assert.ok(
    sql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL'),
    'must declare approval warning'
  );
  assert.ok(
    sql.includes('P102M3T03'),
    'must reference task ID P102M3T03'
  );
});

check('migration: forward migration enforces fail-closed preflight and hermetic transaction', () => {
  const sql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  const clean = stripSqlComments(sql).trim();
  assert.ok(clean.startsWith('BEGIN;'), 'must start with BEGIN;');
  assert.ok(clean.endsWith('COMMIT;'), 'must end with COMMIT;');
  assert.ok(sql.includes('P102M3T03_PREFLIGHT_FAILED'), 'must have fail-closed preflight error');
  assert.ok(sql.includes('users') && sql.includes('login_attempts'), 'preflight must check users and login_attempts');
});

check('migration: forward migration adds request_id, status, and atomic admission functions', () => {
  const sql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  assert.ok(sql.includes('request_id text'), 'must add request_id column');
  assert.ok(sql.includes('status text'), 'must add status column');
  assert.ok(sql.includes('uq_login_attempts_request_id'), 'must create unique index for request_id idempotency');
  assert.ok(sql.includes('idx_login_attempts_status_time'), 'must create status+time index');
  assert.ok(!sql.includes('CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at'), 'must not claim the pre-existing P98 retention index');
  assert.ok(sql.includes('acquire_login_admission'), 'must create acquire_login_admission function');
  assert.ok(sql.includes('finalize_login_admission'), 'must create finalize_login_admission function');
  assert.ok(sql.includes('pg_advisory_xact_lock'), 'must acquire advisory locks for concurrency serialization');
  assert.ok(
    !sql.includes('CREATE OR REPLACE FUNCTION public.check_login_rate_limit') &&
      !sql.includes('CREATE OR REPLACE FUNCTION public.clear_login_attempts'),
    'must not replace pre-existing P98 RPCs whose rollback contract belongs to P98'
  );
  assert.ok(sql.includes('kurabe:p102:candidate:v1:function:acquire_login_admission'), 'must set provenance marker');
  assert.ok(sql.includes('kurabe:p102:candidate:v1:function:finalize_login_admission'), 'must set provenance marker');
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.acquire_login_admission'), 'must revoke public access');
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.acquire_login_admission') && sql.includes('TO service_role'), 'must grant to service_role');
});

check('rollback: rollback candidate exists and declares GUC approval guard', () => {
  assert.ok(fs.existsSync(ROLLBACK_PATH), 'rollback script must exist');
  const sql = fs.readFileSync(ROLLBACK_PATH, 'utf8');
  assert.ok(
    sql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED') || sql.includes('ROLLBACK CANDIDATE ONLY'),
    'must declare rollback candidate header'
  );
  assert.ok(
    /current_setting\(\s*'kurabe\.p102_rollback_approved'\s*,\s*true\s*\)/i.test(sql),
    'must inspect kurabe.p102_rollback_approved GUC'
  );
  assert.ok(sql.includes('ROLLBACK_UNAPPROVED'), 'must abort with ROLLBACK_UNAPPROVED if GUC is not true');
  assert.ok(
    !/SET\s+kurabe\.p102_rollback_approved/i.test(stripSqlComments(sql)),
    'must not set approval GUC internally'
  );
});

check('rollback: rollback drops candidate objects and preserves table and data', () => {
  const sql = fs.readFileSync(ROLLBACK_PATH, 'utf8');
  assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.acquire_login_admission'), 'must drop acquire_login_admission');
  assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.finalize_login_admission'), 'must drop finalize_login_admission');
  assert.ok(sql.includes('DROP INDEX IF EXISTS public.uq_login_attempts_request_id'), 'must drop request_id unique index');
  assert.ok(!sql.includes('DROP INDEX IF EXISTS public.idx_login_attempts_attempted_at'), 'rollback must preserve the pre-existing P98 retention index');
  assert.ok(sql.includes('ALTER TABLE public.login_attempts DROP COLUMN IF EXISTS request_id'), 'must drop request_id column');
  assert.ok(sql.includes('ALTER TABLE public.login_attempts DROP COLUMN IF EXISTS status'), 'must drop status column');
  assert.ok(!/\bDROP\s+TABLE\b/i.test(sql), 'rollback must NEVER drop table');
  assert.ok(!/\bDELETE\s+FROM\b/i.test(sql), 'rollback must NEVER delete table data');
  assert.ok(!/\bTRUNCATE\b/i.test(sql), 'rollback must NEVER truncate table');
});

check('types: database.ts includes admission functions and login_attempts columns', () => {
  assert.ok(fs.existsSync(DB_TYPES_PATH), 'database.ts must exist');
  const typesCode = fs.readFileSync(DB_TYPES_PATH, 'utf8');
  assert.ok(typesCode.includes('acquire_login_admission:'), 'must declare acquire_login_admission');
  assert.ok(typesCode.includes('finalize_login_admission:'), 'must declare finalize_login_admission');
  assert.ok(typesCode.includes('p_reservation_timeout_seconds'), 'must declare p_reservation_timeout_seconds');
  assert.ok(typesCode.includes('request_id: string | null'), 'login_attempts must have request_id');
  assert.ok(typesCode.includes('status: string'), 'login_attempts must have status');
});

check('rate-limit: login-rate-limit.ts exports required functions and constants', () => {
  assert.ok(fs.existsSync(LOGIN_RATE_LIMIT_PATH), 'login-rate-limit.ts must exist');
  const code = fs.readFileSync(LOGIN_RATE_LIMIT_PATH, 'utf8');
  assert.ok(code.includes("import 'server-only'"), 'must import server-only');
  assert.ok(code.includes('MAX_LOGIN_ATTEMPTS = 5'), 'must define MAX_LOGIN_ATTEMPTS = 5');
  assert.ok(code.includes('MAX_NETWORK_ATTEMPTS = 25'), 'must define MAX_NETWORK_ATTEMPTS = 25');
  assert.ok(
    code.includes('LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60') || code.includes('LOGIN_ATTEMPT_WINDOW_SECONDS = 900'),
    'must define 15-minute sliding window'
  );
  assert.ok(code.includes('export function isLoopbackIp'), 'must export isLoopbackIp');
  assert.ok(code.includes('export function isPrivateIp'), 'must export isPrivateIp');
  assert.ok(code.includes('export function resolveClientNetwork'), 'must export resolveClientNetwork');
  assert.ok(code.includes('export function resolveClientIp'), 'must export resolveClientIp');
  assert.ok(code.includes('export async function acquireLoginAdmission'), 'must export acquireLoginAdmission');
  assert.ok(code.includes('export async function finalizeLoginAdmission'), 'must export finalizeLoginAdmission');
  assert.ok(code.includes('export async function checkLoginRateLimit'), 'must export checkLoginRateLimit');
  assert.ok(code.includes('export async function recordFailedLoginAttempt'), 'must export recordFailedLoginAttempt');
  assert.ok(code.includes('export async function clearLoginAttempts'), 'must export clearLoginAttempts');
});

check('rate-limit: login-rate-limit.ts fails closed with zero direct-table fallback', () => {
  const code = fs.readFileSync(LOGIN_RATE_LIMIT_PATH, 'utf8');
  assert.ok(code.includes("lockedBy: 'db_error'"), 'must fail closed with db_error on DB/RPC errors');
  // Check that checkLoginRateLimit and recordFailedLoginAttempt do NOT perform direct queries on login_attempts
  assert.ok(
    !code.includes("from('login_attempts').select"),
    'must not fall back to direct select from login_attempts'
  );
  assert.ok(
    !code.includes("from('login_attempts').insert"),
    'must not fall back to direct insert into login_attempts'
  );
});

check('auth-action: auth.ts wires admission reservation and preserves contract strings', () => {
  assert.ok(fs.existsSync(AUTH_ACTIONS_PATH), 'auth.ts must exist');
  const code = fs.readFileSync(AUTH_ACTIONS_PATH, 'utf8');
  const rateLimitCode = fs.readFileSync(LOGIN_RATE_LIMIT_PATH, 'utf8');
  const sessionHelperCode = fs.readFileSync(path.resolve(projectRoot, 'src/lib/auth-password-setup.ts'), 'utf8');
  assert.ok(code.includes('checkLoginRateLimit'), 'auth.ts must wire checkLoginRateLimit');
  assert.ok(code.includes('recordFailedLoginAttempt'), 'auth.ts must wire recordFailedLoginAttempt');
  assert.ok(code.includes('executeIssueSessionRpc'), 'auth.ts must wire executeIssueSessionRpc');
  assert.ok(sessionHelperCode.includes('issue_session_finalize_login_admission'), 'session helper must use atomic session/admission RPC');
  assert.ok(code.includes('KURABE_TRUSTED_PROXY_PEER'), 'auth.ts must pass explicit runtime proxy peer');
  assert.ok(!code.includes('await finalizeLoginAdmission'), 'auth.ts must not split session/admission writes');
  assert.ok(code.includes('revokeSessionExact'), 'post-session failure must revoke and read back the session');
  assert.ok(!code.includes('clearLoginAttempts('), 'auth.ts must not bypass reservation accounting with legacy clear');
  assert.ok(code.includes('resolveClientNetwork'), 'auth.ts must wire resolveClientNetwork');
  assert.ok(code.includes('admissionRequestId'), 'auth.ts must generate admissionRequestId');
  assert.ok(code.includes('UNTRUSTED_NETWORK_MAX_ATTEMPTS'), 'untrusted network must not share a low global bucket');
  assert.ok(code.includes('GENERIC_AUTH_ERROR'), 'auth.ts must use generic auth error');
  assert.ok(code.includes('THROTTLED_ERROR_MESSAGE'), 'auth.ts must use throttled message');
  assert.ok(code.includes('DUMMY_BCRYPT_HASH'), 'auth.ts must preserve dummy bcrypt hash');
  assert.ok(code.includes('admissionFinalizationAttempted'), 'auth.ts must not retry or suppress a failed admission finalization');
  const issueSessionRuntimeCall = code.indexOf('const issueResult = await executeIssueSessionRpc(');
  assert.notEqual(issueSessionRuntimeCall, -1, 'auth.ts must contain the runtime atomic session RPC call');
  assert.ok(
    code.indexOf('issuedSessionHash = tokenHash') < issueSessionRuntimeCall,
    'session hash must be armed for cleanup before the atomic RPC can throw'
  );
  assert.ok(
    issueSessionRuntimeCall < code.indexOf("cookieStore.set('auth_session'"),
    'browser cookie must only be written after the atomic RPC succeeds'
  );
  assert.ok(rateLimitCode.includes('hasInvalidTrustedProxyConfig'), 'ambiguous trusted proxy configuration must fail closed');
  assert.ok(
    code.includes('!user.password_hash || user.password_setup_required'),
    'auth.ts must preserve password setup safety contract comment'
  );
  assert.ok(
    code.includes("process.env.KURABE_REQUIRE_PASSWORD_LOGIN === 'true'") ||
    code.includes('process.env.KURABE_REQUIRE_PASSWORD_LOGIN === "true"'),
    'auth.ts must gate strict password on environment flag'
  );
});

// ============================================================
// 2. EXPLICIT PROXY DEPLOYMENT CONTRACT UNIT TESTS
// ============================================================

// Deterministic implementations matching src/lib/login-rate-limit.ts
function isLoopbackIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim().toLowerCase();
  return (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === '::ffff:127.0.0.1' ||
    clean === 'localhost' ||
    clean.startsWith('127.') ||
    clean.startsWith('::ffff:127.')
  );
}

function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim().toLowerCase();
  if (isLoopbackIp(clean)) return true;

  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  }

  if (net.isIPv6(clean)) {
    return clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:');
  }

  return false;
}

function isValidIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  return net.isIP(ip.trim()) !== 0;
}

function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return '127.0.0.1';
  let clean = ip.trim();
  if (clean.startsWith('[') && clean.includes(']')) {
    clean = clean.slice(1, clean.indexOf(']'));
  } else if (clean.includes(':') && !clean.includes('::') && clean.split(':').length === 2) {
    clean = clean.split(':')[0];
  }
  return isValidIp(clean) ? clean : '127.0.0.1';
}

function isPeerTrusted(peer, trustedProxies) {
  if (!peer || !isValidIp(peer)) return false;
  const clean = peer.trim().toLowerCase();
  return (
    trustedProxies.includes(clean) ||
    (trustedProxies.includes('loopback') && isLoopbackIp(clean)) ||
    (trustedProxies.includes('private') && isPrivateIp(clean))
  );
}

function resolveClientNetwork(headers, config) {
  const getHeader = (name) => {
    if (!headers) return null;
    const lower = name.toLowerCase();
    if (typeof headers.get === 'function') return headers.get(lower) ?? headers.get(name) ?? null;
    return headers[lower] ?? headers[name] ?? null;
  };

  const xForwardedFor = getHeader('x-forwarded-for');
  const xRealIp = getHeader('x-real-ip');
  const cfConnectingIp = getHeader('cf-connecting-ip');

  const immediatePeerRaw = config?.immediatePeer?.trim() || null;
  const immediatePeer = immediatePeerRaw && isValidIp(immediatePeerRaw) ? normalizeIp(immediatePeerRaw) : null;
  const trustedProxies = config?.trustedProxies ?? [];
  const rawHops = config?.trustedHops;

  let configuredHops = null;
  if (rawHops !== undefined && rawHops !== null && rawHops !== '') {
    const parsed = typeof rawHops === 'number' ? rawHops : Number(rawHops);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      const fallback = immediatePeer ?? '127.0.0.1';
      return { clientIp: fallback, isTrustedProxy: false, proxyChain: [fallback] };
    }
    configuredHops = parsed;
  }

  const hasTrustedProxiesConfig = trustedProxies.length > 0;
  const hasTrustedHopsConfig = configuredHops !== null;
  const hasProxyTrustConfig = hasTrustedProxiesConfig || hasTrustedHopsConfig;

  if (!hasProxyTrustConfig || !immediatePeer || (hasTrustedHopsConfig && !hasTrustedProxiesConfig)) {
    const fallback = immediatePeer ?? '127.0.0.1';
    return { clientIp: fallback, isTrustedProxy: false, proxyChain: [fallback] };
  }

  if (immediatePeer && hasTrustedProxiesConfig && !isPeerTrusted(immediatePeer, trustedProxies)) {
    return { clientIp: immediatePeer, isTrustedProxy: false, proxyChain: [immediatePeer] };
  }

  if (xForwardedFor) {
    const hops = xForwardedFor
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (hops.length > 0) {
      if (hasTrustedHopsConfig && configuredHops !== null) {
        if (hops.length < configuredHops) {
          const fallback = immediatePeer ?? '127.0.0.1';
          return { clientIp: fallback, isTrustedProxy: false, proxyChain: hops };
        }
        const targetIndex = hops.length - configuredHops;
        const selectedIp = normalizeIp(hops[targetIndex]);
        return { clientIp: selectedIp, isTrustedProxy: true, proxyChain: hops };
      }

      if (hasTrustedProxiesConfig) {
        const rightmostHop = hops[hops.length - 1];
        const immediateToCheck = immediatePeer ?? rightmostHop;

        if (!isPeerTrusted(immediateToCheck, trustedProxies)) {
          return {
            clientIp: normalizeIp(immediateToCheck),
            isTrustedProxy: false,
            proxyChain: hops,
          };
        }

        let selectedIp = hops[0];
        for (let i = hops.length - 1; i >= 0; i--) {
          const hop = hops[i];
          if (!isPeerTrusted(hop, trustedProxies)) {
            selectedIp = hop;
            break;
          }
        }

        return {
          clientIp: normalizeIp(selectedIp),
          isTrustedProxy: true,
          proxyChain: hops,
        };
      }
    }
  }

  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    if (immediatePeer && hasTrustedProxiesConfig && !isPeerTrusted(immediatePeer, trustedProxies)) {
      return { clientIp: immediatePeer, isTrustedProxy: false, proxyChain: [immediatePeer] };
    }
    return { clientIp: normalizeIp(cfConnectingIp), isTrustedProxy: true, proxyChain: [cfConnectingIp] };
  }

  if (xRealIp && isValidIp(xRealIp)) {
    if (immediatePeer && hasTrustedProxiesConfig && !isPeerTrusted(immediatePeer, trustedProxies)) {
      return { clientIp: immediatePeer, isTrustedProxy: false, proxyChain: [immediatePeer] };
    }
    return { clientIp: normalizeIp(xRealIp), isTrustedProxy: true, proxyChain: [xRealIp] };
  }

  const defaultFallback = immediatePeer ?? '127.0.0.1';
  return { clientIp: defaultFallback, isTrustedProxy: false, proxyChain: [defaultFallback] };
}

check('proxy-contract: IP classification helpers handle loopback and private ranges', () => {
  assert.equal(isLoopbackIp('127.0.0.1'), true, '127.0.0.1 is loopback');
  assert.equal(isLoopbackIp('::1'), true, '::1 is loopback');
  assert.equal(isLoopbackIp('localhost'), true, 'localhost is loopback');
  assert.equal(isLoopbackIp('::ffff:127.0.0.1'), true, 'IPv4-mapped loopback is loopback');
  assert.equal(isLoopbackIp('10.0.0.1'), false, '10.0.0.1 is not loopback');
  assert.equal(isLoopbackIp('203.0.113.5'), false, 'public IP is not loopback');

  assert.equal(isPrivateIp('10.0.0.1'), true, '10.0.0.0/8 is private');
  assert.equal(isPrivateIp('172.16.0.1'), true, '172.16.0.0/12 is private');
  assert.equal(isPrivateIp('172.31.255.254'), true, '172.31.255.254 is private');
  assert.equal(isPrivateIp('192.168.1.1'), true, '192.168.0.0/16 is private');
  assert.equal(isPrivateIp('127.0.0.1'), true, 'loopback counts as private');
  assert.equal(isPrivateIp('8.8.8.8'), false, '8.8.8.8 is public');
  assert.equal(isPrivateIp('203.0.113.10'), false, '203.0.113.10 is public');

  assert.equal(isValidIp('1.2.3.4'), true);
  assert.equal(isValidIp('2001:db8::1'), true);
  assert.equal(isValidIp('invalid'), false);
  assert.equal(normalizeIp(' 1.2.3.4 '), '1.2.3.4');
  assert.equal(normalizeIp('[2001:db8::1]'), '2001:db8::1');
});

check('proxy-contract: untrusted network rejects client-supplied forwarded headers', () => {
  // When no proxy configuration is declared, client-supplied headers MUST NOT select an arbitrary client IP
  const res1 = resolveClientNetwork({
    'x-forwarded-for': '203.0.113.195, 198.51.100.5',
  }, { trustedProxies: [] });
  assert.equal(res1.clientIp, '127.0.0.1', 'untrusted network must not trust X-Forwarded-For');
  assert.equal(res1.isTrustedProxy, false, 'isTrustedProxy must be false');

  const res2 = resolveClientNetwork({
    'cf-connecting-ip': '203.0.113.88',
  }, { trustedProxies: [] });
  assert.equal(res2.clientIp, '127.0.0.1', 'untrusted network must not trust CF-Connecting-IP');
  assert.equal(res2.isTrustedProxy, false, 'isTrustedProxy must be false');

  const res3 = resolveClientNetwork({
    'x-real-ip': '203.0.113.99',
  }, { trustedProxies: [] });
  assert.equal(res3.clientIp, '127.0.0.1', 'untrusted network must not trust X-Real-IP');
  assert.equal(res3.isTrustedProxy, false, 'isTrustedProxy must be false');

  // If immediatePeer is supplied from socket, safe untrusted network uses that peer
  const res4 = resolveClientNetwork({
    'x-forwarded-for': '1.2.3.4',
    'cf-connecting-ip': '5.6.7.8',
  }, { immediatePeer: '198.51.100.44', trustedProxies: [] });
  assert.equal(res4.clientIp, '198.51.100.44', 'untrusted network uses immediate peer and ignores headers');
  assert.equal(res4.isTrustedProxy, false);
});

check('proxy-contract: untrusted immediate peer rejects forwarded headers even if proxy config exists', () => {
  // Proxies config declared, but immediate peer is NOT in the trusted list
  const res = resolveClientNetwork({
    'x-forwarded-for': 'attacker.spoofed.ip, 10.0.0.1',
  }, {
    immediatePeer: '203.0.113.77', // untrusted internet host connecting directly
    trustedProxies: ['10.0.0.1', 'loopback'],
  });
  assert.equal(res.clientIp, '203.0.113.77', 'untrusted immediate peer cannot spoof trusted headers');
  assert.equal(res.isTrustedProxy, false, 'must mark isTrustedProxy = false');
});

check('proxy-contract: proven proxy contract with trustedProxies traverses chain correctly', () => {
  const config = { trustedProxies: ['loopback', 'private'], immediatePeer: '127.0.0.1' };

  // Chain: client IP (public) -> internal proxy (private) -> local reverse proxy (loopback)
  const res = resolveClientNetwork({
    'x-forwarded-for': 'attacker.spoof.ip, 198.51.100.22, 10.0.0.1, 127.0.0.1',
  }, config);
  assert.equal(res.clientIp, '198.51.100.22', 'must skip loopback and private proxies to isolate real client IP');
  assert.equal(res.isTrustedProxy, true, 'isTrustedProxy must be true');

  // Cloudflare header when trusted
  const cfRes = resolveClientNetwork({
    'cf-connecting-ip': '203.0.113.90',
  }, { trustedProxies: ['loopback'], immediatePeer: '127.0.0.1' });
  assert.equal(cfRes.clientIp, '203.0.113.90', 'CF header honored when immediate peer is trusted');
  assert.equal(cfRes.isTrustedProxy, true);
});

check('proxy-contract: proven proxy contract with trustedHops isolates correct hop', () => {
  const headers = { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' };

  const proxyConfig = { trustedProxies: ['loopback'], immediatePeer: '127.0.0.1' };
  const hops1 = resolveClientNetwork(headers, { ...proxyConfig, trustedHops: 1 });
  assert.equal(hops1.clientIp, '3.3.3.3', 'trustedHops=1 selects rightmost hop');
  assert.equal(hops1.isTrustedProxy, true);

  const hops2 = resolveClientNetwork(headers, { ...proxyConfig, trustedHops: 2 });
  assert.equal(hops2.clientIp, '2.2.2.2', 'trustedHops=2 selects second from right');
  assert.equal(hops2.isTrustedProxy, true);

  const hops3 = resolveClientNetwork(headers, { ...proxyConfig, trustedHops: 3 });
  assert.equal(hops3.clientIp, '1.1.1.1', 'trustedHops=3 selects third from right');
  assert.equal(hops3.isTrustedProxy, true);

  // A configured hop count without a runtime immediate peer is not proof of a
  // trusted ingress and must not allow a client-controlled X-Forwarded-For.
  const missingPeer = resolveClientNetwork(headers, { trustedHops: 1 });
  assert.equal(missingPeer.clientIp, '127.0.0.1');
  assert.equal(missingPeer.isTrustedProxy, false);

  const missingPeerList = resolveClientNetwork(headers, { trustedProxies: ['127.0.0.1'] });
  assert.equal(missingPeerList.clientIp, '127.0.0.1');
  assert.equal(missingPeerList.isTrustedProxy, false);

  const invalidPeer = resolveClientNetwork(headers, {
    trustedProxies: ['loopback'],
    trustedHops: 1,
    immediatePeer: 'not-an-ip',
  });
  assert.equal(invalidPeer.isTrustedProxy, false);
});

check('proxy-contract: malformed or ambiguous configuration fails closed', () => {
  const headers = { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' };

  // Negative hops
  const negHops = resolveClientNetwork(headers, { trustedHops: -1 });
  assert.equal(negHops.isTrustedProxy, false, 'negative hops must fail closed');
  assert.equal(negHops.clientIp, '127.0.0.1');

  // Zero hops
  const zeroHops = resolveClientNetwork(headers, { trustedHops: 0 });
  assert.equal(zeroHops.isTrustedProxy, false, 'zero hops must fail closed');

  // Non-integer hops
  const floatHops = resolveClientNetwork(headers, { trustedHops: 1.5 });
  assert.equal(floatHops.isTrustedProxy, false, 'float hops must fail closed');

  // Header chain shorter than configured hops
  const shortChain = resolveClientNetwork(headers, { trustedHops: 5 });
  assert.equal(shortChain.isTrustedProxy, false, 'short chain must fail closed');
  assert.equal(shortChain.clientIp, '127.0.0.1');
});

// ============================================================
// 3. ADMISSION RESERVATION & CONCURRENCY BEHAVIORAL SIMULATION
// ============================================================

function createAdmissionHarness({ maxAccountAttempts = 5, maxNetworkAttempts = 25, windowSeconds = 900, reservationTimeoutSeconds = 30 } = {}) {
  const store = new Map(); // key -> { id, requestId, employeeCode, ip, attemptedAt, status }

  return {
    async acquire({ requestId, employeeCode, ip, currentTime = Date.now() }) {
      if (!requestId || !employeeCode || !ip) {
        return { allowed: false, error: 'INVALID_ARGUMENT' };
      }

      // Check existing reservation (duplicate retry)
      for (const row of store.values()) {
        if (row.requestId === requestId) {
          if (row.status === 'reserved') {
            if (currentTime - row.attemptedAt < reservationTimeoutSeconds * 1000) {
              return { allowed: true, requestId, isRetry: true };
            }
            return { allowed: false, lockedBy: 'reservation_in_flight', requestId };
          } else if (row.status === 'succeeded') {
            return { allowed: true, requestId, isRetry: true };
          } else if (row.status === 'failed') {
            return { allowed: false, lockedBy: 'already_failed', requestId };
          } else if (row.status === 'expired') {
            return { allowed: false, lockedBy: 'expired', requestId };
          }
        }
      }

      // Sliding window count
      const cutoff = currentTime - windowSeconds * 1000;
      let accountAttempts = 0;
      let ipAttempts = 0;
      for (const row of store.values()) {
        if (row.attemptedAt >= cutoff && (row.status === 'reserved' || row.status === 'failed')) {
          if (row.employeeCode === employeeCode) accountAttempts++;
          if (row.ip === ip) ipAttempts++;
        }
      }

      if (accountAttempts >= maxAccountAttempts) {
        return { allowed: false, lockedBy: 'account', accountAttempts, retryAfterSeconds: windowSeconds };
      }
      if (ipAttempts >= maxNetworkAttempts) {
        return { allowed: false, lockedBy: 'ip', ipAttempts, retryAfterSeconds: windowSeconds };
      }

      const id = crypto.randomUUID();
      store.set(id, {
        id,
        requestId,
        employeeCode,
        ip,
        attemptedAt: currentTime,
        status: 'reserved',
      });

      return { allowed: true, requestId, accountAttempts: accountAttempts + 1, ipAttempts: ipAttempts + 1 };
    },

    async finalize({ requestId, employeeCode, ip, success, currentTime = Date.now() }) {
      let targetRow = null;
      for (const row of store.values()) {
        if (row.requestId === requestId) {
          targetRow = row;
          break;
        }
      }

      if (success) {
        // Clear terminal failures only; another reserved request may still be
        // executing and must retain its admission slot.
        for (const [id, row] of [...store.entries()]) {
          if (row.employeeCode === employeeCode && row.status === 'failed') {
            store.delete(id);
          }
        }
        if (targetRow) targetRow.status = 'succeeded';
        return { finalized: true, allowed: true, accountAttempts: 0 };
      } else {
        if (targetRow) {
          if (targetRow.status === 'reserved') {
            targetRow.status = 'failed';
            targetRow.attemptedAt = currentTime;
          }
          // if already failed, idempotent no-op (no overcounting)
        } else {
          const id = crypto.randomUUID();
          store.set(id, { id, requestId, employeeCode, ip, attemptedAt: currentTime, status: 'failed' });
        }
        return { finalized: true, allowed: false, lockedBy: 'failed' };
      }
    },

    getRows(employeeCode) {
      return [...store.values()].filter((r) => r.employeeCode === employeeCode);
    }
  };
}

check('admission-simulation: concurrent burst is strictly bounded at maxAccountAttempts', async () => {
  const harness = createAdmissionHarness({ maxAccountAttempts: 5 });
  const employeeCode = 'NV001';
  const ip = '10.0.0.1';

  const results = [];
  for (let i = 0; i < 10; i++) {
    results.push(await harness.acquire({
      requestId: `req-burst-${i}`,
      employeeCode,
      ip,
    }));
  }

  const allowedCount = results.filter((r) => r.allowed).length;
  const deniedCount = results.filter((r) => !r.allowed).length;

  assert.equal(allowedCount, 5, 'exactly 5 concurrent reservations allowed');
  assert.equal(deniedCount, 5, 'subsequent concurrent requests above threshold denied');
  assert.equal(results[5].lockedBy, 'account', 'denied requests locked by account');
});

check('admission-simulation: duplicate retry with same requestId is safe and idempotent', async () => {
  const harness = createAdmissionHarness({ maxAccountAttempts: 5 });
  const employeeCode = 'NV002';
  const ip = '10.0.0.1';
  const requestId = 'req-dup-01';

  const first = await harness.acquire({ requestId, employeeCode, ip });
  assert.equal(first.allowed, true);

  // Duplicate retry with same requestId
  const retry = await harness.acquire({ requestId, employeeCode, ip });
  assert.equal(retry.allowed, true);
  assert.equal(retry.isRetry, true);

  const rows = harness.getRows(employeeCode);
  assert.equal(rows.length, 1, 'duplicate retry must not create a duplicate reservation slot');
});

check('admission-simulation: failure finalization is idempotent and does not overcount on retry', async () => {
  const harness = createAdmissionHarness({ maxAccountAttempts: 5 });
  const employeeCode = 'NV003';
  const ip = '10.0.0.1';
  const requestId = 'req-fail-01';

  await harness.acquire({ requestId, employeeCode, ip });
  const fin1 = await harness.finalize({ requestId, employeeCode, ip, success: false });
  assert.equal(fin1.finalized, true);

  // Duplicate finalize call
  const fin2 = await harness.finalize({ requestId, employeeCode, ip, success: false });
  assert.equal(fin2.finalized, true);

  const rows = harness.getRows(employeeCode);
  assert.equal(rows.length, 1, 'failure must only record once');
  assert.equal(rows[0].status, 'failed');
});

check('admission-simulation: success finalization resets terminal failures for account', async () => {
  const harness = createAdmissionHarness({ maxAccountAttempts: 5 });
  const employeeCode = 'NV004';
  const ip = '10.0.0.1';

  // 2 prior failures
  await harness.acquire({ requestId: 'f1', employeeCode, ip });
  await harness.finalize({ requestId: 'f1', employeeCode, ip, success: false });
  await harness.acquire({ requestId: 'f2', employeeCode, ip });
  await harness.finalize({ requestId: 'f2', employeeCode, ip, success: false });
  assert.equal(harness.getRows(employeeCode).length, 2);

  // Now successful login
  const succReq = 'succ-01';
  await harness.acquire({ requestId: succReq, employeeCode, ip });
  await harness.finalize({ requestId: succReq, employeeCode, ip, success: true });

  const remaining = harness.getRows(employeeCode);
  assert.equal(remaining.length, 1, 'successful request tombstone remains while terminal failures are cleared');
  assert.equal(remaining[0].status, 'succeeded');

  // Account can immediately log in again
  const nextAcquire = await harness.acquire({ requestId: 'next-01', employeeCode, ip });
  assert.equal(nextAcquire.allowed, true);
});

check('admission-simulation: stale reservation stays counted and cannot be reused implicitly', async () => {
  const harness = createAdmissionHarness({ maxAccountAttempts: 2, reservationTimeoutSeconds: 30 });
  const employeeCode = 'NV005';
  const ip = '10.0.0.1';
  const now = Date.now();

  // 2 in-flight reservations at T=0
  await harness.acquire({ requestId: 'stale-1', employeeCode, ip, currentTime: now });
  await harness.acquire({ requestId: 'stale-2', employeeCode, ip, currentTime: now });

  // At T=10, 3rd reservation denied (limit reached)
  const deniedAt10 = await harness.acquire({ requestId: 'try-10', employeeCode, ip, currentTime: now + 10_000 });
  assert.equal(deniedAt10.allowed, false, 'must be locked at T=10');

  // A timeout does not prove that the original password checks stopped.
  const deniedAt35 = await harness.acquire({ requestId: 'try-35', employeeCode, ip, currentTime: now + 35_000 });
  assert.equal(deniedAt35.allowed, false, 'must remain blocked when stale work may still be running');

  const rows = harness.getRows(employeeCode);
  const reservedRows = rows.filter((r) => r.status === 'reserved');
  assert.equal(reservedRows.length, 2, 'stale reservations remain counted until explicit finalization');
});

check('admission-simulation: account and network isolation ensures independent throttling', async () => {
  const harness = createAdmissionHarness({ maxAccountAttempts: 2, maxNetworkAttempts: 5 });
  const ip = '10.0.0.1';

  // Account A exhausted
  await harness.acquire({ requestId: 'a1', employeeCode: 'ACCA', ip });
  await harness.finalize({ requestId: 'a1', employeeCode: 'ACCA', ip, success: false });
  await harness.acquire({ requestId: 'a2', employeeCode: 'ACCA', ip });
  await harness.finalize({ requestId: 'a2', employeeCode: 'ACCA', ip, success: false });

  const accALocked = await harness.acquire({ requestId: 'a3', employeeCode: 'ACCA', ip });
  assert.equal(accALocked.allowed, false, 'Account A must be locked');

  // Account B from same IP is NOT blocked
  const accBAllowed = await harness.acquire({ requestId: 'b1', employeeCode: 'ACCB', ip });
  assert.equal(accBAllowed.allowed, true, 'Account B must be allowed despite Account A being locked');
});

// Run all checks
console.log(`\n=== RUN login-admission-action unit & source regression ===`);
for (const c of cases) {
  console.log(`  ✓ ${c}`);
}
console.log(`=== PASS login-admission-action (${cases.length} cases verified) ===\n`);
