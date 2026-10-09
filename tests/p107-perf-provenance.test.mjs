import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// P107M1T09 provenance contract test.
//
// Proves the performance-report provenance rules without re-running the heavy
// harness: the checked-in report must be a self-consistent generated artifact,
// its report SHA must be distinct from the candidate BASE/tree/source identity,
// the run-count equation must hold for every lane from runtime output, and a
// report bound to a different source SHA must never be accepted as evidence for
// the current candidate. Also proves the effective fixtures are identical
// across the before/after lanes and that FCP/LCP UNKNOWN is never guessed.

const rootDir = process.cwd();
const reportPath = path.join(rootDir, 'tests', 'perf', 'perf-report.json');
const harnessPath = path.join(rootDir, 'tests', 'perf', 'benchmark-harness.mjs');
const EXPECTED_SCHEMA = 'kurabe-performance-baseline/v2';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function reportContentSha(report) {
  const clone = JSON.parse(JSON.stringify(report));
  if (clone.provenance) delete clone.provenance.reportSha;
  return sha256(JSON.stringify(clone));
}

// Provenance verdict: may `report` be used as current-candidate evidence for
// `currentCandidateSha`? Encodes the rules proved below.
function provenanceVerdict(report, currentCandidateSha) {
  const reasons = [];
  const provenance = (report && report.provenance) || {};
  const candidate = provenance.candidate || {};
  if (typeof provenance.reportSha !== 'string' || !/^[0-9a-f]{64}$/i.test(provenance.reportSha)) {
    reasons.push('reportSha missing or not a 64-hex digest');
  } else if (reportContentSha(report) !== provenance.reportSha) {
    reasons.push('reportSha does not match the report content (tampered/stale artifact)');
  }
  for (const [label, value] of [['baseSha', candidate.baseSha], ['treeSha', candidate.treeSha], ['sourceSha', candidate.sourceSha]]) {
    if (!value || typeof value !== 'string') reasons.push(`candidate ${label} missing`);
  }
  if (provenance.reportSha && [candidate.baseSha, candidate.treeSha, candidate.sourceSha].includes(provenance.reportSha)) {
    reasons.push('report SHA equals a candidate identity SHA');
  }
  const equations = provenance.runCountEquation || {};
  const laneNames = Object.keys(equations);
  if (laneNames.length === 0) reasons.push('run-count equation missing');
  for (const lane of laneNames) {
    const equation = equations[lane];
    const expected = (equation.routes + equation.deniedRoutes) * equation.viewports * equation.states * equation.samplesPerPoint;
    if (equation.expected !== expected) reasons.push(`lane ${lane} expected does not equal the run-count equation`);
    if (equation.observed !== equation.expected) reasons.push(`lane ${lane} observed runs do not equal expected`);
    if (equation.ok !== true) reasons.push(`lane ${lane} run-count equation not satisfied`);
  }
  if (!currentCandidateSha) reasons.push('current candidate SHA unavailable');
  else if (candidate.baseSha !== currentCandidateSha) reasons.push('candidate source SHA is not the current candidate (stale report)');
  return { accepted: reasons.length === 0, reasons };
}

console.log('=== P107M1T09 PERF PROVENANCE CONTRACT TEST ===\n');

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const harnessSource = fs.readFileSync(harnessPath, 'utf8');
const candidate = report.provenance.candidate;

// R1 — report identity/provenance shape.
assert.equal(report.schema, EXPECTED_SCHEMA, 'report schema must be the provenance-bearing v2 schema');
assert.equal(report.provenance.mode, 'actual-local', 'report must be the actual-local authenticated production-build lane');
assert.equal(report.provenance.target, 'loopback-owned-supabase-plus-private-next-production');
assert.equal(report.provenance.liveBrowser, true, 'a real browser must have produced the report');
assert.equal(report.provenance.authenticated, true, 'the lane must be authenticated');

