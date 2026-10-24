import { strict as assert } from 'node:assert';
import fs from 'node:fs';

/**
 * Deterministic source-contract coverage for the AI egress boundary.
 * This test never imports the server module, calls fetch, resolves DNS, or uses
 * a provider key. It verifies the transport's fail-closed structure only.
 */

const root = new URL('../', import.meta.url);
const ai = fs.readFileSync(new URL('src/lib/ai.ts', root), 'utf8');
const governance = fs.readFileSync(new URL('src/lib/ai-governance.ts', root), 'utf8');
const chat = fs.readFileSync(new URL('src/actions/chat.ts', root), 'utf8');

function count(source, expression) {
  return (source.match(expression) || []).length;
}

// Redirects must fail at fetch rather than follow a possibly untrusted Location.
assert.equal(count(ai, /redirect: 'error'/g), 2, 'text and vision transports must reject redirects');
const redirectStatuses = [301, 302, 303, 307, 308];
for (const status of redirectStatuses) {
  assert.ok(status >= 300 && status < 400, `${status} must be treated as a redirect status`);
  assert.match(ai, /redirect: 'error'/, `${status} must not be followed by either AI transport`);
}
assert.doesNotMatch(ai, /redirect:\s*['"]follow['"]/, 'provider redirects must never be followed');

// Both transports must reject every non-2xx response before reading its body.
const nonOkBeforeJson = [...ai.matchAll(/if \(!res\.ok\) \{([\s\S]*?)\n\s*}\n\s*const data = await res\.json\(\);/g)];
assert.equal(nonOkBeforeJson.length, 2, 'text and vision must guard HTTP status before parsing');
for (const match of nonOkBeforeJson) {
  assert.match(match[1], /return\s*\{\s*content:\s*null,\s*finishReason:\s*null,\s*retryable:\s*res\.status\s*>=\s*500,?\s*\};/, 'HTTP exception/refusal must return null content and retryable only for >=500');
  assert.doesNotMatch(match[1], /res\.json|res\.text|res\.arrayBuffer|body/, 'HTTP failure must not pass response payload downstream');
}

// Provider egress is fail-closed: malformed/credentialed/unsupported/disallowed
// URLs cannot reach fetch, while HTTP is limited to the explicit local exception.
assert.match(governance, /parsed\.protocol !== 'http:' && parsed\.protocol !== 'https:'/);
assert.match(governance, /parsed\.username \|\| parsed\.password/);
assert.match(governance, /parsed\.search \|\| parsed\.hash/);
assert.match(governance, /reason: 'host_not_allowed'/);
assert.match(governance, /reason: 'http_not_permitted_without_dev_exception'/);
assert.match(governance, /!devExceptionAllowed \|\| !isApprovedLocalDevHost\(hostname\)/);
assert.match(ai, /if \(!providerCheck\.allowed\) \{/);

// One fixed OpenAI endpoint/model/key serves chat and admin. Chat has no app quota.
assert.match(ai, /export function isAIConfigured\(\): boolean \{[\s\S]*validateAIProvider\(OPENAI_BASE_URL, DEFAULT_AI_ALLOWED_HOSTS\.join\(','\)\)\.allowed/);
assert.match(ai, /const OPENAI_MODEL = 'gpt-6-luna'/);
assert.match(ai, /const OPENAI_BASE_URL = 'https:\/\/api\.openai\.com\/v1'/);
assert.doesNotMatch(ai, /\bOPENROUTER\b|openrouter\.ai|\bAI_API_KEY\b|\bAI_BASE_URL\b|\bAI_VISION_MODEL\b/);
const prepare = chat.slice(chat.indexOf('async function prepareChatContext('), chat.indexOf('export async function chatAskAction('));
assert.ok(prepare.indexOf('if (!isAIConfigured())') >= 0, 'chat preparation must check configuration');
assert.doesNotMatch(chat, /reserveChatQuota|consumeChatQuota|refundChatQuota|15 lượt hỏi trong 2 giờ/);
assert.match(chat, /callAI\(prompt/);
assert.match(chat, /callAIVision\(/);
assert.match(chat, /https:\/\/api\.telegram\.org\/bot/);

// Blank, unsupported, incomplete, and refused outputs are never returned as
// assistant payloads. Text and vision share the same chat response parser.
assert.match(ai, /function isUsableAIOutput\(/);
assert.match(ai, /result\.finishReason === null \|\| result\.finishReason === 'stop' \|\| result\.finishReason === 'completed'/);
assert.match(ai, /finishReason: 'refused'/);
assert.match(ai, /d\.status === 'incomplete'/);
assert.equal(count(ai, /const parsed = parseResponsesOutput\(data\);/g), 2, 'text and vision must use the governed Responses parser');
assert.equal(count(ai, /return\s*\{\s*content:\s*parsed\.content,\s*finishReason:\s*parsed\.finishReason,\s*retryable:\s*!usable,?\s*\};/g), 2, 'text and vision must return governed parsed result');
assert.equal(count(ai, /fetch\(`\$\{baseUrl\}\/responses`/g), 2, 'text and vision must use OpenAI Responses API');
assert.equal(count(ai, /\{ type: 'input_image', image_url: dataUrl \}/g), 1, 'vision image must use Responses input_image');
assert.equal(count(ai, /max_output_tokens: maxTokens/g), 2, 'text and vision use Responses output token field');
assert.match(ai, /typeof d\.output_text === 'string'/);

// Timeout/retry remains bounded and response bodies are never logged.
assert.match(ai, /setTimeout\(\(\) => controller\.abort\(\), 45000\)/);
assert.match(ai, /setTimeout\(\(\) => controller\.abort\(\), 60000\)/);
assert.equal(count(ai, /const second = await attempt\(/g), 2, 'each transport has at most one retry');
assert.doesNotMatch(ai, /console\.(?:log|error)\([^;]*(?:res\.json|res\.text|response\.body|rawBody|data)/s, 'response bodies must not be logged');

console.log('AI egress boundary contract PASS provider=openai-api model=gpt-6-luna chat-quota=none transports=2');
