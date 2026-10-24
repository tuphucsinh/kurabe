// P107M1T07 owned helper: fail-closed guards, resource readback, evidence ledger,
// and process/port/docker primitives. Portable across runs; no hardcoded
// historical SHA, no /tmp assumption, no shared server. Owned fixture-local file.
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const MEM_MIN_KIB = 3_145_728; // 3 GiB MemAvailable floor before provision/build/browser.
export const TASK_ID = 'P107M1T07';
export const FIXTURE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT_ROOT = path.resolve(FIXTURE_DIR, '../../../..');

const SECRET_KEY = /(password|secret|token|apikey|api_key|authorization|cookie|jwt|passwd|pwd)/i;
const LONG_HEX = /\b[0-9a-f]{32,}\b/gi;
const BEARER = /Bearer\s+[A-Za-z0-9._-]+/gi;
const PG_URI = /(?:postgres(?:ql)?:\/\/)[^\s)"']+/gi;

/** Strip credentials/tokens/hashes/URLs from arbitrary text before it is stored. */
export function redact(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value
      .replace(PG_URI, '[REDACTED_DB_TARGET]')
      .replace(BEARER, 'Bearer [REDACTED]')
      .replace(LONG_HEX, '[REDACTED_HASH]')
      .replace(/(password|secret|token|apikey|api_key)\s*[=:]\s*[^\s,;"']+/gi, '$1=[REDACTED]')
      .replace(/https?:\/\/[^\s)"']+/gi, (url) => {
        try {
          const parsed = new URL(url);
          return `${parsed.origin}${parsed.pathname}`;
        } catch {
          return '[REDACTED_URL]';
        }
      });
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redact(entry);
    }
    return out;
  }
  return value;
}

export function safeError(error) {
  return redact(String(error?.message || error || 'unknown error')).slice(0, 1500);
}

export function localOnlyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

