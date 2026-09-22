import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';

// Initialize global test state shared across mock modules
globalThis.__test_state = {
  users: [],
  selectError: null,
  updateError: null,
  personnelError: null,
  auditLogs: [],
};

// Register ESM loader hooks to resolve path aliases and mock external/database dependencies
register(`data:text/javascript,
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "bcryptjs") {
    return {
      url: "data:text/javascript," + encodeURIComponent(\`
        export const hash = async (code, rounds) => "\\$2a\\$" + rounds + "\\$mockhash." + Buffer.from(code).toString("base64url");
        export const compare = async (candidate, hashed) => {
          if (!hashed || !hashed.startsWith("\\$2a\\$10\\$mockhash.")) return false;
          const expected = "\\$2a\\$10\\$mockhash." + Buffer.from(candidate).toString("base64url");
          return hashed === expected;
        };
        export default { hash, compare };
      \`),
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier === "@/types" || specifier.startsWith("@/types/")) {
    return {
      url: "data:text/javascript,export const Role={};export const User={};export const Database={};",
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier === "next/cache") {
    return {
      url: "data:text/javascript,export const revalidatePath=()=>{};export const revalidateTag=()=>{};",
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier === "@/lib/auth") {
    return {
      url: "data:text/javascript," + encodeURIComponent(\`
        export const mockAuthUser = { id: "admin-1", role: "Manager", teamId: "t-1" };
        export const requireRole = async () => ({ user: mockAuthUser, error: null });
        export const requireManager = async () => ({ user: mockAuthUser, error: null });
        export const requireAuth = async () => ({ user: mockAuthUser, error: null });
      \`),
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier === "@/lib/audit") {
    return {
      url: "data:text/javascript," + encodeURIComponent(\`
        export const logAudit = async (...args) => {
          globalThis.__test_state.auditLogs.push({ type: "single", args });
        };
        export const logAuditBatch = async (...args) => {
          globalThis.__test_state.auditLogs.push({ type: "batch", args });
        };
      \`),
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier === "@/lib/db/teams-admin") {
    return {
      url: "data:text/javascript,export const getLeaderTeamIds = async () => ['t-1'];",
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier === "@/lib/errors") {
    return {
      url: "data:text/javascript,export const toClientError = (err, fb) => (err && err.message) || fb;",
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier === "@/lib/db/users") {
    return {
      url: "data:text/javascript," + encodeURIComponent(\`
        export const mapUserFromDb = (dbUser) => ({
          id: dbUser.id || "",
          employeeCode: dbUser.employee_code || "",
          name: dbUser.name || "",
          role: dbUser.role || "Employee",
          teamId: dbUser.team_id || "",
          joinDate: dbUser.join_date || "",
          avatar: dbUser.avatar_url || undefined,
          subleaderId: dbUser.subleader_id,
          description: dbUser.description,
          gender: dbUser.gender || "Nữ",
        });
      \`),
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier === "@/lib/db/evaluations-write") {
    return {
      url: "data:text/javascript," + encodeURIComponent(\`
        export const PersonnelTransactionUserInput = {};
        export const applyPersonnelTransaction = async (userInputs, teamInput, actorId) => {
          if (globalThis.__test_state.personnelError) {
            return { data: null, error: globalThis.__test_state.personnelError };
          }
          const createdOrUpdated = [];
          for (const input of userInputs) {
            let existing = globalThis.__test_state.users.find((u) => u.id === input.id);
            if (!existing) {
              existing = {
                id: input.id,
                employee_code: input.employee_code ?? "",
                name: input.name ?? "",
                role: input.role ?? "Employee",
                team_id: input.team_id ?? null,
                join_date: input.join_date ?? null,
                avatar_url: input.avatar_url ?? null,
                subleader_id: input.subleader_id ?? null,
                description: input.description ?? null,
                gender: input.gender ?? "Nữ",
                is_active: input.is_active ?? true,
                password_hash: null,
                password_setup_required: true,
                credential_revision: 0,
              };
              globalThis.__test_state.users.push(existing);
            } else {
              Object.assign(existing, input);
            }
            createdOrUpdated.push({ ...existing });
          }
          return {
            data: { users: createdOrUpdated, team: null, roundsCreated: 0, criteriaSnapshotsCreated: 0 },
            error: null,
          };
        };
      \`),
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier === "@/lib/supabase-admin") {
    return {
      url: "data:text/javascript," + encodeURIComponent(\`
        export const supabaseAdmin = {
          from(table) {
            if (table !== "users") throw new Error("Unexpected table: " + table);
            let inFilters = [];
            let isFilters = [];
            let eqFilters = [];
            let updatePayload = null;

            const builder = {
              select() { return builder; },
              in(col, values) { inFilters.push({ col, values }); return builder; },
              is(col, val) { isFilters.push({ col, val }); return builder; },
              eq(col, val) { eqFilters.push({ col, val }); return builder; },
              update(payload) { updatePayload = payload; return builder; },
              async maybeSingle() {
                if (globalThis.__test_state.selectError) {
                  return { data: null, error: globalThis.__test_state.selectError };
                }
                const filtered = globalThis.__test_state.users.filter((row) => {
                  for (const f of eqFilters) {
                    if (row[f.col] !== f.val) return false;
                  }
                  return true;
                });
                return { data: filtered[0] ? { ...filtered[0] } : null, error: null };
              },
              then(onFulfilled, onRejected) {
                return (async () => {
                  if (updatePayload !== null) {
                    if (globalThis.__test_state.updateError) {
                      return { data: null, error: globalThis.__test_state.updateError };
                    }
                    let updatedCount = 0;
                    for (const row of globalThis.__test_state.users) {
                      let match = true;
                      for (const f of eqFilters) {
                        if (row[f.col] !== f.val) { match = false; break; }
                      }
                      if (match) {
                        Object.assign(row, updatePayload);
                        updatedCount++;
                      }
                    }
                    return { data: updatedCount, error: null };
                  }

                  if (globalThis.__test_state.selectError) {
                    return { data: null, error: globalThis.__test_state.selectError };
                  }

                  const filtered = globalThis.__test_state.users.filter((row) => {
                    for (const f of inFilters) {
                      if (!f.values.includes(row[f.col])) return false;
                    }
                    for (const f of isFilters) {
                      if (f.val === null) {
                        if (row[f.col] !== null && row[f.col] !== undefined) return false;
                      } else {
                        if (row[f.col] !== f.val) return false;
                      }
                    }
                    for (const f of eqFilters) {
                      if (row[f.col] !== f.val) return false;
                    }
                    return true;
                  });
                  return { data: filtered.map((r) => ({ ...r })), error: null };
                })().then(onFulfilled, onRejected);
              }
            };
            return builder;
          }
        };
      \`),
      shortCircuit: true,
      format: "module"
    };
  }

  if (specifier.startsWith("@/")) {
    const sub = specifier.slice(2);
    const basePath = path.join(rootDir, "src", sub);
    const candidates = [
      basePath + ".ts",
      basePath + ".tsx",
      path.join(basePath, "index.ts"),
      path.join(basePath, "index.tsx"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return nextResolve(pathToFileURL(c).href, context);
      }
    }
  }

  return nextResolve(specifier, context);
}
`);

