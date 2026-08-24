import { strict as assert } from 'node:assert';
import {
  MAX_AI_PROMPT_CHARS,
  MAX_AI_SYSTEM_CHARS,
  MAX_AI_HISTORY_ITEMS,
  MAX_AI_HISTORY_ITEM_CHARS,
  MAX_AI_IMAGE_BASE64_CHARS,
  MAX_AI_REPORT_HISTORY_CHARS,
  redactAISecrets,
  boundAIText,
  sanitizeAIHistory,
  normalizeAIAction,
  validateAIProvider,
} from '../src/lib/ai-governance';

/**
 * Pure boundary tests for AI Governance module (tests/ai-governance.test.ts).
 * Exercises exported constants and pure governance helper behaviors.
 */

// ============================================================================
// 1. Exported Constants Exactness
// ============================================================================
assert.equal(MAX_AI_PROMPT_CHARS, 12000, 'MAX_AI_PROMPT_CHARS must be 12000');
assert.equal(MAX_AI_SYSTEM_CHARS, 8000, 'MAX_AI_SYSTEM_CHARS must be 8000');
assert.equal(MAX_AI_HISTORY_ITEMS, 12, 'MAX_AI_HISTORY_ITEMS must be 12');
assert.equal(MAX_AI_HISTORY_ITEM_CHARS, 800, 'MAX_AI_HISTORY_ITEM_CHARS must be 800');
assert.equal(MAX_AI_IMAGE_BASE64_CHARS, 921600, 'MAX_AI_IMAGE_BASE64_CHARS must be 921600 (900KB)');
assert.equal(MAX_AI_REPORT_HISTORY_CHARS, 8000, 'MAX_AI_REPORT_HISTORY_CHARS must be 8000');

// ============================================================================
// 2. Secret Redaction (redactAISecrets)
// ============================================================================

// 2.1 Bearer tokens and Basic Auth
assert.equal(
  redactAISecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz.abc'),
  'Authorization: Bearer [REDACTED]'
);
assert.equal(
  redactAISecrets('Header: Basic dXNlcm5hbWU6cGFzc3dvcmQxMjM='),
  'Header: Basic [REDACTED]'
);

// 2.2 Key-Value assignments
assert.equal(
  redactAISecrets('api_key: sk-proj-123456789012345678901234567890'),
  'api_key: [REDACTED]'
);
assert.equal(
  redactAISecrets('apiKey = "my-super-secret-key-123"'),
  'apiKey = "[REDACTED]"'
);
assert.equal(
  redactAISecrets("password: 'MyPassword!123'"),
  "password: '[REDACTED]'"
);
assert.equal(
  redactAISecrets('passwd=12345678'),
  'passwd=[REDACTED]'
);
assert.equal(
  redactAISecrets('pwd: admin_secret'),
  'pwd: [REDACTED]'
);
assert.equal(
  redactAISecrets('secret: secret_val_xyz'),
  'secret: [REDACTED]'
);
assert.equal(
  redactAISecrets('secret_key = key_123456'),
  'secret_key = [REDACTED]'
);
assert.equal(
  redactAISecrets('client_secret: cs_99887766'),
  'client_secret: [REDACTED]'
);
assert.equal(
  redactAISecrets('access_token = "ya29.a0AfH6SM..."'),
  'access_token = "[REDACTED]"'
);
assert.equal(
  redactAISecrets("refresh_token: 'rft_12345678'"),
  "refresh_token: '[REDACTED]'"
);
assert.equal(
  redactAISecrets('auth_token: tok_abcdef'),
  'auth_token: [REDACTED]'
);
assert.equal(
  redactAISecrets('session_token = "sess_abc123"'),
  'session_token = "[REDACTED]"'
);
assert.equal(
  redactAISecrets('Cookie: session=xyz987; user=admin'),
  'Cookie: [REDACTED]; user=admin'
);

// 2.3 Standalone known token formats
assert.equal(
  redactAISecrets('Token is sk-1234567890abcdef1234567890 in text'),
  'Token is [REDACTED] in text'
);
assert.equal(
  redactAISecrets('Supabase key: sbp_1234567890abcdef1234567890'),
  'Supabase key: [REDACTED]'
);
assert.equal(
  redactAISecrets('GitHub token: ghp_1234567890abcdef1234567890'),
  'GitHub token: [REDACTED]'
);