/** Runtime root must be under TMPDIR (or an explicit task-owned root), never /tmp itself. */
export function resolveRuntimeRoot({ explicit } = {}) {
  const candidate = explicit || process.env.KURABE_P107_RUNTIME_ROOT || null;
  if (candidate) {
    const resolved = path.resolve(candidate);
    if (resolved === '/tmp' || resolved.startsWith('/tmp/')) {
      throw localOnlyError('REFUSE_TMP_RUNTIME_ROOT', 'runtime root must not live under /tmp');
    }
    return resolved;
  }
  const tmpDir = os.tmpdir();
  if (!tmpDir || tmpDir === '/tmp' || tmpDir.startsWith('/tmp/')) {
    throw localOnlyError(
      'REFUSE_TMP_RUNTIME_ROOT',
      'TMPDIR resolves under /tmp; pass --runtime-root to a task-owned directory',
    );
  }
  return path.join(tmpDir, `kurabe-p107m1t07-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
}

export function readMemAvailableKiB() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const match = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/** Budget guard: refuse provisioning/build/browser below the MemAvailable floor. */
export function assertResourceBudget() {
  const available = readMemAvailableKiB();
  const readback = { memAvailableKiB: available, requiredKiB: MEM_MIN_KIB };
  if (available === null) {
    throw localOnlyError('RESOURCE_GUARD_UNREADABLE', 'cannot read MemAvailable from /proc/meminfo');
  }
  if (available < MEM_MIN_KIB) {
    throw localOnlyError(
      'RESOURCE_BUDGET_INSUFFICIENT',
      `MemAvailable ${available}KiB is below required ${MEM_MIN_KIB}KiB`,
    );
  }
  return readback;
}

export function run(file, args, options = {}) {
  return spawnSync(file, args, {
    cwd: options.cwd || PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 60_000,
    maxBuffer: options.maxBuffer || 32 * 1024 * 1024,
    env: options.env || process.env,
    ...options.spawnOptions,
  });
}

export function mustRun(file, args, options = {}) {
  const result = run(file, args, options);
  if (result.error || result.status !== 0) {
    throw new Error(
      `${file} ${args[0] || ''} failed (status=${result.status}): ${redact(result.stderr || result.stdout || result.error?.message || '')}`,
    );
  }
  return String(result.stdout || '').trim();
}

export function which(binary) {
  const probe = run('sh', ['-c', `command -v ${binary}`], { timeout: 5000 });
  return probe.status === 0 && String(probe.stdout).trim() ? String(probe.stdout).trim() : null;
}

export function locatePsql() {
  const candidates = [
    '/usr/lib/postgresql/17/bin/psql',
    '/usr/bin/psql',
    'psql',
    '/usr/local/bin/psql',
  ];
  for (const candidate of candidates) {
    const probe = run(candidate, ['--version'], { timeout: 4000 });
    if (probe.status === 0 && !probe.error) return candidate;
  }
  return null;
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** psql against a disposable loopback target; loopback + disposable-name guarded. */
export function psql(target, sql, options = {}) {
  if (!target || !isLoopbackHost(target.host)) {
    throw localOnlyError('REFUSE_NON_LOOPBACK_HOST', `db host is not loopback: ${target?.host}`);
  }
  if (!/^kurabe_harness_[a-z0-9_]+$/.test(String(target.database || ''))) {
    throw localOnlyError('REFUSE_NON_DISPOSABLE_DATABASE', `non-disposable db name: ${target.database}`);
  }
  const psqlBin = locatePsql();
  if (!psqlBin) throw localOnlyError('MISSING_RUNTIME_CAPABILITY', 'psql binary not found');
  const args = [
    '--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align',
    '--host', target.host, '--port', String(target.port),
    '--username', target.user, '--dbname', target.database,
  ];
  const result = spawnSync(psqlBin, args, {
    cwd: options.cwd || PROJECT_ROOT,
    env: { ...process.env, PGPASSWORD: target.password, PGPASSFILE: '/dev/null', PGCONNECT_TIMEOUT: '5' },
    input: sql,
    encoding: 'utf8',
    timeout: options.timeout || 60_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const error = new Error(`psql failed: ${redact(result.error?.message || result.stderr || result.stdout || '')}`);
    error.sqlstate = String(result.stderr || '').match(/ERROR:\s+([0-9A-Z]{5})/)?.[1] || null;
    error.businessError = /ERROR:/.test(String(result.stderr || ''));
    throw error;
  }
  return String(result.stdout || '').trim();
}

export function psqlJson(target, sql, options = {}) {
  const out = psql(target, sql, options);
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`psql returned non-JSON: ${redact(out).slice(0, 300)}`);
  }
}

export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function assertPortFree(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(localOnlyError('PORT_IN_USE', `loopback port ${port} already bound`)));
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}

export function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitFor(predicate, { timeout = 30_000, interval = 200, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(interval);
  }
  throw lastError || new Error(`${label} timed out after ${timeout}ms`);
}

/** Spawn a detached owned child whose process group can be signalled as a unit. */
export function spawnOwned(file, args, options = {}) {
  return spawn(file, args, {
    cwd: options.cwd || PROJECT_ROOT,
    env: options.env || process.env,
    detached: true,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
}

export function signalOwned(child, signal) {
  if (!child || child.exitCode !== null) return;
  if (child.pid) {
    try { process.kill(-child.pid, signal); return; } catch { /* fall through */ }
  }
  try { child.kill(signal); } catch { /* already gone */ }
}

export async function stopOwned(child, { graceMs = 5000 } = {}) {
  if (!child || child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  signalOwned(child, 'SIGTERM');
  await Promise.race([closed, wait(graceMs)]);
  if (child.exitCode === null) {
    signalOwned(child, 'SIGKILL');
    await Promise.race([closed, wait(2000)]);
  }
}

export function hashFile(absolutePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
}

export function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/** Source identity: frozen HEAD must match a caller-supplied expected SHA. */
export function captureSourceIdentity({ expectedSha }) {
  const head = mustRun('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT });
  if (!expectedSha || !/^[0-9a-f]{40}$/i.test(expectedSha)) {
    throw localOnlyError(
      'MISSING_EXPECTED_SHA',
      'a configurable expected SHA is required (--expected-sha or KURABE_P107_EXPECTED_SHA); no historical SHA is hardcoded',
    );
  }
  if (head.toLowerCase() !== expectedSha.toLowerCase()) {
    throw localOnlyError('SOURCE_DRIFT', `HEAD ${head} does not match expected ${expectedSha}`);
  }
  const status = mustRun('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: PROJECT_ROOT });
  if (status.trim() !== '') {
    throw localOnlyError(
      'SOURCE_DIRTY',
      `worktree is not clean (${status.trim().split('\n').length} entries); acceptance evidence requires the frozen clean candidate`,
    );
  }
  return { head, expectedSha, worktreeStatus: status };
}

/** Recursively list regular files under a directory (diagnostic identity helper). */
function listFilesRecursive(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile()) out.push(abs);
    }
  }
  return out.sort();
}

/**
 * Diagnostic-only source identity. Same HEAD assertion as captureSourceIdentity,
 * but tolerates an uncommitted (dirty) worktree: instead of throwing SOURCE_DIRTY
 * it returns a deterministic digest over the dirty tree so the exact bytes under
 * test are still pinned. Evidence produced with this identity is explicitly
 * diagnostic and can NEVER be qualified as the frozen candidate (see
 * browser-acceptance.mjs --diagnostic).
 */
export function captureDiagnosticIdentity({ expectedSha }) {
  const head = mustRun('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT });
  if (!expectedSha || !/^[0-9a-f]{40}$/i.test(expectedSha)) {
    throw localOnlyError(
      'MISSING_EXPECTED_SHA',
      'a configurable expected SHA is required (--expected-sha or KURABE_P107_EXPECTED_SHA)',
    );
  }
  if (head.toLowerCase() !== expectedSha.toLowerCase()) {
    throw localOnlyError('SOURCE_DRIFT', `HEAD ${head} does not match expected ${expectedSha}`);
  }
  const status = mustRun('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: PROJECT_ROOT });
  const trackedDiff = String(run('git', ['diff', 'HEAD', '--no-color'], { cwd: PROJECT_ROOT }).stdout || '');
  const digest = crypto.createHash('sha256');
  digest.update('status\0'); digest.update(status);
  digest.update('\0diff\0'); digest.update(trackedDiff);
  const entries = status.split('\n').filter(Boolean);
  for (const line of entries) {
    if (!line.startsWith('??')) continue;
    const rel = line.slice(3);
    const abs = path.join(PROJECT_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const files = fs.statSync(abs).isDirectory() ? listFilesRecursive(abs) : [abs];
    for (const file of files) {
      digest.update(`\0untracked:${path.relative(PROJECT_ROOT, file)}\0`);
      digest.update(fs.readFileSync(file));
    }
  }
  return {
    head,
    expectedSha,
    diagnostic: true,
    worktreeDirty: entries.length > 0,
    dirtyEntries: entries.length,
    dirtyDigest: digest.digest('hex'),
    worktreeStatus: status,
  };
}

/** Hash the harness sources this invocation ships so drift is detectable. */
export function captureHarnessSourceHashes() {
  const files = [
    'browser-acceptance.mjs',
    'lib/guard.mjs',
    'lib/stack.mjs',
    'lib/browser.mjs',
    'lib/org.mjs',
  ];
  const hashes = {};
  for (const relative of files) {
    const absolute = path.join(FIXTURE_DIR, relative);
    hashes[relative] = fs.existsSync(absolute) ? hashFile(absolute) : '[missing]';
  }
  return hashes;
}

/**
 * Fail-closed case ledger. `real`/`passed` stay false until every required case
 * is genuinely asserted as PASS. Partial lanes remain NOT_RUN/FAIL.
 */
export class CaseLedger {
  constructor({ manifest, evidencePath }) {
    this.evidencePath = evidencePath ? path.resolve(evidencePath) : null;
    this.manifest = manifest;
    this.byId = new Map();
    this.records = [];
    this.firstFailure = null;
    this.meta = { taskId: TASK_ID, startedAt: new Date().toISOString() };
  }

  setMeta(patch) {
    this.meta = { ...this.meta, ...redact(patch) };
    this.write();
  }

  record(entry) {
    const record = {
      id: entry.id,
      group: entry.group || this.byId.get(entry.id)?.group || 'general',
      required: entry.required ?? this.byId.get(entry.id)?.required ?? true,
      status: entry.status,
      expected: redact(entry.expected ?? null),
      actual: redact(entry.actual ?? null),
      readback: redact(entry.readback ?? null),
      errorKind: entry.errorKind || null,
      error: entry.error ? safeError(entry.error) : null,
      durationMs: entry.durationMs ?? null,
      at: new Date().toISOString(),
    };
    this.records.push(record);
    if (record.status !== 'PASS' && record.required && !this.firstFailure) {
      this.firstFailure = record;
    }
    this.write();
    return record;
  }

  async run(id, fn, expected) {
    const started = Date.now();
    try {
      const outcome = await fn();
      const record = this.record({
        id,
        status: 'PASS',
        expected,
        actual: outcome?.actual ?? outcome ?? null,
        readback: outcome?.readback ?? null,
        durationMs: Date.now() - started,
      });
      // P110M2T01: per-case progress on stderr so a stalled lane shows WHERE it is
      // (the wrapper forwards these lines live into the CI step log).
      console.error(`[caseledger] PASS ${id} ${record.durationMs}ms`);
      return record;
    } catch (error) {
      const record = this.record({
        id,
        status: 'FAIL',
        expected,
        actual: { error: safeError(error) },
        readback: error?.readback ? redact(error.readback) : null,
        errorKind: error?.errorKind || (error?.businessError ? 'BUSINESS_ERROR' : 'TRANSPORT_ERROR'),
        error,
        durationMs: Date.now() - started,
      });
      console.error(`[caseledger] FAIL ${id} ${record.durationMs}ms`);
      throw error;
    }
  }

  notRun(id, reason) {
    this.record({ id, status: 'NOT_RUN', expected: null, actual: { reason }, readback: null });
  }

  summary() {
    const ids = this.manifest.map((entry) => entry.id);
    const requiredIds = this.manifest.filter((entry) => entry.required !== false).map((entry) => entry.id);
    const byId = new Map();
    for (const record of this.records) byId.set(record.id, record);
    const unasserted = requiredIds.filter((id) => byId.get(id)?.status !== 'PASS');
    const unexpected = [...byId.keys()].filter((id) => !ids.includes(id));
    return {
      manifestSize: ids.length,
      asserted: this.records.length,
      unasserted,
      unexpected,
      firstFailure: this.firstFailure ? this.firstFailure.id : null,
      real: unasserted.length === 0 && unexpected.length === 0,
      passed: unasserted.length === 0 && unexpected.length === 0,
    };
  }

  snapshot() {
    const summary = this.summary();
    return {
      taskId: TASK_ID,
      meta: this.meta,
      manifest: this.manifest,
      summary,
      firstFailure: this.firstFailure,
      cases: this.records,
    };
  }

  write() {
    if (!this.evidencePath) return null;
    try {
      fs.mkdirSync(path.dirname(this.evidencePath), { recursive: true });
      const tmp = `${this.evidencePath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify(this.snapshot(), null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(tmp, this.evidencePath);
      return this.evidencePath;
    } catch {
      return null;
    }
  }
}

/**
 * Read `/proc/net/tcp` + docker state so the report proves resource ownership.
 * Enhanced for P107M1T07 prefreeze semantics: every process entry carries its
 * Linux starttime (identity, not just liveness), containers carry their docker
 * state+pid, the network carries its id, and owned loopback ports are probed for
 * an actual listener. A pure count is never accepted as a full-graph teardown.
 */
export function captureResourceReadback({ containerNames = [], networkName = null, pids = [], ports = [] } = {}) {
  const containers = containerNames.map((name) => {
    const state = run('docker', ['inspect', '--format', '{{.State.Status}}|{{.State.ExitCode}}|{{.State.Pid}}', name]);
    return { name, present: state.status === 0, state: state.status === 0 ? state.stdout.trim() : 'absent' };
  });
  let networkPresent = false;
  let networkId = null;
  if (networkName) {
    const net = run('docker', ['network', 'inspect', '--format', '{{.Id}}', networkName]);
    networkPresent = net.status === 0;
    networkId = net.status === 0 ? String(net.stdout).trim() : null;
  }
  const processAlive = pids.filter(Boolean).map((pid) => {
    const probe = run('kill', ['-0', String(pid)]);
    return { pid, alive: probe.status === 0, startTicks: readStartTicks(pid) };
  });
  const portState = ports.filter(Boolean).map((port) => {
    const probe = run('sh', ['-c', `ss -ltn 2>/dev/null | grep -c ':${port} ' || true`]);
    return { port, listenerPresent: Number(String(probe.stdout).trim() || '0') > 0 };
  });
  return redact({ containers, networkPresent, networkId, processAlive, portState });
}

/** Linux `/proc/<pid>/stat` starttime (clock ticks since boot); null if unreadable. */
export function readStartTicks(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const close = stat.lastIndexOf(')');
    // After "(comm) " the fields start at proc field 3 (state); starttime is field 22.
    const fields = stat.slice(close + 2).trim().split(/\s+/);
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

/** Current pg_stat_activity rows for this disposable database (loopback only). */
export function pgStatActivity(target) {
  return psqlJson(target, `SELECT COALESCE(json_agg(row_to_json(x)), '[]')::text FROM (
    SELECT pid, state, wait_event_type, wait_event, left(query, 160) AS query
    FROM pg_stat_activity WHERE datname = current_database()
  ) x;`);
}

/** Current pg_locks rows with their relation/mode/granted for overlap readback. */
export function pgLocks(target) {
  return psqlJson(target, `SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.pid), '[]')::text FROM (
    SELECT l.pid, l.locktype, COALESCE(c.relname, l.relation::text) AS relation, l.mode, l.granted
    FROM pg_locks l LEFT JOIN pg_class c ON c.oid = l.relation
  ) x;`);
}

/** Count backends of this database currently waiting on a lock. */
export function countLockWaiters(target) {
  return Number(psql(target, `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock';`));
}

/**
 * Long-lived psql session over a loopback pipe so the harness can hold a real
 * transaction/lock open while an authenticated browser action contends with it.
 * Never a fake connection: it is the same psql client against the disposable DB.
 */
export function openPsqlSession(target) {
  if (!target || !isLoopbackHost(target.host)) {
    throw localOnlyError('REFUSE_NON_LOOPBACK_HOST', `db host is not loopback: ${target?.host}`);
  }
  const psqlBin = locatePsql();
  if (!psqlBin) throw localOnlyError('MISSING_RUNTIME_CAPABILITY', 'psql binary not found');
  const args = [
    '--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--quiet',
    '--host', target.host, '--port', String(target.port),
    '--username', target.user, '--dbname', target.database,
  ];
  const child = spawn(psqlBin, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PGPASSWORD: target.password, PGPASSFILE: '/dev/null', PGCONNECT_TIMEOUT: '5' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const session = {
    pid: child.pid,
    sql(text) { child.stdin.write(text.endsWith('\n') ? text : `${text}\n`); return session; },
    take() { const out = stdout; stdout = ''; return out.trim(); },
    stderr() { const e = stderr; stderr = ''; return e.trim(); },
    async waitForOutput(pattern, { timeout = 15_000, label = 'psql session' } = {}) {
      await waitFor(() => (pattern.test(stdout) ? stdout : false), { timeout, label });
      return session;
    },
    async close() {
      try { child.stdin.write('\\q\n'); child.stdin.end(); } catch { /* already closed */ }
      await new Promise((resolve) => {
        if (child.exitCode !== null) { resolve(); return; }
        child.once('close', resolve);
        setTimeout(resolve, 3000);
      });
      return { exitCode: child.exitCode, stderr: stderr.trim().slice(0, 400) };
    },
  };
  return session;
}
