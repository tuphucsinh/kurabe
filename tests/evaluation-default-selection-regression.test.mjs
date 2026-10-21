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

// 1.3 Edit revision, Save snapshot guard & Refetch sequence regressions
const {
  canAcknowledgeSave,
  applySaveAcknowledgement,
  resolveHydrationDecision,
  createRefetchSequencer,
} = hookModule.exports;

assert.equal(typeof canAcknowledgeSave, 'function', 'canAcknowledgeSave helper must be exported');
assert.equal(typeof applySaveAcknowledgement, 'function', 'applySaveAcknowledgement helper must be exported');
assert.equal(typeof resolveHydrationDecision, 'function', 'resolveHydrationDecision helper must be exported');
assert.equal(typeof createRefetchSequencer, 'function', 'createRefetchSequencer helper must be exported');

// (i) dirty local edits survive an old same-round refetch
let localDraftState = evaluationReducer(initialState, {
  type: 'SET_SCORE',
  criterionId: 'crit-task-1',
  points: 8,
  levelIndex: 1,
});
localDraftState = evaluationReducer(localDraftState, {
  type: 'SET_NOTE',
  criterionId: 'crit-task-1',
  note: 'Draft note in progress',
});
localDraftState = evaluationReducer(localDraftState, {
  type: 'SET_COMMENT',
  comment: 'Draft round comment',
});

const hydrationCtx1 = {
  roundKey: 'eval-101:1',
  lastInitializedKey: 'eval-101:1',
  isDirty: true,
  incomingUpdatedAt: '2026-10-21T01:00:00Z',
  lastHydratedUpdatedAt: '2026-10-21T01:00:00Z',
};
const decision1 = resolveHydrationDecision(hydrationCtx1);
assert.equal(decision1.shouldHydrate, true, '(i) decision must allow hydration with preservation');
assert.equal(decision1.preserveUserEdits, true, '(i) decision must preserve user edits');

const hydratedPreservedState = evaluationReducer(localDraftState, {
  type: 'SET_INITIAL_DATA',
  preserveUserEdits: decision1.preserveUserEdits,
  payload: {
    scores: { 'crit-task-1': 2 },
    selectedLevelIndexes: { 'crit-task-1': 0 },
    notes: { 'crit-task-1': 'Old server note' },
    comment: 'Old server comment',
  },
});
assert.equal(hydratedPreservedState.scores['crit-task-1'], 8, '(i) local score must survive old same-round refetch');
assert.equal(hydratedPreservedState.selectedLevelIndexes['crit-task-1'], 1, '(i) local level index must survive old same-round refetch');
assert.equal(hydratedPreservedState.notes['crit-task-1'], 'Draft note in progress', '(i) local note must survive old same-round refetch');
assert.equal(hydratedPreservedState.comment, 'Draft round comment', '(i) local comment must survive old same-round refetch');

// (ii) successful Save with unchanged evaluation/round/edit revision permits the subsequent latest server payload to hydrate
const activeContext2 = {
  evaluationId: 'eval-101',
  round: 1,
  contextGeneration: 0,
  editRevision: 3,
  isDirty: true,
};
const saveSnapshot2 = {
  evaluationId: 'eval-101',
  round: 1,
  contextGeneration: 0,
  editRevision: 3,
};
const ackResult2 = applySaveAcknowledgement(activeContext2, saveSnapshot2, true);
assert.equal(ackResult2.acknowledged, true, '(ii) Save acknowledgement must succeed when context matches');
assert.equal(ackResult2.isDirty, false, '(ii) Dirty state must be cleared after successful save acknowledgement');

const hydrationCtx2 = {
  roundKey: 'eval-101:1',
  lastInitializedKey: 'eval-101:1',
  isDirty: ackResult2.isDirty,
  incomingUpdatedAt: '2026-10-21T02:00:00Z',
  lastHydratedUpdatedAt: '2026-10-21T01:00:00Z',
};
const decision2 = resolveHydrationDecision(hydrationCtx2);
assert.equal(decision2.shouldHydrate, true, '(ii) Must hydrate latest server payload');
assert.equal(decision2.preserveUserEdits, false, '(ii) Must NOT preserve old edits after successful save acknowledged');

const hydratedSavedState = evaluationReducer(localDraftState, {
  type: 'SET_INITIAL_DATA',
  preserveUserEdits: decision2.preserveUserEdits,
  payload: {
    scores: { 'crit-task-1': 10, 'crit-task-2': 5 },
    selectedLevelIndexes: { 'crit-task-1': 2, 'crit-task-2': 0 },
    notes: { 'crit-task-1': 'Persisted note from server' },
    comment: 'Persisted comment from server',
  },
});
assert.equal(hydratedSavedState.scores['crit-task-1'], 10, '(ii) Must hydrate new score 10');
assert.equal(hydratedSavedState.scores['crit-task-2'], 5, '(ii) Must hydrate additional saved score');
assert.equal(hydratedSavedState.notes['crit-task-1'], 'Persisted note from server', '(ii) Must hydrate persisted note');
assert.equal(hydratedSavedState.comment, 'Persisted comment from server', '(ii) Must hydrate persisted comment');

