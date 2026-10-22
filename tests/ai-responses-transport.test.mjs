import { strict as assert } from 'node:assert';
import fs from 'node:fs';

/** Deterministic source-contract checks: no key access and no provider request. */
const source = fs.readFileSync(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../src/actions/chat.ts', import.meta.url), 'utf8');
const quota = fs.readFileSync(new URL('../src/lib/ai-limit.ts', import.meta.url), 'utf8');

assert.match(source, /const OPENAI_MODEL = 'gpt-6-luna'/);
assert.match(source, /const OPENAI_BASE_URL = 'https:\/\/api\.openai\.com\/v1'/);
assert.match(source, /process\.env\.OPENAI_API_KEY/);
assert.doesNotMatch(source, /\bOPENROUTER\b|openrouter\.ai|\bAI_API_KEY\b|\bAI_BASE_URL\b|\bAI_VISION_MODEL\b|chat\/completions/);
assert.equal((source.match(/fetch\(`\$\{baseUrl\}\/responses`/g) || []).length, 2,
  'text and vision must both use the OpenAI Responses API');
assert.equal((source.match(/max_output_tokens: maxTokens/g) || []).length, 2);
assert.match(source, /type: 'input_text', text: systemContent/);
assert.match(source, /type: 'input_text', text: boundedPrompt/);
assert.match(source, /type: 'input_image', image_url: dataUrl/);
assert.match(source, /function parseResponsesOutput\(/);
assert.match(source, /typeof d\.output_text === 'string'/);
assert.match(source, /const hasRefusal = Array\.isArray\(d\.output\) && d\.output\.some\(/);
const refusalGuard = source.indexOf("if (hasRefusal) return { content: null, finishReason: 'refused' }");
const outputTextParse = source.indexOf('let content = typeof d.output_text');
assert.ok(refusalGuard >= 0 && refusalGuard < outputTextParse,
  'refusal parts must be rejected before accepting top-level output_text');
assert.match(source, /if \(!content && Array\.isArray\(d\.output\)\)/);
assert.match(source, /item\?\.type !== 'message' \|\| !Array\.isArray\(item\.content\)/);
assert.match(source, /part\?\.type === 'output_text' \|\| part\?\.type === 'text'/);
assert.match(source, /part\?\.type === 'refusal'/);
assert.match(source, /d\.status === 'incomplete'/);
assert.match(source, /d\.incomplete_details\?\.reason === 'max_output_tokens' \? 'length' : 'incomplete'/);
assert.match(source, /finishReason === 'stop' \|\| result\.finishReason === 'completed'/);
assert.match(source, /if \(!result\?\.content\) return false/);
assert.equal((source.match(/const second = await attempt\(/g) || []).length, 2,
  'text and vision retries remain bounded to one retry');
assert.match(source, /Math\.max\(2500, maxTokens \* 2\)/);
assert.equal((source.match(/finishReason !== 'length'/g) || []).length, 4,
  'first and retry outputs must reject truncation on both text and vision paths');
assert.equal((source.match(/redirect: 'error'/g) || []).length, 2);
assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 45000\)/);
assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), 60000\)/);
assert.equal((source.match(/clearTimeout\(timer\)/g) || []).length, 2);
assert.equal((source.match(/finally\s*\{\s*clearTimeout\(timer\);\s*\}/g) || []).length, 2,
  'both transports must clear their timeout on all response/error paths');
assert.match(source, /boundAIText\(prompt, MAX_AI_PROMPT_CHARS\)/);
assert.match(source, /imageBase64\.length > MAX_AI_IMAGE_BASE64_CHARS/);
assert.match(source, /imageBase64\.startsWith\('data:'\)/);
assert.match(source, /const inferredMime = imageBase64\.startsWith\('iVBORw0KGgo'\) \? 'image\/png' : 'image\/jpeg'/);
assert.match(source, /`data:\$\{inferredMime\};base64,\$\{imageBase64\}`/);
assert.match(source, /if \(!res\.ok\)/);
assert.doesNotMatch(source, /console\.(?:log|error)\([^;]*(?:apiKey|Authorization|boundedPrompt|response\.body)/s);

assert.match(chat, /callAI\(prompt/);
assert.match(chat, /callAIVision\(/);
assert.match(chat, /chatReportErrorAction/);
assert.match(chat, /api\.telegram\.org\/bot/);
assert.doesNotMatch(chat, /reserveChatQuota|consumeChatQuota|refundChatQuota/);
assert.match(quota, /export async function reserveAiQuota/);
assert.match(quota, /export async function consumeAiQuota/);
assert.match(quota, /export async function refundAiQuota/);
assert.doesNotMatch(quota, /reserveChatQuota|consumeChatQuota|refundChatQuota|CHAT_LIMIT|CHAT_WINDOW_MS/);

console.log('AI Responses transport PASS provider=openai-api model=gpt-6-luna text=responses vision=responses chat-quota=none');