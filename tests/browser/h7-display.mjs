#!/usr/bin/env node
/**
 * P103M3T02 / H7 browser-boundary contract.
 *
 * This module verifies the rendered-source invariants and reports only a
 * source-contract result unless an independently captured authenticated browser
 * evidence file is supplied. It never substitutes a mock browser for evidence.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

const REQUIRED_CASES = Object.freeze([
  'h7:submitted-grade-from-display-dto',
  'h7:submitted-criteria-labels-per-round',
  'h7:submitted-evaluator-role-from-display-dto',
  'h7:loading-state-no-live-flicker',
  'h7:error-legacy-unavailable-no-current-fallback',
  'h7:draft-keeps-current-rules',
  'h7:active-period-and-auth-boundaries',
]);

function read(rootDir, relative) {
  return fs.readFileSync(path.join(rootDir, relative), 'utf8');
}

export function verifySourceContracts(rootDir = projectRoot) {
  const compare = read(rootDir, 'src/app/evaluations/[id]/compare/ComparePageClient.tsx');
  const detail = read(rootDir, 'src/app/evaluations/[id]/EvaluationPageClient.tsx');
  const pageState = read(rootDir, 'src/hooks/use-evaluation-page-state.ts');
  const cases = [];

  assert.ok(compare.includes('useEvaluationDisplay'), 'compare must consume the H7 display hook');
  assert.ok(detail.includes('useEvaluationDisplay'), 'detail must consume the H7 display hook');
  assert.ok(compare.includes('view.displayRound.grade'), 'compare grade must come from submitted DTO');
  assert.ok(compare.includes('view.displayRound.totalScore'), 'compare score must come from submitted DTO');
  cases.push(REQUIRED_CASES[0]);
  assert.ok(compare.includes('roundCriteria[rIdx]?.name'), 'compare must retain per-round labels');
  cases.push(REQUIRED_CASES[1]);
  assert.ok(compare.includes('displayRound.evaluatorRole'), 'compare evaluator role must come from DTO');
  assert.ok(detail.includes('historicalRound.evaluatorRole'), 'detail evaluator role must come from DTO');
  cases.push(REQUIRED_CASES[2]);
  assert.ok(compare.includes('data-historical-snapshot-state="loading"'), 'compare loading state must be explicit');
  assert.ok(detail.includes("evaluationDisplayStatus === 'loading'"), 'detail must hold the static frame while DTO loads');
  cases.push(REQUIRED_CASES[3]);
  for (const state of ['error', 'legacy_unknown', 'unavailable']) {
    assert.ok(compare.includes(`'${state}'`) || compare.includes(`"${state}"`), `compare must represent ${state}`);
  }
  assert.ok(detail.includes('Không dùng cấu hình hiện tại'), 'detail must not use live-config fallback');
  assert.ok(compare.includes('Không dùng cấu hình hiện tại'), 'compare must not use live-config fallback');
  cases.push(REQUIRED_CASES[4]);
  assert.ok(pageState.includes('getCriteriaForRoleAction(employee.role)'), 'draft current-rules loader must remain');
  assert.ok(pageState.includes('if (isSubmittedRound)'), 'submitted criteria path must be distinct from draft');
  cases.push(REQUIRED_CASES[5]);
  assert.ok(compare.includes("scope.kind === 'NO_ACTIVE_PERIOD'"), 'compare must retain active-period gate');
  assert.ok(compare.includes('getEvaluationAccessState(user, evaluation, users)'), 'compare auth boundary must remain');
  assert.ok(detail.includes("scope.kind === 'NO_ACTIVE_PERIOD'"), 'detail must retain active-period gate');
  cases.push(REQUIRED_CASES[6]);

  return cases;
}

export async function run({ rootDir = projectRoot } = {}) {
  const cases = verifySourceContracts(rootDir);
  const evidencePath = process.env.KURABE_H7_BROWSER_EVIDENCE;

  if (!evidencePath || !fs.existsSync(evidencePath)) {
    return {
      real: false,
      passed: true,
      tier: 'source-contract',
      status: 'SOURCE_CONTRACT',
      capability: 'SOURCE_CONTRACT_ONLY',
      reason: 'No authenticated browser evidence was supplied; source contracts only.',
      cases,
      requiredCases: [...REQUIRED_CASES],
      target: 'no-authenticated-browser-evidence',
    };
  }

  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.real, true, 'browser evidence must be real');
  assert.equal(evidence.tier, 'authenticated', 'browser evidence must be authenticated');
  assert.equal(evidence.status, 'QUALIFIED', 'browser evidence must be qualified');
  assert.ok(Array.isArray(evidence.requiredCases), 'browser evidence must enumerate required cases');
  return { ...evidence, cases, evidencePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`H7_DISPLAY_BROWSER ${result.status} cases=${result.cases.length} target=${result.target}`);
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.error(`H7_DISPLAY_BROWSER FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
