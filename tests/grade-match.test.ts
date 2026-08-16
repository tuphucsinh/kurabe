import { strict as assert } from 'node:assert';
import { matchGradeBand } from '../src/lib/grade-match';

/**
 * Boundary test cho matchGradeBand (A2).
 * Chạy: npx tsc --module commonjs --target es2020 --esModuleInterop --strict \
 *          --outDir .tmp/testbuild tests/grade-match.test.ts \
 *        && node .tmp/testbuild/tests/grade-match.test.js
 */

// Thang thật của app (leader): D là band minScore null (catch-all thấp nhất)
const LEADER_BANDS = [
  { grade: 'S', minScore: 170 },
  { grade: 'A', minScore: 160 },
  { grade: 'AB', minScore: 130 },
  { grade: 'B', minScore: 100 },
  { grade: 'C', minScore: 70 },
  { grade: 'D', minScore: null },
];

// Band null-min đứng đầu mảng (data bẩn/thứ tự khác) — ngữ nghĩa không đổi
const REVERSED_BANDS = [...LEADER_BANDS].reverse();

// Case bug cũ: band null-min nhưng các band khác không phủ điểm thấp
const NULL_AT_TOP = [
  { grade: 'S', minScore: null },   // dữ liệu sai cấu hình — match vẫn theo quy ước null=catch-all
  { grade: 'A', minScore: 160 },
  { grade: 'D', minScore: 70 },
];

// 1. Boundary đúng tại cận dưới mỗi band
assert.equal(matchGradeBand(LEADER_BANDS, 170), 'S', '170 = đúng cận S');
assert.equal(matchGradeBand(LEADER_BANDS, 169), 'A', '169 = cận trên A');
assert.equal(matchGradeBand(LEADER_BANDS, 160), 'A', '160 = đúng cận A');
assert.equal(matchGradeBand(LEADER_BANDS, 159), 'AB', '159 = cận trên AB');
assert.equal(matchGradeBand(LEADER_BANDS, 130), 'AB', '130 = đúng cận AB');
assert.equal(matchGradeBand(LEADER_BANDS, 100), 'B', '100 = đúng cận B');
assert.equal(matchGradeBand(LEADER_BANDS, 70), 'C', '70 = đúng cận C');
assert.equal(matchGradeBand(LEADER_BANDS, 69), 'D', '69 = catch-all D (min null)');

// 2. Điểm 0 / cực thấp → band catch-all (bug cũ: sort 0 vs match -Infinity cho ra S)
assert.equal(matchGradeBand(LEADER_BANDS, 0), 'D', '0 điểm phải là D, không phải S');
assert.equal(matchGradeBand(LEADER_BANDS, 10), 'D', '10 điểm phải là D');
assert.equal(matchGradeBand(LEADER_BANDS, -5), 'D', 'điểm âm → catch-all D');

// 3. Điểm cao vượt trần → band cao nhất có cận
assert.equal(matchGradeBand(LEADER_BANDS, 999), 'S', 'điểm rất cao → S');

// 4. Thứ tự band không ảnh hưởng kết quả
for (const score of [0, 10, 69, 70, 99, 100, 129, 130, 159, 160, 169, 170, 200]) {
  const expected = matchGradeBand(LEADER_BANDS, score);
  const actual = matchGradeBand(REVERSED_BANDS, score);
  assert.equal(actual, expected, `thứ tự band đảo không đổi kết quả ở ${score} điểm`);
}

// 5. Band null-min đứng sai vị trí (đầu mảng) vẫn là catch-all theo quy ước —
//    dữ liệu sai kiểu này bị chặn ở validate (chỉ band thấp nhất được null min)
assert.equal(matchGradeBand(NULL_AT_TOP, 10), 'S', 'mismatch hoàn toàn → nhãn của band null-min (data sai cấu hình)');
assert.equal(matchGradeBand(NULL_AT_TOP, 75), 'D', '75 ≥ 70 → D');
assert.equal(matchGradeBand(NULL_AT_TOP, 160), 'A', '160 → A (null-min không cản band có cận)');

// 6. Không có band nào match và không có catch-all → undefined (caller fallback 'D')
assert.equal(matchGradeBand([{ grade: 'A', minScore: 100 }], 10), undefined, 'không match → undefined');

// 7. Mảng rỗng → undefined
assert.equal(matchGradeBand([], 100), undefined, 'bands rỗng → undefined');

console.log('grade-match boundary tests: ALL PASS (29 assertions)');
