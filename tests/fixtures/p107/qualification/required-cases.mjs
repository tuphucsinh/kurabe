#!/usr/bin/env node
/**
 * P107M1T10 qualification case manifest (pure data; no side effects).
 *
 * This module is the single source of truth for the integrated `p107-qualification`
 * required cases. It is imported by the integration/browser producers AND by the
 * source-contract test, so the required set cannot drift between them.
 *
 * Case coverage maps to the accepted master-plan matrix:
 *  - `p107-read-authority:*`      -> T03 sensitive read boundary + appointed-Leader write authority (real DB).
 *  - `p107-auth-resilience:*`     -> T04 compatible seed/CAS + login resilience (real two-connection race).
 *  - `p107-roster-personnel:*`    -> T05 large roster + personnel lifecycle + named DB races.
 *  - `p107-lifecycle-coherence:*` -> T07 lifecycle/return/resubmit + rollback/reapply + named DB races.
 *  - P103 integration/browser cases remain delegated unchanged (five flows, read policy, history).
 *  - lifecycle browser cases       -> T07 provider freshness, two-tab convergence, mobile/desktop DOM/network.
 */

// Self-contained disposable-PostgreSQL producers (spawned as child processes).
// Each starts its own loopback postgres:17-alpine container, bootstraps, applies the
// candidate migrations, asserts, prints "<marker> PASS cases=N" then one case per line,
// and removes its container in a finally block.
export const ACCEPTANCE_PRODUCERS = Object.freeze([
  {
    area: 'read-authority',
    taskId: 'P107M1T03',
    script: 'tests/fixtures/p107/read-authority/acceptance.mjs',
    marker: 'P107T03_RUNTIME_ACCEPTANCE',
  },
  {
    area: 'auth-resilience',
    taskId: 'P107M1T04',
    script: 'tests/fixtures/p107/auth-resilience/acceptance.mjs',
    marker: 'P107T04_RUNTIME_ACCEPTANCE',
  },
  {
    area: 'roster-personnel',
    taskId: 'P107M1T05',
    script: 'tests/fixtures/p107/roster-personnel/acceptance.mjs',
    marker: 'P107T05_RUNTIME_ACCEPTANCE',
  },
  {
    area: 'lifecycle-coherence',
    taskId: 'P107M1T07',
    script: 'tests/fixtures/p107/lifecycle-coherence/db-acceptance.mjs',
    marker: 'P107T07_RUNTIME_ACCEPTANCE',
  },
]);

// Stable leading tokens emitted by each producer (dynamic "=N"/" key=value" suffixes
// are normalised away by the producer parser).
const P107_READ_AUTHORITY_CASES = Object.freeze([
  'db-bootstrap-baseline+catalog+ledger',
  'pre-migration-seed',
  'pre-candidate-migrations-applied',
  'candidate-migration-applied',
  'acl-closure-verified',
  'rollback-requires-approval',
  'rollback-restores-captured-acl',
  'rpc-unappointed-next-leader-denied',
  'rpc-appointed-next-leader-allowed',
  'rpc-appointed-leader-save-allowed',
  'rpc-unappointed-leader-save-denied',
  'rpc-revoked-actor-save-denied',
  'rpc-revoked-actor-left-db-unchanged',
]);

const P107_AUTH_RESILIENCE_CASES = Object.freeze([
  'db-bootstrap-baseline+catalog+ledger',
  'forward-migrations-applied',
  'seed-cas-predicates-verified',
  'fixture-users-inserted',
  'concurrent-credential-change-committed',
  'seed-cas-matched-zero-rows',
  'user-credential-survived-revision-monotonic',
  'clean-seed-affects-one-row',
]);

const P107_ROSTER_PERSONNEL_CASES = Object.freeze([
  'db-bootstrap-baseline+catalog+ledger',
  'prior-migrations-applied',
  'pre-state-captured-functions',
  'candidate-migration-applied',
  'post-apply-graph-and-acl-verified',
  'rollback-restores-captured-graph',
  'reapply-reproduces-post-apply-graph',
  'p107-race-control-single-create',
  'p107-race-create-create-single-active',
  'p107-race-roster-churn-vs-create',
  'p107-race-deactivate-live-evaluator',
]);

