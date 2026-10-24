#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

// 1. Transpile ai-governance.ts
const govPath = path.join(projectRoot, 'src/lib/ai-governance.ts');
const govSource = fs.readFileSync(govPath, 'utf8');
const govTranspiled = ts.transpileModule(govSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const govModule = { exports: {} };
new Function('exports', 'require', 'module', govTranspiled)(govModule.exports, require, govModule);

// 2. Transpile chat.ts
const chatPath = path.join(projectRoot, 'src/actions/chat.ts');
const chatSource = fs.readFileSync(chatPath, 'utf8');
const chatTranspiled = ts.transpileModule(chatSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/**
 * Creates an instance of chatReportErrorAction bound to configurable mocks.
 */
function createChatReportHarness(options = {}) {
  const {
    user = { id: 'usr-100', name: 'Nguyen Van A', role: 'Worker', gender: 'Nam' },
    authError = null,
    dbReports = [],
    countError = null,
    insertError = null,
    insertData = undefined,
    isAIConfigured = () => true,
    callAI = async () => 'Tóm tắt sự cố từ AI',
    eventLog = [],
  } = options;

  const mockSupabaseAdmin = {
    from: (table) => {
      assert.equal(table, 'chat_reports');
      let op = null;
      let selectFields = null;
      let selectOpts = null;
      let insertPayload = null;
      let filters = [];

      const queryBuilder = {
        select: (fields, opts) => {
          selectFields = fields;
          selectOpts = opts;
          if (!op) op = 'select';
          return queryBuilder;
        },
        insert: (payload) => {
          op = 'insert';
          insertPayload = payload;
          return queryBuilder;
        },
        eq: (col, val) => {
          filters.push({ type: 'eq', col, val });
          return queryBuilder;
        },
        gte: (col, val) => {
          filters.push({ type: 'gte', col, val });
          return queryBuilder;
        },
        single: () => execute(),
        then: (onFulfilled, onRejected) => execute().then(onFulfilled, onRejected),
      };

      async function execute() {
        if (op === 'select') {
          eventLog.push('db_count_query');
          if (countError) {
            return { count: null, error: countError, data: null };
          }
          let filtered = dbReports.slice();
          for (const f of filters) {
            if (f.type === 'eq') filtered = filtered.filter((r) => r[f.col] === f.val);
            if (f.type === 'gte') filtered = filtered.filter((r) => r[f.col] >= f.val);
          }
          return { count: filtered.length, error: null, data: filtered };
        }

        if (op === 'insert') {
          eventLog.push('db_insert');
          if (insertError) {
            return { data: null, error: insertError };
          }
          if (insertData !== undefined) {
            return { data: insertData, error: null };
          }
          const row = {
            id: 'rep-' + (dbReports.length + 1),
            ...insertPayload,
            created_at: new Date().toISOString(),
          };
          dbReports.push(row);
          return { data: { id: row.id }, error: null };
        }

        throw new Error('Unsupported DB op: ' + op);
      }

      return queryBuilder;
    },
  };

  const customRequire = (id) => {
    if (id === '@/lib/ai-governance') return govModule.exports;
    if (id === '@/lib/auth') {
      return {
        requireRole: async () => ({ user: authError ? null : user, error: authError }),
      };
    }
    if (id === '@/lib/ai') {
      return {
        callAI: async (prompt, opts) => {
          eventLog.push('ai_call');
          return callAI(prompt, opts);
        },
        callAIVision: async () => null,
        isAIConfigured,
      };
    }
    if (id === '@/lib/supabase-admin') {
      return { supabaseAdmin: mockSupabaseAdmin };
    }
    if (id === 'node:fs' || id === 'fs') return fs;
    if (id === 'node:path' || id === 'path') return require('path');
    if (id === 'node:crypto' || id === 'crypto') return require('crypto');
    return {};
  };

  const actionModule = { exports: {} };
  new Function('exports', 'require', 'module', chatTranspiled)(
    actionModule.exports,
    customRequire,
    actionModule
  );

  return {
    chatReportErrorAction: actionModule.exports.chatReportErrorAction,
    dbReports,
    eventLog,
  };
}

// Env & Fetch sandbox helper
const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
const savedSetTimeout = globalThis.setTimeout;
const savedClearTimeout = globalThis.clearTimeout;
const savedAbortSignalTimeout = AbortSignal.timeout;

function setupEnv(overrides = {}) {
  process.env.TELEGRAM_BOT_TOKEN = overrides.TELEGRAM_BOT_TOKEN !== undefined ? overrides.TELEGRAM_BOT_TOKEN : 'test-bot-token';
  process.env.TELEGRAM_HOME_CHANNEL = overrides.TELEGRAM_HOME_CHANNEL !== undefined ? overrides.TELEGRAM_HOME_CHANNEL : '-100987654321';
  process.env.KURABE_WEBHOOK_URL = overrides.KURABE_WEBHOOK_URL !== undefined ? overrides.KURABE_WEBHOOK_URL : 'https://kurabe.test/api/webhook';
  process.env.KURABE_WEBHOOK_SECRET = overrides.KURABE_WEBHOOK_SECRET !== undefined ? overrides.KURABE_WEBHOOK_SECRET : 'webhook-secret-key-123';
  if (!process.env.KURABE_WEBHOOK_URL) delete process.env.KURABE_WEBHOOK_URL;
  if (!process.env.KURABE_WEBHOOK_SECRET) delete process.env.KURABE_WEBHOOK_SECRET;
  if (!process.env.TELEGRAM_BOT_TOKEN) delete process.env.TELEGRAM_BOT_TOKEN;
  if (!process.env.TELEGRAM_HOME_CHANNEL) delete process.env.TELEGRAM_HOME_CHANNEL;
}

function restoreEnvAndFetch() {
  process.env = { ...savedEnv };
  // Guard against accidental external network requests (never contact Telegram)
  globalThis.fetch = async (url) => {
    throw new Error(`Unexpected unmocked external network call in test: ${url}`);
  };
  globalThis.setTimeout = savedSetTimeout;
  globalThis.clearTimeout = savedClearTimeout;
  AbortSignal.timeout = savedAbortSignalTimeout;
}

const testCases = [];
function test(name, fn) {
  testCases.push({ name, fn });
}

// ============================================================================
// TEST CASES
// ============================================================================

test('1. insert + Telegram success: records DB row first and truthfully reports Developer notification sent', async () => {
  setupEnv();
  const fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const { chatReportErrorAction, dbReports } = createChatReportHarness();
  const res = await chatReportErrorAction({
    question: 'Không thể xem chi tiết nhóm',
    pathname: '/teams',
    history: [
      { role: 'user', text: 'Tôi muốn xem nhóm 1' },
      { role: 'assistant', text: 'Nhóm 1 chưa hoàn thành' },
    ],
  });

  assert.equal(typeof res.reply, 'string', 'Should return reply on success');
  assert.ok(res.reply.includes('Developer'), 'Receipt should truthfully state Developer was notified');
  assert.equal(dbReports.length, 1, 'Exactly 1 row must be saved in chat_reports');
  assert.equal(dbReports[0].user_name, 'Nguyen Van A');
  assert.equal(dbReports[0].role, 'Worker');
  assert.equal(dbReports[0].pathname, '/teams');
  assert.equal(dbReports[0].question, 'Không thể xem chi tiết nhóm');
  assert.equal(dbReports[0].user_id, 'usr-100');

  // Verify Telegram fetch
  const tgCall = fetchCalls.find((c) => c.url.includes('api.telegram.org'));
  assert.ok(tgCall, 'Telegram sendMessage must be called');
  assert.equal(tgCall.body.chat_id, '-100987654321');
  assert.ok(tgCall.body.text.includes('Không thể xem chi tiết nhóm'));
  assert.equal(tgCall.body.parse_mode, undefined, 'Telegram payload must omit parse_mode (plain text only)');
});

test('2a. Telegram 400 leaves one saved row and truthful receipt claiming only Kurabe record', async () => {
  setupEnv();
  const fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts, body: JSON.parse(opts.body) });
    if (url.includes('api.telegram.org')) {
      return { ok: false, status: 400, statusText: 'Bad Request' };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const { chatReportErrorAction, dbReports } = createChatReportHarness();
  const res = await chatReportErrorAction({
    question: 'Báo lỗi trang báo cáo',
    pathname: '/reports',
  });

  assert.equal(typeof res.reply, 'string', 'Should return reply receipt, not error');
  assert.ok(
    res.reply.includes('Kurabe') && res.reply.includes('ghi nhận'),
    'Receipt must state report was recorded in Kurabe'
  );
  assert.ok(
    !res.reply.includes('Developer'),
    'Receipt must NEVER claim Developer received notification when Telegram failed'
  );
  assert.equal(dbReports.length, 1, 'DB record must remain preserved');
});

test('2b. Telegram timeout leaves one saved row and truthful receipt', async () => {
  setupEnv();
  globalThis.fetch = async (url) => {
    if (url.includes('api.telegram.org')) {
      const err = new Error('The operation was aborted');
      err.name = 'TimeoutError';
      throw err;
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const { chatReportErrorAction, dbReports } = createChatReportHarness();
  const res = await chatReportErrorAction({
    question: 'Timeout test question',
    pathname: '/evaluations',
  });

  assert.equal(typeof res.reply, 'string', 'Should return reply receipt, not error');
  assert.ok(
    res.reply.includes('Kurabe') && res.reply.includes('ghi nhận'),
    'Receipt must state report was recorded in Kurabe'
  );
  assert.ok(!res.reply.includes('Developer'), 'Receipt must not claim Developer received it on timeout');
  assert.equal(dbReports.length, 1, 'DB record must remain saved');
});

test('2c. Telegram HTTP 200 with { ok: false } produces safe Kurabe receipt and preserves row', async () => {
  setupEnv();
  const fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts, body: JSON.parse(opts.body) });
    if (url.includes('api.telegram.org')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }),
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const { chatReportErrorAction, dbReports } = createChatReportHarness();
  const res = await chatReportErrorAction({
    question: 'Báo lỗi khi Telegram trả về ok: false',
    pathname: '/evaluations',
  });

  assert.equal(typeof res.reply, 'string', 'Should return reply receipt, not error');
  assert.ok(
    res.reply.includes('Kurabe') && res.reply.includes('ghi nhận'),
    'Receipt must state report was recorded in Kurabe'
  );
  assert.ok(
    !res.reply.includes('Developer'),
    'Receipt must NEVER claim Developer received notification when ok is false'
  );
  assert.equal(dbReports.length, 1, 'DB record must remain preserved');
});

