#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

export async function run() {
  const summary = read('src/actions/ai-summary.ts');
  const minutes = read('src/actions/ai.ts');
  const card = read('src/components/reports/AiSummaryCard.tsx');
  const modal = read('src/components/reports/PeriodMinutesModal.tsx');
  const governance = read('src/lib/ai-governance.ts');
  const states = [];

  assert.match(summary, /status === 'Submitted'/, 'summary input must use submitted rounds');
  assert.doesNotMatch(summary, /totalScore\s*>\s*0/, 'zero-score submitted rounds must not be dropped');
  assert.match(summary, /sourceRevision/);
  assert.match(summary, /coverage_fields/);
  assert.match(summary, /upsert_ai_summary_if_active/);
  states.push('submitted-round-source-and-persistent-metadata');

  assert.match(minutes, /sourceSummaryCoverage/);
  assert.match(minutes, /payloadCoverage/);
  states.push('minutes-carries-summary-and-payload-coverage');

  assert.match(card, /coverage\.status/);
  assert.match(card, /Không coi đây là bản tổng hợp đầy đủ/);
  states.push('summary-card-discloses-legacy-or-partial-coverage');

  assert.match(modal, /sourceSummaryCoverage/);
  assert.match(modal, /không đại diện cho phần dữ liệu đã bị rút gọn/i);
  states.push('minutes-draft-discloses-incomplete-source');

  assert.match(governance, /fieldTruncation/);
  assert.match(governance, /totalItems/);
  assert.match(governance, /fittedItems/);
  assert.match(governance, /droppedItems/);
  states.push('coverage-contract-is-explicit');

  assert.equal(states.length, 5);
  return {
    real: true,
    passed: true,
    tier: 'source-contract',
    status: 'EXECUTED',
    authenticated: false,
    cases: states,
    target: 'local-source-contract-ai-summary-truth',
    live_browser: 'NOT_RUN_AUTH_REQUIRED',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((result) => console.log(`AI_SUMMARY_BROWSER PASS cases=${result.cases.length} target=${result.target} live_browser=${result.live_browser}`))
    .catch((error) => {
      console.error(`AI_SUMMARY_BROWSER FAIL ${error.message}`);
      process.exitCode = 1;
    });
}
