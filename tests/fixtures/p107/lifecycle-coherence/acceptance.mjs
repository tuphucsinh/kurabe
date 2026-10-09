import assert from 'node:assert/strict';

/**
 * Fixture contract for the P107M1T07 lifecycle-coherence suite. Pure and
 * side-effect free so the test file can import it without any alias/hook setup.
 */
export function validateFixture(fixture) {
  assert.equal(fixture.task, 'P107M1T07', 'fixture must describe P107M1T07');
  assert.ok(
    String(fixture.migration).endsWith('20261008000300_p107_lifecycle_coherence.sql'),
    'fixture must pin the owned candidate migration path',
  );
  assert.equal(fixture.periodRefreshAction, 'getPeriodMetadataAction');

  const scenarioIds = Object.keys(fixture.scenarios || {});
  for (const id of ['v1ReturnV2Resubmit', 'genuineConcurrentEdit', 'closeWithUnfinished']) {
    assert.ok(scenarioIds.includes(id), `fixture missing scenario ${id}`);
  }

  const v1 = fixture.scenarios.v1ReturnV2Resubmit;
  assert.equal(v1.expected.conflictRaised, false, 'V1->return->V2->resubmit must not conflict');
  assert.equal(v1.expected.errorMarker, 'CONFLICTING_NEXT_ROUND');
  assert.equal(v1.expected.nextRoundPin, 'C2');
  assert.equal(v1.expected.historyImmutable, true);

  const neg = fixture.scenarios.genuineConcurrentEdit;
  assert.equal(neg.expected.conflictRaised, true, 'genuine concurrent edit must still fail closed');

  const frozen = fixture.scenarios.closeWithUnfinished;
  assert.equal(frozen.expected.closeAllowed, true);
  assert.equal(frozen.expected.frozenIncomplete, true);
  assert.equal(frozen.expected.excludedState, false);
  assert.equal(frozen.expected.reopen, false);

  assert.equal(fixture.transitionContextCleanup.everySuccessPath, true);
  assert.equal(fixture.epochProtection.olderResponseMustNeverOverwriteNewerEpoch, true);
  return true;
}
