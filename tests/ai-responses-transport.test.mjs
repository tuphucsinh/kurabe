import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

/** Deterministic source-contract checks: no key access and no provider request. */
const source = fs.readFileSync(path.join(projectRoot, 'src/lib/ai.ts'), 'utf8');
const chat = fs.readFileSync(path.join(projectRoot, 'src/actions/chat.ts'), 'utf8');
const quota = fs.readFileSync(path.join(projectRoot, 'src/lib/ai-limit.ts'), 'utf8');

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

// P109M1T05 source-contract checks for retry classification
assert.equal((source.match(/retryable:\s*res\.status\s*>=\s*500/g) || []).length, 2,
  'HTTP 5xx triggers retry on both text and vision, 4xx does not');
assert.equal((source.match(/retryable:\s*!usable/g) || []).length, 2,
  'HTTP 200 incomplete/length/unusable triggers bounded retry on both text and vision');
assert.equal((source.match(/retryable:\s*false/g) || []).length, 2,
  'network throw or timeout abort is non-retryable on both text and vision');
assert.equal((source.match(/if\s*\(!first\?\.retryable\)\s*return\s*null;/g) || []).length, 2,
  'both text and vision exit immediately when first attempt is non-retryable');

assert.match(chat, /callAI\(prompt/);
assert.match(chat, /callAIVision\(/);
assert.match(chat, /chatReportErrorAction/);
assert.match(chat, /api\.telegram\.org\/bot/);
assert.doesNotMatch(chat, /reserveChatQuota|consumeChatQuota|refundChatQuota/);
assert.match(quota, /export async function reserveAiQuota/);
assert.match(quota, /export async function consumeAiQuota/);
assert.match(quota, /export async function refundAiQuota/);
assert.doesNotMatch(quota, /reserveChatQuota|consumeChatQuota|refundChatQuota|CHAT_LIMIT|CHAT_WINDOW_MS/);

// ============================================================================
// Real transpiled execution of ai.ts with stubs only for imports
// ============================================================================

// 1. Transpile real ai-governance.ts
const govPath = path.join(projectRoot, 'src/lib/ai-governance.ts');
const govSource = fs.readFileSync(govPath, 'utf8');
const govTranspiled = ts.transpileModule(govSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const govModule = { exports: {} };
new Function('exports', 'require', 'module', govTranspiled)(govModule.exports, require, govModule);

// 2. Transpile real ai.ts
const aiPath = path.join(projectRoot, 'src/lib/ai.ts');
const aiSource = fs.readFileSync(aiPath, 'utf8');
const aiTranspiled = ts.transpileModule(aiSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadAiModule() {
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/lib/ai-governance' || id.endsWith('ai-governance')) {
      return govModule.exports;
    }
    return require(id);
  };
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', aiTranspiled);
  fn(mod.exports, customRequire, mod);
  return mod.exports;
}

const ai = loadAiModule();

// ============================================================================
// Fixtures & Harness
// ============================================================================

const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
const savedConsoleError = console.error;

function restoreEnvAndFetch() {
  process.env = { ...savedEnv };
  // Guard against accidental external provider calls
  globalThis.fetch = async (url) => {
    throw new Error(`Unexpected unmocked external network call in test: ${url}`);
  };
  console.error = savedConsoleError;
}

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const DATA_URL = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=';

const usable200 = (text = 'Xin chào, tôi là trợ lý QAQC.') => ({
  status: 200,
  body: {
    status: 'completed',
    output_text: text,
  },
});

const truncated200 = (partial = 'Nội dung bị cắt giữa chừng...') => ({
  status: 200,
  body: {
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
    output_text: partial,
  },
});

const refusal200 = () => ({
  status: 200,
  body: {
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'refusal' }],
      },
    ],
  },
});

const httpError = (status) => ({
  status,
  body: {
    error: {
      message: `Error status ${status}`,
      type: 'invalid_request_error',
    },
  },
});

const networkError = () => ({
  error: new TypeError('fetch failed: network connection refused'),
});

const timeoutAbortError = () => {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return { error: err };
};

function withMockFetch(responses, testFn) {
  return async () => {
    process.env.OPENAI_API_KEY = 'sk-synthetic-kurabe-test-key-12345678901234567890';
    const calls = [];
    const loggedErrors = [];
    console.error = (...args) => {
      loggedErrors.push(args);
    };

    globalThis.fetch = async (url, opts) => {
      const idx = calls.length;
      let body = null;
      if (opts?.body) {
        try {
          body = JSON.parse(opts.body);
        } catch {
          body = opts.body;
        }
      }
      calls.push({ url, opts, body });
      const resp = Array.isArray(responses) ? responses[idx] : responses(idx, url, opts);
      if (!resp) {
        throw new Error(`Unexpected fetch call #${idx + 1} to ${url}`);
      }
      if (resp.error) {
        throw resp.error;
      }
      return {
        ok: resp.status >= 200 && resp.status < 300,
        status: resp.status,
        json: async () => resp.body,
      };
    };

    try {
      await testFn({ calls, loggedErrors });
    } finally {
      restoreEnvAndFetch();
    }
  };
}

