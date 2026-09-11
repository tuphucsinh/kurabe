import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(projectRoot, 'src/lib/auth-password-setup.ts'), 'utf8');
const MAX_BYTES = 72;
const utf8Bytes = (value) => Buffer.byteLength(value, 'utf8');
const valid = (value) => value.length >= 6 && utf8Bytes(value) <= MAX_BYTES;
const cases = [];

assert.match(source, /Buffer\.byteLength\(newPassword, ['"]utf8['"]\)/, 'server validator must measure UTF-8 bytes');
assert.match(source, /MAX_PASSWORD_BYTES\s*=\s*72/, 'server byte ceiling must be 72');
assert.doesNotMatch(source, /newPassword\.slice\(|newPassword\.substring\(/, 'server must not silently truncate passwords');
cases.push('source contract: bcrypt UTF-8 byte cap and no silent truncation');

const boundaryCases = [
  ['ASCII-71', `${'a'.repeat(71)}`, 71, true],
  ['ASCII-72', `${'a'.repeat(72)}`, 72, true],
  ['ASCII-73', `${'a'.repeat(73)}`, 73, false],
  ['Vietnamese-71', `${'a'.repeat(69)}đ`, 71, true],
  ['Vietnamese-72', `${'a'.repeat(70)}đ`, 72, true],
  ['Vietnamese-73', `${'a'.repeat(71)}đ`, 73, false],
  ['emoji-71', `${'a'.repeat(67)}😀`, 71, true],
  ['emoji-72', `${'a'.repeat(68)}😀`, 72, true],
  ['emoji-73', `${'a'.repeat(69)}😀`, 73, false],
];
for (const [name, value, expectedBytes, expectedValid] of boundaryCases) {
  assert.equal(utf8Bytes(value), expectedBytes, `${name} must have exact UTF-8 byte count`);
  assert.equal(valid(value), expectedValid, `${name} validation result must be byte-based`);
  cases.push(`${name} bytes=${expectedBytes} valid=${expectedValid}`);
}

assert.ok('đ'.length === 1 && utf8Bytes('đ') === 2, 'Vietnamese boundary must distinguish JS units from UTF-8 bytes');
assert.ok('😀'.length === 2 && utf8Bytes('😀') === 4, 'emoji boundary must distinguish UTF-16 units from UTF-8 bytes');
cases.push('UTF-16 versus UTF-8 distinction verified for Vietnamese and emoji');
console.log(`PASSWORD_BYTE_BOUNDARY PASS cases=${cases.length}`);
