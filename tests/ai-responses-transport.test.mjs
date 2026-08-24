import { strict as assert } from 'node:assert';
import fs from 'node:fs';

/**
 * Regression test P92T03 — bounded provider transport fix (src/lib/ai.ts).
 *
 * Scope under test: gpt-5.6-luna text chat must use the OpenCode Go Responses API
 * (`${baseUrl}/responses` + `input` + `max_output_tokens`), while non-Luna chat models
 * and the vision flow stay on `${baseUrl}/chat/completions` (`messages` + `max_tokens`).
 * No model/config/prompt/RBAC/DB changes, no fallback model, no secret/prompt logging.
 *
 * Why static contract (read-only over the source bytes):
 * - run-tests.mjs executes *.test.mjs with plain `node` (no tsc, no alias loader).
 * - src/lib/ai.ts imports 'server-only' (not resolvable in node_modules) and the
 *   `@/lib/ai-governance` alias (only resolvable via the .test.ts tsc path), so a
 *   mocked-fetch import test is impractical for .mjs in this harness.
 * - Deterministic, zero network, prints no source, no secrets, no raw prompts.
 */

const AI_SRC = fs.readFileSync(new URL('../src/lib/ai.ts', import.meta.url), 'utf8');

// ---------------------------------------------------------------- transport separation
// gpt-5.6-luna → POST ${baseUrl}/responses (exactly once); all other chat + vision keep
// ${baseUrl}/chat/completions (exactly twice: non-Luna text branch + callAIVision).
assert.equal(
  (AI_SRC.match(/\$\{baseUrl\}\/responses/g) || []).length,
  1,
  'gpt-5.6-luna text path must POST ${baseUrl}/responses exactly once'
);
assert.equal(
  (AI_SRC.match(/\$\{baseUrl\}\/chat\/completions/g) || []).length,
  2,
  '${baseUrl}/chat/completions must remain for non-Luna text + vision (exactly 2)'
);
assert.ok(
  AI_SRC.includes("const useResponses = model === 'gpt-5.6-luna';"),
  'routing must key ONLY on the gpt-5.6-luna model (no provider/model fallback)'
);
assert.ok(
  AI_SRC.includes('const endpoint = useResponses ? `${baseUrl}/responses` : `${baseUrl}/chat/completions`;'),
  'transport must branch per-model between /responses and /chat/completions'
);

