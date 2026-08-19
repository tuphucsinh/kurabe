import { strict as assert } from 'node:assert';
import { normalizeVi, roleLabel, matchEmployeeCandidates } from '../src/lib/vi-text.ts';

/**
 * Unit test cho helper context Chat AI (Phase 91 + 91.1).
 * Chạy: node tests/ai-context-match.test.mjs
 */

// normalizeVi
assert.equal(normalizeVi('Nguyễn Thị Lý Sa'), 'nguyen thi ly sa');
assert.equal(normalizeVi('Đặng Văn Đạt  '), 'dang van dat');
assert.equal(normalizeVi('HÒA_Nhân'), 'hoa_nhan');
assert.equal(normalizeVi(''), '');
assert.equal(normalizeVi('Âm Ê Í Ô Ư Ỳ'), 'am e i o u y');

// roleLabel
assert.equal(roleLabel('Employee'), 'Nhân viên');
assert.equal(roleLabel('Worker'), 'Công nhân');
assert.equal(roleLabel('Leader'), 'Leader');
assert.equal(roleLabel('Manager'), 'Manager');
assert.equal(roleLabel(null), 'Không xác định');

const USERS = [
  { id: 'u1', name: 'Nguyễn Thị Lý Sa' },
  { id: 'u2', name: 'Trần Văn Hòa' },
  { id: 'u3', name: 'Lê Thị Lan' },
];

const ids = (arr) => arr.map((u) => u.id);

// "ly sa" 2 từ (tên cuối <3) vẫn match qua cụm hậu tố
assert.deepEqual(ids(matchEmployeeCandidates('sao sửa chức danh của Lý Sa không hiển thị?', USERS)), ['u1']);
assert.deepEqual(ids(matchEmployeeCandidates('tại sao CHỨC DANH của ly sa không lên', USERS)), ['u1']);
// tên đầy đủ
assert.deepEqual(ids(matchEmployeeCandidates('nguyen thi ly sa', USERS)), ['u1']);

// tên cuối unique >=3
assert.deepEqual(ids(matchEmployeeCandidates('kết quả của Hòa thế nào', USERS)), ['u2']);
assert.deepEqual(ids(matchEmployeeCandidates('đánh giá của Lan thế nào', USERS)), ['u3']);

// tên cuối <3 ký tự → bỏ qua
assert.deepEqual(matchEmployeeCandidates('đánh giá của Sa', USERS), []);

// nhiều người cùng tên → trả cả 2 (hỏi lại)
assert.deepEqual(ids(matchEmployeeCandidates('xem Hòa và Lan đánh giá thế nào', USERS)), ['u2', 'u3']);

// trùng tên cuối (2 user cùng "Hòa") → trả cả 2 → multiple
const dup = [{ id: 'a', name: 'Nguyễn Hòa' }, { id: 'b', name: 'Trần Hòa' }];
assert.deepEqual(ids(matchEmployeeCandidates('Hòa đâu rồi', dup)), ['a', 'b']);

// không khớp / rỗng
assert.deepEqual(matchEmployeeCandidates('cách đổi mật khẩu', USERS), []);
assert.deepEqual(matchEmployeeCandidates('', USERS), []);
assert.deepEqual(matchEmployeeCandidates('abc', []), []);

console.log('✅ AI context match test PASS');
