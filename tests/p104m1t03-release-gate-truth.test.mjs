#!/usr/bin/env node
/**
 * Focused regression test suite for Task P104M1T03: Release-Gate Truth (Findings F07 and F08).
 *
 * Verifies:
 * 1. F07 ACL Verification:
 *    - clean ACL passes with exact overload signatures and service_role execute.
 *    - PUBLIC grant (grantee=0) retained via LEFT JOIN rather than lost via INNER JOIN; fails closed.
 *    - direct anon and authenticated grants fail closed.
 *    - inherited effective grants via role membership fail closed via has_function_privilege.
 *    - extra overloads or wrong signatures fail closed.
 *    - missing required functions or ambiguous definitions fail closed.
 * 2. F08 Cleanup Verification:
 *    - successful cleanup verifies actual container absence.
 *    - docker rm nonzero fails closed and participates in final verdict.
 *    - container still exists after removal fails closed.
 *    - docker inspect unavailable fails closed.
 *    - simultaneous primary failure + cleanup failure preserves both failures (PreflightDualError).
 *    - cleanup failure alone causes preflight run() to fail rather than claiming false PASS.
 * 3. Checklist truth:
 *    - docs/P103_RELEASE_CHECKLIST.md uses LEFT JOIN to retain PUBLIC (grantee=0).
 *    - binds exact function overload identity arguments.
 *    - includes effective has_function_privilege verification.
 *
 * Run: node tests/p104m1t03-release-gate-truth.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PreflightDualError,
  verifyReleaseFunctionAcls,
  cleanupDisposableContainer,
  run,
  projectRoot,
} from './operations/p103-release-preflight.mjs';

const cases = [];
function test(name, fn) {
  try {
    fn();
    cases.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    cases.push({ name, passed: false, error: err });
    console.error(`  ✗ ${name}: ${err.message}`);
    throw err;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    cases.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    cases.push({ name, passed: false, error: err });
    console.error(`  ✗ ${name}: ${err.message}`);
    throw err;
  }
}

console.log('=== P104M1T03: Release-Gate Truth Test Suite ===\n');

// Standard clean test fixtures
const CLEAN_OVERLOADS = [
  'return_evaluation_round_transaction|uuid, integer, uuid, text|4|postgres',
  'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|17|postgres',
].join('\n');

const CLEAN_ACL = [
  'return_evaluation_round_transaction|uuid, integer, uuid, text|postgres|EXECUTE',
  'return_evaluation_round_transaction|uuid, integer, uuid, text|service_role|EXECUTE',
  'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|postgres|EXECUTE',
  'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|service_role|EXECUTE',
].join('\n');

const CLEAN_EFFECTIVE = [
  'return_evaluation_round_transaction|uuid, integer, uuid, text|false|false|true',
  'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|false|false|true',
].join('\n');

function createSqlRunner({ overloads = CLEAN_OVERLOADS, acl = CLEAN_ACL, effective = CLEAN_EFFECTIVE } = {}) {
  return (sql) => {
    const s = String(sql);
    if (s.includes('p.pronargs::text')) {
      return overloads;
    }
    if (s.includes('aclexplode')) {
      return acl;
    }
    if (s.includes('has_function_privilege')) {
      return effective;
    }
    return '';
  };
}

// -----------------------------------------------------------------------------
// Group 1: ACL Verification Regressions (Finding F07)
// -----------------------------------------------------------------------------

test('1. clean ACL passes with exact overload signatures and service_role execute', () => {
  const runner = createSqlRunner();
  const result = verifyReleaseFunctionAcls(runner);
  assert.equal(result.verified, true);
  assert.equal(result.functions.length, 2);
  assert.equal(result.effectiveResults.length, 2);
  for (const eff of result.effectiveResults) {
    assert.equal(eff.anonExecute, false);
    assert.equal(eff.authenticatedExecute, false);
    assert.equal(eff.serviceRoleExecute, true);
  }
});

test('2. PUBLIC grant (grantee=0) retained via LEFT JOIN and fails closed (F07)', () => {
  // Demonstration of inner join loss:
  // In pg_roles, grantee=0 does not exist. An inner join filters it out completely.
  const innerJoinAclQuerySimulatedOutput = CLEAN_ACL; // Inner join drops grantee=0, so it appears "clean"!
  assert.doesNotThrow(() => {
    // If verifier only saw inner-join output, it would falsely pass!
    verifyReleaseFunctionAcls(createSqlRunner({ acl: innerJoinAclQuerySimulatedOutput }));
  });

  // With LEFT JOIN, grantee=0 is retained as 'PUBLIC':
  const retainedPublicAcl = [
    CLEAN_ACL,
    'return_evaluation_round_transaction|uuid, integer, uuid, text|PUBLIC|EXECUTE',
  ].join('\n');

  assert.throws(
    () => {
      verifyReleaseFunctionAcls(createSqlRunner({ acl: retainedPublicAcl }));
    },
    (err) => {
      assert.match(err.message, /FORBIDDEN_GRANT.*PUBLIC/);
      return true;
    },
    'Must fail closed when explicit EXECUTE is granted to PUBLIC'
  );

  // Also verify effective check catches PUBLIC grants even if ACL query was corrupted:
  // (because in PostgreSQL, PUBLIC grant makes has_function_privilege('anon', ...) return true)
  const effectivePublicLeak = [
    'return_evaluation_round_transaction|uuid, integer, uuid, text|true|true|true',
    'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|false|false|true',
  ].join('\n');

  assert.throws(
    () => {
      verifyReleaseFunctionAcls(createSqlRunner({ acl: CLEAN_ACL, effective: effectivePublicLeak }));
    },
    (err) => {
      assert.match(err.message, /EFFECTIVE_EXECUTE_LEAK.*anon/);
      return true;
    },
    'Must fail closed when effective EXECUTE leaks to anon via PUBLIC'
  );
});

test('3. direct anon and authenticated grants fail closed', () => {
  // Direct anon grant in explicit ACL
  const anonAcl = [
    CLEAN_ACL,
    'return_evaluation_round_transaction|uuid, integer, uuid, text|anon|EXECUTE',
  ].join('\n');
  assert.throws(
    () => verifyReleaseFunctionAcls(createSqlRunner({ acl: anonAcl })),
    /FORBIDDEN_GRANT.*anon/
  );

  // Direct authenticated grant in explicit ACL
  const authAcl = [
    CLEAN_ACL,
    'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|authenticated|EXECUTE',
  ].join('\n');
  assert.throws(
    () => verifyReleaseFunctionAcls(createSqlRunner({ acl: authAcl })),
    /FORBIDDEN_GRANT.*authenticated/
  );

  // Direct leak visible in effective privileges
  const authEffectiveLeak = [
    'return_evaluation_round_transaction|uuid, integer, uuid, text|false|false|true',
    'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|false|true|true',
  ].join('\n');
  assert.throws(
    () => verifyReleaseFunctionAcls(createSqlRunner({ effective: authEffectiveLeak })),
    /EFFECTIVE_EXECUTE_LEAK.*authenticated/
  );
});

test('4. inherited effective grant via intermediate role fails closed', () => {
  // Suppose explicit ACL was granted to an intermediate group role "qa_custom_readers",
  // where "anon" is a member of that group role.
  // The explicit ACL does NOT name anon directly, but has_function_privilege evaluates true.
  const intermediateRoleAcl = [
    'return_evaluation_round_transaction|uuid, integer, uuid, text|postgres|EXECUTE',
    'return_evaluation_round_transaction|uuid, integer, uuid, text|service_role|EXECUTE',
    'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|postgres|EXECUTE',
    'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|service_role|EXECUTE',
  ].join('\n');

  const inheritedEffectiveLeak = [
    'return_evaluation_round_transaction|uuid, integer, uuid, text|true|false|true',
    'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|false|false|true',
  ].join('\n');

  assert.throws(
    () => {
      verifyReleaseFunctionAcls(createSqlRunner({ acl: intermediateRoleAcl, effective: inheritedEffectiveLeak }));
    },
    (err) => {
      assert.match(err.message, /EFFECTIVE_EXECUTE_LEAK.*anon/);
      return true;
    },
    'Must fail closed when anon inherits EXECUTE privilege through another role'
  );
});

test('5. extra overload, wrong signature, or missing function fails closed', () => {
  // 5a. Extra unexpected overload (e.g. 3-arg legacy or test overload)
  const extraOverload = [
    CLEAN_OVERLOADS,
    'save_evaluation_round_transaction_active_only|uuid, integer, uuid|3|postgres',
  ].join('\n');
  assert.throws(
    () => verifyReleaseFunctionAcls(createSqlRunner({ overloads: extraOverload })),
    /EXTRA_OVERLOAD.*3 arguments/
  );

  // 5b. Wrong argument signature
  const wrongSignature = [
    'return_evaluation_round_transaction|uuid, integer, text|3|postgres',
    'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|17|postgres',
  ].join('\n');
  assert.throws(
    () => verifyReleaseFunctionAcls(createSqlRunner({ overloads: wrongSignature })),
    /EXTRA_OVERLOAD|MISSING_FUNCTION/
  );

  // 5c. Missing required function
  const missingFunction = [
    'return_evaluation_round_transaction|uuid, integer, uuid, text|4|postgres',
  ].join('\n');
  assert.throws(
    () => verifyReleaseFunctionAcls(createSqlRunner({ overloads: missingFunction })),
    /MISSING_FUNCTION.*save_evaluation_round_transaction_active_only/
  );

  // 5d. Missing service_role EXECUTE privilege
  const missingServiceRole = [
    'return_evaluation_round_transaction|uuid, integer, uuid, text|false|false|false',
    'save_evaluation_round_transaction_active_only|uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid|false|false|true',
  ].join('\n');
  assert.throws(
    () => verifyReleaseFunctionAcls(createSqlRunner({ effective: missingServiceRole })),
    /MISSING_PRIVILEGE.*service_role/
  );
});

// -----------------------------------------------------------------------------
// Group 2: Cleanup Verification Regressions (Finding F08)
// -----------------------------------------------------------------------------

test('6. successful cleanup verifies actual container absence', () => {
  const runner = {
    rm: (args) => {
      assert.deepEqual(args, ['rm', '--force', 'test-container']);
      return { status: 0, stdout: 'test-container', stderr: '' };
    },
    inspect: (args) => {
      assert.deepEqual(args, ['inspect', 'test-container']);
      return { status: 1, stdout: '', stderr: 'Error: No such object: test-container' };
    },
  };

  const outcome = cleanupDisposableContainer('test-container', { runner });
  assert.equal(outcome.success, true);
  assert.equal(outcome.removed, true);
  assert.equal(outcome.absent, true);
  assert.equal(outcome.error, null);
  assert.equal(outcome.rmError, null);
  assert.equal(outcome.absenceError, null);
});

test('7. docker rm nonzero fails closed and records error', () => {
  const runner = {
    rm: () => ({ status: 1, stdout: '', stderr: 'Error response from daemon: permission denied' }),
    inspect: () => ({ status: 1, stdout: '', stderr: 'Error: No such object' }),
  };

  const outcome = cleanupDisposableContainer('test-container', { runner });
  assert.equal(outcome.success, false);
  assert.equal(outcome.removed, false);
  assert.ok(outcome.rmError);
  assert.match(outcome.rmError.message, /DOCKER_RM_FAILED.*permission denied/);
  assert.match(outcome.error.message, /DOCKER_RM_FAILED/);
});

test('8. container still exists after removal attempt fails closed', () => {
  const runner = {
    rm: () => ({ status: 0, stdout: 'test-container', stderr: '' }),
    // Inspect reports exit 0 with JSON body, meaning container still exists!
    inspect: () => ({ status: 0, stdout: '[{"Id":"abc123container"}]', stderr: '' }),
  };

  const outcome = cleanupDisposableContainer('test-container', { runner });
  assert.equal(outcome.success, false);
  assert.equal(outcome.removed, true);
  assert.equal(outcome.absent, false);
  assert.ok(outcome.absenceError);
  assert.match(outcome.absenceError.message, /CONTAINER_STILL_EXISTS/);
  assert.match(outcome.error.message, /CONTAINER_STILL_EXISTS/);
});

test('9. inspect unavailable fails closed', () => {
  // 9a. Daemon error / unexpected failure
  const daemonFailRunner = {
    rm: () => ({ status: 0, stdout: 'test-container', stderr: '' }),
    inspect: () => ({ status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock' }),
  };

  const outcomeA = cleanupDisposableContainer('test-container', { runner: daemonFailRunner });
  assert.equal(outcomeA.success, false);
  assert.ok(outcomeA.absenceError);
  assert.match(outcomeA.absenceError.message, /CLEANUP_VERIFICATION_UNAVAILABLE/);

  // 9b. Command spawn error (e.g. ENOENT)
  const spawnErrorRunner = {
    rm: () => ({ status: 0, stdout: 'test-container', stderr: '' }),
    inspect: () => ({ status: null, error: new Error('spawnSync docker ENOENT') }),
  };

  const outcomeB = cleanupDisposableContainer('test-container', { runner: spawnErrorRunner });
  assert.equal(outcomeB.success, false);
  assert.ok(outcomeB.absenceError);
  assert.match(outcomeB.absenceError.message, /CLEANUP_VERIFICATION_UNAVAILABLE/);
});

await testAsync('10. simultaneous primary failure plus cleanup failure preserves both (PreflightDualError)', async () => {
  const primaryErrorMessage = 'PRIMARY_FAILURE_SYNTAX_ERROR_IN_MIGRATION';
  const cleanupErrorMessage = 'DOCKER_RM_PERMISSION_DENIED';

  const options = {
    container: { name: 'dual-fail-container', target: { host: '127.0.0.1', port: 5432 } },
    runSql: (sql) => {
      // Let initial role bootstrap pass, then throw a primary error during baseline apply
      if (sql.includes('pg_roles')) return '';
      throw new Error(primaryErrorMessage);
    },
    runSqlFile: () => { throw new Error(primaryErrorMessage); },
    execSql: () => ({ status: 1, stdout: '', stderr: primaryErrorMessage }),
    cleanupRunner: {
      rm: () => ({ status: 1, stdout: '', stderr: cleanupErrorMessage }),
      inspect: () => ({ status: 0, stdout: 'container-still-alive', stderr: '' }),
    },
  };

  try {
    await run({ options });
    assert.fail('run() must not succeed on dual failure');
  } catch (err) {
    assert.ok(err instanceof PreflightDualError, 'Must throw PreflightDualError');
    assert.ok(err.primaryError, 'Must preserve primaryError');
    assert.ok(err.cleanupError, 'Must preserve cleanupError');
    assert.match(err.primaryError.message, new RegExp(primaryErrorMessage), 'primaryError must match original cause');
    assert.match(err.cleanupError.message, /DOCKER_RM_FAILED|CLEANUP_FAILURE/, 'cleanupError must match cleanup failure');
    assert.match(err.message, /PRIMARY_AND_CLEANUP_FAILURE/, 'Composite message must report dual failure');
    // Ensure primary error was not replaced with cleanup-only error
    assert.ok(err.message.includes(primaryErrorMessage), 'Message must contain primary error text');
  }
});

await testAsync('11. cleanup failure alone causes preflight run() to fail (participates in verdict)', async () => {
  let currentSaveComment = '';
  const options = {
    container: { name: 'cleanup-alone-fail-container', target: { host: '127.0.0.1', port: 5432 } },
    runSql: (sql) => {
      const s = String(sql);
      if (s.includes('BEGIN TRANSACTION READ ONLY')) {
        return 'save_evaluation_round_transaction_active_only\nreturn_evaluation_round_transaction';
      }
      if (s.includes('kurabe:p103m2t01:candidate:v1:function:save_evaluation_round_transaction_active_only')) {
        currentSaveComment = 'kurabe:p103m2t01:candidate:v1:function:save_evaluation_round_transaction_active_only';
      } else if (s.includes('kurabe:p103m1t03:candidate:v1:function:save_evaluation_round_transaction_active_only')) {
        currentSaveComment = 'kurabe:p103m1t03:candidate:v1:function:save_evaluation_round_transaction_active_only';
      } else if (s.includes('COMMENT ON FUNCTION public.save_evaluation_round_transaction_active_only') && s.includes('NULL;')) {
        currentSaveComment = '';
      }

      if (s.includes('obj_description')) {
        if (s.includes("proname = 'return_evaluation_round_transaction'")) {
          return 'kurabe:p103m1t03:candidate:v1:function:return_evaluation_round_transaction';
        }
        if (s.includes("proname = 'save_evaluation_round_transaction_active_only'")) {
          return currentSaveComment;
        }
      }
      if (s.includes('save_evaluation_round_transaction_active_only') && s.includes('pronargs = 17')) {
        return 'CREATE OR REPLACE FUNCTION public.save_evaluation_round_transaction_active_only(...)';
      }
      if (s.includes('return_evaluation_round_transaction') && s.includes('pronargs = 4')) {
        return 'CREATE OR REPLACE FUNCTION public.return_evaluation_round_transaction(...)';
      }
      if (s.includes('md5')) {
        return '0123456789abcdef0123456789abcdef';
      }
      if (s.includes('p.pronargs::text')) {
        return CLEAN_OVERLOADS;
      }
      if (s.includes('aclexplode')) {
        return CLEAN_ACL;
      }
      if (s.includes('has_function_privilege')) {
        return CLEAN_EFFECTIVE;
      }
      if (s.includes('count(*)')) {
        return '1';
      }
      return '';
    },
    runSqlFile: () => '',
    execSql: () => ({ status: 1, stdout: '', stderr: 'P96T05_PERIOD_NOT_ACTIVE' }),
    cleanupRunner: {
      rm: () => ({ status: 1, stderr: 'cleanup-failed-rm' }),
      inspect: () => ({ status: 0, stdout: 'exists' }),
    },
  };

  try {
    await run({ options });
    assert.fail('run() must not succeed when cleanup fails');
  } catch (err) {
    assert.match(err.message, /DOCKER_RM_FAILED|CONTAINER_STILL_EXISTS|CLEANUP_FAILURE/);
    assert.ok(!(err instanceof PreflightDualError), 'Should be cleanup error, not dual error, when primary passed');
  }
});

// -----------------------------------------------------------------------------
// Group 3: Checklist Document Truth & Contract
// -----------------------------------------------------------------------------

test('12. docs/P103_RELEASE_CHECKLIST.md contains truthful SQL template and checklist items', () => {
  const checklistPath = path.join(projectRoot, 'docs', 'P103_RELEASE_CHECKLIST.md');
  assert.ok(fs.existsSync(checklistPath), 'P103_RELEASE_CHECKLIST.md must exist');
  const content = fs.readFileSync(checklistPath, 'utf8');

  // Must use LEFT JOIN to retain PUBLIC (grantee=0)
  assert.ok(
    /LEFT\s+JOIN\s+pg_roles\s+r\s+ON\s+r\.oid\s*=\s*a\.grantee/i.test(content),
    'Checklist must use LEFT JOIN pg_roles to retain PUBLIC (grantee=0)'
  );

  // Must not have inner join dropping PUBLIC
  assert.equal(
    /(?<!\bLEFT\s+)JOIN\s+pg_roles\s+r\s+ON\s+r\.oid\s*=\s*a\.grantee/i.test(content),
    false,
    'Checklist must not use INNER JOIN pg_roles which drops PUBLIC'
  );

  // Must handle CASE WHEN a.grantee = 0 THEN 'PUBLIC'
  assert.ok(
    /CASE\s+WHEN\s+a\.grantee\s*=\s*0\s+THEN\s*'PUBLIC'/i.test(content),
    'Checklist must explicitly map grantee=0 to PUBLIC'
  );

  // Must bind exact function overload identity arguments
  assert.ok(
    /pg_get_function_identity_arguments\(p\.oid\)\s+AS\s+arguments/i.test(content),
    'Checklist must verify pg_get_function_identity_arguments'
  );

  // Must include effective EXECUTE privilege verification
  assert.ok(
    /has_function_privilege\('anon',\s*p\.oid,\s*'EXECUTE'\)/i.test(content),
    'Checklist must verify anon has_function_privilege'
  );
  assert.ok(
    /has_function_privilege\('authenticated',\s*p\.oid,\s*'EXECUTE'\)/i.test(content),
    'Checklist must verify authenticated has_function_privilege'
  );
  assert.ok(
    /has_function_privilege\('service_role',\s*p\.oid,\s*'EXECUTE'\)/i.test(content),
    'Checklist must verify service_role has_function_privilege'
  );

  // Checklist items must record truth for exact overload, PUBLIC retention, and cleanup truth
  assert.ok(
    content.includes('Verify explicit function permissions retain `PUBLIC` (`grantee=0`) via `LEFT JOIN`'),
    'Checklist items must reference PUBLIC retention via LEFT JOIN'
  );
  assert.ok(
    content.includes('Verify effective exact-overload `EXECUTE` privileges: `anon=false`, `authenticated=false`, `service_role=true`'),
    'Checklist items must reference effective exact-overload EXECUTE privileges'
  );
  assert.ok(
    content.includes('Confirm disposable rehearsal cleanup truth: verified container absence with no swallowed removal errors'),
    'Checklist items must reference verified container absence without swallowed errors'
  );
});

console.log(`\nAll ${cases.length} regression tests completed successfully!`);
