import { strict as assert } from 'node:assert';
import { isOpaqueSessionToken } from '../src/lib/session-token';

/**
 * Test-first contract for isOpaqueSessionToken (#P1M2T01).
 * Chạy: npx tsc --module commonjs --target es2020 --esModuleInterop --strict \
 *          --outDir .tmp/testbuild tests/session-token.test.ts \
 *        && node .tmp/testbuild/tests/session-token.test.js
 */

// 1. Valid 64-character hexadecimal tokens (SHA-256 hex string)
const VALID_LOWERCASE_HEX = 'a'.repeat(64);
const VALID_HEX_DIGITS = '0123456789abcdef'.repeat(4);
const VALID_UPPERCASE_HEX = '0123456789ABCDEF'.repeat(4);
const VALID_MIXED_HEX = '1a2B3c4D'.repeat(8);

assert.equal(isOpaqueSessionToken(VALID_LOWERCASE_HEX), true, '64 lowercase hex chars must be valid');
assert.equal(isOpaqueSessionToken(VALID_HEX_DIGITS), true, '64 hex chars (0-9, a-f) must be valid');
assert.equal(isOpaqueSessionToken(VALID_UPPERCASE_HEX), true, '64 uppercase hex chars must be valid');
assert.equal(isOpaqueSessionToken(VALID_MIXED_HEX), true, '64 mixed-case hex chars must be valid');

// 2. Reject legacy UUID formats (EXPECTED RED against baseline)
assert.equal(isOpaqueSessionToken('123e4567-e89b-12d3-a456-426614174000'), false, 'Standard UUID v4 must be rejected');
assert.equal(isOpaqueSessionToken('d3b07384-d113-40f4-8025-a4ec67f40cf9'), false, 'Random UUID must be rejected');
assert.equal(isOpaqueSessionToken('00000000-0000-0000-0000-000000000000'), false, 'Nil UUID must be rejected');

// 3. Reject invalid lengths
assert.equal(isOpaqueSessionToken(''), false, 'empty string must be rejected');
assert.equal(isOpaqueSessionToken('a'.repeat(63)), false, '63 hex chars must be rejected');
assert.equal(isOpaqueSessionToken('a'.repeat(65)), false, '65 hex chars must be rejected');
assert.equal(isOpaqueSessionToken('a'.repeat(32)), false, '32 hex chars (MD5 length) must be rejected');
assert.equal(isOpaqueSessionToken('a'.repeat(128)), false, '128 hex chars (SHA-512 length) must be rejected');

// 4. Reject non-hex characters and whitespace
assert.equal(isOpaqueSessionToken('g'.repeat(64)), false, '64 non-hex letters (g) must be rejected');
assert.equal(isOpaqueSessionToken('z'.repeat(64)), false, '64 non-hex letters (z) must be rejected');
assert.equal(isOpaqueSessionToken(`${'a'.repeat(63)}g`), false, '63 hex chars + 1 non-hex char must be rejected');
assert.equal(isOpaqueSessionToken(` ${'a'.repeat(64)}`), false, 'leading whitespace must be rejected');
assert.equal(isOpaqueSessionToken(`${'a'.repeat(64)} `), false, 'trailing whitespace must be rejected');
assert.equal(isOpaqueSessionToken(' '.repeat(64)), false, 'whitespace-only string must be rejected');
assert.equal(isOpaqueSessionToken(`${'a'.repeat(32)}-${'a'.repeat(31)}`), false, 'hyphen inside string must be rejected');
assert.equal(isOpaqueSessionToken(`${'a'.repeat(32)}_${'a'.repeat(31)}`), false, 'underscore inside string must be rejected');

// 5. Reject non-string data types
assert.equal(isOpaqueSessionToken(null), false, 'null must be rejected');
assert.equal(isOpaqueSessionToken(undefined), false, 'undefined must be rejected');
assert.equal(isOpaqueSessionToken(123456), false, 'number must be rejected');
assert.equal(isOpaqueSessionToken(true), false, 'boolean true must be rejected');
assert.equal(isOpaqueSessionToken(false), false, 'boolean false must be rejected');
assert.equal(isOpaqueSessionToken({}), false, 'plain object must be rejected');
assert.equal(isOpaqueSessionToken([]), false, 'array must be rejected');
assert.equal(isOpaqueSessionToken(Symbol('token')), false, 'symbol must be rejected');
assert.equal(isOpaqueSessionToken(() => {}), false, 'function must be rejected');

console.log('session-token contract tests: ALL PASS');
