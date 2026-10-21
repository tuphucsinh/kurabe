import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// 1. G1 explicit scoring hook contracts & behavioral regressions
const hookSource = fs.readFileSync('src/hooks/use-evaluation-page-state.ts', 'utf8');

// 1.1 Static guards: hook must NOT prefill defaults or carry forward previous round scores
assert.doesNotMatch(
  hookSource,
  /currentScores\[criterion\.id!\]\s*=\s*criterion\.levels\[criterion\.defaultLevelIndex\]\.points/,
  'hook must NOT pre-fill default level scores'
);
assert.doesNotMatch(
  hookSource,
  /currentSelectedLevelIndexes\[criterion\.id!\]\s*=\s*criterion\.defaultLevelIndex/,
  'hook must NOT pre-fill default level indexes'
);
assert.doesNotMatch(
  hookSource,
  /initialScores\s*=\s*\{\s*\.\.\.lastRound\.scores\s*\}/,
  'hook must NOT copy scores from lastRound/prevRounds'
);
assert.match(
  hookSource,
  /initialScores\s*=\s*\{\s*\.\.\.\(targetRound\.scores\s*\|\|\s*\{\}\)\s*\}/,
  'layer 1 must restore scores directly from targetRound'
);
assert.match(
  hookSource,
  /initialNotes\s*=\s*\{\s*\.\.\.\(targetRound\.notes\s*\|\|\s*\{\}\)\s*\}/,
  'layer 1 must restore notes directly from targetRound'
);

