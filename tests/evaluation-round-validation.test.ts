/**
 * Behavioral tests for validateEvaluationRoundPayload (Phase 0 Bug 2).
 * Run: npx tsc --module commonjs --target es2020 --esModuleInterop --strict \
 *          --outDir .tmp/testbuild tests/evaluation-round-validation.test.ts \
 *        && node .tmp/testbuild/tests/evaluation-round-validation.test.js
 */
import { strict as assert } from 'node:assert';
import {
  validateEvaluationRoundPayload,
  EVAL_ROUND_LIMITS,
  EvaluationCriterionRule,
  EvaluationRoundPayloadInput,
} from '../src/lib/evaluation-round-validation';

// Mock Criteria Rules for tests
const MOCK_CRITERIA: EvaluationCriterionRule[] = [
  { id: 'crit_quality', allowedPoints: [0, 5, 10, 15, 20] },
  { id: 'crit_speed', allowedPoints: [0, 10, 20] },
  { id: 'crit_teamwork', levels: [{ points: 0 }, { points: 10 }, { points: 25 }] },
];

// --- 1. Valid Draft (incomplete scores allowed) ---
{
  const draftInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10 },
    notes: { crit_quality: 'Tốt' },
    selectedLevelIndexes: { crit_quality: 2 },
    comment: 'Bản nháp ban đầu',
    isSubmit: false,
  };
  const result = validateEvaluationRoundPayload(draftInput, MOCK_CRITERIA);
  assert.equal(result.ok, true, 'Draft hợp lệ với 1 tiêu chí phải thành công');
  if (result.ok) {
    assert.deepEqual(result.data.scores, { crit_quality: 10 });
    assert.deepEqual(result.data.notes, { crit_quality: 'Tốt' });
    assert.deepEqual(result.data.selectedLevelIndexes, { crit_quality: 2 });
    assert.equal(result.data.comment, 'Bản nháp ban đầu');
    assert.equal(result.data.isSubmit, false);
  }
}

// --- 2. Valid Empty Draft ---
{
  const emptyDraft: EvaluationRoundPayloadInput = {
    scores: {},
    notes: {},
    selectedLevelIndexes: {},
    comment: '',
    isSubmit: false,
  };
  const result = validateEvaluationRoundPayload(emptyDraft, MOCK_CRITERIA);
  assert.equal(result.ok, true, 'Draft rỗng phải hợp lệ');
}

// --- 3. Valid Complete Submit ---
{
  const submitInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 20, crit_speed: 10, crit_teamwork: 25 },
    notes: { crit_quality: 'Xuất sắc', crit_speed: '', crit_teamwork: 'Hợp tác tốt' },
    selectedLevelIndexes: { crit_quality: 4, crit_speed: 1, crit_teamwork: 2 },
    comment: 'Hoàn thành đánh giá kỳ.',
    isSubmit: true,
  };
  const result = validateEvaluationRoundPayload(submitInput, MOCK_CRITERIA);
  assert.equal(result.ok, true, 'Nộp hoàn chỉnh đủ tiêu chí phải thành công');
  if (result.ok) {
    assert.equal(result.data.isSubmit, true);
    assert.equal(result.data.scores.crit_quality, 20);
    assert.equal(result.data.scores.crit_speed, 10);
    assert.equal(result.data.scores.crit_teamwork, 25);
  }
}

