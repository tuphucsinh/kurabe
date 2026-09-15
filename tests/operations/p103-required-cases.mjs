#!/usr/bin/env node
import assert from 'node:assert/strict';

export const TASK_ID = 'P103M4T01';
export const BASE_SHA = '7807d6d3789b4772ba68c1d692b385581e51510f';
export const CANONICAL_ANCESTORS = Object.freeze([
  'd2142155fb633b70db4ad22d69edd426e50f5924',
  '36d696c1367fbfd76afd5d15db14a493b753f733',
  'ea04a894bd4fee8214fa9a395fc5a279255fd596',
]);

export function verifyCandidateSha(candidateSha, env = process.env) {
  assert.match(candidateSha, /^[0-9a-f]{40}$/i, 'candidate SHA must be a full commit SHA');
  assert.doesNotThrow(() => execFileSync('git', ['merge-base', '--is-ancestor', BASE_SHA, candidateSha]));
  if (env.KURABE_CONFIRMATION_CANDIDATE_SHA) {
    assert.equal(env.KURABE_CONFIRMATION_CANDIDATE_SHA, candidateSha, 'RUNTIME_CANDIDATE_SHA_MISMATCH');
  }
  return candidateSha;
}

// These are the authenticated cases emitted by the already-qualified H1/H2,
// H3, H5, H6, and H7 integration modules. The two H1/H2 database-invariant
// branches that the source module labels source-only are intentionally absent.
export const INTEGRATION_REQUIRED_CASES = Object.freeze([
  'h1h2:employee-flow-subleader-to-leader-to-manager',
  'h1h2:worker-flow-subleader-to-leader-to-manager',
  'h1h2:subleader-flow-self-to-leader-to-manager',
  'h1h2:leader-flow-self-to-manager',
  'h1h2:manager-flow-self-final',
  'h1h2:employee-worker-self-r1-denial',
  'h1h2:appointed-leader-independent-team-save',
  'h1h2:unrelated-leader-c-denial',
  'h1h2:pointer-absent-unique-primary-fallback',
  'h1h2:skipped-round-denial',
  'h1h2:backward-round-denial',
  'h1h2:conflicting-replay-denial',
  'h1h2:final-tampered-submit-denial',
  'h1h2:stale-config-version-denial',
  'h1h2:closed-period-denial',
  'h3:own-employee-scope',
  'h3:manager-all-teams-scope',
  'h3:subleader-managed-employees-scope',
  'h3:leader-primary-a-only-scope',
  'h3:leader-appointed-ab-full-summary-parity',
  'h3:leader-unrelated-c-denial',
  'h3:leader-revoked-b-scope',
  'h3:zero-assigned-rounds-scope',
  'h3:pagination-scope-parity',
  'h3:single-detail-scope-parity',
  'h3:fail-closed-empty-id',
  'h5:fixture-notstarted-to-draft-to-submitted',
  'h5:positive-appointed-leader-save',
  'h5:revoke-appointment-save-denial',
  'h5:revoke-appointment-submit-denial',
  'h5:revoke-appointment-return-denial',
  'h5:atomic-graph-unchanged-on-deny',
  'h5:historical-submitted-data-unchanged',
  'h5:manager-authenticated-revoke-readback',
  'h5:current-authorized-leader-positive-control',
  'h6:authentic-r1-draft-response-matches-db',
  'h6:authentic-r1-submit-advances-to-r2',
  'h6:authentic-r2-draft-response-matches-submitted-db',
  'h6:authentic-r2-submit-advances-to-r3',
  'h6:authentic-r3-draft-response-matches-reviewed-db',
  'h6:authentic-r3-final-submit-approves',
  'h6:repeated-identical-draft-no-duplicate-round',
  'h6:draft-has-no-submit-audit-or-next-transition',
  'h6:initialize-draft-consumer-parity',
  'h6:atomic-denial-stale-revoked-closed',
  'h7:source-authorization-before-version-lookup',
  'h7:manager-sees-per-round-v1-v2-snapshots',
  'h7:subject-role-snapshot-survives-current-role-change',
  'h7:submitted-grade-and-score-persisted',
  'h7:legacy-null-version-is-explicit',
  'h7:no-current-config-fallback',
  'h7:version-query-failure-contract-is-unavailable',
  'h7:unauthorized-leader-gets-no-dto',
  'h7:batched-unique-version-lookups',
]);

// Browser cases are deliberately separate from integration cases. They are
// only satisfied by the actual Next production build under Chrome/CDP; source
// contract modules and synthetic HTML are never accepted here.
export const BROWSER_REQUIRED_CASES = Object.freeze([
  'h4:history-denied-target-non-disclosure',
  'h4:history-authorized-submitted-read',
  'h4:history-route-action-policy-parity',
  'h4:history-generic-unavailable-render',
  'h7:submitted-grade-from-display-dto',
  'h7:submitted-criteria-labels-per-round',
  'h7:submitted-evaluator-role-from-display-dto',
  'h7:loading-state-no-live-flicker',
  'h7:error-legacy-unavailable-no-current-fallback',
  'h7:draft-keeps-current-rules',
  'h7:active-period-and-auth-boundaries',
  'cache:server-authoritative-scope-in-query-identity',
  'cache:logout-clears-old-scope-before-render',
  'cache:visible-scope-refresh-is-bounded',
  'cache:failed-read-removes-last-good-sensitive-payload',
]);

export const REQUIRED_CASES = Object.freeze([
  ...INTEGRATION_REQUIRED_CASES,
  ...BROWSER_REQUIRED_CASES,
]);

export const CASE_TIER = Object.freeze({
  integration: 'real-DB/authenticated',
  browser: 'actual-Next-browser/authenticated',
});

export function verifyRequiredCaseManifest() {
  assert.equal(new Set(INTEGRATION_REQUIRED_CASES).size, INTEGRATION_REQUIRED_CASES.length, 'integration required case IDs must be unique');
  assert.equal(new Set(BROWSER_REQUIRED_CASES).size, BROWSER_REQUIRED_CASES.length, 'browser required case IDs must be unique');
  assert.equal(new Set(REQUIRED_CASES).size, REQUIRED_CASES.length, 'combined required case IDs must be unique');
  assert.ok(REQUIRED_CASES.every((name) => /^[a-z0-9]+(?:[a-z0-9-]*):[a-z0-9-]+$/.test(name)), 'case IDs must be stable namespaced identifiers');
  assert.ok(Object.isFrozen(INTEGRATION_REQUIRED_CASES));
  assert.ok(Object.isFrozen(BROWSER_REQUIRED_CASES));
  assert.ok(Object.isFrozen(REQUIRED_CASES));
  return {
    taskId: TASK_ID,
    baseSha: BASE_SHA,
    canonicalAncestors: [...CANONICAL_ANCESTORS],
    integration: [...INTEGRATION_REQUIRED_CASES],
    browser: [...BROWSER_REQUIRED_CASES],
    total: REQUIRED_CASES.length,
    tiers: { ...CASE_TIER },
  };
}

if (process.argv[1] && process.argv[1].endsWith('p103-required-cases.mjs')) {
  try {
    const manifest = verifyRequiredCaseManifest();
    console.log(`P103_REQUIRED_CASES EXECUTED integration=${manifest.integration.length} browser=${manifest.browser.length} total=${manifest.total}`);
  } catch (error) {
    console.error(`P103_REQUIRED_CASES FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