// R2 — report SHA distinct from the candidate BASE/tree/source SHA and self-consistent.
assert.match(report.provenance.reportSha, /^[0-9a-f]{64}$/i, 'reportSha must be a 64-hex content digest');
assert.equal(reportContentSha(report), report.provenance.reportSha, 'reportSha must equal the recomputed report content hash');
assert.match(candidate.baseSha, /^[0-9a-f]{40}$/i, 'candidate baseSha must be a git commit SHA');
assert.match(candidate.treeSha, /^[0-9a-f]{40}$/i, 'candidate treeSha must be a git tree SHA');
assert.match(candidate.sourceSha, /^[0-9a-f]{64}$/i, 'candidate sourceSha must be a source digest');
assert.notEqual(report.provenance.reportSha, candidate.baseSha, 'report SHA must be distinct from candidate BASE SHA');
assert.notEqual(report.provenance.reportSha, candidate.treeSha, 'report SHA must be distinct from candidate tree SHA');
assert.notEqual(report.provenance.reportSha, candidate.sourceSha, 'report SHA must be distinct from candidate source SHA');

// R3 — run-count equation checked from the report's runtime output, per lane.
assert.deepEqual(report.provenance.lanes, ['baseline', 'candidate'], 'both before/after lanes must be present');
for (const lane of report.provenance.lanes) {
  const equation = report.provenance.runCountEquation[lane];
  assert.ok(equation, `run-count equation for lane ${lane}`);
  const expected = (equation.routes + equation.deniedRoutes) * equation.viewports * equation.states * equation.samplesPerPoint;
  assert.equal(equation.expected, expected, `lane ${lane} expected must equal the equation`);
  assert.equal(equation.observed, equation.expected, `lane ${lane} observed runs must equal expected`);
  assert.equal(equation.ok, true, `lane ${lane} equation must be satisfied`);
  assert.equal(report.lanes[lane].runs.length, equation.observed, `lane ${lane} stored runs must match observed`);
  assert.equal(report.lanes[lane].runCountEquation.observed, equation.observed);
}

// R4 — the checked-in report is accepted as evidence for its own candidate source.
const accepted = provenanceVerdict(report, candidate.baseSha);
assert.equal(accepted.accepted, true, `current report must be accepted for its candidate: ${accepted.reasons.join('; ')}`);

// R5 — a report bound to a different source SHA is rejected (no stale evidence).
const staleVerdict = provenanceVerdict(report, 'b'.repeat(40));
assert.equal(staleVerdict.accepted, false, 'a report whose candidate SHA is not current must be rejected');
assert.ok(staleVerdict.reasons.some((reason) => /stale/.test(reason)), 'stale rejection must state the candidate mismatch');

// R6 — a report whose SHA equals the candidate identity is rejected.
const forged = JSON.parse(JSON.stringify(report));
forged.provenance.reportSha = forged.provenance.candidate.sourceSha;
const forgedVerdict = provenanceVerdict(forged, candidate.baseSha);
assert.equal(forgedVerdict.accepted, false, 'a report SHA equal to the candidate identity must be rejected');
assert.ok(forgedVerdict.reasons.some((reason) => /equals a candidate identity/.test(reason)));