// Dynamically import the real modules under test after registering mocks
const { seedDefaultPasswords } = await import('../src/lib/db/password-seed.ts');
const { upsertUserAction, upsertUsersAction } = await import('../src/actions/users.ts');
const bcrypt = (await import('bcryptjs')).default;

function resetTestState() {
  globalThis.__test_state.users = [];
  globalThis.__test_state.selectError = null;
  globalThis.__test_state.updateError = null;
  globalThis.__test_state.personnelError = null;
  globalThis.__test_state.auditLogs = [];
}

describe('P106M1T01: Default Password Seeding Contract Suite', () => {
  beforeEach(() => {
    resetTestState();
  });

  describe('Static Source Contract Invariants', () => {
    const projectRoot = process.cwd();

    it('src/lib/db/password-seed.ts exports seedDefaultPasswords without credential leaks', () => {
      const filePath = path.join(projectRoot, 'src', 'lib', 'db', 'password-seed.ts');
      assert.ok(fs.existsSync(filePath), 'password-seed.ts must exist');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.match(content, /export\s+async\s+function\s+seedDefaultPasswords/, 'Must export seedDefaultPasswords');
      assert.match(content, /bcrypt\.hash\([^,]+,\s*10\)/, 'Must use bcryptjs cost 10');
      assert.match(content, /password_setup_required:\s*false/, 'Must set password_setup_required to false');
      assert.match(content, /credential_revision:\s*(nextRevision|nextRev)/, 'Must increment credential_revision');
      assert.match(content, /'empty employee_code'/, 'Must record failure reason empty employee_code');
      assert.doesNotMatch(content, /console\.(log|info|debug|warn|error)/, 'Must not log any credentials');
    });

    it('src/actions/users.ts wires seedDefaultPasswords and surfaces warning without credential values', () => {
      const filePath = path.join(projectRoot, 'src', 'actions', 'users.ts');
      assert.ok(fs.existsSync(filePath), 'users.ts must exist');
      const content = fs.readFileSync(filePath, 'utf8');

      assert.match(content, /import\s+.*seedDefaultPasswords.*from\s+['"]@\/lib\/db\/password-seed['"]/, 'Must import seedDefaultPasswords');
      assert.match(content, /seedDefaultPasswords\(\[userId\]\)/, 'upsertUserAction must seed new user');
      assert.match(content, /seedDefaultPasswords\(newIds\)/, 'upsertUsersAction must seed new users');
      assert.match(content, /seed\.failed\.length\s*>\s*0/, 'Must check seed.failed.length > 0');
      assert.doesNotMatch(content, /seed\.failed.*employee[Cc]ode/, 'Warning must never contain employee code or credentials');
    });
  });

  describe('Core Behavioral Requirements (DoD)', () => {
    it('1. a NULL-hash row gets seeded: bcrypt compare(employee_code, stored hash) === true, password_setup_required===false, credential_revision bumped by 1', async () => {
      globalThis.__test_state.users = [
        {
          id: 'user-null-hash-1',
          employee_code: 'EMP-001',
          password_hash: null,
          password_setup_required: true,
          credential_revision: 0,
        },
      ];

      const result = await seedDefaultPasswords(['user-null-hash-1']);

      assert.deepStrictEqual(result.seeded, ['user-null-hash-1']);
      assert.deepStrictEqual(result.failed, []);

      const storedUser = globalThis.__test_state.users.find((u) => u.id === 'user-null-hash-1');
      assert.ok(storedUser, 'User must remain in DB');
      assert.ok(storedUser.password_hash !== null, 'password_hash must be set');
      assert.strictEqual(
        await bcrypt.compare('EMP-001', storedUser.password_hash),
        true,
        'bcrypt compare with employee_code must return true'
      );
      assert.strictEqual(
        await bcrypt.compare('WRONG-PASSWORD', storedUser.password_hash),
        false,
        'bcrypt compare with wrong password must return false'
      );
      assert.strictEqual(storedUser.password_setup_required, false, 'password_setup_required must be false');
      assert.strictEqual(storedUser.credential_revision, 1, 'credential_revision must be bumped by 1');
    });

    it('2. a row that already has password_hash is untouched (not selected)', async () => {
      const existingHash = '$2a$10$existingpreconfiguredhash1234567890';
      globalThis.__test_state.users = [
        {
          id: 'user-already-hashed',
          employee_code: 'EMP-002',
          password_hash: existingHash,
          password_setup_required: false,
          credential_revision: 5,
        },
      ];

      const result = await seedDefaultPasswords(['user-already-hashed']);

      // Row had password_hash, so .is('password_hash', null) excludes it
      assert.deepStrictEqual(result.seeded, []);
      assert.deepStrictEqual(result.failed, []);

      const storedUser = globalThis.__test_state.users.find((u) => u.id === 'user-already-hashed');
      assert.strictEqual(storedUser.password_hash, existingHash, 'password_hash must remain untouched');
      assert.strictEqual(storedUser.password_setup_required, false, 'password_setup_required must remain untouched');
      assert.strictEqual(storedUser.credential_revision, 5, 'credential_revision must remain 5');
    });

    it('3. empty employee_code -> that id lands in failed and no update happens for it', async () => {
      globalThis.__test_state.users = [
        {
          id: 'user-empty-code-1',
          employee_code: '',
          password_hash: null,
          password_setup_required: true,
          credential_revision: 0,
        },
        {
          id: 'user-whitespace-code-2',
          employee_code: '   ',
          password_hash: null,
          password_setup_required: true,
          credential_revision: 0,
        },
      ];

      const result = await seedDefaultPasswords(['user-empty-code-1', 'user-whitespace-code-2']);

      assert.deepStrictEqual(result.seeded, []);
      assert.strictEqual(result.failed.length, 2);
      assert.deepStrictEqual(result.failed, [
        { id: 'user-empty-code-1', reason: 'empty employee_code' },
        { id: 'user-whitespace-code-2', reason: 'empty employee_code' },
      ]);

      for (const id of ['user-empty-code-1', 'user-whitespace-code-2']) {
        const storedUser = globalThis.__test_state.users.find((u) => u.id === id);
        assert.strictEqual(storedUser.password_hash, null, 'No update must happen: password_hash remains null');
        assert.strictEqual(storedUser.password_setup_required, true, 'password_setup_required remains true');
        assert.strictEqual(storedUser.credential_revision, 0, 'credential_revision remains 0');
      }
    });

    it('4. helper does not throw when supabase update fails -> id in failed with reason', async () => {
      globalThis.__test_state.users = [
        {
          id: 'user-update-fail',
          employee_code: 'EMP-FAIL',
          password_hash: null,
          password_setup_required: true,
          credential_revision: 0,
        },
      ];
      globalThis.__test_state.updateError = { message: 'Supabase update constraint violation' };

      const result = await seedDefaultPasswords(['user-update-fail']);

      assert.deepStrictEqual(result.seeded, []);
      assert.strictEqual(result.failed.length, 1);
      assert.strictEqual(result.failed[0].id, 'user-update-fail');
      assert.strictEqual(result.failed[0].reason, 'Supabase update constraint violation');

      const storedUser = globalThis.__test_state.users.find((u) => u.id === 'user-update-fail');
      assert.strictEqual(storedUser.password_hash, null, 'User password_hash remains null on update failure');
    });

    it('4b. helper does not throw when supabase select fails -> all requested ids in failed with reason', async () => {
      globalThis.__test_state.selectError = { message: 'Database connection timeout' };

      const result = await seedDefaultPasswords(['user-timeout-1', 'user-timeout-2']);

      assert.deepStrictEqual(result.seeded, []);
      assert.strictEqual(result.failed.length, 2);
      assert.deepStrictEqual(result.failed, [
        { id: 'user-timeout-1', reason: 'Database connection timeout' },
        { id: 'user-timeout-2', reason: 'Database connection timeout' },
      ]);
    });

    it('5. upsertUserAction surfaces warning when failed is non-empty', async () => {
      // Calling upsertUserAction with whitespace employeeCode will cause seedDefaultPasswords to fail
      const res = await upsertUserAction({
        name: 'User With Bad Code',
        employeeCode: '   ',
        role: 'Employee',
      });

      assert.strictEqual(res.success, true, 'Return stays success: true per contract');
      assert.ok(res.user, 'User must be returned');
      assert.ok(typeof res.warning === 'string', 'warning must be surfaced when seeding failed');
      assert.match(res.warning, /1 nhân viên/, 'warning must state count of failed users');
      assert.match(res.warning, new RegExp(res.user.id), 'warning must state the failed user id');
      assert.doesNotMatch(res.warning, /password|hash|mật khẩu là/i, 'warning must not reveal passwords');
    });

    it('5b. upsertUserAction succeeds without warning when seeding succeeds', async () => {
      const res = await upsertUserAction({
        name: 'Normal New User',
        employeeCode: 'EMP-GOOD-1',
        role: 'Employee',
      });

      assert.strictEqual(res.success, true);
      assert.ok(res.user);
      assert.strictEqual(res.warning, undefined, 'No warning when seeding succeeds completely');

      const storedUser = globalThis.__test_state.users.find((u) => u.id === res.user.id);
      assert.ok(storedUser);
      assert.strictEqual(
        await bcrypt.compare('EMP-GOOD-1', storedUser.password_hash),
        true,
        'New user must have bcrypt hash matching employee_code'
      );
      assert.strictEqual(storedUser.password_setup_required, false);
      assert.strictEqual(storedUser.credential_revision, 1);
    });

    it('5c. upsertUsersAction surfaces warning with counts and ids when some seeds fail', async () => {
      const res = await upsertUsersAction([
        { name: 'Batch User 1', employeeCode: 'EMP-BATCH-1', role: 'Employee' },
        { name: 'Batch User 2', employeeCode: '   ', role: 'Employee' },
      ]);

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.users.length, 2);
      assert.ok(typeof res.warning === 'string', 'Warning must be set for failed seed');
      assert.match(res.warning, /1 nhân viên/, 'Count must reflect number of failed seeds');
      assert.match(res.warning, new RegExp(res.users[1].id), 'Failed user ID must be in warning');
      assert.doesNotMatch(res.warning, new RegExp(res.users[0].id), 'Successful user ID must not be in warning');

      // User 1 was seeded
      const stored1 = globalThis.__test_state.users.find((u) => u.id === res.users[0].id);
      assert.strictEqual(await bcrypt.compare('EMP-BATCH-1', stored1.password_hash), true);
      assert.strictEqual(stored1.password_setup_required, false);

      // User 2 failed seed
      const stored2 = globalThis.__test_state.users.find((u) => u.id === res.users[1].id);
      assert.strictEqual(stored2.password_hash, null);
    });

    it('6. upsertUserAction and upsertUsersAction do not seed existing users', async () => {
      const existingUser = {
        id: 'existing-emp-99',
        employee_code: 'EMP-99',
        name: 'Existing Employee',
        role: 'Employee',
        team_id: 't-1',
        password_hash: '$2a$10$preexistinghash99',
        password_setup_required: false,
        credential_revision: 7,
      };
      globalThis.__test_state.users = [existingUser];

      // Update existing user via upsertUserAction
      const resSingle = await upsertUserAction({
        id: 'existing-emp-99',
        name: 'Updated Name',
      });
      assert.strictEqual(resSingle.success, true);
      assert.strictEqual(resSingle.warning, undefined);
      assert.strictEqual(existingUser.password_hash, '$2a$10$preexistinghash99');
      assert.strictEqual(existingUser.credential_revision, 7);

      // Update existing user via upsertUsersAction
      const resBatch = await upsertUsersAction([
        {
          id: 'existing-emp-99',
          name: 'Batch Updated Name',
        },
      ]);
      assert.strictEqual(resBatch.success, true);
      assert.strictEqual(resBatch.warning, undefined);
      assert.strictEqual(existingUser.password_hash, '$2a$10$preexistinghash99');
      assert.strictEqual(existingUser.credential_revision, 7);
    });

    it('7. seedDefaultPasswords handles empty or invalid userIds gracefully', async () => {
      const resEmpty = await seedDefaultPasswords([]);
      assert.deepStrictEqual(resEmpty, { seeded: [], failed: [] });

      const resNull = await seedDefaultPasswords(null);
      assert.deepStrictEqual(resNull, { seeded: [], failed: [] });
    });
  });
});