// --- 4. Reject Unknown Criterion Keys ---
{
  // Unknown key in scores
  const badScoresInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10, crit_unknown_injected: 10 },
    notes: {},
    selectedLevelIndexes: { crit_quality: 2 },
    isSubmit: false,
  };
  const res1 = validateEvaluationRoundPayload(badScoresInput, MOCK_CRITERIA);
  assert.equal(res1.ok, false, 'Phải từ chối key tiêu chí lạ trong scores');

  // Unknown key in notes
  const badNotesInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10 },
    notes: { crit_hacker: 'inject' },
    selectedLevelIndexes: { crit_quality: 2 },
    isSubmit: false,
  };
  const res2 = validateEvaluationRoundPayload(badNotesInput, MOCK_CRITERIA);
  assert.equal(res2.ok, false, 'Phải từ chối key tiêu chí lạ trong notes');

  // Unknown key in selectedLevelIndexes
  const badIndexInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10 },
    notes: {},
    selectedLevelIndexes: { crit_alien: 0 },
    isSubmit: false,
  };
  const res3 = validateEvaluationRoundPayload(badIndexInput, MOCK_CRITERIA);
  assert.equal(res3.ok, false, 'Phải từ chối key tiêu chí lạ trong selectedLevelIndexes');
}

// --- 5. Reject Missing Criteria on Submit ---
{
  const missingSubmitInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10, crit_speed: 10 }, // missing crit_teamwork
    notes: {},
    selectedLevelIndexes: { crit_quality: 2, crit_speed: 1 },
    comment: '',
    isSubmit: true,
  };
  const result = validateEvaluationRoundPayload(missingSubmitInput, MOCK_CRITERIA);
  assert.equal(result.ok, false, 'Khi isSubmit=true phải từ chối nếu thiếu điểm tiêu chí');
}

// --- 6. Reject NaN / Infinity / Non-numeric Scores ---
{
  const nanInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: Number.NaN },
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(nanInput, MOCK_CRITERIA).ok, false, 'Phải từ chối điểm NaN');

  const infInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: Number.POSITIVE_INFINITY },
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(infInput, MOCK_CRITERIA).ok, false, 'Phải từ chối điểm Infinity');

  const negInfInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: Number.NEGATIVE_INFINITY },
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(negInfInput, MOCK_CRITERIA).ok, false, 'Phải từ chối điểm -Infinity');

  const strInput = {
    scores: { crit_quality: '10' },
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(strInput, MOCK_CRITERIA).ok, false, 'Phải từ chối điểm dạng string');
}

// --- 7. Reject Negative and Non-level Point Values ---
{
  const negInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: -5 },
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(negInput, MOCK_CRITERIA).ok, false, 'Phải từ chối điểm âm');

  const nonLevelInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 7 }, // allowed: [0, 5, 10, 15, 20]
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(nonLevelInput, MOCK_CRITERIA).ok, false, 'Phải từ chối điểm không thuộc thang level');

  const arbitraryHighInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 9999 },
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(arbitraryHighInput, MOCK_CRITERIA).ok, false, 'Phải từ chối điểm vượt trần tự chế');
}

// --- 8. Reject Out-of-range / Non-integer Selected Level Index ---
{
  const negIdxInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 0 },
    selectedLevelIndexes: { crit_quality: -1 },
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(negIdxInput, MOCK_CRITERIA).ok, false, 'Phải từ chối index âm');

  const outOfRangeIdxInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 20 },
    selectedLevelIndexes: { crit_quality: 5 }, // length is 5 -> max index is 4
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(outOfRangeIdxInput, MOCK_CRITERIA).ok, false, 'Phải từ chối index vượt số level');

  const floatIdxInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10 },
    selectedLevelIndexes: { crit_quality: 1.5 },
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(floatIdxInput, MOCK_CRITERIA).ok, false, 'Phải từ chối index số thập phân');

  const nanIdxInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10 },
    selectedLevelIndexes: { crit_quality: Number.NaN },
    isSubmit: false,
  };
  assert.equal(validateEvaluationRoundPayload(nanIdxInput, MOCK_CRITERIA).ok, false, 'Phải từ chối index NaN');
}

// --- 9. Reject Index vs Score Mismatch ---
{
  // crit_quality levels are [0, 5, 10, 15, 20]. Index 1 is 5 points, but score is 20
  const mismatchInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 20 },
    selectedLevelIndexes: { crit_quality: 1 }, // index 1 -> 5 points != 20
    isSubmit: false,
  };
  assert.equal(
    validateEvaluationRoundPayload(mismatchInput, MOCK_CRITERIA).ok,
    false,
    'Phải từ chối khi điểm và index level không khớp giá trị'
  );
}