// R7 — effective fixtures identical across before/after lanes.
const pointKey = (run) => `${run.route}|${run.viewport}|${run.role}|${run.access}|${run.state}`;
const pointsOf = (lane) => [...new Set(report.lanes[lane].runs.map(pointKey))].sort();
assert.deepEqual(pointsOf('baseline'), pointsOf('candidate'), 'lanes must cover the identical route/viewport/role/access/state points');
for (const lane of report.provenance.lanes) {
  const counts = {};
  for (const run of report.lanes[lane].runs) counts[pointKey(run)] = (counts[pointKey(run)] || 0) + 1;
  for (const [key, count] of Object.entries(counts)) {
    assert.equal(count, report.provenance.samplesPerPoint, `${lane} ${key} must have ${report.provenance.samplesPerPoint} samples`);
  }
}
assert.ok(report.provenance.fixture && report.provenance.fixture.seedIdentity, 'the shared fixture identity must be recorded');
assert.deepEqual(report.provenance.fixture.routes, report.provenance.routes);
assert.deepEqual(report.provenance.fixture.viewports, report.provenance.viewports);
assert.deepEqual(report.provenance.fixture.states, report.provenance.states);
assert.equal(report.provenance.fixture.regions.length, 1, 'the measured region must be the loopback region');
assert.ok(report.provenance.fixture.largeRosterCount >= 100, 'a large shared roster must be seeded for both lanes');
assert.ok(report.provenance.fixture.historical, 'the historical correctness fixture readback must be recorded');
assert.ok(report.provenance.fixture.historical.closedPeriods >= 1, 'historical closed-period correctness data must be present');
assert.equal(report.runtimeReadback.largeRoster.seeded, report.provenance.fixture.largeRosterCount, 'roster readback must match the recorded fixture');
assert.equal(report.runtimeReadback.largeRoster.cleanup.rosterResidue, 0, 'the shared large roster must be cleaned up with zero residue');

// R8 — FCP/LCP missing entry is UNKNOWN (null), never guessed.
let unknownPaints = 0;
for (const run of report.runs) {
  for (const metric of ['fcp', 'lcp']) {
    assert.ok(run[metric] === null || typeof run[metric] === 'number', `${metric} must be a number or explicit null (UNKNOWN)`);
    if (run[metric] === null) unknownPaints += 1;
  }
}
assert.ok(unknownPaints > 0, 'at least one UNKNOWN paint entry must be preserved rather than fabricated');

// R9 — network/console errors are fatal (none may be recorded).
for (const lane of report.provenance.lanes) {
  for (const run of report.lanes[lane].runs) {
    assert.equal(run.browserErrors.length, 0, `${lane} ${pointKey(run)} must record zero browser/runtime/network errors`);
  }
}

// R10 — the harness source carries the provenance rules it is asserted to enforce.
for (const token of ['reportContentSha', 'report.provenance.reportSha === report.provenance.candidate.sourceSha', 'runCountFormula', 'KURABE_PERF_LANES', 'measureActionDb']) {
  assert.ok(harnessSource.includes(token), `harness must implement provenance token: ${token}`);
}

// R11 — gates recorded from real measurements (a failure would be a residual, not fabricated).
assert.equal(typeof report.provenance.gates.dataCompleteMedianMs, 'number', 'dataComplete median must be measured');
assert.equal(typeof report.provenance.gates.submitP95Ms, 'number', 'submit p95 must be measured');
assert.equal(report.provenance.gates.submitLane, 'loopback-low-rtt', 'submit gate must name its low-RTT lane');
assert.equal(report.provenance.gates.dataCompleteMedianLimitMs, 1000);
assert.equal(report.provenance.gates.submitP95LimitMs, 800);

// R12 — action/DB timing recorded with the required sample count.
assert.equal(report.actionDb.dbRead.samples.length, report.provenance.samplesPerPoint);
assert.equal(report.actionDb.submit.samples.length, report.provenance.samplesPerPoint);
assert.equal(report.actionDb.submit.okSamples, report.provenance.samplesPerPoint, 'every low-RTT submit sample must complete');
assert.equal(typeof report.actionDb.dbRead.stats.median, 'number');
assert.equal(typeof report.actionDb.submit.stats.p95, 'number');

// R13 — shell/light/heavy/full phases recorded per lane.
for (const lane of report.provenance.lanes) {
  assert.ok(Array.isArray(report.lanes[lane].phases) && report.lanes[lane].phases.length > 0, `lane ${lane} phase summary`);
  for (const point of report.lanes[lane].phases) {
    for (const phase of ['shell', 'light', 'heavy', 'full']) {
      assert.ok(point.metrics[phase], `lane ${lane} ${pointKey(point)} must record the ${phase} phase`);
    }
  }
}

console.log('P107M1T09 perf provenance contract: ALL PASS');
