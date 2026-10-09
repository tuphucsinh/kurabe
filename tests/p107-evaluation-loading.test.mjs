import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLoggerSource } from './fixtures/p107/lifecycle-coherence/lib/browser.mjs';

// Focused regression for the P107M1T07 loading gate:
//  1. the evaluation page must not latch on EvaluationStaticFrame for a fresh
//     NotStarted editable round (the tracked browser-matrix blocker), and
//  2. the harness fetch logger must never delay/consume a streamed response.
// These are focused unit/contract checks; the authoritative proof is the actual
// local browser producer run under the declared evidence root.

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readProjectFile = (rel) => fs.readFileSync(path.join(PROJECT_ROOT, rel), 'utf8');

// ---------------------------------------------------------------------------
// 1. use-evaluation-page-state: target round uses authorization, not hasRoundDraft
// ---------------------------------------------------------------------------
const hookSource = readProjectFile('src/hooks/use-evaluation-page-state.ts');

// 1.1 The removed coupling must be gone.
assert.ok(
  !hookSource.includes('isTargetRoundVisible'),
  'target-round selection must not be gated on accessState.visibleRounds (draft-existence)',
);

// 1.2 The target round must be selected by presence + redaction only.
const targetExpr = hookSource.match(/const targetRound = (rawTargetRound[^;]*);/)?.[1];
assert.ok(targetExpr, 'layer-1 targetRound selection expression must exist');
assert.match(targetExpr, /rawTargetRound/, 'targetRound must derive from the raw (DTO-sanitized) target round');
assert.match(targetExpr, /!rawTargetRound\.isRedacted/, 'targetRound must keep the redaction/authorization guard');

// 1.3 Execute the shipped expression against representative rounds so the gate
//     semantics are proven, not merely pattern-matched.
const selectTarget = new Function('rawTargetRound', `return (${targetExpr});`);

const notStartedAuthorized = {
  round: 1,
  status: 'NotStarted',
  scores: {},
  notes: {},
};

// A fresh NotStarted editable round (no draft) must resolve so currentRoundData
// hydrates and the editable controls render.
assert.equal(
  selectTarget(notStartedAuthorized),
  notStartedAuthorized,
  'a fresh NotStarted round present in the DTO must resolve as the target round',
);

// A delivered draft round still resolves.
assert.equal(selectTarget({ round: 1, status: 'Draft', scores: { c1: 170 } }).status, 'Draft');

// A redacted round must never resolve.
assert.equal(
  selectTarget({ ...notStartedAuthorized, isRedacted: true }),
  null,
  'a redacted round must stay hidden',
);

// A missing round stays null.
assert.equal(selectTarget(null), null);

// 1.4 Previous-rounds privacy (T03) must remain gated by visibleRounds + redaction.
const prevRoundsLine = hookSource.match(/const prevRounds = evaluation\.rounds[\s\S]*?\.sort\(\(a, b\) => a\.round - b\.round\);/)?.[0];
assert.ok(prevRoundsLine, 'previous-rounds selection must exist');
assert.match(prevRoundsLine, /!r\.isRedacted/, 'previous rounds must drop redacted payloads');
assert.match(
  prevRoundsLine,
  /accessState\.visibleRounds\.some/,
  'previous rounds must stay restricted to viewer-visible rounds',
);

// ---------------------------------------------------------------------------
// 2. EvaluationPageClient: the static-frame gates are intact and fail-closed
// ---------------------------------------------------------------------------
const pageSource = readProjectFile('src/app/evaluations/[id]/EvaluationPageClient.tsx');

const initialGate = pageSource.match(
  /if\s*\(\s*!isMounted\s*\|\|\s*isLoadingUser\s*\|\|\s*isLoadingEval\s*\|\|\s*!pageData\s*\)\s*\{([\s\S]*?)\}/,
);
assert.ok(initialGate && /EvaluationStaticFrame/.test(initialGate[1]), 'initial loading gate must render the static frame');

const transientGate = pageSource.match(
  /if\s*\(\s*activeRound\s*&&\s*activeRoundExists\s*&&\s*!activeRoundData\s*\)\s*\{([\s\S]*?)\}/,
);
assert.ok(transientGate && /EvaluationStaticFrame/.test(transientGate[1]), 'transient round-hydration gate must render the static frame');
assert.ok(!transientGate[1].includes('AccessDenied'), 'transient round-hydration gate must never render AccessDenied');

// The transient static frame is only reachable while currentRoundData is pending;
// once the hook resolves the target round it renders editable. Assert the client
// consumes currentRoundData (so the hook fix actually unlocks the editable UI).
assert.ok(
  pageSource.includes('const activeRoundData = currentRoundData?.round === activeRound ? currentRoundData : null;'),
  'client must derive activeRoundData from the hook currentRoundData',
);

// ---------------------------------------------------------------------------
// 3. Fetch logger must not block/consume a streamed response (harness self-test)
// ---------------------------------------------------------------------------
const encoder = new TextEncoder();
let activeController = null;
const makeStream = () => new ReadableStream({
  start(c) {
    activeController = c;
    c.enqueue(encoder.encode('chunk-1'));
  },
});
const originalFetch = async () => new Response(makeStream(), { status: 200, headers: { 'content-type': 'text/x-component' } });
const fakeWindow = { fetch: originalFetch };

// Execute the exact injected source against a fake window.
new Function('window', fetchLoggerSource())(fakeWindow);
assert.equal(typeof fakeWindow.fetch, 'function');

const started = Date.now();
const logged = await fakeWindow.fetch('/p107-action', { method: 'POST' });
const elapsed = Date.now() - started;

// The wrapper must hand the (still-streaming) response back promptly.
assert.equal(logged.status, 200, 'logger must return the original response');
assert.ok(elapsed < 250, `logger must not await the response body before returning (waited ${elapsed}ms)`);
assert.equal(fakeWindow.__p107FetchLog.length, 1, 'the server-action POST must be logged');
assert.equal(fakeWindow.__p107FetchLog[0].status, 200, 'logged status must reflect the response');
assert.equal(fakeWindow.__p107FetchLog[0].method, 'POST');
assert.equal(fakeWindow.__p107FetchLog[0].body, '', 'body must be read out-of-band, not before returning');

// Finish the stream and confirm the body is captured asynchronously.
activeController.enqueue(encoder.encode('-tail'));
activeController.close();
await new Promise((resolve) => setTimeout(resolve, 60));
assert.equal(fakeWindow.__p107FetchLog[0].body, 'chunk-1-tail', 'the cloned body must be captured after the stream ends');

// GET requests are never cloned/logged (no interference with normal navigation).
const getLogged = await fakeWindow.fetch('/dashboard', { method: 'GET' });
assert.equal(getLogged.status, 200);
assert.equal(fakeWindow.__p107FetchLog.length, 1, 'GET requests must not be logged');

console.log('P107M1T07 evaluation loading gate + fetch-logger self-test: ALL PASS');