const testCases = [];
function test(name, fn) {
  testCases.push({ name, fn });
}

// ============================================================================
// TEXT BEHAVIORAL TESTS (callAI)
// ============================================================================

test('text: 200 usable -> 1 request, returns content', withMockFetch(
  [usable200('Kết quả văn bản trực tiếp')],
  async ({ calls }) => {
    const result = await ai.callAI('Xin chào');
    assert.equal(result, 'Kết quả văn bản trực tiếp');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.redirect, 'error');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer sk-synthetic-kurabe-test-key-12345678901234567890');
    assert.equal(calls[0].body.model, 'gpt-6-luna');
    assert.equal(calls[0].body.max_output_tokens, 1500);
  }
));

test('text: 400 -> 1 request, returns null (no retry)', withMockFetch(
  [httpError(400)],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('text: 401 -> 1 request, returns null (no retry)', withMockFetch(
  [httpError(401)],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('text: 403 -> 1 request, returns null (no retry)', withMockFetch(
  [httpError(403)],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('text: 429 -> 1 request, returns null (no retry)', withMockFetch(
  [httpError(429)],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('text: 503 -> 200 -> 2 requests, returns content from 2nd attempt', withMockFetch(
  [httpError(503), usable200('Thành công sau retry 503')],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, 'Thành công sau retry 503');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.max_output_tokens, 1500);
    assert.equal(calls[1].body.max_output_tokens, 3000);
  }
));

test('text: 503 twice -> 2 requests max, returns null', withMockFetch(
  [httpError(503), httpError(503)],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  }
));

test('text: network throw -> 1 request, returns null (no retry)', withMockFetch(
  [networkError()],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('text: timeout/AbortError -> 1 request, returns null (no retry)', withMockFetch(
  [timeoutAbortError()],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('text: truncated -> usable -> 2 requests, returns content from 2nd attempt', withMockFetch(
  [truncated200('Cắt...'), usable200('Nội dung đầy đủ sau retry')],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, 'Nội dung đầy đủ sau retry');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.max_output_tokens, 1500);
    assert.equal(calls[1].body.max_output_tokens, 3000);
  }
));

test('text: truncated twice -> 2 requests max, returns null', withMockFetch(
  [truncated200('Cắt 1'), truncated200('Cắt 2')],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  }
));

// ============================================================================
// VISION BEHAVIORAL TESTS (callAIVision)
// ============================================================================

test('vision: 200 usable -> 1 request, returns content', withMockFetch(
  [usable200('Phân tích ảnh QAQC thành công')],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, 'Phân tích ảnh QAQC thành công');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.redirect, 'error');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer sk-synthetic-kurabe-test-key-12345678901234567890');
    assert.equal(calls[0].body.model, 'gpt-6-luna');
    assert.equal(calls[0].body.max_output_tokens, 500);
  }
));

test('vision: 400 -> 1 request, returns null (no retry)', withMockFetch(
  [httpError(400)],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('vision: 401 -> 1 request, returns null (no retry)', withMockFetch(
  [httpError(401)],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('vision: 403 -> 1 request, returns null (no retry)', withMockFetch(
  [httpError(403)],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('vision: 429 -> 1 request, returns null (no retry)', withMockFetch(
  [httpError(429)],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('vision: 503 -> 200 -> 2 requests, returns content from 2nd attempt', withMockFetch(
  [httpError(503), usable200('Vision phục hồi sau 503')],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, 'Vision phục hồi sau 503');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.max_output_tokens, 500);
    assert.equal(calls[1].body.max_output_tokens, 750);
  }
));

test('vision: 503 twice -> 2 requests max, returns null', withMockFetch(
  [httpError(503), httpError(503)],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  }
));

test('vision: network throw -> 1 request, returns null (no retry)', withMockFetch(
  [networkError()],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('vision: timeout/AbortError -> 1 request, returns null (no retry)', withMockFetch(
  [timeoutAbortError()],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  }
));

test('vision: truncated -> usable -> 2 requests, returns content from 2nd attempt', withMockFetch(
  [truncated200('Cắt...'), usable200('Vision đầy đủ sau retry')],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, 'Vision đầy đủ sau retry');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.max_output_tokens, 500);
    assert.equal(calls[1].body.max_output_tokens, 750);
  }
));

test('vision: truncated twice -> 2 requests max, returns null', withMockFetch(
  [truncated200('Cắt 1'), truncated200('Cắt 2')],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  }
));

// ============================================================================
// VISION MIME INFERENCE & DATA URL PRESERVATION
// ============================================================================

test('vision: PNG raw base64 inferred as image/png data URL', withMockFetch(
  [usable200('PNG checked')],
  async ({ calls }) => {
    const result = await ai.callAIVision('Kiểm tra PNG', PNG_BASE64);
    assert.equal(result, 'PNG checked');
    assert.equal(calls.length, 1);
    const userContent = calls[0].body.input[1].content;
    const imgItem = userContent.find((c) => c.type === 'input_image');
    assert.ok(imgItem, 'image part must be present');
    assert.equal(imgItem.image_url, `data:image/png;base64,${PNG_BASE64}`);
  }
));

test('vision: JPEG raw base64 inferred as image/jpeg data URL', withMockFetch(
  [usable200('JPEG checked')],
  async ({ calls }) => {
    const result = await ai.callAIVision('Kiểm tra JPEG', JPEG_BASE64);
    assert.equal(result, 'JPEG checked');
    assert.equal(calls.length, 1);
    const userContent = calls[0].body.input[1].content;
    const imgItem = userContent.find((c) => c.type === 'input_image');
    assert.ok(imgItem, 'image part must be present');
    assert.equal(imgItem.image_url, `data:image/jpeg;base64,${JPEG_BASE64}`);
  }
));

test('vision: data URL input passed through unchanged', withMockFetch(
  [usable200('data URL checked')],
  async ({ calls }) => {
    const result = await ai.callAIVision('Kiểm tra data URL', DATA_URL);
    assert.equal(result, 'data URL checked');
    assert.equal(calls.length, 1);
    const userContent = calls[0].body.input[1].content;
    const imgItem = userContent.find((c) => c.type === 'input_image');
    assert.ok(imgItem, 'image part must be present');
    assert.equal(imgItem.image_url, DATA_URL);
  }
));

// ============================================================================
// REFUSAL / BOUNDS / GUARDS
// ============================================================================

test('text: refusal 200 response triggers bounded single retry then returns null', withMockFetch(
  [refusal200(), refusal200()],
  async ({ calls }) => {
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  }
));

test('vision: refusal 200 response triggers bounded single retry then returns null', withMockFetch(
  [refusal200(), refusal200()],
  async ({ calls }) => {
    const result = await ai.callAIVision('Xem ảnh', PNG_BASE64);
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  }
));

test('vision: oversized image base64 returns null with 0 fetch calls', withMockFetch(
  [],
  async ({ calls }) => {
    const oversized = 'iVBORw0KGgo' + 'A'.repeat(921600);
    const result = await ai.callAIVision('Xem ảnh', oversized);
    assert.equal(result, null);
    assert.equal(calls.length, 0);
  }
));

test('text: missing OPENAI_API_KEY returns null with 0 fetch calls', withMockFetch(
  [],
  async ({ calls }) => {
    delete process.env.OPENAI_API_KEY;
    const result = await ai.callAI('Câu hỏi');
    assert.equal(result, null);
    assert.equal(calls.length, 0);
  }
));

// ============================================================================
// RUNNER WITH NATIVE-TIMER WATCHDOG
// ============================================================================

const CASE_TIMEOUT_MS = 2000;

async function run() {
  console.log('Running AI Responses transport behavioral test suite...\n');
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of testCases) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Test case timed out after ${CASE_TIMEOUT_MS}ms`));
      }, CASE_TIMEOUT_MS);
    });

    try {
      const casePromise = Promise.resolve().then(() => fn());
      casePromise.catch(() => {});
      await Promise.race([casePromise, timeoutPromise]);
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`[FAIL] ${name}`);
      console.log(`       ${err.message}`);
      failed++;
    } finally {
      clearTimeout(timer);
      restoreEnvAndFetch();
    }
  }

  restoreEnvAndFetch();
  console.log(`\nTest results: ${passed} passed, ${failed} failed (${testCases.length} total)`);
  if (failed > 0) {
    process.exitCode = 1;
    process.exit(1);
  } else {
    console.log('AI Responses transport PASS provider=openai-api model=gpt-6-luna text=responses vision=responses chat-quota=none');
  }
}

// Watchdog for whole suite execution (30s)
const suiteWatchdog = setTimeout(() => {
  console.error('Suite watchdog timeout: execution exceeded 30s');
  process.exit(1);
}, 30000);
suiteWatchdog.unref();

await run();