// (iii) edit during pending Save keeps dirty state and preserves the newer local value
const pendingSaveSnapshot = {
  evaluationId: 'eval-101',
  round: 1,
  contextGeneration: 0,
  editRevision: 3,
};
const stateDuringPendingSave = evaluationReducer(localDraftState, {
  type: 'SET_SCORE',
  criterionId: 'crit-task-1',
  points: 15,
  levelIndex: 3,
});
const contextAfterNewerEdit = {
  evaluationId: 'eval-101',
  round: 1,
  contextGeneration: 0,
  editRevision: 4,
  isDirty: true,
};
const ackResult3 = applySaveAcknowledgement(contextAfterNewerEdit, pendingSaveSnapshot, true);
assert.equal(ackResult3.acknowledged, false, '(iii) Save acknowledgement must be rejected when revision bumped');
assert.equal(ackResult3.isDirty, true, '(iii) Dirty state must remain true');

const hydrationCtx3 = {
  roundKey: 'eval-101:1',
  lastInitializedKey: 'eval-101:1',
  isDirty: ackResult3.isDirty,
  incomingUpdatedAt: '2026-10-21T02:00:00Z',
  lastHydratedUpdatedAt: '2026-10-21T01:00:00Z',
};
const decision3 = resolveHydrationDecision(hydrationCtx3);
assert.equal(decision3.preserveUserEdits, true, '(iii) Must preserve newer local edits');

const stateAfterStaleHydration = evaluationReducer(stateDuringPendingSave, {
  type: 'SET_INITIAL_DATA',
  preserveUserEdits: decision3.preserveUserEdits,
  payload: {
    scores: { 'crit-task-1': 10 },
    selectedLevelIndexes: { 'crit-task-1': 2 },
  },
});
assert.equal(stateAfterStaleHydration.scores['crit-task-1'], 15, '(iii) Newer local value 15 must be preserved');
assert.equal(stateAfterStaleHydration.selectedLevelIndexes['crit-task-1'], 3, '(iii) Newer level index 3 must be preserved');

// (iv) failed Save does not clear unsaved data
const failedSaveSnapshot = {
  evaluationId: 'eval-101',
  round: 1,
  contextGeneration: 0,
  editRevision: 4,
};
const contextForFailedSave = {
  evaluationId: 'eval-101',
  round: 1,
  contextGeneration: 0,
  editRevision: 4,
  isDirty: true,
};
const ackResult4 = applySaveAcknowledgement(contextForFailedSave, failedSaveSnapshot, false);
assert.equal(ackResult4.acknowledged, false, '(iv) Acknowledgment must fail when save failed');
assert.equal(ackResult4.isDirty, true, '(iv) Dirty state must remain true on save failure');

const decision4 = resolveHydrationDecision({
  roundKey: 'eval-101:1',
  lastInitializedKey: 'eval-101:1',
  isDirty: ackResult4.isDirty,
});
assert.equal(decision4.preserveUserEdits, true, '(iv) Failed save must keep unsaved edits preserved');

// (v) changed evaluation/round cannot acknowledge an old Save
const oldRoundSnapshot = {
  evaluationId: 'eval-101',
  round: 1,
  contextGeneration: 0,
  editRevision: 2,
};
const contextAfterRoundSwitch = {
  evaluationId: 'eval-101',
  round: 2,
  contextGeneration: 1,
  editRevision: 0,
  isDirty: true,
};
const ackResultRoundSwitch = applySaveAcknowledgement(contextAfterRoundSwitch, oldRoundSnapshot, true);
assert.equal(ackResultRoundSwitch.acknowledged, false, '(v) Cannot acknowledge save when round changed');
assert.equal(ackResultRoundSwitch.isDirty, true, '(v) Dirty state of new round must not be cleared by old round save');

const contextAfterEvalSwitch = {
  evaluationId: 'eval-999',
  round: 1,
  contextGeneration: 1,
  editRevision: 0,
  isDirty: true,
};
const ackResultEvalSwitch = applySaveAcknowledgement(contextAfterEvalSwitch, oldRoundSnapshot, true);
assert.equal(ackResultEvalSwitch.acknowledged, false, '(v) Cannot acknowledge save when evaluationId changed');

// (vi) an older in-flight refetch cannot overwrite a newer response
const sequencer = createRefetchSequencer();
const reqSeq1 = sequencer.nextSequence();
const reqSeq2 = sequencer.nextSequence();
assert.equal(reqSeq1, 1);
assert.equal(reqSeq2, 2);

const canApply2 = sequencer.canApplyResponse(reqSeq2);
assert.equal(canApply2, true, '(vi) Newer response 2 must be applied');
assert.equal(sequencer.getLatestAppliedSeq(), 2);

