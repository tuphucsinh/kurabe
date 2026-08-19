import { strict as assert } from 'node:assert';
import { normalizeVi, roleLabel, matchEmployeeCandidates } from '../src/lib/vi-text.ts';

/**
 * Unit test cho helper context Chat AI (Phase 91 + 91.1 + tinh chỉnh hậu tố-dài-nhất).
 * Chạy: node tests/ai-context-match.test.mjs
 */

assert.equal(normalizeVi('Nguyễn Thị Lý Sa'), 'nguyen thi ly sa');
assert.equal(normalizeVi('Đặng Văn Đạt  '), 'dang van dat');
assert.equal(normalizeVi(''), '');
assert.equal(normalizeVi('Âm Ê Í Ô Ư Ỳ'), 'am e i o u y');

assert.equal(roleLabel('Employee'), 'Nhân viên');
assert.equal(roleLabel('Worker'), 'Công nhân');
assert.equal(roleLabel('Leader'), 'Leader');
assert.equal(roleLabel(null), 'Không xác định');

const USERS = [ { id: 'u1', name: 'Nguyễn Thị Lý Sa' }, { id: 'u2', name: 'Trần Văn Hòa' }, { id: 'u3', name: 'Lê Thị Lan' } ];
const ids = (arr) => arr.map((u) => u.id);

// "ly sa" 2 từ (tên cuối <3) match qua cụm hậu tố
assert.deepEqual(ids(matchEmployeeCandidates('sao sửa chức danh của Lý Sa không hiển thị?', USERS)), ['u1']);
assert.deepEqual(ids(matchEmployeeCandidates('nguyen thi ly sa', USERS)), ['u1']);

// tên cuối unique >=3
assert.deepEqual(ids(matchEmployeeCandidates('kết quả của Hòa thế nào', USERS)), ['u2']);
assert.deepEqual(ids(matchEmployeeCandidates('đánh giá của Lan thế nào', USERS)), ['u3']);

// tên cuối <3 ký tự → bỏ qua
assert.deepEqual(matchEmployeeCandidates('đánh giá của Sa', USERS), []);

// nhiều tên cùng xuất hiện → trả cả, sắp theo độ dài hậu tố
const mult = matchEmployeeCandidates('xem Hòa và Lan đánh giá thế nào', USERS);
assert.deepEqual(ids(mult), ['u2', 'u3']);
assert.equal(mult[0].bestLen, 3);

// trùng tên cuối → 2 candidate
const dup = [{ id: 'a', name: 'Nguyễn Hòa' }, { id: 'b', name: 'Trần Hòa' }];
assert.deepEqual(ids(matchEmployeeCandidates('Hòa đâu rồi', dup)), ['a', 'b']);

// HẬU TỐ DÀI NHẤT ưu tiên: "Mai Thị Hòa" phải đứng đầu + bestLen lớn hơn "Hòa" cuối
const hoa = [{ id: 'm', name: 'Mai Thị Hòa' }, { id: 'h', name: 'Trần Văn Hòa' }];
const c = matchEmployeeCandidates('Mai Thị Hòa thuộc nhóm nào, chức danh gì?', hoa);
assert.equal(c[0].id, 'm');
assert.ok(c[0].bestLen > c[1].bestLen, `mong đợi "mai thi hoa" (${c[0].bestLen}) > "hoa" (${c[1].bestLen})`);

// không khớp / rỗng
assert.deepEqual(matchEmployeeCandidates('cách đổi mật khẩu', USERS), []);
assert.deepEqual(matchEmployeeCandidates('', USERS), []);
assert.deepEqual(matchEmployeeCandidates('abc', []), []);

console.log('✅ AI context match test PASS');
