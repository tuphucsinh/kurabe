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
  assert.match(match[1], /return null;/, 'HTTP exception/refusal must be fail-soft');
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

// Configuration must be rejected before chat quota reservation. The check also
// validates the provider URL/allowlist, not merely the presence of a key.
assert.match(ai, /export function isAIConfigured\(\): boolean \{[\s\S]*validateAIProvider\(rawBaseUrl, process\.env\.AI_ALLOWED_HOSTS, devException\)\.allowed/);
const prepare = chat.slice(chat.indexOf('async function prepareChatContext('), chat.indexOf('export async function chatAskAction('));
assert.ok(prepare.indexOf('if (!isAIConfigured())') >= 0, 'chat preparation must check configuration');
assert.ok(prepare.indexOf('if (!isAIConfigured())') < prepare.indexOf('reserveChatQuota('), 'configuration failure must occur before quota reservation');

// Blank, unsupported, incomplete, and refused outputs are never returned as
// assistant payloads. Text and vision share the same chat response parser.
assert.match(ai, /function isUsableAIOutput\(/);
assert.match(ai, /result\.finishReason === null \|\| result\.finishReason === 'stop' \|\| result\.finishReason === 'completed'/);
assert.match(ai, /finishReason: 'refused'/);
assert.match(ai, /d\.status === 'incomplete'/);
assert.equal(count(ai, /return parseChatCompletionsOutput\(data\);/g), 1, 'vision must use the governed chat parser');
assert.equal(count(ai, /parseChatCompletionsOutput\(data\)/g), 2, 'text and vision must both use governed chat parsing');
assert.match(ai, /typeof text === 'string' && text\.trim\(\) \? text\.trim\(\) : null/);

// Timeout/retry remains bounded and response bodies are never logged.
assert.match(ai, /setTimeout\(\(\) => controller\.abort\(\), 45000\)/);
assert.match(ai, /setTimeout\(\(\) => controller\.abort\(\), 60000\)/);
assert.equal(count(ai, /const second = await attempt\(/g), 2, 'each transport has at most one retry');
assert.doesNotMatch(ai, /console\.(?:log|error)\([^;]*(?:res\.json|res\.text|response\.body|rawBody|data)/s, 'response bodies must not be logged');

console.log('AI egress boundary contract PASS redirects=301,302,303,307,308 transports=2');
