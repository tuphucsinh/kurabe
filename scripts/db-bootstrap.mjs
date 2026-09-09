#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, '..');
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DATABASE_PATTERN = /^kurabe_harness_[a-z0-9_]+$/;
const PREDICATE_KEYS = [
  'extensions',
  'schemas',
  'tables',
  'columns',
  'constraints',
  'indexes',
  'policies',
  'functions',
  'triggers',
  'roles',
  'table_privileges',
  'routine_privileges',
];

function fail(message) {
  throw new Error(`DB_BOOTSTRAP: ${message}`);
}

function safeError(error) {
  return String(error?.message || error)
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs(argv) {
  const options = { rootDir: defaultRoot };
  const allowed = new Set(['--host', '--port', '--database', '--user', '--root']);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help') return { help: true };
    if (!allowed.has(flag)) fail(`unknown argument ${JSON.stringify(flag)}`);
    const value = argv[++index];
    if (!value || value.startsWith('--')) fail(`${flag} requires a value`);
    if (flag === '--host') options.host = value;
    if (flag === '--port') options.port = value;
    if (flag === '--database') options.database = value;
    if (flag === '--user') options.user = value;
    if (flag === '--root') options.rootDir = path.resolve(value);
  }
  if (!options.host || !options.port || !options.database || !options.user) {
    fail('--host, --port, --database and --user are required');
  }
  return options;
}

export function validateDisposableIdentity(options) {
  const port = Number(options.port);
  if (!LOOPBACK_HOSTS.has(options.host)) fail(`REFUSE_NON_DISPOSABLE_HOST host=${options.host}`);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`invalid local port ${options.port}`);
  if (!DATABASE_PATTERN.test(options.database)) fail(`REFUSE_NON_DISPOSABLE_DATABASE database=${options.database}`);
  if (options.user !== 'postgres') fail(`REFUSE_NON_DISPOSABLE_USER user=${options.user}`);
  return { host: options.host, port: String(port), database: options.database, user: options.user };
}

function checkedPath(rootDir, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    fail(`manifest path is not a relative path: ${String(relativePath)}`);
  }
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    fail(`manifest path escapes project root: ${relativePath}`);
  }
  return resolved;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`cannot read ${label}: ${safeError(error)}`);
  }
}

function verifyFileHash(rootDir, relativePath, expectedHash, label) {
  const filePath = checkedPath(rootDir, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) fail(`${label} is missing: ${relativePath}`);
  const actualHash = sha256(fs.readFileSync(filePath));
  if (actualHash !== expectedHash) fail(`${label} hash mismatch path=${relativePath}`);
  return filePath;
}

function psqlArgs(target) {
  return [
    '--no-psqlrc',
    '--no-password',
    '--host', target.host,
    '--port', target.port,
    '--username', target.user,
    '--dbname', target.database,
  ];
}

