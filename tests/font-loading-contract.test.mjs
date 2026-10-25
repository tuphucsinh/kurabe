import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ============================================================================
// P110M6T01 — font loading contract.
// Bối cảnh (đo thực tế 2026-10-25):
//  - Font tĩnh được phục vụ immutable (max-age=1y) → chi phí mỗi navigation = 0;
//    "84KB mỗi page" trong lần đo cũ là artifact (CDP đếm cả response từ cache).
//  - Trước fix: subsets chỉ "latin" → các dấu tiếng Việt (ạ ế ộ …, U+1EA0-1EF9)
//    KHÔNG thuộc slice nào → render bằng font hệ thống trộn lẫn Inter.
//  - Fix: thêm subset "vietnamese" (slice ~10KB, chứa đủ cả đ/ơ/ư và U+1EA0-1EF9)
//    + display: "swap" tường minh. Slice vietnamese được next/font preload.
// Contract này pin cấu hình để không hồi quy về mixed-font rendering.
// ============================================================================

const layoutSource = fs.readFileSync(path.join(projectRoot, 'src/app/layout.tsx'), 'utf8');

assert.match(layoutSource, /import \{ Inter \} from "next\/font\/google";/,
  'app font stays Inter via next/font/google (variable font — 6 weight đang dùng hiệu quả hơn static)');

const subsetsMatch = layoutSource.match(/subsets:\s*\[([^\]]+)\]/);
assert.ok(subsetsMatch, 'Inter config must declare subsets explicitly');
const subsets = subsetsMatch[1].split(',').map((s) => s.trim().replace(/["']/g, ''));
assert.ok(subsets.includes('latin'), 'latin subset retained (base a-z, â/ê/ô)');
assert.ok(subsets.includes('vietnamese'),
  'vietnamese subset required — không có nó, mọi dấu tổ hợp (ạ ế ộ …) render bằng font hệ thống trộn với Inter');
assert.equal(subsets.includes('latin-ext'), false,
  'latin-ext subset không khai báo tường minh (slice 83KB; browser vẫn tự fetch theo unicode-range nếu cần — không preload)');

assert.match(layoutSource, /display:\s*"swap"/, 'font-display: swap explicit (chữ hiện ngay bằng fallback, không trắng trang)');

// Ngôn ngữ trang phải là tiếng Việt để browser ưu tiên đúng subset hint.
assert.match(layoutSource, /lang="vi"/, 'html lang="vi"');

console.log('P110M6T01 font loading contract: ALL PASS');