test('2d. Telegram HTTP 200 with invalid JSON produces safe Kurabe receipt and preserves row', async () => {
  setupEnv();
  const fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts, body: JSON.parse(opts.body) });
    if (url.includes('api.telegram.org')) {
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const { chatReportErrorAction, dbReports } = createChatReportHarness();
  const res = await chatReportErrorAction({
    question: 'Báo lỗi khi Telegram trả về invalid JSON',
    pathname: '/evaluations',
  });

  assert.equal(typeof res.reply, 'string', 'Should return reply receipt, not error');
  assert.ok(
    res.reply.includes('Kurabe') && res.reply.includes('ghi nhận'),
    'Receipt must state report was recorded in Kurabe'
  );
  assert.ok(
    !res.reply.includes('Developer'),
    'Receipt must NEVER claim Developer received notification when JSON is invalid'
  );
  assert.equal(dbReports.length, 1, 'DB record must remain preserved');
});

test('3a. Supabase insert error means honest failure and no notification sent', async () => {
  setupEnv();
  const fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url });
    return { ok: true, status: 200, json: async () => ({}) };
  };

  let aiCalled = false;
  const { chatReportErrorAction } = createChatReportHarness({
    insertError: new Error('Postgres insert failed: foreign key violation'),
    callAI: async () => {
      aiCalled = true;
      return 'Summary';
    },
  });

  const res = await chatReportErrorAction({
    question: 'Lỗi nút lưu',
    pathname: '/criteria',
  });

  assert.ok(res.error, 'Should return honest error when insert fails');
  assert.equal(res.reply, undefined, 'Must not return success reply');
  assert.equal(aiCalled, false, 'Must not call AI when insert fails');
  assert.equal(fetchCalls.length, 0, 'Must not call webhook or Telegram when insert fails');
});