function runPsql(target, sql, label) {
  try {
    return execFileSync('psql', [...psqlArgs(target), '--set', 'ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', sql], {
      cwd: defaultRoot,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const detail = error?.stderr ? String(error.stderr).trim() : safeError(error);
    fail(`${label} failed: ${safeError(detail)}`);
  }
}

function runPsqlFile(target, filePath, label, cwd) {
  try {
    return execFileSync('psql', [...psqlArgs(target), '--set', 'ON_ERROR_STOP=1', '--file', filePath], {
      cwd,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const detail = error?.stderr ? String(error.stderr).trim() : safeError(error);
    fail(`${label} failed: ${safeError(detail)}`);
  }
}

function ensureLocalRoles(target) {
  const sql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN INHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN INHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN INHERIT BYPASSRLS; END IF;
  ALTER ROLE anon NOSUPERUSER NOCREATEDB NOCREATEROLE NOLOGIN INHERIT NOBYPASSRLS;
  ALTER ROLE authenticated NOSUPERUSER NOCREATEDB NOCREATEROLE NOLOGIN INHERIT NOBYPASSRLS;
  ALTER ROLE service_role NOSUPERUSER NOCREATEDB NOCREATEROLE NOLOGIN INHERIT BYPASSRLS;
END $$;`;
  runPsql(target, sql, 'minimal local role bootstrap');
}

function assertEmptyTarget(target) {
  const count = runPsql(target, `
SELECT COUNT(*)::int
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f');`, 'fresh target check');
  if (count !== '0') fail(`REFUSE_NON_EMPTY_PUBLIC_SCHEMA relations=${count}`);
  const ledger = runPsql(target, `
SELECT COUNT(*)::int
FROM information_schema.tables
WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations';`, 'fresh ledger check');
  if (ledger !== '0') fail(`REFUSE_NON_EMPTY_LEDGER rows_or_table=${ledger}`);
}

const CATALOG_SQL = `
SELECT json_build_object(
  'extensions', COALESCE((SELECT json_agg(extname ORDER BY extname) FROM pg_extension WHERE extname = 'pgcrypto'), '[]'::json),
  'schemas', COALESCE((SELECT json_agg(nspname ORDER BY nspname) FROM pg_namespace WHERE nspname = 'public'), '[]'::json),
  'tables', COALESCE((SELECT json_agg(json_build_object('table_schema', n.nspname, 'table_name', c.relname, 'owner', r.rolname, 'relkind', c.relkind, 'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND c.relkind='r'), '[]'::json),
  'columns', COALESCE((SELECT json_agg(json_build_object('table_schema', i.table_schema, 'table_name', i.table_name, 'column_name', i.column_name, 'ordinal_position', i.ordinal_position, 'formatted_type', format_type(a.atttypid,a.atttypmod), 'is_nullable', i.is_nullable, 'column_default', i.column_default) ORDER BY i.table_schema,i.table_name,i.ordinal_position) FROM information_schema.columns i JOIN pg_namespace n ON n.nspname=i.table_schema JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=i.table_name JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=i.column_name AND a.attnum=i.ordinal_position WHERE i.table_schema='public' AND c.relkind='r'), '[]'::json),
  'constraints', COALESCE((SELECT json_agg(json_build_object('table_schema', n.nspname, 'table_name', c.relname, 'constraint_name', con.conname, 'constraint_type', CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' WHEN 'f' THEN 'FOREIGN KEY' WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUDE' ELSE con.contype::text END, 'definition', pg_get_constraintdef(con.oid, true)) ORDER BY n.nspname,c.relname,con.conname) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'), '[]'::json),
  'indexes', COALESCE((SELECT json_agg(json_build_object('schema_name', schemaname, 'table_name', tablename, 'index_name', indexname, 'definition', indexdef) ORDER BY schemaname,tablename,indexname) FROM pg_indexes WHERE schemaname='public'), '[]'::json),
  'policies', COALESCE((SELECT json_agg(json_build_object('schema_name', schemaname, 'table_name', tablename, 'policy_name', policyname, 'permissive', permissive, 'roles', roles, 'cmd', cmd, 'qual', qual, 'with_check', with_check) ORDER BY schemaname,tablename,policyname) FROM pg_policies WHERE schemaname='public'), '[]'::json),
  'functions', COALESCE((SELECT json_agg(json_build_object('routine_schema', n.nspname, 'routine_name', p.proname, 'identity_arguments', pg_get_function_identity_arguments(p.oid), 'return_type', pg_get_function_result(p.oid), 'security_definer', p.prosecdef, 'configuration', p.proconfig, 'comment', obj_description(p.oid,'pg_proc'), 'definition', pg_get_functiondef(p.oid)) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'), '[]'::json),
  'triggers', COALESCE((SELECT json_agg(json_build_object('schema_name', n.nspname, 'table_name', c.relname, 'trigger_name', t.tgname, 'definition', pg_get_triggerdef(t.oid, true)) ORDER BY n.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal), '[]'::json),
  'roles', COALESCE((SELECT json_agg(json_build_object('role_name', rolname, 'can_login', rolcanlogin, 'inherit', rolinherit, 'superuser', rolsuper, 'bypass_rls', rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')), '[]'::json),
  'table_privileges', COALESCE((SELECT json_agg(json_build_object('grantee', grantee, 'table_schema', table_schema, 'table_name', table_name, 'privilege_type', privilege_type, 'is_grantable', is_grantable) ORDER BY grantee,table_schema,table_name,privilege_type) FROM information_schema.table_privileges WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role','postgres')), '[]'::json),
  'routine_privileges', COALESCE((SELECT json_agg(json_build_object('grantee', grantee, 'routine_schema', routine_schema, 'routine_name', routine_name, 'specific_name', specific_name, 'privilege_type', privilege_type, 'is_grantable', is_grantable) ORDER BY grantee,routine_schema,routine_name,specific_name) FROM information_schema.routine_privileges WHERE routine_schema='public' AND grantee IN ('anon','authenticated','service_role','postgres')), '[]'::json)
) AS catalog;`;

function normalizedCatalog(raw, expected) {
  const actual = { ...raw };
  const expectedFunctionKeys = new Set((expected.predicate.functions || [])
    .map((fn) => `${fn.routine_name}|${fn.identity_arguments}`));
  const expectedRoutineNames = new Set((expected.predicate.functions || []).map((fn) => fn.routine_name));
  actual.functions = (actual.functions || [])
    .filter((fn) => expectedFunctionKeys.has(`${fn.routine_name}|${fn.identity_arguments}`))
    .map((fn) => {
      const { definition, ...metadata } = fn;
      return { ...metadata, definition_sha256: sha256(definition || '') };
    });
  actual.routine_privileges = (actual.routine_privileges || [])
    .filter((privilege) => expectedRoutineNames.has(privilege.routine_name))
    .map((privilege) => {
      const copy = { ...privilege };
      delete copy.specific_name;
      return copy;
    });
  return Object.fromEntries(PREDICATE_KEYS.map((key) => [key, actual[key] || []]));
}

function compareCatalog(expected, actual) {
  const expectedPredicate = Object.fromEntries(PREDICATE_KEYS.map((key) => [key, expected.predicate[key] || []]));
  const expectedJson = stableJson(expectedPredicate);
  const normalizedActual = normalizedCatalog(actual, expected);
  const actualJson = stableJson(normalizedActual);
  if (expectedJson !== actualJson) {
    const mismatches = PREDICATE_KEYS.filter((key) => stableJson(expectedPredicate[key]) !== stableJson(normalizedActual[key]));
    const details = mismatches.map((key) => `${key}:${expectedPredicate[key].length}/${normalizedActual[key].length}`).join(',');
    fail(`NORMALIZED_CATALOG_MISMATCH keys=${mismatches.join(',')} counts=${details}`);
  }
  return sha256(actualJson);
}

function collectCatalog(target) {
  const output = runPsql(target, CATALOG_SQL, 'catalog comparison');
  try {
    return JSON.parse(output);
  } catch (error) {
    fail(`catalog JSON parse failed: ${safeError(error)}`);
  }
}

function replayLedger(target, manifest) {
  const entries = manifest.applied_ledger_replay;
  if (!Array.isArray(entries) || entries.length === 0) fail('manifest has no applied ledger replay entries');
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].version >= entries[index].version) fail('ledger versions are not strictly ordered');
  }
  const values = entries.map((entry) => `(${sqlLiteral(entry.version)}, ${sqlLiteral(entry.name)})`).join(',\n    ');
  runPsql(target, `
BEGIN;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ${values}
ON CONFLICT (version) DO NOTHING;
COMMIT;`, 'ordered migration ledger replay');
  const actual = runPsql(target, 'SELECT version || \'|\' || name FROM supabase_migrations.schema_migrations ORDER BY version;')
    .split('\n').filter(Boolean);
  const expected = entries.map((entry) => `${entry.version}|${entry.name}`);
  if (stableJson(actual) !== stableJson(expected)) fail(`ledger replay mismatch expected=${expected.length} actual=${actual.length}`);
  return entries.length;
}

function verifyManifest(rootDir, manifest) {
  const baselinePath = verifyFileHash(rootDir, manifest.baseline.path, manifest.baseline.sha256, 'baseline');
  verifyFileHash(rootDir, manifest.functions.path, manifest.functions.sha256, 'function catalog');
  verifyFileHash(rootDir, manifest.expected_catalog.path, manifest.expected_catalog.sha256, 'expected catalog');
  for (const entry of manifest.legacy_provenance || []) {
    verifyFileHash(rootDir, entry.path, entry.sha256, 'migration source');
  }
  return baselinePath;
}

export function runBootstrap(input) {
  const target = validateDisposableIdentity(input);
  const rootDir = path.resolve(input.rootDir || defaultRoot);
  const manifest = readJson(checkedPath(rootDir, 'db/bootstrap/manifest.json'), 'bootstrap manifest');
  const expected = readJson(checkedPath(rootDir, manifest.expected_catalog.path), 'expected catalog');
  const baselinePath = verifyManifest(rootDir, manifest);
  assertEmptyTarget(target);
  ensureLocalRoles(target);
  runPsqlFile(target, baselinePath, 'schema-only baseline', path.dirname(baselinePath));
  const beforeReplay = collectCatalog(target);
  const catalogHash = compareCatalog(expected, beforeReplay);
  const ledgerCount = replayLedger(target, manifest);
  const afterReplay = collectCatalog(target);
  const replayHash = compareCatalog(expected, afterReplay);
  if (catalogHash !== replayHash) fail('ledger replay changed the schema predicate');
  return {
    real: true,
    passed: true,
    cases: ['identity-guard', 'empty-to-full', 'normalized-catalog', 'ordered-ledger-replay'],
    target: 'disposable-postgresql',
    catalogHash,
    ledgerCount,
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/db-bootstrap.mjs --host 127.0.0.1 --port <port> --database kurabe_harness_<name> --user postgres');
      return;
    }
    const result = runBootstrap(options);
    console.log(`DB_BOOTSTRAP PASS cases=${result.cases.length} ledger=${result.ledgerCount} catalog_sha256=${result.catalogHash}`);
  } catch (error) {
    console.error(`DB_BOOTSTRAP FAIL ${safeError(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
