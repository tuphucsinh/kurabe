#!/usr/bin/env node
/**
 * Integration Test for Kurabe CONTROLLED Task P103M1T02
 * H4 server history authorization and target non-disclosure.
 *
 * Rules:
 * - Behavioral DB checks must use a fresh disposable local stack only; no production writes.
 * - If real runtime capability is unavailable, report BLOCKED_CAPABILITY and preserve the first useful failure.
 * - Do not claim PASS from regex/source checks alone.
 *
 * Run: node tests/integration/h4-history.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

const HISTORY_ADMIN_PATH = path.join(projectRoot, 'src/lib/db/evaluation-history-admin.ts');
const WORKFLOW_PATH = path.join(projectRoot, 'src/data/workflow.ts');
const PAGE_PATH = path.join(projectRoot, 'src/app/history/[employeeId]/page.tsx');
const COMPONENT_PATH = path.join(projectRoot, 'src/components/evaluation/EvaluationHistoryPage.tsx');
const READ_ACTION_PATH = path.join(projectRoot, 'src/actions/read.ts');


function verifySourceContracts() {
  const cases = [];

  const historyAdminCode = fs.readFileSync(HISTORY_ADMIN_PATH, 'utf8');
  const workflowCode = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const pageCode = fs.readFileSync(PAGE_PATH, 'utf8');
  const componentCode = fs.readFileSync(COMPONENT_PATH, 'utf8');
  const readActionCode = fs.readFileSync(READ_ACTION_PATH, 'utf8');

  // Contract 1: evaluation-history-admin server-only and predicate enforcement
  assert.ok(historyAdminCode.includes("import 'server-only';"), 'history-admin must be server-only');
  assert.ok(historyAdminCode.includes('hasEvaluationHistoryTargetScope'), 'history-admin must import and check hasEvaluationHistoryTargetScope');
  assert.ok(historyAdminCode.includes('isAuthorizedHistoricalEvaluator'), 'history-admin must import and check isAuthorizedHistoricalEvaluator');
  assert.ok(historyAdminCode.includes('!hasCurrentScope'), 'history-admin must guard on hasCurrentScope');
  assert.ok(historyAdminCode.includes('return { target: null, entries: [] }'), 'history-admin must fail-closed with null target');
  cases.push('source:history-admin-target-scope-predicate');

  // Contract 2: workflow predicate exports and submitted status requirement
  assert.ok(workflowCode.includes('export function hasEvaluationHistoryTargetScope'), 'workflow must export hasEvaluationHistoryTargetScope');
  assert.ok(workflowCode.includes('export function isAuthorizedHistoricalEvaluator'), 'workflow must export isAuthorizedHistoricalEvaluator');
  assert.ok(workflowCode.includes('isRoundSubmitted(r)'), 'workflow canViewEvaluation must check isRoundSubmitted for approved evaluation historical snapshot');
  cases.push('source:workflow-historical-evaluator-predicate');

  // Contract 3: page route server-side protection
  assert.ok(pageCode.includes('getSessionUser()'), 'page must authenticate viewer server-side');
  assert.ok(pageCode.includes('getEvaluationHistoryAdmin(employeeId, viewer)'), 'page must delegate query to getEvaluationHistoryAdmin');
  cases.push('source:page-route-server-guard');

  assert.ok(readActionCode.includes('getEvaluationHistoryAdmin'), 'direct history action must share the route authorization policy');
  cases.push('source:action-route-policy-parity');

  // Contract 4: component non-disclosure on target: null
  assert.ok(componentCode.includes('if (!target)'), 'component must early return when target is null');
  assert.ok(componentCode.includes('Không tìm thấy thông tin nhân viên'), 'component must render generic unavailable title');
  assert.ok(componentCode.includes('Nhân viên không tồn tại hoặc bạn không có quyền truy cập'), 'component must render generic unavailable message');
  cases.push('source:component-generic-unavailable-non-disclosure');

  return cases;
}

export async function run() {
  const cases = verifySourceContracts();

  const evidencePath = process.env.KURABE_H4_EVIDENCE;
  if (!evidencePath || !fs.existsSync(evidencePath)) {
    return {
      real: false,
      passed: false,
      tier: 'source-contract',
      status: 'BLOCKED_CAPABILITY',
      capability: 'BLOCKED_CAPABILITY',
      reason: 'Real authenticated disposable evidence is required; source contracts and Docker availability alone cannot pass H4.',
      firstFailure: 'KURABE_H4_EVIDENCE is missing',
      cases,
      target: 'no-authenticated-evidence',
    };
  }

  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.real, true, 'H4 evidence must be real');
  assert.equal(evidence.tier, 'authenticated', 'H4 evidence tier must be authenticated for the populated Next/auth/action matrix');
  assert.equal(evidence.authenticated, true, 'H4 evidence must explicitly identify authenticated execution');
  assert.ok(Number.isInteger(evidence.authenticatedCases) && evidence.authenticatedCases >= evidence.requiredCases.length, 'H4 evidence must enumerate authenticated cases');
  assert.equal(evidence.fixtureSetupTier, 'real-DB', 'fixture setup must remain separately labelled real-DB');
  assert.equal(evidence.fixtureSetupSynthetic, true, 'fixture setup must remain explicitly synthetic/disposable');
  assert.equal(evidence.status, 'QUALIFIED', 'H4 evidence must be qualified');
  assert.ok(Array.isArray(evidence.requiredCases) && evidence.requiredCases.length >= 8, 'H4 evidence must cover the required populated/denied/positive cases');
  return { ...evidence, cases, evidencePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    if (!result.passed) {
      console.error(`H4_HISTORY_INTEGRATION ${result.status} reason=${result.reason}`);
      process.exitCode = 1;
    } else {
      console.log(`H4_HISTORY_INTEGRATION ${result.status} cases=${result.cases.length} target=${result.target}`);
    }
  } catch (error) {
    console.error(`H4_HISTORY_INTEGRATION FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