// 1.2 Behavioral regressions driven from actual evaluationReducer
const hookTranspiled = ts.transpileModule(hookSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const hookModule = { exports: {} };
new Function('exports', 'require', 'module', hookTranspiled)(
  hookModule.exports,
  () => ({}),
  hookModule
);
const { evaluationReducer } = hookModule.exports;
assert.equal(typeof evaluationReducer, 'function', 'evaluationReducer must be exported function');

// Test A: Initial unstarted round starts with empty scores, indexes, notes, comment
const initialState = {
  employee: null,
  evaluation: null,
  currentRoundData: null,
  allPreviousRounds: [],
  scores: {},
  selectedLevelIndexes: {},
  notes: {},
  comment: '',
};

const emptyInitState = evaluationReducer(initialState, {
  type: 'SET_INITIAL_DATA',
  payload: {
    scores: {},
    selectedLevelIndexes: {},
    notes: {},
    comment: '',
  },
});
assert.deepEqual(emptyInitState.scores, {}, 'Initial round scores must be empty {}');
assert.deepEqual(emptyInitState.selectedLevelIndexes, {}, 'Initial round selectedLevelIndexes must be empty {}');

// Test B: Note/comment-only saved Draft restores preserved notes and comment with empty scores
const noteCommentDraftState = evaluationReducer(initialState, {
  type: 'SET_INITIAL_DATA',
  payload: {
    scores: {},
    selectedLevelIndexes: {},
    notes: { 'crit-note-1': 'Ghi chú tự lưu nháp' },
    comment: 'Nhận xét bản nháp chưa chấm điểm',
  },
});
assert.deepEqual(noteCommentDraftState.scores, {}, 'Note/comment-only draft must retain empty scores');
assert.equal(noteCommentDraftState.notes['crit-note-1'], 'Ghi chú tự lưu nháp');
assert.equal(noteCommentDraftState.comment, 'Nhận xét bản nháp chưa chấm điểm');

// Test C: Explicit zero scoring creates genuine score 0 and levelIndex
const zeroScoreState = evaluationReducer(emptyInitState, {
  type: 'SET_SCORE',
  criterionId: 'crit-zero',
  points: 0,
  levelIndex: 1,
});
assert.equal(zeroScoreState.scores['crit-zero'], 0, 'Explicit zero score must be stored as number 0');
assert.equal(zeroScoreState.selectedLevelIndexes['crit-zero'], 1, 'Matching selected level index must be stored');

// Test D: Reopening saved round with zero score restores exact 0 score and index
const reopenedZeroState = evaluationReducer(initialState, {
  type: 'SET_INITIAL_DATA',
  payload: {
    scores: { 'crit-zero': 0 },
    selectedLevelIndexes: { 'crit-zero': 1 },
    notes: {},
    comment: '',
  },
});
assert.equal(reopenedZeroState.scores['crit-zero'], 0, 'Reopening zero score round must preserve score 0');
assert.equal(reopenedZeroState.selectedLevelIndexes['crit-zero'], 1, 'Reopening zero score round must preserve level index');

// Test E: Single selection (1/33) partial draft preserved across background refetch
const singleScoredState = evaluationReducer(emptyInitState, {
  type: 'SET_SCORE',
  criterionId: 'crit-leader-1',
  points: 10,
  levelIndex: 0,
});
assert.equal(singleScoredState.scores['crit-leader-1'], 10, 'Single scored criterion must be 10');
assert.equal(singleScoredState.selectedLevelIndexes['crit-leader-1'], 0, 'Single scored level index must be 0');

// Same-round refetch carrying round context preserves active edits only when the hook marks them dirty.
const singleScoredStateWithContext = {
  ...singleScoredState,
  evaluation: { id: 'eval-1' },
  currentRoundData: { round: 1 },
};

const guardedRefetchState = evaluationReducer(singleScoredStateWithContext, {
  type: 'SET_INITIAL_DATA',
  preserveUserEdits: true,
  payload: {
    employee: { id: 'emp-1' },
    evaluation: { id: 'eval-1' },
    currentRoundData: { round: 1 },
    allPreviousRounds: [],
    scores: {},
    selectedLevelIndexes: {},
  },
});
assert.equal(guardedRefetchState.scores['crit-leader-1'], 10, 'Guarded refetch must preserve user score');
assert.equal(guardedRefetchState.selectedLevelIndexes['crit-leader-1'], 0, 'Guarded refetch must preserve user level index');

const refreshedSavedState = evaluationReducer(singleScoredStateWithContext, {
  type: 'SET_INITIAL_DATA',
  payload: {
    evaluation: { id: 'eval-1' },
    currentRoundData: { round: 1 },
    scores: { 'crit-leader-1': 5 },
    selectedLevelIndexes: { 'crit-leader-1': 1 },
  },
});
assert.equal(refreshedSavedState.scores['crit-leader-1'], 5, 'Unmarked same-round hydration must accept refreshed persisted scores');
assert.equal(refreshedSavedState.selectedLevelIndexes['crit-leader-1'], 1, 'Unmarked same-round hydration must accept refreshed persisted level index');

// 3. Genuine round switch (Round 1 -> Round 2) hydrates Round 2 data cleanly without leaking Round 1 edits
const roundSwitchState = evaluationReducer(singleScoredStateWithContext, {
  type: 'SET_INITIAL_DATA',
  payload: {
    employee: { id: 'emp-1' },
    evaluation: { id: 'eval-1' },
    currentRoundData: { round: 2 },
    allPreviousRounds: [],
    scores: {},
    selectedLevelIndexes: {},
    notes: {},
    comment: '',
  },
});
assert.deepEqual(roundSwitchState.scores, {}, 'Genuine round switch must hydrate round 2 saved data (empty scores)');
assert.deepEqual(roundSwitchState.selectedLevelIndexes, {}, 'Genuine round switch must hydrate round 2 saved level indexes');
assert.equal(roundSwitchState.currentRoundData.round, 2, 'Current round must advance to round 2');

// 4. Genuine evaluation switch (eval-1 -> eval-2) hydrates eval-2 data cleanly
const evalSwitchState = evaluationReducer(singleScoredStateWithContext, {
  type: 'SET_INITIAL_DATA',
  payload: {
    employee: { id: 'emp-2' },
    evaluation: { id: 'eval-2' },
    currentRoundData: { round: 1 },
    allPreviousRounds: [],
    scores: {},
    selectedLevelIndexes: {},
    notes: {},
    comment: '',
  },
});
assert.deepEqual(evalSwitchState.scores, {}, 'Genuine evaluation switch must hydrate new evaluation saved data');
assert.equal(evalSwitchState.evaluation.id, 'eval-2', 'Evaluation must switch to eval-2');

// Test F: Multi-criterion partial draft (explicit zero, positive, negative points) preserved across refetch
let multiScoredState = evaluationReducer(emptyInitState, {
  type: 'SET_SCORE',
  criterionId: 'crit-pos',
  points: 10,
  levelIndex: 0,
});
multiScoredState = evaluationReducer(multiScoredState, {
  type: 'SET_SCORE',
  criterionId: 'crit-zero',
  points: 0,
  levelIndex: 1,
});
multiScoredState = evaluationReducer(multiScoredState, {
  type: 'SET_SCORE',
  criterionId: 'crit-neg',
  points: -2,
  levelIndex: 2,
});
multiScoredState = evaluationReducer(multiScoredState, {
  type: 'SET_NOTE',
  criterionId: 'crit-pos',
  note: 'Ghi chú tiêu chí dương',
});
multiScoredState = evaluationReducer(multiScoredState, {
  type: 'SET_COMMENT',
  comment: 'Nhận xét nháp đa tiêu chí',
});

// Multi-criterion draft: the hook-marked stale payload must NOT wipe edits
const multiRefetchState = evaluationReducer(
  {
    ...multiScoredState,
    evaluation: { id: 'eval-1' },
    currentRoundData: { round: 1 },
  },
  {
    type: 'SET_INITIAL_DATA',
    preserveUserEdits: true,
    payload: {
      employee: { id: 'emp-1' },
      evaluation: { id: 'eval-1' },
      currentRoundData: { round: 1 },
      allPreviousRounds: [],
      scores: {},
      selectedLevelIndexes: {},
      notes: {},
      comment: '',
    },
  }
);
assert.equal(multiRefetchState.scores['crit-pos'], 10, 'Positive score preserved across refetch');
assert.equal(multiRefetchState.scores['crit-zero'], 0, 'Zero score preserved across refetch');
assert.equal(multiRefetchState.scores['crit-neg'], -2, 'Negative score preserved across refetch');
assert.equal(multiRefetchState.selectedLevelIndexes['crit-pos'], 0, 'Positive level index preserved across refetch');
assert.equal(multiRefetchState.selectedLevelIndexes['crit-zero'], 1, 'Zero level index preserved across refetch');
assert.equal(multiRefetchState.selectedLevelIndexes['crit-neg'], 2, 'Negative level index preserved across refetch');
assert.equal(multiRefetchState.notes['crit-pos'], 'Ghi chú tiêu chí dương', 'User note preserved across refetch');
assert.equal(multiRefetchState.comment, 'Nhận xét nháp đa tiêu chí', 'User comment preserved across refetch');

// Test seam limitation note:
// This regression directly exercises the production reducer seam: same-round preservation, explicit 0, negative points,
// index 0 semantics, and genuine round/evaluation switches.
// Honest limitation: This focused unit seam does not include an interactive browser runtime
// or live network interceptor, and therefore proves the reducer loss/preservation mechanism
// rather than proving the exact asynchronous trigger sequence in the production UI.
assert.match(
  hookSource,
  /if\s*\(isSameRound\s*&&\s*userEditedRef\.current\)\s*\{[\s\S]*?preserveUserEdits:\s*true/,
  'same-round edited hook branch must mark its hydration action to preserve user edits'
);
assert.match(
  hookSource,
  /userEditedRef\.current\s*=\s*true/,
  'score/note/comment dispatch must mark the active round as edited'
);

// Test G: Evaluation payload validation for partial draft vs incomplete submit
const valSource = fs.readFileSync('src/lib/evaluation-round-validation.ts', 'utf8');
const valTranspiled = ts.transpileModule(valSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const valModule = { exports: {} };
new Function('exports', 'require', 'module', valTranspiled)(valModule.exports, () => ({}), valModule);
const { validateEvaluationRoundPayload } = valModule.exports;
assert.equal(typeof validateEvaluationRoundPayload, 'function');

const sampleRules = [
  { id: 'crit-1', allowedPoints: [10, 5, 0] },
  { id: 'crit-2', allowedPoints: [10, 5, 0] },
  { id: 'crit-3', allowedPoints: [10, 0, -2] },
];

// G.1: Partial draft save (isSubmit: false) is valid with 1/3 score
const partialDraftRes = validateEvaluationRoundPayload(
  {
    scores: { 'crit-1': 10 },
    selectedLevelIndexes: { 'crit-1': 0 },
    notes: {},
    comment: '',
    isSubmit: false,
  },
  sampleRules,
  { isSubmitOverride: false }
);
assert.equal(partialDraftRes.ok, true, 'Partial draft save (1/3 scored) must be valid');
assert.deepEqual(partialDraftRes.data.scores, { 'crit-1': 10 }, 'Canonical partial scores must retain the 1 scored criterion');

// G.2: Partial draft save with multi-criteria (explicit zero & negative) is valid
const multiPartialDraftRes = validateEvaluationRoundPayload(
  {
    scores: { 'crit-1': 10, 'crit-3': -2 },
    selectedLevelIndexes: { 'crit-1': 0, 'crit-3': 2 },
    notes: { 'crit-1': 'Note' },
    comment: 'Draft comment',
    isSubmit: false,
  },
  sampleRules,
  { isSubmitOverride: false }
);
assert.equal(multiPartialDraftRes.ok, true, 'Multi-criteria partial draft save must be valid');
assert.equal(multiPartialDraftRes.data.scores['crit-3'], -2, 'Negative score allowed in partial draft');

// G.3: Incomplete submit (isSubmit: true) must fail closed with exact completeness error
const incompleteSubmitRes = validateEvaluationRoundPayload(
  {
    scores: { 'crit-1': 10 },
    selectedLevelIndexes: { 'crit-1': 0 },
    notes: {},
    comment: '',
    isSubmit: true,
  },
  sampleRules,
  { isSubmitOverride: true }
);
assert.equal(incompleteSubmitRes.ok, false, 'Incomplete submit must be rejected');
assert.equal(
  incompleteSubmitRes.error,
  'Vui lòng hoàn thành đánh giá cho tất cả các tiêu chí trước khi gửi.',
  'Incomplete submit must return exact completeness error'
);


// 2. Shared pure static frame contracts
const staticFrameSource = fs.readFileSync('src/components/evaluation/EvaluationStaticFrame.tsx', 'utf8');

// 2.1 Must render stable structural labels
assert.ok(staticFrameSource.includes('Đánh giá'), 'static frame must render breadcrumb label "Đánh giá"');
assert.ok(staticFrameSource.includes('Mã NV:'), 'static frame must render "Mã NV:" label');
assert.ok(staticFrameSource.includes('Bộ phận:'), 'static frame must render "Bộ phận:" label');
assert.ok(staticFrameSource.includes('Ngày vào làm:'), 'static frame must render "Ngày vào làm:" label');
assert.ok(staticFrameSource.includes('Xếp loại'), 'static frame must render table heading "Xếp loại"');
assert.ok(staticFrameSource.includes('Tổng điểm'), 'static frame must render table heading "Tổng điểm"');
assert.ok(staticFrameSource.includes('Tiêu chí'), 'static frame must render table heading "Tiêu chí"');
assert.ok(staticFrameSource.includes('Nhận xét'), 'static frame must render section heading "Nhận xét"');

// 2.2 Must have data-load-state="static" on shell
assert.ok(
  staticFrameSource.includes('data-load-state="static"'),
  'static frame must declare data-load-state="static"'
);
assert.ok(
  staticFrameSource.includes('data-load-layer="shell"'),
  'static frame must declare data-load-layer="shell"'
);

// 2.3 Must NOT contain interactive form elements, handlers, or state hooks
assert.ok(!staticFrameSource.includes('<button'), 'static frame must not render interactive <button>');
assert.ok(!staticFrameSource.includes('<textarea'), 'static frame must not render interactive <textarea>');
assert.ok(!staticFrameSource.includes('<form'), 'static frame must not render <form>');
assert.ok(!staticFrameSource.includes('onClick'), 'static frame must not contain onClick handlers');
assert.ok(!staticFrameSource.includes('onChange'), 'static frame must not contain onChange handlers');
assert.ok(!staticFrameSource.includes('onSubmit'), 'static frame must not contain onSubmit handlers');
assert.ok(!staticFrameSource.includes('useState('), 'static frame must be stateless (no useState)');
assert.ok(!staticFrameSource.includes('useEffect('), 'static frame must be stateless (no useEffect)');

// 3. Route loading fallback (loading.tsx)
const loadingSource = fs.readFileSync('src/app/evaluations/[id]/loading.tsx', 'utf8');
assert.ok(
  loadingSource.includes('EvaluationStaticFrame') || loadingSource.includes('EvaluationPageSkeleton'),
  'loading.tsx must render static frame fallback'
);

// 4. Evaluation page initial loading & transient activeRoundData vs invalid round contract
const pageSource = fs.readFileSync('src/app/evaluations/[id]/EvaluationPageClient.tsx', 'utf8');

// 4.1 Initial loading gate renders static frame before pageData
const initialGateMatch = pageSource.match(
  /if\s*\(\s*!isMounted\s*\|\|\s*isLoadingUser\s*\|\|\s*isLoadingEval\s*\|\|\s*!pageData\s*\)\s*\{([\s\S]*?)\}/
);
assert.ok(initialGateMatch, 'initial loading gate branch must exist');
assert.match(
  initialGateMatch[1],
  /<(?:EvaluationStaticFrame|EvaluationPageSkeleton)\s*\/>/,
  'initial loading gate must render EvaluationStaticFrame'
);
assert.ok(
  !initialGateMatch[1].includes('AccessDenied'),
  'initial loading gate must never render AccessDenied prematurely'
);

// 4.2 Transient branch: activeRound && activeRoundExists && !activeRoundData must render static frame, NOT AccessDenied
const transientMatch = pageSource.match(
  /if\s*\(\s*activeRound\s*&&\s*activeRoundExists\s*&&\s*!activeRoundData\s*\)\s*\{([\s\S]*?)\}/
);
assert.ok(transientMatch, 'transient activeRoundData branch must exist');
assert.match(
  transientMatch[1],
  /<(?:EvaluationStaticFrame|EvaluationPageSkeleton)\s*\/>/,
  'transient branch must render EvaluationStaticFrame or EvaluationPageSkeleton'
);
assert.ok(
  !transientMatch[1].includes('AccessDenied'),
  'transient branch must never render AccessDenied'
);

// 4.3 Real invalid/missing round branch: !activeRound || !activeRoundExists must render AccessDenied
const invalidRoundMatch = pageSource.match(
  /if\s*\(\s*!activeRound\s*\|\|\s*!activeRoundExists[\s\S]*?\)\s*\{([\s\S]*?)\}/
);
assert.ok(invalidRoundMatch, 'invalid/missing round branch must exist');
assert.match(
  invalidRoundMatch[1],
  /<AccessDenied[\s\S]*?title="Không thể tải vòng đánh giá"/,
  'invalid/missing round branch must render AccessDenied'
);

// 4.4 Fail-closed auth guards intact
assert.ok(pageSource.includes('if (!employee)'), 'page must fail-closed if employee is missing');
assert.ok(pageSource.includes('if (!evaluation)'), 'page must fail-closed if evaluation is missing');
assert.ok(pageSource.includes('if (!accessState)'), 'page must fail-closed if accessState is missing');
assert.ok(pageSource.includes("if (accessState.mode === 'blocked')"), 'page must block blocked accessState mode');

// 4.5 DOM milestone markers in rendered JSX
assert.ok(
  pageSource.includes('data-load-state="light"'),
  'page must mark data-load-state="light" on light section'
);
assert.ok(
  pageSource.includes("criteriaStatus === 'loaded' ? 'criteria' : undefined"),
  'page must mark data-load-state="criteria" when criteria is loaded'
);

console.log('Evaluation default selection and static-first frame regression tests: ALL PASS');