// ---------------------------------------------------------------- payload contracts
// Responses path: input[] with input_text parts, max_output_tokens, no messages[]/max_tokens.
assert.equal((AI_SRC.match(/\binput: \[/g) || []).length, 1, 'input[] must exist only in the Responses path');
assert.equal((AI_SRC.match(/\bmessages: \[/g) || []).length, 2, 'messages[] must exist only in chat-completions paths');
assert.ok(AI_SRC.includes('max_output_tokens: maxTokens,'), 'Responses path must use max_output_tokens');
assert.ok(
  AI_SRC.includes("content: [{ type: 'input_text', text: systemContent }]"),
  'Responses system message must use input_text content part'
);
assert.ok(
  AI_SRC.includes("content: [{ type: 'input_text', text: boundedPrompt }]"),
  'Responses user message must use input_text content part'
);
// temperature is unsupported on the Responses path: it may only appear in the two
// chat-completions branches (non-Luna text + vision). Exactly 2 "temperature" lines allowed.
const temperatureLines = AI_SRC.split('\n').filter((line) => line.trim().startsWith('temperature:'));
assert.equal(
  temperatureLines.length,
  2,
  'temperature must NOT be sent to the Responses path (only non-Luna chat + vision keep it)'
);
assert.ok(
  temperatureLines.every((line) => line.trim().startsWith('temperature:')),
  'temperature occurrences must be payload fields, not comments'
);
// chat-completions path keeps messages/max_tokens contract.
assert.ok(AI_SRC.includes('max_tokens: maxTokens,'), 'chat-completions path must keep max_tokens');
assert.ok(
  AI_SRC.includes('temperature: opts.temperature ?? 0.3,'),
  'non-Luna text path must keep the existing temperature default'
);

// ---------------------------------------------------------------- response parsing
assert.ok(
  AI_SRC.includes('function parseResponsesOutput('),
  'Responses parser must be a dedicated function'
);
assert.ok(
  AI_SRC.includes('const topLevelText = d.output_text;'),
  'Responses parser must accept top-level data.output_text'
);
assert.ok(
  AI_SRC.includes("part.type !== 'output_text' && part.type !== 'text'"),
  'Responses parser must fall back to output[].content[].output_text/text parts'
);
assert.ok(
  AI_SRC.includes('typeof text === \'string\' && text.trim()'),
  'blank/malformed Responses text must be treated as null'
);
assert.ok(
  AI_SRC.includes("d.incomplete_details?.reason === 'max_output_tokens' ? 'length' : 'incomplete'"),
  'max_output_tokens truncation must map to finishReason "length" so the existing retry fires'
);
assert.ok(
  AI_SRC.includes('function parseChatCompletionsOutput('),
  'chat-completions parser must stay intact'
);
assert.ok(
  AI_SRC.includes('const choice = d?.choices?.[0];'),
  'chat-completions parser must keep choices[0] extraction'
);
assert.ok(
  AI_SRC.includes('choice?.message?.content'),
  'chat-completions parser must keep message.content extraction'
);

// ---------------------------------------------------------------- bounded retry + fail-soft
assert.ok(
  AI_SRC.includes("Math.max(2500, maxTokens * 2)"),
  'retry must keep the existing doubled-token bound'
);
assert.ok(
  AI_SRC.includes("' TRẢ LỜI NGẮN GỌN TỐI ĐA 8 CÂU, KHÔNG PHÂN TÍCH.'"),
  'retry must keep the existing short-answer directive (prompt unchanged)'
);
assert.equal(
  (AI_SRC.match(/const second = await attempt\(/g) || []).length,
  2,
  'bounded single retry must be preserved in both callAI and callAIVision'
);
assert.ok(
  AI_SRC.includes("if (first?.content && first.finishReason !== 'length')"),
  'first-attempt gate must stay finishReason-aware'
);
assert.ok(
  AI_SRC.includes("if (second?.content && second.finishReason !== 'length')"),
  'second-attempt gate must stay finishReason-aware'
);
assert.ok(
  AI_SRC.includes('setTimeout(() => controller.abort(), 45000)'),
  'callAI timeout (45s AbortController) must be preserved'
);
assert.ok(
  AI_SRC.includes('setTimeout(() => controller.abort(), 60000)'),
  'callAIVision timeout (60s AbortController) must be preserved'
);
// ---------------------------------------------------------------- guaranteed timer cleanup
// Regression: clearTimeout(timer) used to sit after await fetch, so an early fetch throw left
// the 45/60s AbortController timer scheduled. Both attempt functions must now clear in a finally
// block — exactly two finally blocks clear timer, and no clearTimeout survives outside one.
assert.equal(
  (AI_SRC.match(/clearTimeout\(timer\)/g) || []).length,
  2,
  'clearTimeout(timer) must exist exactly twice — once per attempt function (callAI + callAIVision)'
);
assert.equal(
  (AI_SRC.match(/finally\s*\{\s*clearTimeout\(timer\);\s*\}/g) || []).length,
  2,
  'both attempt functions must guarantee timer cleanup via finally (runs even when fetch throws)'
);
assert.ok(
  (AI_SRC.match(/return null;/g) || []).length >= 6,
  'fail-soft: every failure path must return null'
);

// ---------------------------------------------------------------- no secret / no raw prompt logging
assert.ok(!AI_SRC.includes('console.log'), 'source must not log prompts or keys via console.log');
const errorBlocks = [...AI_SRC.matchAll(/console\.error\([^;]+?\);/g)].map((m) => m[0]);
assert.ok(errorBlocks.length >= 6, 'expected the existing console.error blocks to still exist');
for (const block of errorBlocks) {
  assert.ok(
    !/(apiKey|boundedPrompt|boundedSystem|systemContent|Authorization)/.test(block),
    `console.error block must not leak secrets or prompts: ${block.slice(0, 60)}...`
  );
}

// ---------------------------------------------------------------- no model/config/prompt drift
assert.ok(
  AI_SRC.includes("const DEFAULT_MODEL = 'gpt-5.6-luna';"),
  'production text model must remain gpt-5.6-luna'
);
assert.ok(
  AI_SRC.includes("const DEFAULT_VISION_MODEL = 'qwen3.7-plus';"),
  'vision model must remain qwen3.7-plus'
);
assert.equal(
  (AI_SRC.match(/process\.env\.AI_BASE_URL \|\| 'https:\/\/api\.openai\.com\/v1'/g) || []).length,
  2,
  'AI_BASE_URL default must be untouched in both callAI and callAIVision'
);
assert.ok(
  AI_SRC.includes('const model = process.env.AI_VISION_MODEL || DEFAULT_VISION_MODEL;'),
  'vision model resolution must be untouched'
);
assert.ok(
  AI_SRC.includes('Bạn là trợ lý phân tích dữ liệu đánh giá QAQC, trả lời ngắn gọn bằng tiếng Việt. TRẢ LỜI TRỰC TIẾP NỘI DUNG, KHÔNG suy luận dài dòng.'),
  'default system prompt must be unchanged'
);
assert.equal(
  (AI_SRC.match(/boundAIText\(prompt, MAX_AI_PROMPT_CHARS\)/g) || []).length,
  2,
  'prompt bounding must be preserved in callAI and callAIVision'
);
assert.ok(
  AI_SRC.includes('boundAIText(boundedSystem + extraSystem, MAX_AI_SYSTEM_CHARS)'),
  'bounded system + bounded retry directive must be preserved'
);
assert.ok(
  AI_SRC.includes("{ type: 'image_url', image_url: { url: dataUrl } }"),
  'vision image payload must be untouched'
);
// No provider fallback: every model-like literal must be one of the pre-existing ones.
const KNOWN_MODEL_LITERALS = new Set(['gpt-5.6-luna', 'gpt-4o-mini', 'deepseek-v4-flash', 'qwen3.7-plus']);
const modelLike = [...AI_SRC.matchAll(/\b(?:gpt|qwen|deepseek|claude|gemini|o[0-9])[a-z0-9._-]*/gi)].map((m) =>
  m[0].toLowerCase()
);
for (const m of modelLike) {
  assert.ok(KNOWN_MODEL_LITERALS.has(m), `unexpected model literal appeared (fallback added?): ${m}`);
}

console.log('✅ AI responses transport regression test PASS');