const canApply1 = sequencer.canApplyResponse(reqSeq1);
assert.equal(canApply1, false, '(vi) Older in-flight response 1 must NOT be applied over newer response 2');

const staleSeqDecision = resolveHydrationDecision({
  roundKey: 'eval-101:1',
  lastInitializedKey: 'eval-101:1',
  isDirty: false,
  incomingSeq: 1,
  lastHydratedSeq: 2,
});
assert.equal(staleSeqDecision.shouldHydrate, false, '(vi) Stale sequence payload must be dropped');
assert.equal(staleSeqDecision.reason, 'STALE_OLDER_RESPONSE');

const staleTimestampDecision = resolveHydrationDecision({
  roundKey: 'eval-101:1',
  lastInitializedKey: 'eval-101:1',
  isDirty: false,
  incomingUpdatedAt: '2026-10-21T01:00:00Z',
  lastHydratedUpdatedAt: '2026-10-21T02:00:00Z',
});
assert.equal(staleTimestampDecision.shouldHydrate, false, '(vi) Stale timestamp payload must be dropped');
assert.equal(staleTimestampDecision.reason, 'STALE_OLDER_RESPONSE');

const freshTimestampDecision = resolveHydrationDecision({
  roundKey: 'eval-101:1',
  lastInitializedKey: 'eval-101:1',
  isDirty: false,
  incomingUpdatedAt: '2026-10-21T02:30:00Z',
  lastHydratedUpdatedAt: '2026-10-21T02:00:00Z',
});
assert.equal(freshTimestampDecision.shouldHydrate, true, '(vi) Fresh timestamp payload must be accepted');

// Verification of production wiring in EvaluationPageClient and use-db
const clientSource = fs.readFileSync('src/app/evaluations/[id]/EvaluationPageClient.tsx', 'utf8');
const useDbSource = fs.readFileSync('src/hooks/use-db.ts', 'utf8');

assert.match(
  clientSource,
  /const\s+saveSnapshot\s*=\s*getSaveSnapshot\(\)/,
  'EvaluationPageClient must capture saveSnapshot before calling saveEvaluationRound'
);
assert.match(
  clientSource,
  /acknowledgeSave\(\s*saveSnapshot\s*,\s*true\s*\)/,
  'EvaluationPageClient must acknowledgeSave on successful save'
);
assert.match(
  useDbSource,
  /return\s+queryClient\.invalidateQueries/,
  'use-db invalidateRequesterQueries must return the invalidateQueries promise'
);

// 1.4 Production callback execution: handleSave, getSaveSnapshot & acknowledgeSave
const clientAst = ts.createSourceFile('EvaluationPageClient.tsx', clientSource, ts.ScriptTarget.ES2022, true);
const hookAst = ts.createSourceFile('use-evaluation-page-state.ts', hookSource, ts.ScriptTarget.ES2022, true);

function findVariableInitializer(sourceFile, varName) {
  let result = null;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === varName) {
      result = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!result) throw new Error(`Variable ${varName} not found in AST`);
  return result;
}

function findCallArgument(sourceFile, calleeName, argumentIndex = 0) {
  let result = null;
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === calleeName &&
      node.arguments[argumentIndex]
    ) {
      result = node.arguments[argumentIndex];
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!result) throw new Error(`Call ${calleeName} argument ${argumentIndex} not found in AST`);
  return result;
}

const handleSaveNode = findVariableInitializer(clientAst, 'handleSave');
const getSaveSnapshotNode = findVariableInitializer(hookAst, 'getSaveSnapshot');
const ackSaveNode = findVariableInitializer(hookAst, 'acknowledgeSave');
const latestContextEffectNode = findCallArgument(hookAst, 'useLayoutEffect');

assert.ok(handleSaveNode, 'Production EvaluationPageClient must declare handleSave');
assert.ok(getSaveSnapshotNode, 'Production useEvaluationPageState must declare getSaveSnapshot');
assert.ok(ackSaveNode, 'Production useEvaluationPageState must declare acknowledgeSave');

