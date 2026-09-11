import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const cases = [];
function check(name, fn) {
  fn();
  cases.push(name);
}

export async function run() {
  const governance = read('src/lib/ai-governance.ts');
  const ai = read('src/lib/ai.ts');
  const context = read('src/lib/ai-context.ts');
  const chat = read('src/actions/chat.ts');
  const actions = read('src/actions/ai.ts');
  const summary = read('src/actions/ai-summary.ts');
  const prompts = read('src/lib/ai-prompts.ts');
  const summaryUi = read('src/components/reports/AiSummaryCard.tsx');
  const minutesUi = read('src/components/reports/PeriodMinutesModal.tsx');
  const batchUi = read('src/components/reports/BatchResultMessageModal.tsx');

  check('provider transport is fail-closed and allowlisted', () => {
    assert.match(governance, /DEFAULT_AI_ALLOWED_HOSTS/);
    assert.match(governance, /host_not_allowed/);
    assert.match(governance, /http_not_permitted_without_dev_exception/);
    assert.match(ai, /AI_HTTP_DEV_EXCEPTION/);
    assert.match(ai, /validateAIProvider\(rawBaseUrl/);
  });
  check('all AI transports reject redirects and non-2xx payloads', () => {
    assert.equal((ai.match(/redirect: 'error'/g) || []).length, 2);
    for (const status of [301, 302, 303, 307, 308]) {
      assert.ok(status >= 300 && status < 400);
    }
    const guards = [...ai.matchAll(/if \(!res\.ok\) \{([\s\S]*?)\n\s*}\n\s*const data = await res\.json\(\);/g)];
    assert.equal(guards.length, 2);
    for (const guard of guards) {
      assert.match(guard[1], /return null;/);
      assert.doesNotMatch(guard[1], /res\.json|res\.text|res\.arrayBuffer/);
    }
  });
  check('configuration failure precedes chat quota reservation', () => {
    assert.match(ai, /isAIConfigured\(\): boolean[\s\S]*validateAIProvider\(rawBaseUrl/);
    const prepareStart = chat.indexOf('async function prepareChatContext(');
    const actionStart = chat.indexOf('export async function chatAskAction(');
    const prepare = chat.slice(prepareStart, actionStart);
    assert.ok(prepare.indexOf('if (!isAIConfigured())') >= 0);
    assert.ok(prepare.indexOf('if (!isAIConfigured())') < prepare.indexOf('reserveChatQuota('));
  });
  check('unsupported incomplete and refused output is fail-soft across text and vision', () => {
    assert.match(ai, /function isUsableAIOutput\(/);
    assert.match(ai, /finishReason: 'refused'/);
    assert.match(ai, /d\.status === 'incomplete'/);
    assert.equal((ai.match(/parseChatCompletionsOutput\(data\)/g) || []).length, 2);
    assert.equal((ai.match(/const second = await attempt\(/g) || []).length, 2);
    assert.doesNotMatch(ai, /console\.(?:log|error)\([^;]*(?:res\.json|res\.text|response\.body|rawBody|data)/s);
  });
  check('provider diagnostics do not include credentials', () => {
    assert.match(ai, /hostname: providerCheck\.hostname/);
    assert.doesNotMatch(ai, /console\.(?:log|error).*apiKey/);
    assert.doesNotMatch(ai, /console\.(?:log|error).*Authorization/);
  });
  check('payloads redact and expose coverage', () => {
    assert.match(governance, /sanitizeSerializableAIValue/);
    assert.match(governance, /coverageLabel/);
    assert.match(governance, /prefix exceeded/);
    assert.match(summary, /buildAIPayload/);
    assert.match(summary, /boundedPrompt\.coverageMeta/);
    assert.match(actions, /payloadCoverage\?: AIPayloadCoverage/);
  });
  check('prompt injection is detected at server boundaries', () => {
    assert.match(governance, /detectPromptInjection/);
    assert.match(chat, /detectPromptInjection\(question\)/);
    assert.match(chat, /detectPromptInjection\(message\.text\)/);
    assert.match(actions, /detectPromptInjection\(rawNotesSummary\)/);
  });
  check('manager semantic context uses pseudonyms, not employee names', () => {
    assert.match(chat, /toAIPseudonym\(emp\.id, emp\.employeeCode\)/);
    assert.match(context, /toAIPseudonym\(u\.id, u\.employeeCode\)/);
    assert.doesNotMatch(context, /different_team[\s\S]{0,220}u\.name/);
  });
  check('single result action resolves authoritative server data', () => {
    assert.match(actions, /evaluation_periods/);
    assert.match(actions, /getUsersAdmin\(auth\.user\)/);
    assert.match(actions, /getEvaluationsByPeriodAdmin\(period\.id, auth\.user\)/);
    assert.match(actions, /employee\.employeeCode/);
    assert.doesNotMatch(actions, /const prompt = buildResultPrompt\(input\)/);
  });
  check('batch path is requester-scoped and preserves per-row errors', () => {
    assert.match(actions, /getUsersAdmin\(auth\.user\)/);
    assert.match(actions, /return \{ evaluationId: ev\.id, ok: false, error:/);
    assert.match(actions, /payloadCoverage: bounded\.coverageMeta/);
    assert.match(batchUi, /item\.error/);
    assert.match(batchUi, /item\.coverageLabel/);
  });
  check('screenshot and chat history remain bounded', () => {
    assert.match(chat, /MAX_AI_IMAGE_BASE64_CHARS/);
    assert.match(chat, /sanitizeAIHistory/);
    assert.match(chat, /MAX_AI_REPORT_HISTORY_CHARS/);
  });
  check('partial result disclosure reaches every relevant UI', () => {
    assert.match(summaryUi, /coverageLabel/);
    assert.match(minutesUi, /payloadCoverage\?\.truncated/);
    assert.match(batchUi, /Phạm vi AI/);
    assert.match(prompts, /PHẠM VI DỮ LIỆU/);
  });
  check('tests are deterministic and contain no live provider target', () => {
    const unit = read('tests/ai-governance.test.ts');
    assert.match(unit, /buildAIPayload/);
    assert.match(unit, /validateAIProvider/);
    assert.doesNotMatch(unit, /AI_API_KEY\s*=/);
    assert.doesNotMatch(unit, /fetch\s*\(/);
  });

  return {
    name: 'ai-governance-flow',
    mode: 'source-contract-synthetic',
    tier: 'source-contract',
    status: 'EXECUTED',
    authenticated: false,
    cases,
    real: true,
    passed: true,
    target: 'real-local-source-contract-synthetic',
    production_mutation: 'NONE',
    real_model_calls: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then((result) => {
    console.log(`AI_GOVERNANCE_FLOW PASS cases=${result.cases.length} mode=${result.mode}`);
  }).catch((error) => {
    console.error(`AI_GOVERNANCE_FLOW FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
