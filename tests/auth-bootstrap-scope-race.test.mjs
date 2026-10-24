import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const authContextPath = path.join(process.cwd(), 'src', 'contexts', 'AuthContext.tsx');
const source = readFileSync(authContextPath, 'utf8');

// ============================================================================
// P110M1T06 — the auth bootstrap must run exactly once, and an in-flight scope
// request must be bound to the identity that started it: login of a new user
// must not be blocked by (or lose its scope to) the previous user's pending
// request, and a late old-identity response must never win.
// ============================================================================

// --- 1. Bootstrap runs once ---
assert.match(
  source,
  /const bootstrapStartedRef = useRef\(false\);\s*\n\s*useEffect\(\(\) => \{\s*\n\s*if \(isInitialized \|\| bootstrapStartedRef\.current\) return undefined;\s*\n\s*bootstrapStartedRef\.current = true;/,
  'bootstrap effect must early-return when initialized or already started'
);

// --- 2. Scope requests are identity-bound ---
assert.match(
  source,
  /const scopeRequestRef = useRef<\{ userId: string; request: Promise<ViewerScope \| null> \} \| null>\(null\);/,
  'in-flight scope request must carry its owner identity'
);
assert.match(
  source,
  /const inflight = scopeRequestRef\.current;\s*\n\s*if \(inflight && inflight\.userId === activeUserId\) return scopeRef\.current;/,
  'same-identity dedupe must remain; a different identity must proceed'
);
assert.match(
  source,
  /if \(scopeRequestRef\.current\?\.request === request\) scopeRequestRef\.current = null;/,
  'the slot must only be released by its owning request'
);

// --- 3. Behavioral: extract the real refreshViewerScope callback ---
const sourceFile = ts.createSourceFile(authContextPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let arrowText = null;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'refreshViewerScope') {
    if (node.initializer && ts.isCallExpression(node.initializer)) {
      const arg0 = node.initializer.arguments[0];
      if (arg0 && (ts.isArrowFunction(arg0) || ts.isFunctionExpression(arg0))) {
        arrowText = arg0.getText(sourceFile);
      }
    }
  }
  ts.forEachChild(node, visit);
}
visit(sourceFile);
assert.ok(arrowText, 'refreshViewerScope callback not found');

const transpiled = ts.transpileModule(`return (${arrowText});`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function makeHarness(initialUserId) {
  const scopeA = { role: 'Leader', leaderTeamIds: ['t-A'] };
  const scopeB = { role: 'Manager', leaderTeamIds: [] };
  const calls = { getViewerScopeCalls: 0, setViewerScopeCalls: [] };
  const userRef = { current: initialUserId ? { id: initialUserId } : null };
  const scopeRef = { current: null };
  const scopeRequestRef = { current: null };
  const pending = [];

  const getViewerScopeAction = () => {
    calls.getViewerScopeCalls += 1;
    const requester = userRef.current?.id;
    return new Promise((resolve) => {
      pending.push({ requester, resolve });
    });
  };
  const setViewerScope = (value) => calls.setViewerScopeCalls.push(value);
  const clearScopedQueries = async () => {};

  const refresh = new Function(
    'userRef', 'scopeRef', 'scopeRequestRef', 'getViewerScopeAction', 'setViewerScope', 'clearScopedQueries',
    'lastScopeRefreshAtRef', 'console',
    transpiled,
  )(userRef, scopeRef, scopeRequestRef, getViewerScopeAction, setViewerScope, clearScopedQueries,
    { current: 0 }, { error: () => {} });

  return { refresh, userRef, scopeRef, scopeRequestRef, pending, calls, scopeA, scopeB };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// 3a. A stale request from user A must not block (or null out) user B's login.
{
  const h = makeHarness('user-A');
  const firstPromise = h.refresh(); // A's poll refresh, in flight
  await flush();
  assert.equal(h.calls.getViewerScopeCalls, 1);

  // login B: identity switches, old scope cleared, then login calls refresh.
  h.userRef.current = { id: 'user-B' };
  h.scopeRef.current = null;
  const loginScopePromise = h.refresh();
  await flush();
  assert.equal(h.calls.getViewerScopeCalls, 2,
    'a new identity must start its own scope request even if another is in flight');

  h.pending.find((p) => p.requester === 'user-B').resolve(h.scopeB);
  const resolved = await loginScopePromise;
  assert.deepEqual(resolved, h.scopeB, 'login must resolve with the NEW user scope, not null');
  assert.equal(h.scopeRef.current ? h.scopeRef.current.role : null, 'Manager');
  assert.equal(h.scopeRequestRef.current, null, 'B request owned the slot and released it');

  // A's stale response arrives afterwards: discarded, no state clobber, slot untouched.
  h.pending.find((p) => p.requester === 'user-A').resolve(h.scopeA);
  const staleResult = await firstPromise;
  assert.equal(staleResult, null, 'stale old-identity response is discarded');
  assert.equal(h.scopeRef.current.role, 'Manager', 'late A response must not overwrite B scope');
  assert.deepEqual(h.calls.setViewerScopeCalls.at(-1), h.scopeB);
}

// 3b. Same-identity dedupe: a second refresh while in flight returns the current scope.
{
  const h = makeHarness('user-B');
  const first = h.refresh();
  await flush();
  assert.equal(h.calls.getViewerScopeCalls, 1);
  const second = await h.refresh();
  assert.equal(h.calls.getViewerScopeCalls, 1, 'no duplicate request for the same identity');
  assert.equal(second, null, 'returns current scopeRef (still null while pending)');

  h.pending[0].resolve(h.scopeB);
  assert.deepEqual(await first, h.scopeB);
}

// 3c. Anonymous caller never issues a request.
{
  const h = makeHarness(null);
  const result = await h.refresh();
  assert.equal(result, null);
  assert.equal(h.calls.getViewerScopeCalls, 0);
}

// --- 4. Existing poll contracts still hold ---
assert.equal(source.includes('clearBeforeRender: true'), false, 'poll must never clear before render');
assert.match(source, /if \(inflight && inflight\.userId === activeUserId\) return scopeRef\.current;/);

console.log('P110M1T06 auth bootstrap + scope race: ALL PASS');
