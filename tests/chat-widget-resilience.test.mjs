import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

if (typeof globalThis.document === 'undefined') {
  globalThis.document = { body: {} };
}

const componentPath = path.resolve('src/components/chat/ChatWidget.tsx');
let tsxSource = fs.readFileSync(componentPath, 'utf8');

// Ensure modern-screenshot dynamic import routes through our custom stub
tsxSource = tsxSource.replace(
  /await\s+import\s*\(\s*['"]modern-screenshot['"]\s*\)/g,
  'await customDynamicImport("modern-screenshot")'
);

const transpiled = ts.transpileModule(tsxSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
});

function findNodes(tree, predicate) {
  const results = [];
  function walk(node) {
    if (!node) return;
    if (typeof node === 'object') {
      if (predicate(node)) results.push(node);
      if (node.props && node.props.children) {
        if (Array.isArray(node.props.children)) {
          for (const child of node.props.children) walk(child);
        } else {
          walk(node.props.children);
        }
      }
    }
  }
  walk(tree);
  return results;
}

function createHarness(actionOverrides = {}) {
  let hookIndex = 0;
  const stateSlots = [];

  const actions = {
    chatAskAction: actionOverrides.chatAskAction || (async () => ({ reply: 'Default reply' })),
    chatAskWithScreenshotAction: actionOverrides.chatAskWithScreenshotAction || (async () => ({ reply: 'Screenshot reply' })),
    chatGreetingAction: actionOverrides.chatGreetingAction || (async () => ({ greeting: 'Xin chào!' })),
    chatReportErrorAction: actionOverrides.chatReportErrorAction || (async () => ({ reply: 'Đã báo lỗi' })),
  };

  const reactMock = {
    useState(initial) {
      const idx = hookIndex++;
      if (stateSlots[idx] === undefined) {
        stateSlots[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (next) => {
        if (typeof next === 'function') {
          stateSlots[idx] = next(stateSlots[idx]);
        } else {
          stateSlots[idx] = next;
        }
      };
      return [stateSlots[idx], setState];
    },
    createElement(type, props, ...children) {
      const flat = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false);
      return {
        type,
        props: {
          ...(props || {}),
          children: flat.length === 1 ? flat[0] : (flat.length > 0 ? flat : undefined),
        },
      };
    },
    Fragment: 'Fragment',
  };
  reactMock.default = reactMock;

  const customRequire = (id) => {
    if (id === 'react') return reactMock;
    if (id === 'lucide-react') {
      const Icon = (p) => ({ type: 'icon', props: p });
      return { MessageCircle: Icon, X: Icon, Send: Icon, Loader2: Icon, Bug: Icon };
    }
    if (id === '@/contexts/AuthContext') {
      return { useAuth: () => ({ user: { role: 'Manager' } }) };
    }
    if (id === 'next/navigation') {
      return { usePathname: () => '/test' };
    }
    if (id === '@/actions/chat') {
      return actions;
    }
    if (id === 'modern-screenshot') {
      return {
        domToPng: async () => 'data:image/png;base64,AAAA',
      };
    }
    throw new Error(`Unexpected require: ${id}`);
  };

  const customDynamicImport = async (id) => customRequire(id);

  const exports = {};
  const cjsModule = { exports };
  const fn = new Function('require', 'exports', 'module', 'React', 'customDynamicImport', transpiled.outputText);
  fn(customRequire, exports, cjsModule, reactMock, customDynamicImport);

  const ChatWidget = cjsModule.exports.default || exports.default;

  const render = () => {
    hookIndex = 0;
    return ChatWidget();
  };

  const getState = () => ({
    open: stateSlots[0],
    messages: stateSlots[1],
    input: stateSlots[2],
    loading: stateSlots[3],
    sendingShot: stateSlots[4],
    greeted: stateSlots[5],
    confirmReport: stateSlots[6],
    reporting: stateSlots[7],
  });

  return { render, getState, actions };
}

async function runTests() {
  console.log('Running chat widget resilience tests...\n');

  // Case 1: ask resolves -> loading false, reply appended
  {
    console.log('Case 1: ask resolves -> loading false, reply appended');
    const harness = createHarness({
      chatGreetingAction: async () => ({ greeting: 'Xin chào!' }),
      chatAskAction: async ({ question }) => ({ reply: `Trả lời: ${question}` }),
    });

    let tree = harness.render();
    const openBtn = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0];
    assert.ok(openBtn, 'Open button must be rendered when closed');
    await openBtn.props.onClick();

    tree = harness.render();
    const inputNode = findNodes(tree, (n) => n.type === 'input')[0];
    assert.ok(inputNode, 'Input field must be rendered when open');
    inputNode.props.onChange({ target: { value: 'Hỏi về quy trình' } });

    tree = harness.render();
    assert.equal(harness.getState().input, 'Hỏi về quy trình');

    const sendBtn = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Gửi')[0];
    assert.ok(sendBtn, 'Send button must be rendered');
    await sendBtn.props.onClick();

    tree = harness.render();
    const state = harness.getState();
    assert.equal(state.loading, false, 'Loading must be false after ask resolves');
    assert.equal(state.input, '', 'Input should be cleared after send');
    const lastMsg = state.messages.at(-1);
    assert.equal(lastMsg.role, 'assistant');
    assert.equal(lastMsg.text, 'Trả lời: Hỏi về quy trình');
    assert.equal(lastMsg.pathname, '/test');

    const updatedInput = findNodes(tree, (n) => n.type === 'input')[0];
    assert.equal(updatedInput.props.disabled, false, 'Input must not be disabled');
    console.log('  -> PASS');
  }

  // Case 2: ask rejects -> loading false, one error assistant message, input usable
  {
    console.log('Case 2: ask rejects -> loading false, one error assistant message, input usable');
    const harness = createHarness({
      chatGreetingAction: async () => ({ greeting: 'Xin chào!' }),
      chatAskAction: async () => {
        throw new Error('Ask network error');
      },
    });

    let tree = harness.render();
    const openBtn = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0];
    await openBtn.props.onClick();

    tree = harness.render();
    const inputNode = findNodes(tree, (n) => n.type === 'input')[0];
    inputNode.props.onChange({ target: { value: 'Câu hỏi sẽ lỗi' } });

    tree = harness.render();
    const sendBtn = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Gửi')[0];
    await sendBtn.props.onClick();

    tree = harness.render();
    const state = harness.getState();
    assert.equal(state.loading, false, 'Loading must be false after ask rejection');
    const lastMsg = state.messages.at(-1);
    assert.equal(lastMsg.role, 'assistant');
    assert.equal(lastMsg.text, 'Em chưa trả lời được lúc này, chị thử lại sau nhé.');
    assert.equal(lastMsg.pathname, '/test');

    const updatedInput = findNodes(tree, (n) => n.type === 'input')[0];
    assert.equal(updatedInput.props.disabled, false, 'Input must be usable (disabled=false) after rejection');
    console.log('  -> PASS');
  }

  // Case 3: report resolves
  {
    console.log('Case 3: report resolves');
    let reportPayload = null;
    const harness = createHarness({
      chatGreetingAction: async () => ({ greeting: 'Xin chào!' }),
      chatReportErrorAction: async (payload) => {
        reportPayload = payload;
        return { reply: 'Đã ghi nhận báo lỗi thành công.' };
      },
    });

    let tree = harness.render();
    await findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0].props.onClick();

    tree = harness.render();
    const bugBtn = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Báo lỗi')[0];
    assert.ok(bugBtn, 'Bug button must be rendered');
    bugBtn.props.onClick();

    tree = harness.render();
    assert.equal(harness.getState().confirmReport, true, 'Confirm report must be true');

    const confirmBtn = findNodes(
      tree,
      (n) => n.type === 'button' && (n.props?.children === 'Xác nhận gửi' || (Array.isArray(n.props?.children) && n.props.children.includes('Xác nhận gửi')))
    )[0];
    assert.ok(confirmBtn, 'Confirm send button must be rendered');
    await confirmBtn.props.onClick();

    tree = harness.render();
    const state = harness.getState();
    assert.equal(state.reporting, false, 'Reporting must be false after report resolves');
    assert.ok(reportPayload, 'Report action was called');
    const lastMsg = state.messages.at(-1);
    assert.equal(lastMsg.role, 'assistant');
    assert.equal(lastMsg.text, 'Đã ghi nhận báo lỗi thành công.');

    const updatedInput = findNodes(tree, (n) => n.type === 'input')[0];
    assert.equal(updatedInput.props.disabled, false, 'Input must not be disabled');
    console.log('  -> PASS');
  }

  // Case 4: report rejects -> reporting false, error message, no second report call
  {
    console.log('Case 4: report rejects -> reporting false, error message, no second report call');
    let reportCount = 0;
    const harness = createHarness({
      chatGreetingAction: async () => ({ greeting: 'Xin chào!' }),
      chatReportErrorAction: async () => {
        reportCount++;
        throw new Error('Report server offline');
      },
    });

    let tree = harness.render();
    await findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0].props.onClick();

    tree = harness.render();
    const bugBtn = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Báo lỗi')[0];
    bugBtn.props.onClick();

    tree = harness.render();
    const confirmBtn = findNodes(
      tree,
      (n) => n.type === 'button' && (n.props?.children === 'Xác nhận gửi' || (Array.isArray(n.props?.children) && n.props.children.includes('Xác nhận gửi')))
    )[0];
    await confirmBtn.props.onClick();

    tree = harness.render();
    const state = harness.getState();
    assert.equal(state.reporting, false, 'Reporting must be false after report rejection');
    assert.equal(reportCount, 1, 'Report should be called exactly once; no second call on failure');
    const lastMsg = state.messages.at(-1);
    assert.equal(lastMsg.role, 'assistant');
    assert.equal(lastMsg.text, 'Em chưa gửi được báo lỗi, chị thử lại sau nhé.');

    const updatedInput = findNodes(tree, (n) => n.type === 'input')[0];
    assert.equal(updatedInput.props.disabled, false, 'Input must be usable after report error');
    console.log('  -> PASS');
  }

  // Case 5: greeting rejects on first open, then resolves on second open -> exactly 2 greeting calls total, exactly one greeting message
  {
    console.log('Case 5: greeting rejects on first open, then resolves on second open -> exactly 2 calls, 1 message');
    let greetingCalls = 0;
    const harness = createHarness({
      chatGreetingAction: async () => {
        greetingCalls++;
        if (greetingCalls === 1) {
          throw new Error('Greeting action failed');
        }
        return { greeting: 'Xin chào, em có thể hỗ trợ gì ạ?' };
      },
    });

    let tree = harness.render();
    const openBtn1 = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0];
    await openBtn1.props.onClick();

    tree = harness.render();
    let state = harness.getState();
    assert.equal(greetingCalls, 1, 'First open should attempt greeting call');
    assert.equal(state.greeted, false, 'Greeted should be reset to false when greeting rejects');
    assert.equal(state.messages.length, 0, 'No greeting message should be added on failure');

    // Close the widget
    const closeBtn = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Đóng')[0];
    assert.ok(closeBtn, 'Close button must be available');
    closeBtn.props.onClick();

    tree = harness.render();
    assert.equal(harness.getState().open, false, 'Widget must be closed');

    // Second open: should retry greeting
    const openBtn2 = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0];
    await openBtn2.props.onClick();

    tree = harness.render();
    state = harness.getState();
    assert.equal(greetingCalls, 2, 'Exactly 2 greeting calls total after retry');
    assert.equal(state.greeted, true, 'Greeted must be true after successful greeting');
    assert.equal(state.messages.length, 1, 'Exactly one greeting message must be present');
    assert.equal(state.messages[0].text, 'Xin chào, em có thể hỗ trợ gì ạ?');

    // Close and open a third time: successful greeting must NOT be duplicated
    const closeBtn2 = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Đóng')[0];
    closeBtn2.props.onClick();
    tree = harness.render();
    const openBtn3 = findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0];
    await openBtn3.props.onClick();

    assert.equal(greetingCalls, 2, 'Successful greeting must not trigger another greeting call');
    assert.equal(harness.getState().messages.length, 1, 'Greeting message must not be duplicated');
    console.log('  -> PASS');
  }

  // Case 6: ask returns text with [CẦN_ẢNH] and [CẦN_DEV] -> still routed to screenshot/report paths
  {
    console.log('Case 6a: ask returns [CẦN_ẢNH] -> routes to screenshot path');
    let screenshotCalled = false;
    let receivedQuestion = '';
    const harnessShot = createHarness({
      chatGreetingAction: async () => ({ greeting: 'Xin chào!' }),
      chatAskAction: async ({ question }) => ({ reply: `Cần ảnh [CẦN_ẢNH] cho câu hỏi ${question}` }),
      chatAskWithScreenshotAction: async ({ question, imageBase64 }) => {
        screenshotCalled = true;
        receivedQuestion = question;
        assert.ok(imageBase64, 'Image base64 should be provided');
        return { reply: 'Đã phân tích ảnh thành công.' };
      },
    });

    let tree = harnessShot.render();
    await findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0].props.onClick();

    tree = harnessShot.render();
    findNodes(tree, (n) => n.type === 'input')[0].props.onChange({ target: { value: 'Màn hình bị vỡ' } });

    tree = harnessShot.render();
    await findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Gửi')[0].props.onClick();

    tree = harnessShot.render();
    assert.ok(screenshotCalled, 'chatAskWithScreenshotAction should be called for [CẦN_ẢNH]');
    assert.equal(receivedQuestion, 'Màn hình bị vỡ');
    assert.equal(harnessShot.getState().loading, false, 'Loading must be false');
    assert.equal(harnessShot.getState().sendingShot, false, 'SendingShot must be false');
    const lastMsgShot = harnessShot.getState().messages.at(-1);
    assert.equal(lastMsgShot.text, 'Đã phân tích ảnh thành công.');
    console.log('  -> PASS 6a');

    console.log('Case 6b: ask returns [CẦN_DEV] -> routes to error report path');
    let devReportCalled = false;
    const harnessDev = createHarness({
      chatGreetingAction: async () => ({ greeting: 'Xin chào!' }),
      chatAskAction: async () => ({ reply: 'Cần dev can thiệp [CẦN_DEV]' }),
      chatReportErrorAction: async () => {
        devReportCalled = true;
        return { reply: 'Báo lỗi dev tự động thành công.' };
      },
    });

    tree = harnessDev.render();
    await findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0].props.onClick();

    tree = harnessDev.render();
    findNodes(tree, (n) => n.type === 'input')[0].props.onChange({ target: { value: 'Bug nghiêm trọng' } });

    tree = harnessDev.render();
    await findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Gửi')[0].props.onClick();

    tree = harnessDev.render();
    assert.ok(devReportCalled, 'chatReportErrorAction should be called for [CẦN_DEV]');
    assert.equal(harnessDev.getState().loading, false, 'Loading must be false');
    const lastMsgDev = harnessDev.getState().messages.at(-1);
    assert.equal(lastMsgDev.text, 'Báo lỗi dev tự động thành công.');
    console.log('  -> PASS 6b');

    console.log('Case 6c: ask returns [CẦN_DEV] and follow-up report rejects -> shows error, does not resend');
    let devReportAttempts = 0;
    const harnessDevFail = createHarness({
      chatGreetingAction: async () => ({ greeting: 'Xin chào!' }),
      chatAskAction: async () => ({ reply: 'Cần dev [CẦN_DEV]' }),
      chatReportErrorAction: async () => {
        devReportAttempts++;
        throw new Error('Dev report service down');
      },
    });

    tree = harnessDevFail.render();
    await findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Hỗ trợ')[0].props.onClick();

    tree = harnessDevFail.render();
    findNodes(tree, (n) => n.type === 'input')[0].props.onChange({ target: { value: 'Lỗi phát sinh' } });

    tree = harnessDevFail.render();
    await findNodes(tree, (n) => n.type === 'button' && n.props?.['aria-label'] === 'Gửi')[0].props.onClick();

    tree = harnessDevFail.render();
    assert.equal(devReportAttempts, 1, 'Should call chatReportErrorAction once; do not resend');
    assert.equal(harnessDevFail.getState().loading, false, 'Loading must be false after rejection');
    const lastMsgFail = harnessDevFail.getState().messages.at(-1);
    assert.equal(lastMsgFail.role, 'assistant');
    assert.equal(lastMsgFail.text, 'Em chưa trả lời được lúc này, chị thử lại sau nhé.');

    const updatedInput = findNodes(tree, (n) => n.type === 'input')[0];
    assert.equal(updatedInput.props.disabled, false, 'Input must be usable');
    console.log('  -> PASS 6c');
  }

  console.log('\nAll 6 test cases PASSED!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