// --- 10. Boundary checks for Note, Comment, and Payload sizes ---
{
  // Max note length boundary
  const exactMaxNote = 'a'.repeat(EVAL_ROUND_LIMITS.MAX_NOTE_LENGTH);
  const oversizedNote = 'a'.repeat(EVAL_ROUND_LIMITS.MAX_NOTE_LENGTH + 1);

  const exactNoteInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10 },
    notes: { crit_quality: exactMaxNote },
    selectedLevelIndexes: { crit_quality: 2 },
    isSubmit: false,
  };
  assert.equal(
    validateEvaluationRoundPayload(exactNoteInput, MOCK_CRITERIA).ok,
    true,
    'Ghi chú đúng giới hạn MAX_NOTE_LENGTH phải hợp lệ'
  );

  const overNoteInput: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10 },
    notes: { crit_quality: oversizedNote },
    selectedLevelIndexes: { crit_quality: 2 },
    isSubmit: false,
  };
  assert.equal(
    validateEvaluationRoundPayload(overNoteInput, MOCK_CRITERIA).ok,
    false,
    'Ghi chú vượt MAX_NOTE_LENGTH phải bị từ chối'
  );

  // Max comment length boundary
  const exactMaxComment = 'c'.repeat(EVAL_ROUND_LIMITS.MAX_COMMENT_LENGTH);
  const oversizedComment = 'c'.repeat(EVAL_ROUND_LIMITS.MAX_COMMENT_LENGTH + 1);

  const exactCommentInput: EvaluationRoundPayloadInput = {
    scores: {},
    comment: exactMaxComment,
    isSubmit: false,
  };
  assert.equal(
    validateEvaluationRoundPayload(exactCommentInput, MOCK_CRITERIA).ok,
    true,
    'Nhận xét chung đúng giới hạn MAX_COMMENT_LENGTH phải hợp lệ'
  );

  const overCommentInput: EvaluationRoundPayloadInput = {
    scores: {},
    comment: oversizedComment,
    isSubmit: false,
  };
  assert.equal(
    validateEvaluationRoundPayload(overCommentInput, MOCK_CRITERIA).ok,
    false,
    'Nhận xét chung vượt MAX_COMMENT_LENGTH phải bị từ chối'
  );
}

// --- 11. Prototype Pollution & Meta Hazards Sanitization / Rejection ---
{
  const pollutedScores: Record<string, unknown> = { crit_quality: 10 };
  Object.defineProperty(pollutedScores, '__proto__', {
    value: { admin: true },
    enumerable: true,
    configurable: true,
    writable: true,
  });

  const pollutedIndexes: Record<string, unknown> = {};
  Object.defineProperty(pollutedIndexes, 'constructor', {
    value: 1,
    enumerable: true,
    configurable: true,
    writable: true,
  });

  const pollutedInput: unknown = {
    scores: pollutedScores,
    notes: { '__meta_selected_level_indexes__': '{"crit_quality":99}' },
    selectedLevelIndexes: pollutedIndexes,
    isSubmit: false,
  };
  const result = validateEvaluationRoundPayload(pollutedInput, MOCK_CRITERIA);
  // Must either reject with ok: false or strip dangerous keys without polluting prototype
  if (result.ok) {
    assert.equal(Object.prototype.hasOwnProperty.call(result.data.scores, '__proto__'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.data.notes, '__meta_selected_level_indexes__'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result.data.selectedLevelIndexes, 'constructor'), false);
  } else {
    assert.equal(result.ok, false, 'Từ chối payload chứa meta key/pollution key độc hại');
  }
}