const P107_LIFECYCLE_DB_CASES = Object.freeze([
  'db-bootstrap-baseline+catalog+ledger',
  'prior-migrations-applied',
  'pre-state-captured-functions',
  'candidate-migration-applied',
  'post-apply-graph-and-acl-verified-including-public',
  'rollback-restores-captured-graph',
  'reapply-reproduces-post-apply-graph',
  'seeded-personnel-evaluation-graph',
  'v1-submit-creates-mutable-next-round',
  'return-resets-returned-round-and-unlocks-previous',
  'v2-config-activated',
  'v1-return-v2-resubmit-reconciled-without-conflict',
  'genuine-concurrent-edit-denied-and-rolled-back',
  'committed-history-immutable',
]);

function namespaced(area, tokens) {
  return tokens.map((token) => `p107-${area}:${token}`);
}

// p107 DB producers only (P103 integration cases are appended from the shared manifest).
export const P107_PRODUCER_CASES = Object.freeze([
  ...namespaced('read-authority', P107_READ_AUTHORITY_CASES),
  ...namespaced('auth-resilience', P107_AUTH_RESILIENCE_CASES),
  ...namespaced('roster-personnel', P107_ROSTER_PERSONNEL_CASES),
  ...namespaced('lifecycle-coherence', P107_LIFECYCLE_DB_CASES),
]);

// Real local HTTP/Next + actual PostgREST ACL probes, executed read-only against the
// integrated candidate runtime (idempotent; never mutates the shared fixture graph).
export const P107_HTTP_CASES = Object.freeze([
  'http:next-login-reachable',
  'http:postgrest-rest-root-reachable',
  'http:postgrest-anon-rpc-denied',
  'http:postgrest-service-rpc-allowed',
]);

// T07 lifecycle browser producer case IDs (real Next production build + Chromium CDP).
export const P107_LIFECYCLE_BROWSER_CASES = Object.freeze([
  'src:frozen-head-expected-sha',
  'src:harness-source-hashes',
  'infra:resource-budget',
  'infra:loopback-stack-owned',
  'infra:migrations-applied-ledger',
  'infra:rest-postgrest-real',
  'infra:next-isolated-build',
  'infra:owned-resource-identity',
  'org:single-active-manager',
  'org:appointed-leader',
  'org:subleader-pointers',
  'org:no-progressed-rounds-seeded',
  'config:active-criteria-and-grade',
  'period:create-via-ui',
  'period:evaluations-seeded-for-five-subjects',
  'period:close-clean-approved',
  'period:close-frozen-unfinished',
  'period:new-period-created',
  'flow:manager-round1-self-final-approve',
  'flow:leader-round1-self',
  'flow:leader-round2-manager-approve',
  'flow:subleader-round1-self',
  'flow:subleader-round2-leader',
  'flow:subleader-round3-manager-approve',
  'flow:employee-round1-subleader',
  'flow:employee-round2-leader',
  'flow:employee-round3-manager-return',
  'flow:employee-resubmit-round2',
  'flow:employee-round3-manager-final-approve',
  'flow:worker-round1-subleader',
  'flow:worker-round2-leader',
  'flow:worker-round3-manager-approve',
  'flow:employee-login-own-view',
  'flow:worker-login-own-view',
  'flow:immutable-closed-history',
  'deny:http-business-vs-transport-separated',
  'deny:zero-graph-delta-on-deny',
  'deny:closed-period-write-denied',
  'deny:revoked-session-cannot-restore',
  'race:close-save-concurrent',
  'race:close-save-db-concurrent',
  'race:return-submit-concurrent',
  'race:return-submit-db-concurrent',
  'race:version-edit-resubmit-concurrent',
  'fault:version-edit-resubmit-reconcile',
  'fault:duplicate-response-loss-retry',
  'fault:reader-transport-retry-recovery',
  'fault:stale-read-cannot-resurrect-after-revocation',
  'tab:shared-context-create-select-convergence',
  'tab:shared-context-close-convergence',
  'tab:cookie-provider-rsc-consistency',
  'tab:delete-empty-refused-convergence',
  'tab:delete-empty-success-convergence',
  'poll:unchanged-scope-30s-no-blink',
  'cdp:delayed-response-no-stale-resident',
  'dto:approved-only-projection',
  'dto:approved-only-projection-mixed',
  'dto:minimization-no-internal-fields',
  'scope:no-active-period-fail-closed',
  'scope:malformed-active-metadata-fail-closed',
  'diag:desktop-1440x900-console-network',
  'diag:mobile-390x844-console-network',
  'diag:loading-empty-error-retry-behavior',
  'diag:screenshots-captured',
  'diag:console-exception-first-party-gates',
]);
