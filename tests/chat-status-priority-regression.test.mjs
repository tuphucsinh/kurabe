/**
 * Deterministic static regression test for Chat evaluation status priority contract (Phase 92).
 * Reads src/actions/chat.ts and verifies:
 * 1. Conditional gate (empContext.kind === 'found' && 'Trạng thái đánh giá')
 * 2. Direct-status contract (first sentence states current round and L1/L2/L3 status)
 * 3. Blocking-prior-round contract (states blocking round and who must submit it before general workflow)
 * 4. No-generic-opening contract (no generic workflow/menu opening)
 * 5. No-repeat-question contract (no asking again for employee name/status)
 * 6. No-false-open contract (no assuming round is open merely from 'vòng đang mở')
 * 7. Correct prompt placement and unchanged fallback behavior
 *
 * Run: node tests/chat-status-priority-regression.test.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const CHAT_ACTION_PATH = path.join(projectRoot, 'src', 'actions', 'chat.ts');

assert.ok(fs.existsSync(CHAT_ACTION_PATH), 'src/actions/chat.ts must exist');

const chatContent = fs.readFileSync(CHAT_ACTION_PATH, 'utf8');

// 1. Conditional Gate verification
assert.ok(
  chatContent.includes("empContext.kind === 'found'") &&
    chatContent.includes("empContext.text.includes('Trạng thái đánh giá')"),
  'prepareChatContext must conditionally gate instruction on empContext.kind === "found" and authoritative marker "Trạng thái đánh giá"'
);

// 2. Direct-status contract marker
assert.ok(
  /câu đầu tiên phải nêu trực tiếp.*vòng đánh giá hiện tại.*trạng thái L1\/L2\/L3/i.test(chatContent),
  'Must contain direct-status contract requiring first sentence to state current round and L1/L2/L3 status from context'
);

// 3. Blocking-prior-round contract marker
assert.ok(
  /vòng trước đó đang chặn.*ai.*cần nộp.*trước khi giải thích quy trình chung/i.test(chatContent),
  'Must contain blocking-prior-round contract identifying the blocking round and submitter'
);

// 4. No-generic-opening contract marker
assert.ok(
  /không bắt đầu bằng.*quy trình chung.*menu/i.test(chatContent),
  'Must contain no-generic-opening contract prohibiting starting with generic workflow/menu guidance'
);

// 5. No-repeat-question contract marker
assert.ok(
  /không hỏi lại.*tên nhân viên.*trạng thái/i.test(chatContent),
  'Must contain no-repeat-question contract prohibiting asking for already known employee name/status'
);

// 6. No-false-open contract marker
assert.ok(
  /không tự suy luận.*"vòng đang mở".*trạng thái thực tế.*L1\/L2\/L3/i.test(chatContent),
  'Must contain no-false-open contract preventing assumption that round is open without checking L1/L2/L3 statuses'
);

// 7. Prompt placement & fallback integrity
assert.ok(
  chatContent.includes('const prompt = statusPriorityInstruction') &&
    chatContent.includes('`${statusPriorityInstruction}\\n\\n${basePrompt}`') &&
    chatContent.includes(': basePrompt;'),
  'Prompt must place status priority instruction immediately before basePrompt when active, and leave basePrompt unchanged otherwise'
);

console.log('chat-status-priority-regression tests: ALL PASS');