// --- 12. Input Immutability ---
{
  const originalScores = Object.freeze({ crit_quality: 10 });
  const originalNotes = Object.freeze({ crit_quality: 'Ghi chú gốc' });
  const originalIndexes = Object.freeze({ crit_quality: 2 });
  const immutableInput = Object.freeze({
    scores: originalScores,
    notes: originalNotes,
    selectedLevelIndexes: originalIndexes,
    comment: 'Không bị thay đổi',
    isSubmit: false,
  });

  const result = validateEvaluationRoundPayload(immutableInput, MOCK_CRITERIA);
  assert.equal(result.ok, true, 'Validation không được làm lỗi hoặc mutate object bị freeze');
  assert.equal(originalScores.crit_quality, 10, 'Object input không bị sửa đổi');
}

// --- 13. Malformed Root Payloads ---
{
  assert.equal(validateEvaluationRoundPayload(null, MOCK_CRITERIA).ok, false, 'null payload phải bị từ chối');
  assert.equal(validateEvaluationRoundPayload(undefined, MOCK_CRITERIA).ok, false, 'undefined payload phải bị từ chối');
  assert.equal(validateEvaluationRoundPayload(123, MOCK_CRITERIA).ok, false, 'number payload phải bị từ chối');
  assert.equal(validateEvaluationRoundPayload('invalid', MOCK_CRITERIA).ok, false, 'string payload phải bị từ chối');
  assert.equal(validateEvaluationRoundPayload([], MOCK_CRITERIA).ok, false, 'array payload phải bị từ chối');
}

// --- 14. Payload Size Limit (> 64KB) ---
{
  const hugeComment = 'x'.repeat(EVAL_ROUND_LIMITS.MAX_PAYLOAD_BYTES + 100);
  const oversizedPayload = {
    scores: {},
    comment: hugeComment,
    isSubmit: false,
  };
  assert.equal(
    validateEvaluationRoundPayload(oversizedPayload, MOCK_CRITERIA).ok,
    false,
    'Payload vượt quá MAX_PAYLOAD_BYTES phải bị từ chối'
  );
}

// --- 15. Reject Score Without Index & Index Without Score ---
{
  // Score without index
  const scoreNoIndex: EvaluationRoundPayloadInput = {
    scores: { crit_quality: 10 },
    selectedLevelIndexes: {},
    isSubmit: false,
  };
  assert.equal(
    validateEvaluationRoundPayload(scoreNoIndex, MOCK_CRITERIA).ok,
    false,
    'Có điểm nhưng thiếu index tương ứng phải bị từ chối'
  );

  // Index without score
  const indexNoScore: EvaluationRoundPayloadInput = {
    scores: {},
    selectedLevelIndexes: { crit_quality: 2 },
    isSubmit: false,
  };
  assert.equal(
    validateEvaluationRoundPayload(indexNoScore, MOCK_CRITERIA).ok,
    false,
    'Có index nhưng thiếu điểm tương ứng phải bị từ chối'
  );
}

// --- 16. Criteria Rules Fail-Closed (Duplicate / Empty / Invalid rules) ---
{
  // Empty criteria array
  assert.equal(
    validateEvaluationRoundPayload({ scores: {}, isSubmit: false }, []).ok,
    false,
    'Danh sách criteria rỗng phải fail closed'
  );

  // Duplicate criteria id
  const dupCriteria: EvaluationCriterionRule[] = [
    { id: 'crit_quality', allowedPoints: [0, 10] },
    { id: 'crit_quality', allowedPoints: [0, 10] },
  ];
  assert.equal(
    validateEvaluationRoundPayload({ scores: {}, isSubmit: false }, dupCriteria).ok,
    false,
    'Criteria bị trùng lặp ID phải fail closed'
  );

  // Criterion with empty allowed points / levels
  const emptyPointsCriteria: EvaluationCriterionRule[] = [
    { id: 'crit_empty', allowedPoints: [] },
  ];
  assert.equal(
    validateEvaluationRoundPayload({ scores: {}, isSubmit: false }, emptyPointsCriteria).ok,
    false,
    'Criterion không có điểm level phải fail closed'
  );
}

console.log('evaluation-round-validation tests: ALL PASS');
