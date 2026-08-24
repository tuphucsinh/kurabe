/**
 * Behavioral tests for canDeleteEvaluationPeriodStatus (Phase 0 Bug 1).
 * Run: npx tsc --module commonjs --target es2020 --esModuleInterop --strict \
 *          --outDir .tmp/testbuild tests/period-status.test.ts \
 *        && node .tmp/testbuild/tests/period-status.test.js
 */
import { strict as assert } from 'node:assert';
import { canDeleteEvaluationPeriodStatus } from '../src/lib/period-status';

// 1. Canonical raw DB status: 'closed' is the ONLY status that can be deleted
assert.equal(
  canDeleteEvaluationPeriodStatus('closed'),
  true,
  'Kỳ có trạng thái DB "closed" phải được phép xóa'
);

// 2. Canonical raw DB status: 'active' must NEVER be deletable (Phase 0 Bug 1)
// Expected RED against baseline because baseline allows 'active'
assert.equal(
  canDeleteEvaluationPeriodStatus('active'),
  false,
  'Kỳ có trạng thái DB "active" không được phép xóa (tránh xóa nhầm kỳ đang chấm)'
);

// 3. Legacy/TitleCase status: 'Active' must not be deletable
assert.equal(
  canDeleteEvaluationPeriodStatus('Active'),
  false,
  'Kỳ có trạng thái "Active" không được phép xóa'
);

// 4. Uppercase variations must not be deletable (canonical check must be strict exact lowercase)
assert.equal(
  canDeleteEvaluationPeriodStatus('CLOSED'),
  false,
  'Trạng thái "CLOSED" không đúng chuẩn DB lowercase phải bị từ chối'
);
assert.equal(
  canDeleteEvaluationPeriodStatus('ACTIVE'),
  false,
  'Trạng thái "ACTIVE" không được phép xóa'
);

// 5. Unknown or arbitrary string statuses must not be deletable
assert.equal(canDeleteEvaluationPeriodStatus('draft'), false, 'Status "draft" không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus('archived'), false, 'Status "archived" không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus('pending'), false, 'Status "pending" không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus(''), false, 'Chuỗi rỗng không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus('   '), false, 'Chuỗi khoảng trắng không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus('closed '), false, 'Chuỗi có trailing space không được phép xóa');

// 6. Non-string / null / undefined / primitives / objects
assert.equal(canDeleteEvaluationPeriodStatus(null), false, 'null không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus(undefined), false, 'undefined không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus(0), false, '0 không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus(1), false, '1 không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus(false), false, 'false không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus(true), false, 'true không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus({}), false, 'Object rỗng không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus({ status: 'closed' }), false, 'Object không được phép xóa');
assert.equal(canDeleteEvaluationPeriodStatus([]), false, 'Mảng không được phép xóa');

console.log('period-status tests: ALL PASS');
