import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');
const read = (rel) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

// ============================================================================
// P110M4T02 — client UX/data-loss fixes from the E2E audit:
//  (1) evaluation save buttons stay disabled through the post-submit redirect
//      window (no contradictory error toast on a fast second click);
//  (2) period close/delete surface transport errors with a toast (no silent
//      un-busy button);
//  (3) login submit has a pending state (disabled + label);
//  (4) EmployeeModal default joinDate uses the LOCAL calendar date;
//  (5) PeriodModal year input no longer feeds NaN into state;
//  (6) password reset guards against double-click double tokens;
//  (7) /criteria renders nothing for individual roles (no pre-redirect flash);
//  (8) user/team mutations invalidate the detail cache families
//      ('team','team-users','users-batch','user') and 'criteria-edit-state' is
//      period-scoped;
//  (9) summary-batch cache key is order-insensitive; client no longer
//      value-imports from a server-only module; dead write-only state removed.
// ============================================================================

// (1) submit redirect guard
const evalClient = read('src/app/evaluations/[id]/EvaluationPageClient.tsx');
assert.match(evalClient, /const \[submitRedirectPending, setSubmitRedirectPending\] = useState\(false\);/,
  'redirect-pending state exists');
assert.match(evalClient, /setSubmitRedirectPending\(true\);/,
  'set on submit success before the redirect timer');
assert.equal((evalClient.match(/disabled=\{isSaving \|\| submitRedirectPending\}/g) || []).length,
  (evalClient.match(/disabled=\{isSaving\}/g) || []).length + 4,
  'every former isSaving guard now includes submitRedirectPending');

// (2) period close/delete catch
const periodActions = read('src/components/dashboard/PeriodActions.tsx');
assert.match(periodActions, /catch \(err\) \{[\s\S]{0,200}console\.error\('closeEvaluationPeriod error/, 'close has catch');
assert.match(periodActions, /catch \(err\) \{[\s\S]{0,200}console\.error\('deleteEvaluationPeriod error/, 'delete has catch');
assert.ok((periodActions.match(/Lỗi kết nối/g) || []).length >= 2, 'both handlers toast a connection error');

// (3) login pending state
const loginPage = read('src/app/login/page.tsx');
assert.match(loginPage, /if \(isSubmitting\) return;/, 'double-submit guard');
assert.match(loginPage, /disabled=\{isSubmitting\}/, 'submit disabled while pending');
assert.match(loginPage, /isSubmitting \? 'Đang đăng nhập\.\.\.' : 'Đăng nhập'/, 'pending label');

// (4) local joinDate default
const employeeModal = read('src/components/modals/EmployeeModal.tsx');
assert.match(employeeModal, /getTimezoneOffset\(\) \* 60000/, 'joinDate default is timezone-corrected');
assert.doesNotMatch(employeeModal, /new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/, 'raw UTC default removed');

// (5) year NaN guard
const periodModal = read('src/components/modals/PeriodModal.tsx');
assert.match(periodModal, /Number\.isNaN\(parsed\) \? 0 : parsed/, 'empty year input maps to 0, never NaN');

// (6) reset password double-click guard
const employeesClient = read('src/components/employees/EmployeesClient.tsx');
assert.match(employeesClient, /if \(resettingPasswordId\) return;/, 'in-flight reset short-circuits');
assert.match(employeesClient, /disabled=\{resettingPasswordId === item\.id\}/, 'per-row disable while resetting');

// (7) criteria no-flash
const criteriaPage = read('src/app/criteria/page.tsx');
assert.match(criteriaPage, /if \(isIndividualRole\(user\?\.role\)\) return null;\s*\n\s*return \(/,
  'individual roles render nothing before the redirect (gate sits right before the JSX return, after all hooks)');

// (8) invalidation families
const useDb = read('src/hooks/use-db.ts');
const userBlocks = (useDb.match(/invalidateRequesterQueries\(queryClient, 'team-users', requesterRef\.current\);/g) || []).length;
assert.ok(userBlocks >= 5, `user+team mutations now invalidate detail families (found ${userBlocks} team-users calls)`);
assert.match(useDb, /invalidateRequesterQueries\(queryClient, 'user', requesterRef\.current\);/, 'user family invalidated');
const authContext = read('src/contexts/AuthContext.tsx');
assert.match(authContext, /PERIOD_SCOPED_QUERY_FAMILIES = new Set\(\[\s*\n\s*'criteria-edit-state',/,
  'criteria-edit-state is period-scoped');

// (9) misc
assert.match(useDb, /\[\.\.\.employeeIds\]\.sort\(\)\.join\(','\)/, 'summary-batch key is order-insensitive');
assert.match(useDb, /import type \{ UsersBatchOptions \}/, 'server-only module import is type-only');
const teamDetail = read('src/app/teams/[id]/page.tsx');
assert.doesNotMatch(teamDetail, /const \[, setIsSaving\] = useState\(false\);/, 'write-only state removed');

console.log('P110M4T02 client UX fixes: ALL PASS');