const cleanJs = (code) => ts.transpileModule(`(${code})`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText.trim().replace(/;$/, '');

const handleSaveJs = cleanJs(handleSaveNode.getText(clientAst));
const getSaveSnapshotJs = cleanJs(getSaveSnapshotNode.arguments[0].getText(hookAst));
const ackSaveJs = cleanJs(ackSaveNode.arguments[0].getText(hookAst));
const latestContextEffectJs = cleanJs(latestContextEffectNode.getText(hookAst));

const makeLatestContextEffect = new Function(
  'latestContextRef', 'evaluation', 'targetRound', 'targetRoundNumber',
  `return ${latestContextEffectJs};`
);

const makeGetSaveSnapshot = new Function(
  'latestContextRef', 'evaluation', 'targetRound', 'accessState', 'editRevisionRef',
  `return ${getSaveSnapshotJs};`
);

const makeAckSave = new Function(
  'latestContextRef', 'evaluation', 'targetRound', 'accessState', 'editRevisionRef', 'userEditedRef', 'applySaveAcknowledgement',
  `return ${ackSaveJs};`
);

const commitLatestContext = (latestContextRef, evaluation, round) => {
  const effect = makeLatestContextEffect(
    latestContextRef,
    evaluation,
    round == null ? null : { round },
    round
  );
  effect();
};

const makeHandleSave = new Function(
  'evaluation', 'accessState', 'user', 'getSaveSnapshot', 'setIsSaving', 'saveEvaluationRound',
  'scores', 'notes', 'selectedLevelIndexes', 'comment', 'criteriaConfigVersionId', 'gradeConfigVersionId',
  'renderedCriteriaRules', 'acknowledgeSave', 'invalidateRequesterQueries', 'queryClient',
  'userRef', 'showSubmitSuccess', 'redirectTimer', 'router', 'showDraftSaved', 'toast', 'window', 'console',
  `return ${handleSaveJs};`
);

// Execution of required behavioral sequence with deferred Save (Context switch to Evaluation B):
{
  const editRevisionRef = { current: 0 };
  const userEditedRef = { current: false };
  const latestContextRef = { current: { evaluationId: 'eval-A', round: 1, contextGeneration: 0 } };

  const evaluationA = { id: 'eval-A', rounds: [{ round: 1, scores: {}, notes: {} }] };
  const accessStateA = { mode: 'edit', editableRound: 1 };
  const targetRoundA = evaluationA.rounds[0];

  // 1. Edit evaluation A (score + note), start Save A and hold its promise pending.
  let stateA = evaluationReducer(initialState, {
    type: 'SET_SCORE', criterionId: 'crit-A', points: 10, levelIndex: 0
  });
  stateA = evaluationReducer(stateA, {
    type: 'SET_NOTE', criterionId: 'crit-A', note: 'Note A'
  });
  editRevisionRef.current = 2;
  userEditedRef.current = true;

  const getSaveSnapshotA = makeGetSaveSnapshot(latestContextRef, evaluationA, targetRoundA, accessStateA, editRevisionRef);
  const acknowledgeSaveA = makeAckSave(latestContextRef, evaluationA, targetRoundA, accessStateA, editRevisionRef, userEditedRef, applySaveAcknowledgement);

  let resolveSaveA;
  const saveAPromise = new Promise(resolve => { resolveSaveA = resolve; });

  const handleSaveA = makeHandleSave(
    evaluationA, accessStateA, { id: 'user-1' }, getSaveSnapshotA, () => {}, () => saveAPromise,
    stateA.scores, stateA.notes, stateA.selectedLevelIndexes, stateA.comment, null, null, [],
    acknowledgeSaveA, () => Promise.resolve(), {}, { current: { id: 'user-1' } },
    () => {}, { current: null }, { push: () => {} }, () => {}, () => {}, { setTimeout: () => 1 }, console
  );

  const saveOpPromise = handleSaveA(false);

  // 2. Switch the latest context to evaluation/round B; simulate the round revision reset, then edit B score + note.
  const evaluationB = { id: 'eval-B', rounds: [{ round: 1, scores: {}, notes: {} }] };
  const accessStateB = { mode: 'edit', editableRound: 1 };
  const targetRoundB = evaluationB.rounds[0];
  commitLatestContext(latestContextRef, evaluationB, 1);
  editRevisionRef.current = 0;
  userEditedRef.current = false;

  let stateB = evaluationReducer(initialState, {
    type: 'SET_INITIAL_DATA', payload: { scores: {}, notes: {}, selectedLevelIndexes: {}, comment: '' }
  });
  stateB = evaluationReducer(stateB, {
    type: 'SET_SCORE', criterionId: 'crit-B', points: 8, levelIndex: 1
  });
  stateB = evaluationReducer(stateB, {
    type: 'SET_NOTE', criterionId: 'crit-B', note: 'Note B'
  });
  stateB = evaluationReducer(stateB, {
    type: 'SET_COMMENT', comment: 'Comment B'
  });
  editRevisionRef.current = 2; // Collision with snapshot edit revision
  userEditedRef.current = true;

  const bScoresBefore = JSON.stringify(stateB.scores);
  const bNotesBefore = JSON.stringify(stateB.notes);
  const bIndexesBefore = JSON.stringify(stateB.selectedLevelIndexes);
  const bCommentBefore = stateB.comment;

  // 3. Resolve Save A successfully; invoke the real production acknowledgement callback through real handleSave.
  resolveSaveA({ success: true });
  await saveOpPromise;

  // 4. Assert B remains dirty and B score/note/index/comment are byte-for-byte unchanged.
  assert.equal(userEditedRef.current, true, 'B must remain dirty after Save A resolves');
  assert.equal(JSON.stringify(stateB.scores), bScoresBefore, 'B scores must be unchanged');
  assert.equal(JSON.stringify(stateB.notes), bNotesBefore, 'B notes must be unchanged');
  assert.equal(JSON.stringify(stateB.selectedLevelIndexes), bIndexesBefore, 'B indexes must be unchanged');
  assert.equal(stateB.comment, bCommentBefore, 'B comment must be unchanged');

  // 5. Deliver same-round background refetch for B with older/different server values
  const decisionB = resolveHydrationDecision({
    roundKey: 'eval-B:1',
    lastInitializedKey: 'eval-B:1',
    isDirty: userEditedRef.current,
    incomingUpdatedAt: '2026-10-21T02:00:00Z',
    lastHydratedUpdatedAt: '2026-10-21T01:00:00Z',
  });
  assert.equal(decisionB.shouldHydrate, true, 'Hydration decision must allow hydration for fresh response');
  assert.equal(decisionB.preserveUserEdits, true, 'Hydration decision must preserve user edits for B');
  const stateBAfterRefetch = evaluationReducer(stateB, {
    type: 'SET_INITIAL_DATA',
    preserveUserEdits: decisionB.preserveUserEdits,
    payload: {
      scores: { 'crit-B': 3 },
      notes: { 'crit-B': 'Old server note' },
      selectedLevelIndexes: { 'crit-B': 0 },
      comment: 'Old server comment',
    },
  });
  assert.equal(JSON.stringify(stateBAfterRefetch.scores), bScoresBefore, 'B scores preserved across background refetch');
  assert.equal(JSON.stringify(stateBAfterRefetch.notes), bNotesBefore, 'B notes preserved across background refetch');
  assert.equal(JSON.stringify(stateBAfterRefetch.selectedLevelIndexes), bIndexesBefore, 'B indexes preserved across background refetch');
  assert.equal(stateBAfterRefetch.comment, bCommentBefore, 'B comment preserved across background refetch');
}

// Execution of the production save and layout-effect callbacks across an A→B→A identity collision.
{
  const editRevisionRef = { current: 0 };
  const userEditedRef = { current: false };
  const latestContextRef = {
    current: { evaluationId: 'eval-A', round: 1, contextGeneration: 0 },
  };

  const evaluationA = { id: 'eval-A', rounds: [{ round: 1, scores: {}, notes: {} }] };
  const accessStateA = { mode: 'edit', editableRound: 1 };
  const targetRoundA = evaluationA.rounds[0];
  let stateA = evaluationReducer(initialState, { type: 'SET_SCORE', criterionId: 'crit-A', points: 10, levelIndex: 0 });
  stateA = evaluationReducer(stateA, { type: 'SET_NOTE', criterionId: 'crit-A', note: 'Note A before save' });
  let currentStateA = stateA;
  editRevisionRef.current = 2;
  userEditedRef.current = true;

  const getSaveSnapshotA = makeGetSaveSnapshot(latestContextRef, evaluationA, targetRoundA, accessStateA, editRevisionRef);
  const acknowledgeSaveA = makeAckSave(latestContextRef, evaluationA, targetRoundA, accessStateA, editRevisionRef, userEditedRef, applySaveAcknowledgement);
  let returnedHydrationDecision = null;
  const invalidateRequesterQueriesA = async (_queryClient, queryName) => {
    if (queryName !== 'evaluation-page-data') return;
    returnedHydrationDecision = resolveHydrationDecision({
      roundKey: 'eval-A:1',
      lastInitializedKey: 'eval-A:1',
      isDirty: userEditedRef.current,
      incomingUpdatedAt: '2026-10-21T02:00:00Z',
      lastHydratedUpdatedAt: '2026-10-21T01:00:00Z',
    });
    currentStateA = evaluationReducer(currentStateA, {
      type: 'SET_INITIAL_DATA',
      preserveUserEdits: returnedHydrationDecision.preserveUserEdits,
      payload: {
        scores: { 'crit-A-new': 99 },
        notes: { 'crit-A-new': 'Stale refetch note' },
        selectedLevelIndexes: { 'crit-A-new': 0 },
        comment: 'Stale refetch comment',
      },
    });
  };
  let resolveSaveA;
  const saveAPromise = new Promise(resolve => { resolveSaveA = resolve; });
  const handleSaveA = makeHandleSave(
    evaluationA, accessStateA, { id: 'user-1' }, getSaveSnapshotA, () => {}, () => saveAPromise,
    stateA.scores, stateA.notes, stateA.selectedLevelIndexes, stateA.comment, null, null, [],
    acknowledgeSaveA, invalidateRequesterQueriesA, {}, { current: { id: 'user-1' } },
    () => {}, { current: null }, { push: () => {} }, () => {}, () => {}, { setTimeout: () => 1 }, console
  );

  const saveSnapshotA = getSaveSnapshotA();
  const saveOpPromise = handleSaveA(false);

  // Commit B, then return to the same evaluation/round A; revisions collide at 2.
  const evaluationB = { id: 'eval-B', rounds: [{ round: 1, scores: {}, notes: {} }] };
  commitLatestContext(latestContextRef, evaluationB, 1);
  editRevisionRef.current = 0;
  userEditedRef.current = false;
  let stateB = evaluationReducer(initialState, { type: 'SET_SCORE', criterionId: 'crit-B', points: 5, levelIndex: 1 });
  stateB = evaluationReducer(stateB, { type: 'SET_NOTE', criterionId: 'crit-B', note: 'Note B' });
  editRevisionRef.current = 2;
  userEditedRef.current = true;
  currentStateA = stateB;

  const returnedEvaluationA = { id: 'eval-A', rounds: [{ round: 1, scores: {}, notes: {} }] };
  commitLatestContext(latestContextRef, returnedEvaluationA, 1);
  editRevisionRef.current = 0;
  userEditedRef.current = false;
  let returnedStateA = evaluationReducer(initialState, { type: 'SET_SCORE', criterionId: 'crit-A-new', points: 0, levelIndex: 2 });
  returnedStateA = evaluationReducer(returnedStateA, { type: 'SET_NOTE', criterionId: 'crit-A-new', note: 'New A note' });
  returnedStateA = evaluationReducer(returnedStateA, { type: 'SET_COMMENT', comment: 'New A comment' });
  editRevisionRef.current = 2;
  userEditedRef.current = true;
  currentStateA = returnedStateA;

  const returnedScoresBefore = JSON.stringify(returnedStateA.scores);
  const returnedNotesBefore = JSON.stringify(returnedStateA.notes);
  const returnedCommentBefore = returnedStateA.comment;
  assert.equal(saveSnapshotA.evaluationId, 'eval-A', 'Pending save snapshot must remain bound to original A');
  assert.equal(saveSnapshotA.round, 1, 'Pending save snapshot must remain bound to original A round');
  assert.equal(editRevisionRef.current, saveSnapshotA.editRevision, 'A→B→A test must collide on edit revision');
  assert.equal(latestContextRef.current.evaluationId, 'eval-A', 'Committed context must return to evaluation A');
  assert.equal(latestContextRef.current.contextGeneration, saveSnapshotA.contextGeneration + 2, 'Each committed identity transition must advance the monotonic generation');

  resolveSaveA({ success: true });
  await saveOpPromise;

  assert.equal(userEditedRef.current, true, 'Old Save A must not clear dirty state after A→B→A with a revision collision');
  assert.equal(returnedHydrationDecision?.shouldHydrate, true, 'Successful save invalidation must deliver a current A background refetch');
  assert.equal(returnedHydrationDecision?.preserveUserEdits, true, 'Stale Save A acknowledgement must leave the returned A context dirty for hydration');
  assert.equal(JSON.stringify(currentStateA.scores), returnedScoresBefore, 'New A scores must survive the stale-save-triggered refetch');
  assert.equal(JSON.stringify(currentStateA.notes), returnedNotesBefore, 'New A notes must survive the stale-save-triggered refetch');
  assert.equal(currentStateA.comment, returnedCommentBefore, 'New A comment must survive the stale-save-triggered refetch');
  assert.equal(JSON.stringify(currentStateA.selectedLevelIndexes), JSON.stringify(returnedStateA.selectedLevelIndexes), 'New A level indexes must survive the stale-save-triggered refetch');
  assert.equal(stateB.scores['crit-B'], 5, 'B local score must survive the A→B→A transition');
}

// Execution of required behavioral sequence with deferred Save (Round switch on same Evaluation):
{
  const editRevisionRef = { current: 0 };
  const userEditedRef = { current: false };
  const latestContextRef = { current: { evaluationId: 'eval-A', round: 1, contextGeneration: 0 } };

  const evaluationA1 = { id: 'eval-A', rounds: [{ round: 1, scores: {}, notes: {} }, { round: 2, scores: {}, notes: {} }] };
  const accessStateA1 = { mode: 'edit', editableRound: 1 };
  const targetRoundA1 = evaluationA1.rounds[0];

  // 1. Edit round 1, start Save A1 and hold its promise pending
  let stateR1 = evaluationReducer(initialState, {
    type: 'SET_SCORE', criterionId: 'crit-1', points: 10, levelIndex: 0
  });
  editRevisionRef.current = 1;
  userEditedRef.current = true;

  const getSaveSnapshotR1 = makeGetSaveSnapshot(latestContextRef, evaluationA1, targetRoundA1, accessStateA1, editRevisionRef);
  const acknowledgeSaveR1 = makeAckSave(latestContextRef, evaluationA1, targetRoundA1, accessStateA1, editRevisionRef, userEditedRef, applySaveAcknowledgement);

  let resolveSaveR1;
  const saveR1Promise = new Promise(resolve => { resolveSaveR1 = resolve; });

  const handleSaveR1 = makeHandleSave(
    evaluationA1, accessStateA1, { id: 'user-1' }, getSaveSnapshotR1, () => {}, () => saveR1Promise,
    stateR1.scores, stateR1.notes, stateR1.selectedLevelIndexes, stateR1.comment, null, null, [],
    acknowledgeSaveR1, () => Promise.resolve(), {}, { current: { id: 'user-1' } },
    () => {}, { current: null }, { push: () => {} }, () => {}, () => {}, { setTimeout: () => 1 }, console
  );

  const saveR1Op = handleSaveR1(false);

  // 2. Switch context to round 2, simulate revision reset, edit round 2
  commitLatestContext(latestContextRef, evaluationA1, 2);
  editRevisionRef.current = 0;
  userEditedRef.current = false;

  let stateR2 = evaluationReducer(initialState, {
    type: 'SET_INITIAL_DATA', payload: { scores: {}, notes: {}, selectedLevelIndexes: {}, comment: '' }
  });
  stateR2 = evaluationReducer(stateR2, {
    type: 'SET_SCORE', criterionId: 'crit-2', points: 5, levelIndex: 1
  });
  editRevisionRef.current = 1; // Collision with snapshot revision 1
  userEditedRef.current = true;

  const r2ScoresBefore = JSON.stringify(stateR2.scores);

  // 3. Resolve Save R1
  resolveSaveR1({ success: true });
  await saveR1Op;

  // 4. Round 2 must remain dirty and unchanged
  assert.equal(userEditedRef.current, true, 'Round 2 must remain dirty after Round 1 Save resolves');
  assert.equal(JSON.stringify(stateR2.scores), r2ScoresBefore, 'Round 2 scores unchanged');

  // 5. Refetch preserves Round 2 edits
  const decisionR2 = resolveHydrationDecision({
    roundKey: 'eval-A:2',
    lastInitializedKey: 'eval-A:2',
    isDirty: userEditedRef.current,
    incomingUpdatedAt: '2026-10-21T02:00:00Z',
    lastHydratedUpdatedAt: '2026-10-21T01:00:00Z',
  });
  assert.equal(decisionR2.preserveUserEdits, true, 'Hydration decision must preserve user edits for Round 2');
}

// Direct production-callback coverage: (a) same-context successful Save -> awaited invalidation/refetch -> latest server data hydrates
{
  const editRevisionRef = { current: 1 };
  const userEditedRef = { current: true };
  const latestContextRef = { current: { evaluationId: 'eval-A', round: 1, contextGeneration: 0 } };
  const evaluationA = { id: 'eval-A', rounds: [{ round: 1 }] };
  const accessStateA = { mode: 'edit', editableRound: 1 };

  let stateA = evaluationReducer(initialState, {
    type: 'SET_SCORE', criterionId: 'crit-A', points: 10, levelIndex: 0
  });

  const getSaveSnapshotA = makeGetSaveSnapshot(latestContextRef, evaluationA, evaluationA.rounds[0], accessStateA, editRevisionRef);
  const acknowledgeSaveA = makeAckSave(latestContextRef, evaluationA, evaluationA.rounds[0], accessStateA, editRevisionRef, userEditedRef, applySaveAcknowledgement);

  let invalidationAwaited = false;
  const mockInvalidate = async () => {
    invalidationAwaited = true;
  };

  const handleSaveA = makeHandleSave(
    evaluationA, accessStateA, { id: 'user-1' }, getSaveSnapshotA, () => {}, async () => ({ success: true }),
    stateA.scores, stateA.notes, stateA.selectedLevelIndexes, stateA.comment, null, null, [],
    acknowledgeSaveA, mockInvalidate, {}, { current: { id: 'user-1' } },
    () => {}, { current: null }, { push: () => {} }, () => {}, () => {}, { setTimeout: () => 1 }, console
  );

  await handleSaveA(false);

  assert.equal(userEditedRef.current, false, '(a) userEditedRef must be cleared on successful same-context save');
  assert.equal(invalidationAwaited, true, '(a) invalidation queries must be awaited');

  const decisionA = resolveHydrationDecision({
    roundKey: 'eval-A:1',
    lastInitializedKey: 'eval-A:1',
    isDirty: userEditedRef.current,
    incomingUpdatedAt: '2026-10-21T02:00:00Z',
    lastHydratedUpdatedAt: '2026-10-21T01:00:00Z',
  });
  assert.equal(decisionA.shouldHydrate, true);
  assert.equal(decisionA.preserveUserEdits, false, '(a) must not preserve user edits after successful save');

  const hydratedA = evaluationReducer(stateA, {
    type: 'SET_INITIAL_DATA',
    preserveUserEdits: decisionA.preserveUserEdits,
    payload: {
      scores: { 'crit-A': 10, 'crit-A2': 5 },
      notes: {},
      selectedLevelIndexes: { 'crit-A': 0, 'crit-A2': 1 },
      comment: '',
    },
  });
  assert.equal(hydratedA.scores['crit-A2'], 5, '(a) latest server data hydrates successfully');
}

// Direct production-callback coverage: (b) failed Save leaves dirty data unchanged
{
  const editRevisionRef = { current: 1 };
  const userEditedRef = { current: true };
  const latestContextRef = { current: { evaluationId: 'eval-A', round: 1, contextGeneration: 0 } };
  const evaluationA = { id: 'eval-A', rounds: [{ round: 1 }] };
  const accessStateA = { mode: 'edit', editableRound: 1 };

  let stateA = evaluationReducer(initialState, {
    type: 'SET_SCORE', criterionId: 'crit-A', points: 10, levelIndex: 0
  });
  stateA = evaluationReducer(stateA, {
    type: 'SET_NOTE', criterionId: 'crit-A', note: 'Draft note'
  });

  const getSaveSnapshotA = makeGetSaveSnapshot(latestContextRef, evaluationA, evaluationA.rounds[0], accessStateA, editRevisionRef);
  const acknowledgeSaveA = makeAckSave(latestContextRef, evaluationA, evaluationA.rounds[0], accessStateA, editRevisionRef, userEditedRef, applySaveAcknowledgement);

  const handleSaveA = makeHandleSave(
    evaluationA, accessStateA, { id: 'user-1' }, getSaveSnapshotA, () => {}, async () => ({ success: false, error: 'Database locked' }),
    stateA.scores, stateA.notes, stateA.selectedLevelIndexes, stateA.comment, null, null, [],
    acknowledgeSaveA, () => Promise.resolve(), {}, { current: { id: 'user-1' } },
    () => {}, { current: null }, { push: () => {} }, () => {}, () => {}, { setTimeout: () => 1 }, console
  );

  await handleSaveA(false);

  assert.equal(userEditedRef.current, true, '(b) userEditedRef must remain dirty on failed save');

  const decisionA = resolveHydrationDecision({
    roundKey: 'eval-A:1',
    lastInitializedKey: 'eval-A:1',
    isDirty: userEditedRef.current,
    incomingUpdatedAt: '2026-10-21T02:00:00Z',
    lastHydratedUpdatedAt: '2026-10-21T01:00:00Z',
  });
  assert.equal(decisionA.shouldHydrate, true);
  assert.equal(decisionA.preserveUserEdits, true, '(b) must preserve user edits on failed save');

  const hydratedA = evaluationReducer(stateA, {
    type: 'SET_INITIAL_DATA',
    preserveUserEdits: decisionA.preserveUserEdits,
    payload: {
      scores: { 'crit-A': 0 },
      notes: {},
      selectedLevelIndexes: { 'crit-A': 1 },
      comment: '',
    },
  });
  assert.equal(hydratedA.scores['crit-A'], 10, '(b) user score remains unchanged after failed save');
  assert.equal(hydratedA.notes['crit-A'], 'Draft note', '(b) user note remains unchanged after failed save');
}

// In-flight edit during pending Save: newer local edit must remain dirty
{
  const editRevisionRef = { current: 1 };
  const userEditedRef = { current: true };
  const latestContextRef = { current: { evaluationId: 'eval-A', round: 1, contextGeneration: 0 } };
  const evaluationA = { id: 'eval-A', rounds: [{ round: 1 }] };
  const accessStateA = { mode: 'edit', editableRound: 1 };

  let stateA = evaluationReducer(initialState, {
    type: 'SET_SCORE', criterionId: 'crit-A', points: 10, levelIndex: 0
  });

  const getSaveSnapshotA = makeGetSaveSnapshot(latestContextRef, evaluationA, evaluationA.rounds[0], accessStateA, editRevisionRef);
  const acknowledgeSaveA = makeAckSave(latestContextRef, evaluationA, evaluationA.rounds[0], accessStateA, editRevisionRef, userEditedRef, applySaveAcknowledgement);

  let resolveSaveA;
  const saveAPromise = new Promise(resolve => { resolveSaveA = resolve; });

  const handleSaveA = makeHandleSave(
    evaluationA, accessStateA, { id: 'user-1' }, getSaveSnapshotA, () => {}, () => saveAPromise,
    stateA.scores, stateA.notes, stateA.selectedLevelIndexes, stateA.comment, null, null, [],
    acknowledgeSaveA, () => Promise.resolve(), {}, { current: { id: 'user-1' } },
    () => {}, { current: null }, { push: () => {} }, () => {}, () => {}, { setTimeout: () => 1 }, console
  );

  const savePromise = handleSaveA(false);

  // User edits again while Save is pending
  stateA = evaluationReducer(stateA, {
    type: 'SET_SCORE', criterionId: 'crit-A', points: 15, levelIndex: 2
  });
  editRevisionRef.current = 2; // Bump revision

  // Resolve Save A
  resolveSaveA({ success: true });
  await savePromise;

  assert.equal(userEditedRef.current, true, 'Newer edit during save must remain dirty');
  assert.equal(stateA.scores['crit-A'], 15, 'Newer edit score must be preserved');
}

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
