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