test('3b. Supabase missing insert id means honest failure and no notification sent', async () => {
  setupEnv();
  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push({ url });
    return { ok: true, status: 200, json: async () => ({}) };
  };

  let aiCalled = false;
  const { chatReportErrorAction } = createChatReportHarness({
    insertData: null, // returns empty row without id
    callAI: async () => {
      aiCalled = true;
      return 'Summary';
    },
  });

  const res = await chatReportErrorAction({
    question: 'Lỗi tải ảnh',
    pathname: '/support',
  });

  assert.ok(res.error, 'Should return honest error when insert id is missing');
  assert.equal(res.reply, undefined, 'Must not return reply');
  assert.equal(aiCalled, false, 'Must not call AI when insert id is missing');
  assert.equal(fetchCalls.length, 0, 'Must not call webhook or Telegram when insert id is missing');
});

test('4. count query error fails closed', async () => {
  setupEnv();
  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push({ url });
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const { chatReportErrorAction, dbReports } = createChatReportHarness({
    countError: new Error('DB connection pool exhausted'),
  });

  const res = await chatReportErrorAction({
    question: 'Báo lỗi khi đếm thất bại',
    pathname: '/dashboard',
  });

  assert.ok(res.error, 'Should fail closed with error when count query fails');
  assert.ok(!res.error.includes('Developer'), 'Error should not leak internals');
  assert.equal(res.reply, undefined, 'Must not return reply');
  assert.equal(dbReports.length, 0, 'Must not insert report when count query fails');
  assert.equal(fetchCalls.length, 0, 'Must not call webhook or Telegram');
});

