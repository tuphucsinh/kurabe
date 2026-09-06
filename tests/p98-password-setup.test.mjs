/**
 * Focused Source-Contract & Deterministic Invariant Test for P98M2T02
 * Password Reset / Setup Transaction Hardening & Fail-Closed Login
 *
 * NOTE: Production database execution, live RPC calls, and live data mutations
 * are STRICTLY PROHIBITED in this test. This test verifies the exact source
 * contract, PL/pgSQL transaction logic, static AST/token invariants, rollback
 * safety, and auth lifecycle simulations without remote DB or network access.
 *
 * Run: node tests/p98-password-setup.test.mjs
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const FORWARD_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260905072000_p98_password_setup_transaction.sql'
);
const ROLLBACK_PATH = path.join(
  projectRoot,
  'db',
  'rollback-p98-password-setup-transaction.sql'
);
const P98M2T01_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260905070000_p98_password_setup.sql'
);
const AUTH_PASSWORD_SETUP_PATH = path.join(
  projectRoot,
  'src',
  'lib',
  'auth-password-setup.ts'
);
const ACTIONS_ACCOUNT_PATH = path.join(
  projectRoot,
  'src',
  'actions',
  'account.ts'
);
const ACTIONS_AUTH_PATH = path.join(
  projectRoot,
  'src',
  'actions',
  'auth.ts'
);

console.log('[NOTE] Running deterministic source-contract test for P98M2T02 password setup & login hardening...');

// Helper to strip comments and expose executable SQL
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

// ============================================================
// 1. ARTIFACT EXISTENCE & CANDIDATE HEADERS
// ============================================================
assert.ok(
  fs.existsSync(FORWARD_MIGRATION_PATH),
  `Forward migration must exist at: ${FORWARD_MIGRATION_PATH}`
);
assert.ok(
  fs.existsSync(ROLLBACK_PATH),
  `Rollback candidate must exist at: ${ROLLBACK_PATH}`
);
assert.ok(
  fs.existsSync(P98M2T01_MIGRATION_PATH),
  `P98M2T01 prerequisite migration must exist at: ${P98M2T01_MIGRATION_PATH}`
);
assert.ok(
  fs.existsSync(AUTH_PASSWORD_SETUP_PATH),
  `Server helper must exist at: ${AUTH_PASSWORD_SETUP_PATH}`
);
assert.ok(
  fs.existsSync(ACTIONS_ACCOUNT_PATH),
  `Account actions must exist at: ${ACTIONS_ACCOUNT_PATH}`
);
assert.ok(
  fs.existsSync(ACTIONS_AUTH_PATH),
  `Auth actions must exist at: ${ACTIONS_AUTH_PATH}`
);

const forwardMigrationSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');
const helperCode = fs.readFileSync(AUTH_PASSWORD_SETUP_PATH, 'utf8');
const accountCode = fs.readFileSync(ACTIONS_ACCOUNT_PATH, 'utf8');
const authCode = fs.readFileSync(ACTIONS_AUTH_PATH, 'utf8');

// Candidate safety headers
assert.ok(
  forwardMigrationSql.includes('CANDIDATE ONLY — NOT APPLIED') || forwardMigrationSql.includes('CANDIDATE ONLY'),
  'Forward migration must contain CANDIDATE ONLY header'
);
assert.ok(
  forwardMigrationSql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL') || forwardMigrationSql.includes('APPROVAL'),
  'Forward migration must require explicit approval'
);
assert.ok(
  rollbackSql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED') || rollbackSql.includes('ROLLBACK CANDIDATE ONLY'),
  'Rollback must contain ROLLBACK CANDIDATE ONLY header'
);

// Transaction encapsulation
const cleanForwardSql = stripSqlComments(forwardMigrationSql).trim();
const cleanRollbackSql = stripSqlComments(rollbackSql).trim();

assert.ok(cleanForwardSql.startsWith('BEGIN;'), 'Forward migration must start with BEGIN;');
assert.ok(cleanForwardSql.endsWith('COMMIT;'), 'Forward migration must end with COMMIT;');
assert.ok(cleanRollbackSql.startsWith('BEGIN;'), 'Rollback must start with BEGIN;');
assert.ok(cleanRollbackSql.endsWith('COMMIT;'), 'Rollback must end with COMMIT;');

// ============================================================
// 2. FORWARD MIGRATION RPC CONTRACT & SECURITY INVARIANTS
// ============================================================

// 2.1 reset_password_transaction function checks
assert.ok(
  cleanForwardSql.includes('CREATE OR REPLACE FUNCTION public.reset_password_transaction'),
  'Forward migration must declare CREATE OR REPLACE FUNCTION public.reset_password_transaction'
);

const EXPECTED_RESET_PARAMS = [
  'p_user_id uuid',
  'p_token_hash text',
  'p_expires_at timestamptz',
];
for (const param of EXPECTED_RESET_PARAMS) {
  const [name, type] = param.split(/\s+/);
  const re = new RegExp(`\\b${name}\\s+${type}\\b`, 'i');
  assert.ok(re.test(cleanForwardSql), `reset_password_transaction must declare parameter ${param}`);
}

// Ensure raw passwords and raw tokens are NOT accepted
assert.ok(
  !/\bp_password\b/i.test(cleanForwardSql),
  'reset_password_transaction must NEVER accept raw password parameter'
);
assert.ok(
  !/\bp_token\s+text/i.test(cleanForwardSql),
  'reset_password_transaction must NEVER accept raw token parameter (only p_token_hash)'
);

// Invariants inside reset_password_transaction
assert.ok(
  cleanForwardSql.includes('password_setup_required = true') &&
  cleanForwardSql.includes('password_hash = NULL'),
  'reset_password_transaction must mark password_setup_required = true and wipe password_hash'
);
assert.ok(
  cleanForwardSql.includes('DELETE FROM public.sessions') &&
  cleanForwardSql.includes('WHERE user_id = p_user_id'),
  'reset_password_transaction must atomically revoke existing sessions for user'
);
assert.ok(
  cleanForwardSql.includes('UPDATE public.password_setup_tokens') &&
  cleanForwardSql.includes('used_at = now()') &&
  cleanForwardSql.includes('WHERE user_id = p_user_id') &&
  cleanForwardSql.includes('used_at IS NULL'),
  'reset_password_transaction must atomically revoke prior unconsumed setup tokens for user'
);
assert.ok(
  cleanForwardSql.includes('INSERT INTO public.password_setup_tokens') &&
  cleanForwardSql.includes('token_hash') &&
  cleanForwardSql.includes('expires_at'),
  'reset_password_transaction must insert new hashed setup token record'
);

// 2.2 complete_password_setup_transaction function checks
assert.ok(
  cleanForwardSql.includes('CREATE OR REPLACE FUNCTION public.complete_password_setup_transaction'),
  'Forward migration must declare CREATE OR REPLACE FUNCTION public.complete_password_setup_transaction'
);

const EXPECTED_COMPLETE_PARAMS = [
  'p_token_hash text',
  'p_password_hash text',
];
for (const param of EXPECTED_COMPLETE_PARAMS) {
  const [name, type] = param.split(/\s+/);
  const re = new RegExp(`\\b${name}\\s+${type}\\b`, 'i');
  assert.ok(re.test(cleanForwardSql), `complete_password_setup_transaction must declare parameter ${param}`);
}

// Invariants inside complete_password_setup_transaction
assert.ok(
  cleanForwardSql.includes('password_hash = p_password_hash') &&
  cleanForwardSql.includes('password_setup_required = false'),
  'complete_password_setup_transaction must set new password_hash and clear password_setup_required'
);
assert.ok(
  cleanForwardSql.includes('UPDATE public.password_setup_tokens') &&
  cleanForwardSql.includes('used_at = now()'),
  'complete_password_setup_transaction must atomically mark token(s) as used/revoked'
);
assert.ok(
  cleanForwardSql.includes('DELETE FROM public.sessions'),
  'complete_password_setup_transaction must atomically revoke sessions upon password setup'
);

// 2.3 Security definer, search_path, and least-privilege grants
const cleanCompactSql = cleanForwardSql.replace(/\s+/g, ' ');

// SECURITY DEFINER and fixed search_path = public
const securityDefinerCount = (cleanForwardSql.match(/SECURITY\s+DEFINER/gi) || []).length;
assert.ok(securityDefinerCount >= 2, 'Both transaction functions must declare SECURITY DEFINER');

const searchPathCount = (cleanForwardSql.match(/SET\s+search_path\s*=\s*public/gi) || []).length;
assert.ok(searchPathCount >= 2, 'Both transaction functions must declare SET search_path = public');

// Service-role only execution permissions
assert.ok(
  cleanCompactSql.includes('REVOKE ALL ON FUNCTION public.reset_password_transaction') &&
  cleanCompactSql.includes('FROM PUBLIC, anon, authenticated;'),
  'reset_password_transaction must revoke execute from PUBLIC, anon, authenticated'
);
assert.ok(
  cleanCompactSql.includes('GRANT EXECUTE ON FUNCTION public.reset_password_transaction') &&
  cleanCompactSql.includes('TO service_role;'),
  'reset_password_transaction must grant execute to service_role'
);

assert.ok(
  cleanCompactSql.includes('REVOKE ALL ON FUNCTION public.complete_password_setup_transaction') &&
  cleanCompactSql.includes('FROM PUBLIC, anon, authenticated;'),
  'complete_password_setup_transaction must revoke execute from PUBLIC, anon, authenticated'
);
assert.ok(
  cleanCompactSql.includes('GRANT EXECUTE ON FUNCTION public.complete_password_setup_transaction') &&
  cleanCompactSql.includes('TO service_role;'),
  'complete_password_setup_transaction must grant execute to service_role'
);

// Provenance markers
const RESET_PROVENANCE = 'kurabe:p98:candidate:v1:function:reset_password_transaction';
const COMPLETE_PROVENANCE = 'kurabe:p98:candidate:v1:function:complete_password_setup_transaction';

assert.ok(cleanForwardSql.includes(RESET_PROVENANCE), `Forward migration must set provenance: ${RESET_PROVENANCE}`);
assert.ok(cleanForwardSql.includes(COMPLETE_PROVENANCE), `Forward migration must set provenance: ${COMPLETE_PROVENANCE}`);

// 2.4 Consistent Lock-Order & Post-Wait Snapshot Re-read Static Contract
// Statically verifies deterministic lock ordering across both functions:
//   Hierarchy: public.users (1st) -> public.password_setup_tokens (2nd) -> public.sessions (3rd)
// Proves completion resolves token->user_id without locking, locks user first,
// then re-reads and locks token under the post-wait transaction snapshot before writes.
// Note: This remains a static AST/text contract test (not runtime concurrency proof).

function extractPlpgsqlFunctionBody(sql, functionName) {
  const funcMarker = `CREATE OR REPLACE FUNCTION ${functionName}`;
  const funcStart = sql.indexOf(funcMarker);
  assert.ok(funcStart !== -1, `Migration must define ${functionName}`);
  const bodyStart = sql.indexOf('AS $$', funcStart);
  assert.ok(bodyStart !== -1, `${functionName} must have AS $$ opening`);
  const bodyEnd = sql.indexOf('$$;', bodyStart);
  assert.ok(bodyEnd !== -1, `${functionName} must have $$; closing`);
  return sql.substring(bodyStart + 5, bodyEnd);
}

const resetFnBody = extractPlpgsqlFunctionBody(cleanForwardSql, 'public.reset_password_transaction');
const completeFnBody = extractPlpgsqlFunctionBody(cleanForwardSql, 'public.complete_password_setup_transaction');

// --- Invariants for reset_password_transaction ---
// 1. Locks user row first with FOR UPDATE
const resetUserLockPos = resetFnBody.search(/FROM\s+public\.users\b[\s\S]*?FOR\s+UPDATE\s*;/i);
assert.ok(resetUserLockPos !== -1, 'reset_password_transaction must lock user row with FOR UPDATE');

// 2. Updates user record
const resetUserUpdatePos = resetFnBody.search(/UPDATE\s+public\.users\b/i);
assert.ok(resetUserUpdatePos !== -1, 'reset_password_transaction must update public.users');
assert.ok(resetUserLockPos < resetUserUpdatePos, 'reset_password_transaction must lock user before updating');

// 3. Modifies/locks password_setup_tokens
const resetTokenUpdatePos = resetFnBody.search(/UPDATE\s+public\.password_setup_tokens\b/i);
assert.ok(resetTokenUpdatePos !== -1, 'reset_password_transaction must update public.password_setup_tokens');
assert.ok(
  resetUserLockPos < resetTokenUpdatePos,
  'reset_password_transaction must acquire user lock BEFORE modifying password_setup_tokens'
);

// 4. Deletes from sessions
const resetSessionDeletePos = resetFnBody.search(/DELETE\s+FROM\s+public\.sessions\b/i);
assert.ok(resetSessionDeletePos !== -1, 'reset_password_transaction must delete from public.sessions');
assert.ok(
  resetTokenUpdatePos < resetSessionDeletePos,
  'reset_password_transaction must modify password_setup_tokens BEFORE deleting sessions'
);

// --- Invariants for complete_password_setup_transaction ---
// Find all SELECT statements querying password_setup_tokens in complete_password_setup_transaction
const tokenSelectRegex = /SELECT\s+t\.(?:user_id|id)\b[\s\S]*?FROM\s+public\.password_setup_tokens\b[\s\S]*?;/gi;
const tokenSelectMatches = [...completeFnBody.matchAll(tokenSelectRegex)];

assert.strictEqual(
  tokenSelectMatches.length,
  2,
  'complete_password_setup_transaction must contain exactly two SELECT queries against password_setup_tokens: 1 non-locking resolution and 1 post-wait locked re-read'
);

const [firstTokenSelect, secondTokenSelect] = tokenSelectMatches;
const firstTokenSelectPos = firstTokenSelect.index;
const secondTokenSelectPos = secondTokenSelect.index;

// Initial resolution must NOT acquire row lock (resolve token->user_id without locking)
assert.ok(
  !/FOR\s+UPDATE/i.test(firstTokenSelect[0]),
  'Initial token read in complete_password_setup_transaction must NOT use FOR UPDATE (non-locking resolution)'
);
assert.ok(
  /v_user_id/i.test(firstTokenSelect[0]),
  'Initial token read must resolve into v_user_id'
);

// User lock must occur AFTER initial token resolution
const completeUserLockPos = completeFnBody.search(/FROM\s+public\.users\b[\s\S]*?FOR\s+UPDATE\s*;/i);
assert.ok(completeUserLockPos !== -1, 'complete_password_setup_transaction must lock user row with FOR UPDATE');
assert.ok(
  firstTokenSelectPos < completeUserLockPos,
  'complete_password_setup_transaction must resolve token->user_id before acquiring user lock'
);

// Second token read MUST occur AFTER user lock and MUST acquire row lock with FOR UPDATE
assert.ok(
  completeUserLockPos < secondTokenSelectPos,
  'complete_password_setup_transaction must re-read token AFTER locking user row'
);
assert.ok(
  /FOR\s+UPDATE/i.test(secondTokenSelect[0]),
  'Second token read in complete_password_setup_transaction MUST acquire row lock with FOR UPDATE'
);

// Validation under post-wait snapshot must occur after second read and before writes
const alreadyUsedCheckPos = completeFnBody.indexOf('TOKEN_ALREADY_USED');
const tokenExpiredCheckPos = completeFnBody.indexOf('TOKEN_EXPIRED');
assert.ok(alreadyUsedCheckPos > secondTokenSelectPos, 'TOKEN_ALREADY_USED must be checked after second locked token read');
assert.ok(tokenExpiredCheckPos > secondTokenSelectPos, 'TOKEN_EXPIRED must be checked after second locked token read');

// User status checks must occur after user lock and before writes
const userInactiveCheckPos = completeFnBody.indexOf('USER_INACTIVE');
assert.ok(userInactiveCheckPos > completeUserLockPos, 'USER_INACTIVE must be checked after user lock');

// Writes must occur in consistent order: users -> password_setup_tokens -> sessions
const completeUserUpdatePos = completeFnBody.search(/UPDATE\s+public\.users\b/i);
const completeTokenUpdatePos = completeFnBody.search(/UPDATE\s+public\.password_setup_tokens\b/i);
const completeSessionDeletePos = completeFnBody.search(/DELETE\s+FROM\s+public\.sessions\b/i);

assert.ok(secondTokenSelectPos < completeUserUpdatePos, 'Writes must occur after locked token validation');
assert.ok(completeUserUpdatePos < completeTokenUpdatePos, 'Users update must precede password_setup_tokens update');
assert.ok(completeTokenUpdatePos < completeSessionDeletePos, 'Password_setup_tokens update must precede sessions delete');

// --- Cross-Function Lock Hierarchy Invariant ---
// Both functions follow identical hierarchy: users (1st) -> password_setup_tokens (2nd) -> sessions (3rd)
assert.ok(
  resetUserLockPos < resetTokenUpdatePos && resetTokenUpdatePos < resetSessionDeletePos,
  'reset_password_transaction lock hierarchy violated: must be users -> tokens -> sessions'
);
assert.ok(
  completeUserLockPos < secondTokenSelectPos && secondTokenSelectPos < completeSessionDeletePos,
  'complete_password_setup_transaction lock hierarchy violated: must be users -> tokens -> sessions'
);

// ============================================================
// 3. ROLLBACK CANDIDATE CONTRACT & APPROVAL GUARD
// ============================================================
// GUC approval check
assert.ok(
  /current_setting\(\s*'kurabe\.p98_rollback_approved'\s*,\s*true\s*\)/i.test(cleanRollbackSql),
  'Rollback must inspect custom GUC kurabe.p98_rollback_approved'
);
assert.ok(
  cleanRollbackSql.includes('ROLLBACK_UNAPPROVED'),
  'Rollback must abort with ROLLBACK_UNAPPROVED if GUC is not set'
);
assert.ok(
  !/SET\s+kurabe\.p98_rollback_approved/i.test(cleanRollbackSql),
  'Rollback must NEVER set kurabe.p98_rollback_approved internally'
);

// Provenance inspection before dropping
assert.ok(
  cleanRollbackSql.includes(RESET_PROVENANCE) && cleanRollbackSql.includes(COMPLETE_PROVENANCE),
  'Rollback preflight must inspect exact P98 provenance markers before teardown'
);

// Drops exactly candidate functions
assert.ok(
  cleanRollbackSql.includes('DROP FUNCTION IF EXISTS public.reset_password_transaction'),
  'Rollback must drop public.reset_password_transaction'
);
assert.ok(
  cleanRollbackSql.includes('DROP FUNCTION IF EXISTS public.complete_password_setup_transaction'),
  'Rollback must drop public.complete_password_setup_transaction'
);

// Zero destructive table mutations
assert.ok(!/\bDROP\s+TABLE\b/i.test(cleanRollbackSql), 'Rollback must NOT drop any table');
assert.ok(!/\bDELETE\s+FROM\b/i.test(cleanRollbackSql), 'Rollback must NOT delete any data');
assert.ok(!/\bTRUNCATE\b/i.test(cleanRollbackSql), 'Rollback must NOT truncate any table');

// ============================================================
// 4. SOURCE CODE STATIC CONTRACTS & TYPING
// ============================================================

// 4.1 auth-password-setup.ts
assert.ok(
  helperCode.includes("import 'server-only'") || helperCode.includes('import "server-only"'),
  'auth-password-setup.ts must import server-only'
);
assert.ok(
  helperCode.includes('crypto.randomBytes(32)'),
  'auth-password-setup.ts must use 256-bit cryptographically secure randomBytes'
);
assert.ok(
  helperCode.includes("crypto.createHash('sha256')") || helperCode.includes('crypto.createHash("sha256")'),
  'auth-password-setup.ts must use SHA-256 for token hashing'
);
assert.ok(
  helperCode.includes('SETUP_TOKEN_EXPIRY_MINUTES') || helperCode.includes('SETUP_TOKEN_MAX_AGE_MS'),
  'auth-password-setup.ts must enforce short bounded expiry'
);
assert.ok(
  helperCode.includes('export function isValidTokenFormat'),
  'auth-password-setup.ts must export isValidTokenFormat'
);
assert.ok(
  helperCode.includes('export function hashSetupToken'),
  'auth-password-setup.ts must export hashSetupToken'
);
assert.ok(
  helperCode.includes('export function generateSetupToken'),
  'auth-password-setup.ts must export generateSetupToken'
);
assert.ok(
  helperCode.includes('export async function executePasswordResetRpc'),
  'auth-password-setup.ts must export executePasswordResetRpc'
);
assert.ok(
  helperCode.includes('export async function completePasswordSetupCore'),
  'auth-password-setup.ts must export completePasswordSetupCore'
);

// 4.2 account.ts
assert.ok(
  accountCode.includes('requireManager()'),
  'account.ts resetPassword must call requireManager()'
);
assert.ok(
  accountCode.includes('executePasswordResetRpc'),
  'account.ts resetPassword must invoke executePasswordResetRpc'
);
assert.ok(
  accountCode.includes('export async function completePasswordSetup'),
  'account.ts must export completePasswordSetup'
);
assert.ok(
  accountCode.includes('ResetPasswordResult'),
  'account.ts must export ResetPasswordResult type'
);

// 4.3 auth.ts
assert.ok(
  authCode.includes('!user.password_hash || user.password_setup_required'),
  'auth.ts loginAction must fail-closed on NULL password_hash OR password_setup_required'
);
assert.ok(
  authCode.includes('export async function completePasswordSetup'),
  'auth.ts must export completePasswordSetup'
);
assert.ok(
  authCode.includes('DUMMY_BCRYPT_HASH'),
  'auth.ts must declare a fixed valid dummy bcrypt hash for timing safety'
);
assert.ok(
  !authCode.includes('Vui lòng nhập mật khẩu.'),
  'auth.ts must not return a differing error for empty password'
);

// ============================================================
// 5. DETERMINISTIC BEHAVIORAL SIMULATIONS
// ============================================================

// 5.1 Deterministic Login Logic Simulation
const DUMMY_BCRYPT_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoOhi55j8KPGWprDAOWfcL6NwgVB5e3EmK';
const GENERIC_AUTH_ERROR = 'Mã nhân viên hoặc mật khẩu không đúng.';

function simulateLogin({
  userExists,
  isActive,
  passwordHash,
  passwordSetupRequired,
  providedPassword,
}) {
  const attempts = [];
  const cleanCode = 'TEST_EMP';
  const ip = '127.0.0.1';

  if (!userExists || !isActive) {
    attempts.push({ employee_code: cleanCode, ip });
    return {
      success: false,
      error: GENERIC_AUTH_ERROR,
      attempts,
      comparisonExecuted: false,
      targetHashUsed: null,
    };
  }

  // For every existing active account login attempt, always execute one bcrypt.compare
  // using real stored hash when normal password account has one, otherwise fixed valid dummy hash.
  const isSetupIncomplete = !passwordHash || Boolean(passwordSetupRequired);
  const targetHash = isSetupIncomplete ? DUMMY_BCRYPT_HASH : passwordHash;
  const passwordCandidate = typeof providedPassword === 'string' ? providedPassword : '';

  const valid = bcrypt.compareSync(passwordCandidate, targetHash);
  const comparisonExecuted = true;

  if (isSetupIncomplete || !valid || !providedPassword) {
    attempts.push({ employee_code: cleanCode, ip });
    return {
      success: false,
      error: GENERIC_AUTH_ERROR,
      attempts,
      comparisonExecuted,
      targetHashUsed: targetHash,
    };
  }

  // Login successful
  return {
    success: true,
    attemptsCleared: true,
    comparisonExecuted,
    targetHashUsed: targetHash,
  };
}

const KNOWN_SECRET = 'CorrectP@ssw0rd123';
const KNOWN_HASH = bcrypt.hashSync(KNOWN_SECRET, 10);

// Case 5.1.1: Valid login with valid password and setup_required = false
const validLoginRes = simulateLogin({
  userExists: true,
  isActive: true,
  passwordHash: KNOWN_HASH,
  passwordSetupRequired: false,
  providedPassword: KNOWN_SECRET,
});
assert.strictEqual(validLoginRes.success, true, 'Valid password login must succeed');
assert.strictEqual(validLoginRes.comparisonExecuted, true, 'Valid password login must execute comparison');
assert.strictEqual(validLoginRes.targetHashUsed, KNOWN_HASH, 'Valid login must compare against user password_hash');

// Case 5.1.2: Wrong password login
const wrongPwRes = simulateLogin({
  userExists: true,
  isActive: true,
  passwordHash: KNOWN_HASH,
  passwordSetupRequired: false,
  providedPassword: 'WrongPassword!',
});
assert.strictEqual(wrongPwRes.success, false, 'Wrong password must fail');
assert.strictEqual(wrongPwRes.error, GENERIC_AUTH_ERROR);
assert.strictEqual(wrongPwRes.attempts.length, 1, 'Failed attempt must be recorded');
assert.strictEqual(wrongPwRes.comparisonExecuted, true, 'Comparison must execute on wrong password');
assert.strictEqual(wrongPwRes.targetHashUsed, KNOWN_HASH, 'Wrong password must compare against stored hash');

// Case 5.1.3: Legacy NULL password account MUST fail closed
const nullPwRes = simulateLogin({
  userExists: true,
  isActive: true,
  passwordHash: null,
  passwordSetupRequired: false,
  providedPassword: KNOWN_SECRET,
});
assert.strictEqual(nullPwRes.success, false, 'NULL password_hash must fail closed');
assert.strictEqual(nullPwRes.error, GENERIC_AUTH_ERROR);
assert.strictEqual(nullPwRes.attempts.length, 1, 'Failed attempt must be recorded for NULL password');
assert.strictEqual(nullPwRes.comparisonExecuted, true, 'Comparison must execute for NULL password account');
assert.strictEqual(nullPwRes.targetHashUsed, DUMMY_BCRYPT_HASH, 'NULL password account must compare against dummy hash');

// Case 5.1.4: Legacy NULL password with empty password MUST also fail closed (Q3 bypass closed)
const nullPwEmptyRes = simulateLogin({
  userExists: true,
  isActive: true,
  passwordHash: null,
  passwordSetupRequired: false,
  providedPassword: '',
});
assert.strictEqual(nullPwEmptyRes.success, false, 'NULL password_hash with empty password must fail closed');
assert.strictEqual(nullPwEmptyRes.error, GENERIC_AUTH_ERROR);
assert.strictEqual(nullPwEmptyRes.attempts.length, 1, 'Attempt recorded for empty password on NULL account');
assert.strictEqual(nullPwEmptyRes.comparisonExecuted, true, 'Comparison must execute for empty password on NULL account');
assert.strictEqual(nullPwEmptyRes.targetHashUsed, DUMMY_BCRYPT_HASH, 'NULL password account must compare against dummy hash');

// Case 5.1.5: Setup-required account MUST fail closed even if password_hash is set
const setupReqRes = simulateLogin({
  userExists: true,
  isActive: true,
  passwordHash: KNOWN_HASH,
  passwordSetupRequired: true,
  providedPassword: KNOWN_SECRET,
});
assert.strictEqual(setupReqRes.success, false, 'Setup-required account must fail closed');
assert.strictEqual(setupReqRes.error, GENERIC_AUTH_ERROR);
assert.strictEqual(setupReqRes.attempts.length, 1, 'Attempt recorded for setup-required account');
assert.strictEqual(setupReqRes.comparisonExecuted, true, 'Comparison must execute for setup-required account');
assert.strictEqual(setupReqRes.targetHashUsed, DUMMY_BCRYPT_HASH, 'Setup-required account must compare against dummy hash');

// Case 5.1.6: Setup-required account with empty password MUST also fail closed
const setupReqEmptyRes = simulateLogin({
  userExists: true,
  isActive: true,
  passwordHash: KNOWN_HASH,
  passwordSetupRequired: true,
  providedPassword: '',
});
assert.strictEqual(setupReqEmptyRes.success, false, 'Setup-required account with empty password must fail closed');
assert.strictEqual(setupReqEmptyRes.error, GENERIC_AUTH_ERROR);
assert.strictEqual(setupReqEmptyRes.attempts.length, 1, 'Attempt recorded for empty password on setup-required account');
assert.strictEqual(setupReqEmptyRes.comparisonExecuted, true, 'Comparison must execute for empty password on setup-required account');
assert.strictEqual(setupReqEmptyRes.targetHashUsed, DUMMY_BCRYPT_HASH, 'Setup-required account must compare against dummy hash');

// Case 5.1.7: Inactive user
const inactiveRes = simulateLogin({
  userExists: true,
  isActive: false,
  passwordHash: KNOWN_HASH,
  passwordSetupRequired: false,
  providedPassword: KNOWN_SECRET,
});
assert.strictEqual(inactiveRes.success, false, 'Inactive account must fail closed');
assert.strictEqual(inactiveRes.error, GENERIC_AUTH_ERROR);
assert.strictEqual(inactiveRes.attempts.length, 1, 'Attempt recorded for inactive user');

// Case 5.1.8: Empty password on normal account MUST return generic error (prevents state leakage)
const emptyPwRes = simulateLogin({
  userExists: true,
  isActive: true,
  passwordHash: KNOWN_HASH,
  passwordSetupRequired: false,
  providedPassword: '',
});
assert.strictEqual(emptyPwRes.success, false, 'Empty password on normal account must fail');
assert.strictEqual(emptyPwRes.error, GENERIC_AUTH_ERROR, 'Empty password must return generic error');
assert.strictEqual(emptyPwRes.attempts.length, 1, 'Attempt recorded for empty password on normal account');
assert.strictEqual(emptyPwRes.comparisonExecuted, true, 'Comparison must execute for empty password on normal account');
assert.strictEqual(emptyPwRes.targetHashUsed, KNOWN_HASH, 'Normal account must compare against user password_hash');

// Case 5.1.9: Strict Generic-Error & Comparison Invariance across all failure modes
const securityFailureCases = [
  { label: 'wrong password', res: wrongPwRes },
  { label: 'NULL password_hash', res: nullPwRes },
  { label: 'NULL password_hash with empty password', res: nullPwEmptyRes },
  { label: 'setup-required account with secret', res: setupReqRes },
  { label: 'setup-required account with empty password', res: setupReqEmptyRes },
  { label: 'empty password on normal account', res: emptyPwRes },
];

for (const { label, res } of securityFailureCases) {
  assert.strictEqual(res.success, false, `${label} must fail`);
  assert.strictEqual(res.error, GENERIC_AUTH_ERROR, `${label} must return generic error`);
  assert.strictEqual(res.error, wrongPwRes.error, `${label} must match wrong-password error exactly`);
  assert.strictEqual(res.attempts.length, 1, `${label} must record failed login attempt`);
  assert.strictEqual(res.comparisonExecuted, true, `${label} must exercise comparison path`);
}

// 5.2 Token Format Validation & Hashing
function isValidTokenFormat(token) {
  if (!token || typeof token !== 'string') return false;
  return /^[0-9a-f]{64}$/i.test(token.trim());
}

function hashSetupToken(token) {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

// Valid tokens
const tokenA = crypto.randomBytes(32).toString('hex');
const tokenB = crypto.randomBytes(32).toString('hex');
assert.strictEqual(isValidTokenFormat(tokenA), true, '64 hex char token must be valid format');
assert.strictEqual(isValidTokenFormat(tokenB), true, '64 hex char token must be valid format');
assert.notStrictEqual(tokenA, tokenB, 'Random tokens must be unique');

// Invalid tokens rejected fail-closed
assert.strictEqual(isValidTokenFormat(''), false, 'Empty token must be rejected');
assert.strictEqual(isValidTokenFormat('not-a-hex-token'), false, 'Non-hex token must be rejected');
assert.strictEqual(isValidTokenFormat('a'.repeat(63)), false, 'Short token (63 chars) must be rejected');
assert.strictEqual(isValidTokenFormat('a'.repeat(65)), false, 'Long token (65 chars) must be rejected');
assert.strictEqual(isValidTokenFormat('123e4567-e89b-12d3-a456-426614174000'), false, 'UUID must be rejected');
assert.strictEqual(isValidTokenFormat(null), false, 'null must be rejected');
assert.strictEqual(isValidTokenFormat(undefined), false, 'undefined must be rejected');

// Deterministic hashing verification
const sampleToken = '0123456789abcdef'.repeat(4);
const expectedHash = crypto.createHash('sha256').update(sampleToken).digest('hex');
assert.strictEqual(hashSetupToken(sampleToken), expectedHash, 'hashSetupToken must match standard SHA-256');

// 5.3 Simulated State Machine for Reset & Setup Completion
class MockDatabase {
  constructor() {
    this.users = new Map();
    this.sessions = [];
    this.tokens = [];
    this.auditLogs = [];
  }

  addUser(id, data) {
    this.users.set(id, { id, is_active: true, password_hash: null, password_setup_required: false, ...data });
  }

  addSession(userId) {
    const session = { id: crypto.randomUUID(), user_id: userId, expires_at: new Date(Date.now() + 86400000).toISOString() };
    this.sessions.push(session);
    return session;
  }

  resetPasswordTransaction(userId, tokenHash, expiresAt) {
    const user = this.users.get(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!user.is_active) throw new Error('USER_INACTIVE');

    // 1. Mark user setup_required and clear password_hash
    user.password_setup_required = true;
    user.password_hash = null;

    // 2. Revoke any prior unconsumed setup tokens (tokens before sessions)
    const nowIso = new Date().toISOString();
    for (const t of this.tokens) {
      if (t.user_id === userId && !t.used_at) {
        t.used_at = nowIso;
      }
    }

    // 3. Revoke all active sessions
    this.sessions = this.sessions.filter(s => s.user_id !== userId);

    // 4. Insert new token record
    const record = {
      id: crypto.randomUUID(),
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used_at: null,
      created_at: nowIso,
    };
    this.tokens.push(record);
    return { token_id: record.id, user_id: userId, expires_at: expiresAt };
  }

  completePasswordSetupTransaction(tokenHash, passwordHash) {
    // 1. Resolve token -> user_id without locking
    const initialRecord = this.tokens.find(t => t.token_hash === tokenHash);
    if (!initialRecord) throw new Error('TOKEN_NOT_FOUND');

    // 2. Lock and verify associated user first
    const user = this.users.get(initialRecord.user_id);
    if (!user) throw new Error('USER_NOT_FOUND');
    if (!user.is_active) throw new Error('USER_INACTIVE');

    // 3. Re-read and validate token under post-wait snapshot
    const record = this.tokens.find(t => t.token_hash === tokenHash);
    if (!record) throw new Error('TOKEN_NOT_FOUND');
    if (record.used_at) throw new Error('TOKEN_ALREADY_USED');
    if (new Date(record.expires_at) <= new Date()) throw new Error('TOKEN_EXPIRED');

    // 4. Update password and clear setup_required
    user.password_hash = passwordHash;
    user.password_setup_required = false;

    // 5. Consume this token and revoke other unconsumed tokens
    const nowIso = new Date().toISOString();
    for (const t of this.tokens) {
      if (t.user_id === record.user_id && !t.used_at) {
        t.used_at = nowIso;
      }
    }

    // 6. Revoke existing sessions
    this.sessions = this.sessions.filter(s => s.user_id !== record.user_id);

    return { user_id: record.user_id };
  }
}

// 5.4 Test Unauthorized Reset
function simulateResetPasswordAction(callerRole, targetUserId, db) {
  if (callerRole !== 'Manager') {
    return { success: false, error: 'Bạn không có quyền thực hiện thao tác này.' };
  }
  if (!targetUserId || !targetUserId.trim()) {
    return { success: false, error: 'Thiếu thông tin tài khoản.' };
  }

  try {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSetupToken(rawToken);
    const expiresAt = new Date(Date.now() + 1800000).toISOString();
    db.resetPasswordTransaction(targetUserId, tokenHash, expiresAt);
    return { success: true, setupToken: rawToken, expiresAt };
  } catch {
    return { success: false, error: 'Lỗi đặt lại mật khẩu. Vui lòng thử lại.' };
  }
}

const mockDb = new MockDatabase();
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
mockDb.addUser(USER_ID, { employee_code: 'NV001', password_hash: KNOWN_HASH });
mockDb.addSession(USER_ID);
assert.strictEqual(mockDb.sessions.length, 1, 'Initial session exists');

// Employee cannot reset
const empReset = simulateResetPasswordAction('Employee', USER_ID, mockDb);
assert.strictEqual(empReset.success, false, 'Non-manager cannot reset password');
assert.strictEqual(empReset.error, 'Bạn không có quyền thực hiện thao tác này.');

// Leader cannot reset
const leaderReset = simulateResetPasswordAction('Leader', USER_ID, mockDb);
assert.strictEqual(leaderReset.success, false, 'Leader cannot reset password');

// Manager can reset
const mgrReset = simulateResetPasswordAction('Manager', USER_ID, mockDb);
assert.strictEqual(mgrReset.success, true, 'Manager can reset password');
assert.ok(mgrReset.setupToken && mgrReset.setupToken.length === 64, 'Reset returns 64-char setup token');
assert.strictEqual(mockDb.sessions.length, 0, 'Reset must atomically revoke user sessions');

const userAfterReset = mockDb.users.get(USER_ID);
assert.strictEqual(userAfterReset.password_setup_required, true, 'User marked setup_required');
assert.strictEqual(userAfterReset.password_hash, null, 'User password_hash wiped');

// 5.5 Complete Setup Validation & Invariant Testing
function simulateCompleteSetupAction(token, newPassword, confirmPassword, db) {
  const cleanToken = (token || '').trim();
  if (!isValidTokenFormat(cleanToken)) {
    return { success: false, error: 'Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn.' };
  }
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' };
  }
  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    return { success: false, error: 'Mật khẩu xác nhận không khớp.' };
  }

  try {
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    const tokenHash = hashSetupToken(cleanToken);
    db.completePasswordSetupTransaction(tokenHash, passwordHash);
    return { success: true };
  } catch {
    return { success: false, error: 'Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn.' };
  }
}

// Case 5.5.1: Mismatched confirm password
const mismatchRes = simulateCompleteSetupAction(mgrReset.setupToken, 'NewPass123', 'Different123', mockDb);
assert.strictEqual(mismatchRes.success, false, 'Mismatched passwords must fail');
assert.strictEqual(mismatchRes.error, 'Mật khẩu xác nhận không khớp.');

// Case 5.5.2: Short password (< 6 characters)
const shortRes = simulateCompleteSetupAction(mgrReset.setupToken, '12345', '12345', mockDb);
assert.strictEqual(shortRes.success, false, 'Password < 6 chars must fail');
assert.strictEqual(shortRes.error, 'Mật khẩu mới phải có ít nhất 6 ký tự.');

// Case 5.5.3: Unknown / forged token fails with generic error (no leakage)
const forgedToken = crypto.randomBytes(32).toString('hex');
const forgedRes = simulateCompleteSetupAction(forgedToken, 'NewPass123', 'NewPass123', mockDb);
assert.strictEqual(forgedRes.success, false, 'Forged token must fail');
assert.strictEqual(forgedRes.error, 'Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn.');

// Case 5.5.4: Successful setup with valid token
const NEW_PASSWORD = 'BrandNewPassword2026!';
const setupRes = simulateCompleteSetupAction(mgrReset.setupToken, NEW_PASSWORD, NEW_PASSWORD, mockDb);
assert.strictEqual(setupRes.success, true, 'Valid setup must succeed');

const userAfterSetup = mockDb.users.get(USER_ID);
assert.strictEqual(userAfterSetup.password_setup_required, false, 'Setup-required must be cleared to false');
assert.ok(userAfterSetup.password_hash !== null, 'Password hash must be set');
assert.ok(bcrypt.compareSync(NEW_PASSWORD, userAfterSetup.password_hash), 'New password hash must match');

// Case 5.5.5: Token reuse rejected (one-time use invariant)
const reuseRes = simulateCompleteSetupAction(mgrReset.setupToken, 'AnotherPass123', 'AnotherPass123', mockDb);
assert.strictEqual(reuseRes.success, false, 'Reused token must be rejected');
assert.strictEqual(reuseRes.error, 'Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn.');

// Case 5.5.6: Expired token rejected fail-closed
const expiredTokenRaw = crypto.randomBytes(32).toString('hex');
const expiredTokenHash = hashSetupToken(expiredTokenRaw);
// Insert token with past expiry
mockDb.tokens.push({
  id: crypto.randomUUID(),
  user_id: USER_ID,
  token_hash: expiredTokenHash,
  expires_at: new Date(Date.now() - 1000).toISOString(),
  used_at: null,
  created_at: new Date(Date.now() - 2000).toISOString(),
});
const expiredRes = simulateCompleteSetupAction(expiredTokenRaw, 'ValidPassword123', 'ValidPassword123', mockDb);
assert.strictEqual(expiredRes.success, false, 'Expired token must be rejected');
assert.strictEqual(expiredRes.error, 'Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn.');

// 5.6 End-to-End Setup-to-Login Lifecycle
// Now that user completed setup, login with old password fails, login with new password succeeds!
const oldLoginRes = simulateLogin({
  userExists: true,
  isActive: userAfterSetup.is_active,
  passwordHash: userAfterSetup.password_hash,
  passwordSetupRequired: userAfterSetup.password_setup_required,
  providedPassword: KNOWN_SECRET,
});
assert.strictEqual(oldLoginRes.success, false, 'Login with old password must fail after password setup');

const newLoginRes = simulateLogin({
  userExists: true,
  isActive: userAfterSetup.is_active,
  passwordHash: userAfterSetup.password_hash,
  passwordSetupRequired: userAfterSetup.password_setup_required,
  providedPassword: NEW_PASSWORD,
});
assert.strictEqual(newLoginRes.success, true, 'Login with new password must succeed after password setup');

// ============================================================
// 6. RAW SECRET LEAK PREVENTION STATIC SCAN
// ============================================================
const sensitiveFiles = [
  { name: 'src/lib/auth-password-setup.ts', content: helperCode },
  { name: 'src/actions/account.ts', content: accountCode },
  { name: 'src/actions/auth.ts', content: authCode },
];

for (const { name, content } of sensitiveFiles) {
  // Ensure no console.log / warn of raw tokens or passwords
  assert.ok(
    !/console\.(log|info|warn|error)\s*\([^)]*\b(token|setupToken|password|passwordHash|rawPassword)\b[^)]*\)/i.test(content),
    `File ${name} must NOT log raw tokens or passwords`
  );
}

console.log('[PASS] All deterministic contract assertions verified for P98M2T02 password setup & login hardening.');