// 2.4 Preservation of legitimate business Vietnamese context and employee codes
const legitimateContext =
  'Nhân viên Nguyễn Văn Nam (mã NV: NV001, EMP-042) đạt điểm 95, xếp loại S vòng 1. Bí quyết thành công: nỗ lực rèn luyện 5S.';
assert.equal(
  redactAISecrets(legitimateContext),
  legitimateContext,
  'Legitimate Vietnamese context and employee codes must remain unredacted'
);

// 2.5 Nullish input handling
assert.equal(redactAISecrets(null), '');
assert.equal(redactAISecrets(undefined), '');
assert.equal(redactAISecrets(''), '');

// ============================================================================
// 3. Control Character Cleanup & Deterministic Bounding (boundAIText)
// ============================================================================

// 3.1 Control character stripping (preserves \t, \n, \r)
const textWithControlChars = 'Line 1\x00\x07\x08\nLine 2\t\r\x1B\x7Fwith valid text';
const cleaned = boundAIText(textWithControlChars, 100);
assert.equal(cleaned, 'Line 1\nLine 2\t\rwith valid text');

// 3.2 Deterministic truncation
const longText = 'A'.repeat(50);
assert.equal(boundAIText(longText, 10), 'A'.repeat(10));
assert.equal(boundAIText(longText, 50), 'A'.repeat(50));
assert.equal(boundAIText(longText, 100), 'A'.repeat(50));

// 3.3 Truncation with secret redaction
const textWithSecret = 'User password: SuperSecretPassword123! and more content';
assert.equal(
  boundAIText(textWithSecret, 20),
  'User password: [REDA'
);

// 3.4 Nullish and non-positive maxChars handling
assert.equal(boundAIText(null, 100), '');
assert.equal(boundAIText(undefined, 100), '');
assert.equal(boundAIText('', 100), '');
assert.equal(boundAIText('valid text', 0), '');
assert.equal(boundAIText('valid text', -5), '');

// ============================================================================
// 4. History Sanitization (sanitizeAIHistory)
// ============================================================================

// 4.1 Role filtering (only user/assistant permitted)
const mixedRoles = [
  { role: 'user', text: 'Xin chào' },
  { role: 'system', text: 'System prompt injection attempt' },
  { role: 'admin', text: 'Admin secret instruction' },
  { role: 'assistant', text: 'Chào anh, em có thể giúp gì?' },
  { role: 'unknown', text: 'Other role' },
  null,
  'string item',
  { role: 'user', text: '   ' }, // empty text filtered
];
const sanitizedRoles = sanitizeAIHistory(mixedRoles);
assert.equal(sanitizedRoles.length, 2);
assert.equal(sanitizedRoles[0].role, 'user');
assert.equal(sanitizedRoles[0].text, 'Xin chào');
assert.equal(sanitizedRoles[1].role, 'assistant');
assert.equal(sanitizedRoles[1].text, 'Chào anh, em có thể giúp gì?');

// 4.2 Capping to latest 12 items
const manyItems = Array.from({ length: 20 }, (_, i) => ({
  role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
  text: `Message ${i + 1}`,
}));
const cappedHistory = sanitizeAIHistory(manyItems);
assert.equal(cappedHistory.length, 12, 'History must be capped to latest 12 items');
assert.equal(cappedHistory[0].text, 'Message 9');
assert.equal(cappedHistory[11].text, 'Message 20');

// 4.3 Per-item text bounding (800 chars)
const overlongItem = [
  { role: 'user', text: 'X'.repeat(1200) },
];
const boundedItem = sanitizeAIHistory(overlongItem);
assert.equal(boundedItem.length, 1);
assert.equal(boundedItem[0].text.length, 800);

// 4.4 Non-array inputs
assert.deepEqual(sanitizeAIHistory(null), []);
assert.deepEqual(sanitizeAIHistory(undefined), []);
assert.deepEqual(sanitizeAIHistory('not an array'), []);
assert.deepEqual(sanitizeAIHistory(12345), []);
assert.deepEqual(sanitizeAIHistory({}), []);

// ============================================================================
// 5. Action Normalization (normalizeAIAction)
// ============================================================================