test('5. AI slow/unavailable preserves inserted row and fallback summary', async () => {
  setupEnv();
  const fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  // Intercept setTimeout to accelerate 6000ms AI timeout to 15ms for fast test execution
  let capturedTimerDelay = null;
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (delay === 6000) {
      capturedTimerDelay = delay;
      return savedSetTimeout(fn, 15, ...args);
    }
    return savedSetTimeout(fn, delay, ...args);
  };

  const history = [
    { role: 'user', text: 'Lượt 1: tôi gặp sự cố' },
    { role: 'assistant', text: 'Lượt 2: em hướng dẫn' },
    { role: 'user', text: 'Lượt 3: vẫn không được' },
    { role: 'assistant', text: 'Lượt 4: thử làm lại' },
    { role: 'user', text: 'Lượt 5: vẫn bị lỗi' },
    { role: 'assistant', text: 'Lượt 6: hãy chụp ảnh' },
  ];

  const { chatReportErrorAction, dbReports } = createChatReportHarness({
    callAI: () => new Promise((resolve) => savedSetTimeout(() => resolve('Chậm trễ quá lâu'), 200)),
  });

  const res = await chatReportErrorAction({
    question: 'Thử nghiệm AI timeout',
    pathname: '/dashboard',
    history,
  });

  assert.equal(capturedTimerDelay, 6000, 'AI summary timer must be bounded to 6000 ms');
  assert.equal(typeof res.reply, 'string');
  assert.equal(dbReports.length, 1, 'DB record must be preserved');

  // Verify that Telegram payload summary contains fallback history turns
  const tgCall = fetchCalls.find((c) => c.url.includes('api.telegram.org'));
  assert.ok(tgCall, 'Telegram should still be called');
  assert.ok(tgCall.body.text.includes('Lượt 5'), 'Fallback summary should include history turns');
});

