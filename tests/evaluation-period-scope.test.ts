import { strict as assert } from 'node:assert';
import { resolveEvaluationPeriodScope } from '../src/lib/evaluation-period-scope';

assert.deepEqual(resolveEvaluationPeriodScope([]), {
  kind: 'NO_ACTIVE_PERIOD',
  selectionReason: 'NO_ACTIVE_PERIOD',
});

assert.deepEqual(resolveEvaluationPeriodScope([{ id: 'period-a', status: 'active' }]), {
  kind: 'ACTIVE',
  activePeriodId: 'period-a',
  selectedPeriodStatus: 'Active',
  selectionReason: 'ACTIVE_ONLY',
});

assert.deepEqual(resolveEvaluationPeriodScope([
  { id: 'period-a', status: 'active' },
  { id: 'period-b', status: 'active' },
]), {
  kind: 'MULTIPLE_ACTIVE_PERIODS',
  selectionReason: 'MULTIPLE_ACTIVE_PERIODS',
});

assert.deepEqual(resolveEvaluationPeriodScope(null), {
  kind: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
  selectionReason: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
});

assert.deepEqual(resolveEvaluationPeriodScope([{ id: '', status: 'active' }]), {
  kind: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
  selectionReason: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
});

console.log('evaluation-period-scope tests: ALL PASS');
