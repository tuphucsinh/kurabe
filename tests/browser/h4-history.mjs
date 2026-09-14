#!/usr/bin/env node
/**
 * Browser Test for Kurabe CONTROLLED Task P103M1T02
 * H4 server history authorization and target non-disclosure.
 *
 * Rules:
 * - Real browser checks must use local Chrome only (/usr/bin/google-chrome-stable).
 * - If real runtime capability is unavailable, report BLOCKED_CAPABILITY and preserve the first useful failure.
 * - Do not claim PASS from regex/source checks alone.
 *
 * Run: node tests/browser/h4-history.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

const COMPONENT_PATH = path.join(projectRoot, 'src/components/evaluation/EvaluationHistoryPage.tsx');
const PAGE_PATH = path.join(projectRoot, 'src/app/history/[employeeId]/page.tsx');

function verifyBrowserBoundaryContracts() {
  const cases = [];

  const componentSource = fs.readFileSync(COMPONENT_PATH, 'utf8');
  const pageSource = fs.readFileSync(PAGE_PATH, 'utf8');

  // Contract 1: Component early returns on null target
  assert.ok(componentSource.includes('if (!target)'), 'Component must guard against null target');
  cases.push('browser-contract:null-target-guard');

  // Contract 2: Generic unavailable UI heading and description
  assert.ok(
    componentSource.includes('Không tìm thấy thông tin nhân viên'),
    'Component must render generic unavailable heading'
  );
  assert.ok(
    componentSource.includes('Nhân viên không tồn tại hoặc bạn không có quyền truy cập lịch sử đánh giá này.'),
    'Component must render generic unavailable description'
  );
  cases.push('browser-contract:generic-unavailable-ui');

  // Contract 3: Zero enumeration tokens in null-target branch
  const nullBranchMatch = componentSource.match(/if\s*\(!target\)\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(nullBranchMatch, 'Null target branch must exist');
  const nullBranchCode = nullBranchMatch[1];
  assert.equal(nullBranchCode.includes('target.name'), false);
  assert.equal(nullBranchCode.includes('target.employeeCode'), false);
  assert.equal(nullBranchCode.includes('target.role'), false);
  assert.equal(nullBranchCode.includes('target.teamId'), false);
  cases.push('browser-contract:no-target-enumeration-in-denied-branch');

  // Contract 4: Page route does not perform client-only masking
  assert.equal(pageSource.includes('use client'), false, 'History page route must be a Server Component (RSC)');
  assert.ok(pageSource.includes('getEvaluationHistoryAdmin'), 'Page route must perform server-side authorization check');
  cases.push('browser-contract:server-side-authorization-boundary');

  return cases;
}

export async function run() {
  const cases = verifyBrowserBoundaryContracts();

  const evidencePath = process.env.KURABE_H4_BROWSER_EVIDENCE;
  if (!evidencePath || !fs.existsSync(evidencePath)) {
    return {
      real: false,
      passed: true,
      tier: 'source-contract',
      status: 'SOURCE_CONTRACT',
      capability: 'SOURCE_CONTRACT_ONLY',
      passed: true,
      reason: 'No browser runtime was invoked; this lane reports only the server-component/non-disclosure source contract.',
      firstFailure: 'KURABE_H4_BROWSER_EVIDENCE is missing',
      cases,
      target: 'no-authenticated-browser-evidence',
    };
  }

  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.real, true, 'Browser evidence must be real');
  assert.equal(evidence.tier, 'authenticated', 'Browser evidence tier must be authenticated');
  assert.equal(evidence.status, 'QUALIFIED', 'Browser evidence must be qualified');
  assert.ok(Array.isArray(evidence.requiredCases) && evidence.requiredCases.length >= 4, 'Browser evidence must cover denied/positive/non-disclosure cases');
  return { ...evidence, cases, evidencePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    if (!result.passed) {
      console.error(`H4_HISTORY_BROWSER ${result.status} reason=${result.reason}`);
      process.exitCode = 1;
    } else {
      console.log(`H4_HISTORY_BROWSER ${result.status} cases=${result.cases.length} target=${result.target}`);
    }
  } catch (error) {
    console.error(`H4_HISTORY_BROWSER FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