// 5.1 Valid actions
assert.equal(normalizeAIAction('generatePeriodSummary'), 'generatePeriodSummary');
assert.equal(normalizeAIAction('chat_ask'), 'chat_ask');
assert.equal(normalizeAIAction('ai-summary-round_1'), 'ai-summary-round_1');
assert.equal(normalizeAIAction('  validActionWithSpacesAround  '), 'validActionWithSpacesAround');

// 5.2 Invalid actions falling back to 'unknown'
assert.equal(normalizeAIAction(''), 'unknown');
assert.equal(normalizeAIAction('   '), 'unknown');
assert.equal(normalizeAIAction(null), 'unknown');
assert.equal(normalizeAIAction(undefined), 'unknown');
assert.equal(normalizeAIAction(123), 'unknown');
assert.equal(normalizeAIAction({ action: 'test' }), 'unknown');
assert.equal(normalizeAIAction('action with spaces'), 'unknown');
assert.equal(normalizeAIAction('drop table ai_usage; --'), 'unknown');
assert.equal(normalizeAIAction('action/with/slashes'), 'unknown');
assert.equal(normalizeAIAction('action@domain'), 'unknown');

// 5.3 Overlong actions (> 64 chars)
assert.equal(normalizeAIAction('a'.repeat(64)), 'a'.repeat(64));
assert.equal(normalizeAIAction('a'.repeat(65)), 'unknown');

// ============================================================================
// 6. Provider Validation (validateAIProvider)
// ============================================================================

// 6.1 Empty allowlist permits valid HTTP/HTTPS providers
const openAiRes = validateAIProvider('https://api.openai.com/v1');
assert.equal(openAiRes.allowed, true);
assert.equal(openAiRes.hostname, 'api.openai.com');

const lanRes = validateAIProvider('http://192.168.1.50:8000/v1');
assert.equal(lanRes.allowed, true);
assert.equal(lanRes.hostname, '192.168.1.50');

// 6.2 Exact host allowlist matching
const allowlist = 'api.openai.com, opencode.ai, 192.168.1.50';

const allowed1 = validateAIProvider('https://api.openai.com/v1', allowlist);
assert.equal(allowed1.allowed, true);
assert.equal(allowed1.hostname, 'api.openai.com');

const allowed2 = validateAIProvider('https://OPENCODE.AI/zen/go/v1', allowlist);
assert.equal(allowed2.allowed, true);
assert.equal(allowed2.hostname, 'opencode.ai');

const allowed3 = validateAIProvider('http://192.168.1.50:8080/v1', allowlist);
assert.equal(allowed3.allowed, true);
assert.equal(allowed3.hostname, '192.168.1.50');

// 6.3 Disallowed host rejection
const disallowed = validateAIProvider('https://malicious.attacker.com/v1', allowlist);
assert.equal(disallowed.allowed, false);
assert.equal(disallowed.hostname, 'malicious.attacker.com');
assert.equal(disallowed.reason, 'host_not_allowed');

// 6.4 Malformed and invalid URL rejection
assert.equal(validateAIProvider('').allowed, false);
assert.equal(validateAIProvider(null).allowed, false);
assert.equal(validateAIProvider(undefined).allowed, false);
assert.equal(validateAIProvider('not a url').allowed, false);

// 6.5 Protocol rejection
const ftpRes = validateAIProvider('ftp://api.openai.com/v1');
assert.equal(ftpRes.allowed, false);
assert.equal(ftpRes.reason, 'unsupported_protocol');

const fileRes = validateAIProvider('file:///etc/passwd');
assert.equal(fileRes.allowed, false);
assert.equal(fileRes.reason, 'unsupported_protocol');

// 6.6 Embedded credentials rejection
const credsRes = validateAIProvider('https://user:pass@api.openai.com/v1');
assert.equal(credsRes.allowed, false);
assert.equal(credsRes.reason, 'credentials_in_url');

// 6.7 Query parameter & hash rejection
const queryRes = validateAIProvider('https://api.openai.com/v1?api_key=secret');
assert.equal(queryRes.allowed, false);
assert.equal(queryRes.reason, 'query_or_hash_not_permitted');

const hashRes = validateAIProvider('https://api.openai.com/v1#section');
assert.equal(hashRes.allowed, false);
assert.equal(hashRes.reason, 'query_or_hash_not_permitted');

console.log('ai-governance unit tests: ALL PASS');