test('6. webhook absent/fail does not change DB receipt', async () => {
  // Case 6a: Webhook env unset
  setupEnv({ KURABE_WEBHOOK_URL: null, KURABE_WEBHOOK_SECRET: null });
  const fetchCalls = [];
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const { chatReportErrorAction, dbReports } = createChatReportHarness();
  const res = await chatReportErrorAction({
    question: 'Webhook env absent test',
    pathname: '/employees',
  });

  assert.equal(typeof res.reply, 'string', 'Should return reply receipt');
  assert.ok(res.reply.includes('Developer'), 'Telegram succeeded, receipt reflects Developer notice');
  assert.equal(dbReports.length, 1, 'DB row is preserved');
  assert.equal(fetchCalls.some((c) => c.url.includes('api.telegram.org')), true);
  assert.equal(fetchCalls.some((c) => c.url.includes('webhook')), false);

  // Case 6b: Webhook returns 500
  setupEnv();
  globalThis.fetch = async (url) => {
    if (url.includes('webhook')) {
      return { ok: false, status: 500, statusText: 'Internal Server Error' };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const harness2 = createChatReportHarness({
    user: { id: 'usr-101', name: 'Tran Thi C', role: 'Worker', gender: 'Nu' },
  });
  const res2 = await harness2.chatReportErrorAction({
    question: 'Webhook fail 500 test',
    pathname: '/employees',
  });
  assert.equal(typeof res2.reply, 'string', 'Webhook failure should not fail action');
  assert.ok(res2.reply.includes('Developer'), 'Receipt reflects Developer notice');
  assert.equal(harness2.dbReports.length, 1, 'DB row is preserved on webhook failure');
});

test('7. user text containing "_ * [" is sent without parse_mode', async () => {
  setupEnv();
  let telegramBody = null;
  globalThis.fetch = async (url, opts) => {
    if (url.includes('api.telegram.org')) {
      telegramBody = JSON.parse(opts.body);
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const { chatReportErrorAction } = createChatReportHarness();
  const trickyQuestion = 'Test markdown injection: _italic_ *bold* [link](https://evil.com) `code` __underline__';
  const res = await chatReportErrorAction({
    question: trickyQuestion,
    pathname: '/settings',
  });

  assert.equal(typeof res.reply, 'string');
  assert.ok(telegramBody, 'Telegram sendMessage must be called');
  assert.equal(telegramBody.parse_mode, undefined, 'parse_mode MUST be omitted to prevent Telegram 400');
  assert.ok(telegramBody.text.includes(trickyQuestion), 'Question with markdown chars preserved in plain text');
});

test('8. same-day sequential limit still prevents another insert', async () => {
  setupEnv();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  });
  const { chatReportErrorAction, dbReports } = createChatReportHarness();

  // First report: succeeds and inserts
  const res1 = await chatReportErrorAction({
    question: 'Báo lỗi lần 1',
    pathname: '/dashboard',
  });
  assert.equal(typeof res1.reply, 'string');
  assert.equal(dbReports.length, 1, 'First report inserted');

  // Second report by same user today: daily limit prevents insert
  const res2 = await chatReportErrorAction({
    question: 'Báo lỗi lần 2 cùng ngày',
    pathname: '/dashboard',
  });
  assert.ok(
    res2.reply && res2.reply.includes('Hôm nay anh đã gửi báo lỗi rồi'),
    'Should return quota reply'
  );
  assert.equal(dbReports.length, 1, 'DB must still contain only 1 row (no second insert)');
});

test('9. verify insert event precedes AI/webhook/Telegram', async () => {
  setupEnv();
  const eventTimeline = [];
  globalThis.fetch = async (url) => {
    if (url.includes('webhook')) {
      eventTimeline.push('webhook_fetch');
    } else if (url.includes('api.telegram.org')) {
      eventTimeline.push('telegram_fetch');
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const { chatReportErrorAction } = createChatReportHarness({
    eventLog: eventTimeline,
  });

  await chatReportErrorAction({
    question: 'Kiểm tra thứ tự thực thi',
    pathname: '/evaluations',
  });

  const idxInsert = eventTimeline.indexOf('db_insert');
  const idxAi = eventTimeline.indexOf('ai_call');
  const idxWebhook = eventTimeline.indexOf('webhook_fetch');
  const idxTelegram = eventTimeline.indexOf('telegram_fetch');

  assert.ok(idxInsert !== -1, 'db_insert must happen');
  assert.ok(idxAi !== -1, 'ai_call must happen');
  assert.ok(idxWebhook !== -1, 'webhook_fetch must happen');
  assert.ok(idxTelegram !== -1, 'telegram_fetch must happen');

  assert.ok(
    idxInsert < idxAi,
    `db_insert (idx ${idxInsert}) MUST happen BEFORE ai_call (idx ${idxAi})`
  );
  assert.ok(
    idxInsert < idxWebhook,
    `db_insert (idx ${idxInsert}) MUST happen BEFORE webhook_fetch (idx ${idxWebhook})`
  );
  assert.ok(
    idxInsert < idxTelegram,
    `db_insert (idx ${idxInsert}) MUST happen BEFORE telegram_fetch (idx ${idxTelegram})`
  );
});

test('10. test AI timeout does not cause unhandled rejection', async () => {
  setupEnv();
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });

  // Intercept setTimeout to accelerate 6000ms AI timeout to 15ms for fast test execution
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (delay === 6000) {
      return savedSetTimeout(fn, 15, ...args);
    }
    return savedSetTimeout(fn, delay, ...args);
  };

  const unhandled = [];
  const onUnhandled = (reason) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);

  try {
    let rejectLosingPromise;
    const losingPromise = new Promise((_, reject) => {
      rejectLosingPromise = reject;
    });

    const { chatReportErrorAction } = createChatReportHarness({
      callAI: () => losingPromise,
    });

    const actionPromise = chatReportErrorAction({
      question: 'Test unhandled rejection',
      pathname: '/dashboard',
    });

    const res = await actionPromise;
    assert.equal(typeof res.reply, 'string');

    // Reject losing promise after action completed
    rejectLosingPromise(new Error('Simulated OpenAI delayed network error'));

    // Allow event loop ticks for unhandledRejection
    await new Promise((resolve) => savedSetTimeout(resolve, 50));

    assert.equal(
      unhandled.length,
      0,
      `Expected 0 unhandled rejections, but got ${unhandled.length}: ${unhandled.map((u) => u?.message || u).join(', ')}`
    );
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('11. fixed bounded timeout values (6000ms AI, 5000ms webhook, 8000ms Telegram) ignore environment override variables', async () => {
  setupEnv();
  // Attempt to override timeouts with large values via environment variables
  process.env.AI_SUMMARY_TIMEOUT_MS = '999999';
  process.env.KURABE_WEBHOOK_TIMEOUT_MS = '888888';
  process.env.TELEGRAM_TIMEOUT_MS = '777777';

  let capturedAiTimerDelay = null;
  globalThis.setTimeout = (fn, delay, ...args) => {
    if (delay === 6000 || delay === 999999) {
      capturedAiTimerDelay = delay;
      return savedSetTimeout(fn, 10, ...args);
    }
    return savedSetTimeout(fn, delay, ...args);
  };

  const capturedAbortSignals = [];
  AbortSignal.timeout = (ms) => {
    capturedAbortSignals.push(ms);
    return savedAbortSignalTimeout.call(AbortSignal, ms);
  };

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  });

  const { chatReportErrorAction } = createChatReportHarness({
    callAI: () => new Promise((resolve) => savedSetTimeout(() => resolve('AI summary done'), 20)),
  });

  await chatReportErrorAction({
    question: 'Kiểm tra hard bounds không bị override bởi env',
    pathname: '/reports',
  });

  assert.equal(
    capturedAiTimerDelay,
    6000,
    `AI summary timer delay must be fixed at 6000 ms, got ${capturedAiTimerDelay} (AI_SUMMARY_TIMEOUT_MS had effect!)`
  );

  assert.ok(
    capturedAbortSignals.includes(5000),
    `Webhook timeout must be fixed at 5000 ms, captured: ${JSON.stringify(capturedAbortSignals)} (KURABE_WEBHOOK_TIMEOUT_MS had effect!)`
  );

  assert.ok(
    capturedAbortSignals.includes(8000),
    `Telegram timeout must be fixed at 8000 ms, captured: ${JSON.stringify(capturedAbortSignals)} (TELEGRAM_TIMEOUT_MS had effect!)`
  );

  assert.ok(
    !capturedAbortSignals.includes(888888) && !capturedAbortSignals.includes(777777),
    'Environment override variables must have no effect on AbortSignal timeouts'
  );
});

// ============================================================================
// RUNNER
// ============================================================================

const CASE_TIMEOUT_MS = 1500;

async function run() {
  console.log('Running chat report reliability test suite...\n');
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of testCases) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = savedSetTimeout(() => {
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
      savedClearTimeout(timer);
      restoreEnvAndFetch();
    }
  }

  restoreEnvAndFetch();
  globalThis.fetch = savedFetch;
  if (failed > 0) {
    process.exitCode = 1;
  }
  console.log(`\nTest results: ${passed} passed, ${failed} failed (${testCases.length} total)`);
}

run();
