#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INTEGRATION_REQUIRED_CASES, BASE_SHA as P103_BASE_SHA } from '../tests/operations/p103-required-cases.mjs';
import { CI_SUITE_MANIFEST } from '../tests/operations/ci-suite-manifest.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '..');
const suiteRoots = ['tests/integration', 'tests/browser', 'tests/operations'];

export const VALID_EVIDENCE_TIERS = new Set([
  'source-contract',
  'mocked-action',
  'real-DB',
  'actual-Next-browser',
  'provider',
  'authenticated',
]);

export const FORBIDDEN_STATUS_PATTERN = /^(FAIL|FAILED|ERROR|ERRORED|BLOCKED|BLOCKED_CAPABILITY|SKIP|SKIPPED|NOT_RUN|NOT-RUN|NOTRUN)$/i;

function usageError(message) {
  throw new Error(`VERIFY_RELEASE: ${message}`);
}

export function isForbiddenStatus(status) {
  if (typeof status !== 'string') return false;
  return FORBIDDEN_STATUS_PATTERN.test(status.trim());
}

export function isForbiddenCaseString(str) {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (FORBIDDEN_STATUS_PATTERN.test(trimmed)) return true;
  if (/(?::|\s|-)\s*(FAIL|FAILED|ERROR|ERRORED|BLOCKED|BLOCKED_CAPABILITY|SKIP|SKIPPED|NOT_RUN|NOT-RUN)$/i.test(trimmed)) {
    return true;
  }
  return false;
}

function checkCasesForForbiddenStatus(items, modulePath, label = 'cases') {
  if (!Array.isArray(items)) return;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) continue;
    if (typeof item === 'string') {
      if (isForbiddenCaseString(item)) {
        usageError(`${modulePath} reported forbidden case status ${JSON.stringify(item)} in ${label}[${index}]`);
      }
    } else if (typeof item === 'object') {
      const caseStatus = item.status || item.state || item.result || item.outcome;
      if (isForbiddenStatus(caseStatus)) {
        usageError(`${modulePath} reported forbidden case status ${JSON.stringify(caseStatus)} in ${label}[${index}] (${item.id || item.name || index})`);
      }
      if (item.passed === false || item.failed === true) {
        usageError(`${modulePath} reported failed case in ${label}[${index}] (${item.id || item.name || index})`);
      }
    }
  }
}

export function resolveGitHead(cwd = projectRoot) {
  try {
    const res = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      const head = res.stdout.trim();
      if (/^[0-9a-f]{40}$/i.test(head)) return head;
    }
  } catch {}
  return null;
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--suite') {
      if (options.suite) usageError('--suite may be supplied only once');
      options.suite = argv[++index];
      continue;
    }
    if (arg === '--tier') {
      options.requiredTier = argv[++index];
      continue;
    }
    if (arg === '--evidence') {
      options.evidence = argv[++index];
      continue;
    }
    const optionMap = {
      '--db-host': 'dbHost',
      '--db-port': 'dbPort',
      '--db-name': 'dbName',
      '--db-user': 'dbUser',
    };
    if (optionMap[arg]) {
      options[optionMap[arg]] = argv[++index];
      continue;
    }
    if (arg === '--help') {
      options.help = true;
      continue;
    }
    usageError(`unknown argument ${JSON.stringify(arg)}`);
  }
  if (options.requiredTier && !VALID_EVIDENCE_TIERS.has(options.requiredTier)) {
    usageError(`--tier must be one of: ${[...VALID_EVIDENCE_TIERS].join(', ')}`);
  }
  if (options.evidence && !path.isAbsolute(options.evidence)) {
    usageError('--evidence must be an absolute path');
  }
  if (!options.help && (!options.suite || !/^[a-z0-9][a-z0-9_-]*$/.test(options.suite))) {
    usageError('--suite must be an exact simple suite name');
  }
  return options;
}

export function discoverSuiteModules(suite) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(suite)) return [];
  const manifestEntry = CI_SUITE_MANIFEST?.find((entry) => entry.id === suite);
  if (manifestEntry && Array.isArray(manifestEntry.modules) && manifestEntry.modules.length > 0) {
    return manifestEntry.modules
      .map((relative) => path.join(projectRoot, relative))
      .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  }
  return suiteRoots
    .map((relativeRoot) => path.join(projectRoot, relativeRoot, `${suite}.mjs`))
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function caseCount(result) {
  if (Array.isArray(result?.cases)) return result.cases.length;
  if (typeof result?.cases === 'number' && Number.isFinite(result.cases) && Number.isInteger(result.cases)) return result.cases;
  return NaN;
}

export function verifyChangedFileHashes(changedFiles, modulePath, rootDir = projectRoot) {
  if (!changedFiles || typeof changedFiles !== 'object' || Array.isArray(changedFiles)) {
    usageError(`${modulePath} missing or invalid changedFileSha256 manifest`);
  }
  const fileEntries = Object.entries(changedFiles);
  if (fileEntries.length === 0) {
    usageError(`${modulePath} reported empty changedFileSha256 manifest`);
  }
  for (const [relPath, expectedDigest] of fileEntries) {
    if (!relPath || typeof relPath !== 'string' || path.isAbsolute(relPath) || relPath.includes('..')) {
      usageError(`${modulePath} contains invalid or escaping changed file path: ${JSON.stringify(relPath)}`);
    }
    if (!/^[0-9a-f]{64}$/i.test(expectedDigest)) {
      usageError(`${modulePath} contains invalid SHA-256 digest for ${relPath}: ${JSON.stringify(expectedDigest)}`);
    }
    const fullPath = path.resolve(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      usageError(`${modulePath} changed file does not exist on disk: ${relPath}`);
    }
    const actualDigest = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
    if (actualDigest.toLowerCase() !== expectedDigest.toLowerCase()) {
      usageError(`${modulePath} changed-file SHA-256 mismatch for ${relPath}: expected ${expectedDigest}, recomputed ${actualDigest}`);
    }
  }
}

function verifyExactCaseManifest(actualCases, expectedCases, modulePath, label) {
  if (!Array.isArray(actualCases) || actualCases.length === 0) {
    usageError(`${modulePath} ${label} is missing or empty`);
  }
  if (actualCases.some((caseId) => typeof caseId !== 'string' || caseId.length === 0)) {
    usageError(`${modulePath} ${label} contains a missing or invalid case ID`);
  }
  const seen = new Set();
  const duplicates = new Set();
  for (const caseId of actualCases) {
    if (seen.has(caseId)) duplicates.add(caseId);
    seen.add(caseId);
  }
  if (duplicates.size > 0) {
    usageError(`${modulePath} ${label} contains duplicate required case IDs: ${[...duplicates].join(', ')}`);
  }
  const expectedSet = new Set(expectedCases);
  const unknown = actualCases.filter((caseId) => !expectedSet.has(caseId));
  if (unknown.length > 0) {
    usageError(`${modulePath} ${label} contains unknown case IDs: ${unknown.join(', ')}`);
  }
  const actualSet = new Set(actualCases);
  const missing = expectedCases.filter((caseId) => !actualSet.has(caseId));
  if (missing.length > 0) {
    usageError(`${modulePath} ${label} is missing required case IDs: ${missing.join(', ')}`);
  }
  return actualCases;
}

export function verifyConfirmationEvidence(evidencePath, result, modulePath, options = {}) {
  if (!evidencePath) {
    usageError(`${modulePath} confirmation-matrix evidence is absent: no evidence path provided`);
  }
  if (!fs.existsSync(evidencePath)) {
    usageError(`${modulePath} confirmation-matrix evidence is absent: file does not exist at ${evidencePath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(evidencePath, 'utf8');
  } catch (err) {
    usageError(`${modulePath} confirmation-matrix evidence cannot be read: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    usageError(`${modulePath} confirmation-matrix evidence is malformed JSON: ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    usageError(`${modulePath} confirmation-matrix evidence must be a valid JSON object`);
  }

  let rich = parsed;
  if (parsed.format === 'kurabe-release-evidence/v1' && (parsed.authoritativeArtifact || parsed.richConfirmationEvidence)) {
    if (parsed.authoritativeArtifact && fs.existsSync(parsed.authoritativeArtifact)) {
      try {
        rich = JSON.parse(fs.readFileSync(parsed.authoritativeArtifact, 'utf8'));
      } catch {
        rich = parsed.richConfirmationEvidence || parsed;
      }
    } else {
      rich = parsed.richConfirmationEvidence || parsed;
    }
  }

  if (!rich.format || typeof rich.format !== 'string' || (!rich.format.includes('confirmation') && rich.format !== 'kurabe-p103m4t01-confirmation-integration/v1')) {
    usageError(`${modulePath} evidence has wrong or unrecognized format: ${JSON.stringify(rich.format)}`);
  }
  if (isForbiddenStatus(rich.status) || rich.status !== 'QUALIFIED') {
    usageError(`${modulePath} evidence reported status ${JSON.stringify(rich.status)}, expected "QUALIFIED"`);
  }
  if (rich.tier !== 'real-DB' && rich.tier !== 'authenticated') {
    usageError(`${modulePath} evidence reported tier ${JSON.stringify(rich.tier)}, expected "real-DB" or "authenticated"`);
  }
  if (rich.authenticated !== true) {
    usageError(`${modulePath} evidence reported authenticated !== true`);
  }

  const candidateSha = result.candidateSha || result.candidate?.candidateSha;
  const evCandidateSha = rich.candidate?.candidateSha || rich.candidateSha;
  if (!evCandidateSha || evCandidateSha !== candidateSha) {
    usageError(`${modulePath} evidence candidate SHA mismatch: expected ${candidateSha}, received ${evCandidateSha}`);
  }
  const evBaseSha = rich.candidate?.baseSha || rich.baseSha;
  if (!evBaseSha || evBaseSha !== P103_BASE_SHA) {
    usageError(`${modulePath} evidence base SHA mismatch: expected ${P103_BASE_SHA}, received ${evBaseSha}`);
  }

  const evChangedFiles = rich.candidate?.changedFileSha256 || rich.changedFileSha256;
  verifyChangedFileHashes(evChangedFiles, `${modulePath} (evidence)`, options.rootDir || projectRoot);

  verifyExactCaseManifest(rich.requiredCases, INTEGRATION_REQUIRED_CASES, modulePath, 'evidence requiredCases');
  if (rich.caseCount !== INTEGRATION_REQUIRED_CASES.length) {
    usageError(`${modulePath} evidence caseCount ${JSON.stringify(rich.caseCount)} does not match required case count ${INTEGRATION_REQUIRED_CASES.length}`);
  }
  if (!Array.isArray(rich.cases) || rich.cases.length === 0) {
    usageError(`${modulePath} evidence reported zero or missing cases`);
  }
  const evReportedIds = [];
  for (let idx = 0; idx < rich.cases.length; idx += 1) {
    const report = rich.cases[idx];
    const caseId = typeof report === 'string' ? report : report?.id || report?.name;
    if (!caseId || typeof caseId !== 'string') {
      usageError(`${modulePath} evidence case[${idx}] has missing or invalid ID`);
    }
    evReportedIds.push(caseId);
    if (typeof report === 'object' && report !== null) {
      if (isForbiddenStatus(report.status) || (report.status && report.status !== 'PASS')) {
        usageError(`${modulePath} evidence case ${caseId} reported non-PASS status: ${report.status}`);
      }
      if (report.passed === false || report.failed === true) {
        usageError(`${modulePath} evidence case ${caseId} reported failure`);
      }
    }
  }
  verifyExactCaseManifest(evReportedIds, INTEGRATION_REQUIRED_CASES, modulePath, 'evidence cases');

  if (rich.migrations?.productionWrites !== undefined && rich.migrations.productionWrites !== 0) {
    usageError(`${modulePath} evidence reports nonzero production writes in migrations: ${rich.migrations.productionWrites}`);
  }
  if (rich.migrations?.productionMigrations !== undefined && rich.migrations.productionMigrations !== 0) {
    usageError(`${modulePath} evidence reports nonzero production migrations in migrations: ${rich.migrations.productionMigrations}`);
  }
  if (rich.cleanup?.productionWrites !== undefined && rich.cleanup.productionWrites !== 0) {
    usageError(`${modulePath} evidence reports nonzero production writes in cleanup: ${rich.cleanup.productionWrites}`);
  }
  if (rich.cleanup?.productionMigrations !== undefined && rich.cleanup.productionMigrations !== 0) {
    usageError(`${modulePath} evidence reports nonzero production migrations in cleanup: ${rich.cleanup.productionMigrations}`);
  }
  if (rich.productionWrites !== undefined && rich.productionWrites !== 0) {
    usageError(`${modulePath} evidence reports nonzero top-level production writes: ${rich.productionWrites}`);
  }
  if (rich.productionMigrations !== undefined && rich.productionMigrations !== 0) {
    usageError(`${modulePath} evidence reports nonzero top-level production migrations: ${rich.productionMigrations}`);
  }
  if (result.productionWrites !== undefined && result.productionWrites !== 0) {
    usageError(`${modulePath} result reports nonzero production writes: ${result.productionWrites}`);
  }
  if (result.productionMigrations !== undefined && result.productionMigrations !== 0) {
    usageError(`${modulePath} result reports nonzero production migrations: ${result.productionMigrations}`);
  }

  return rich;
}

export function validateConfirmationMatrix(result, modulePath, options = {}) {
  if (result.status !== 'QUALIFIED') {
    usageError(`${modulePath} reported status ${JSON.stringify(result.status)}, expected "QUALIFIED"`);
  }
  if (result.real !== true) {
    usageError(`${modulePath} did not report a real local run; mock substitution is forbidden`);
  }
  if (result.passed !== true) {
    usageError(`${modulePath} did not report passed === true`);
  }
  if (result.authenticated !== true) {
    usageError(`${modulePath} did not report authenticated === true`);
  }
  const native = result.nativeTier || (result.tier === 'real-DB' ? 'real-DB' : null);
  if (native !== 'real-DB') {
    usageError(`${modulePath} did not prove native real-DB provenance (native tier: ${JSON.stringify(native)})`);
  }

  verifyExactCaseManifest(result.requiredCases, INTEGRATION_REQUIRED_CASES, modulePath, 'result requiredCases');
  if (!Array.isArray(result.cases) || result.cases.length === 0) {
    usageError(`${modulePath} reported zero executable cases`);
  }
  const reportedIds = [];
  for (let idx = 0; idx < result.cases.length; idx += 1) {
    const item = result.cases[idx];
    const id = typeof item === 'string' ? item : item?.id || item?.name;
    if (!id || typeof id !== 'string') {
      usageError(`${modulePath} case[${idx}] has missing or invalid ID`);
    }
    reportedIds.push(id);
    if (typeof item === 'object' && item !== null) {
      if (isForbiddenStatus(item.status) || (item.status && item.status !== 'PASS')) {
        usageError(`${modulePath} case ${id} reported non-PASS status: ${item.status}`);
      }
      if (item.passed === false || item.failed === true) {
        usageError(`${modulePath} case ${id} reported failure`);
      }
    }
  }
  verifyExactCaseManifest(reportedIds, INTEGRATION_REQUIRED_CASES, modulePath, 'result cases');
  if (result.authenticatedCases !== INTEGRATION_REQUIRED_CASES.length) {
    usageError(`${modulePath} authenticatedCases ${JSON.stringify(result.authenticatedCases)} does not match required case count ${INTEGRATION_REQUIRED_CASES.length}`);
  }

  const candidateSha = result.candidateSha || result.candidate?.candidateSha;
  if (!candidateSha || !/^[0-9a-f]{40}$/i.test(candidateSha)) {
    usageError(`${modulePath} reported missing or invalid candidate SHA: ${JSON.stringify(candidateSha)}`);
  }
  const env = options.env || process.env;
  const envCandidateSha = env.KURABE_CONFIRMATION_CANDIDATE_SHA;
  if (envCandidateSha && candidateSha !== envCandidateSha) {
    usageError(`${modulePath} candidate SHA (${candidateSha}) does not match env KURABE_CONFIRMATION_CANDIDATE_SHA (${envCandidateSha})`);
  }
  const gitHead = options.gitHead !== undefined ? options.gitHead : resolveGitHead(options.rootDir || projectRoot);
  if (gitHead && candidateSha !== gitHead) {
    usageError(`${modulePath} candidate SHA (${candidateSha}) does not match current Git HEAD (${gitHead})`);
  }
  if (envCandidateSha && gitHead && envCandidateSha !== gitHead) {
    usageError(`environment KURABE_CONFIRMATION_CANDIDATE_SHA (${envCandidateSha}) does not match current Git HEAD (${gitHead})`);
  }
  if (!envCandidateSha && !gitHead) {
    usageError(`${modulePath} candidate SHA cannot be verified: neither current Git HEAD nor env KURABE_CONFIRMATION_CANDIDATE_SHA is available`);
  }

  const baseSha = result.baseSha || result.candidate?.baseSha;
  if (!baseSha || baseSha !== P103_BASE_SHA) {
    usageError(`${modulePath} reported base SHA ${JSON.stringify(baseSha)}, expected p103 manifest BASE_SHA "${P103_BASE_SHA}"`);
  }

  const changedFiles = result.changedFileSha256 || result.candidate?.changedFileSha256;
  if (changedFiles) {
    verifyChangedFileHashes(changedFiles, modulePath, options.rootDir || projectRoot);
  }

  const evidencePath = options.evidence || result.evidencePath || env.KURABE_CONFIRMATION_INTEGRATION_EVIDENCE;
  verifyConfirmationEvidence(evidencePath, result, modulePath, options);

  return reportedIds.length;
}

export function validateSuiteResult(result, modulePath, options = {}) {
  if (!result || typeof result !== 'object') {
    usageError(`${modulePath} returned a non-object suite result`);
  }

  if (result.failed === true) {
    usageError(`${modulePath} reported failed === true despite passed === true`);
  }
  if (isForbiddenStatus(result.status)) {
    usageError(`${modulePath} reported forbidden status ${JSON.stringify(result.status)} despite passed === true`);
  }
  if (isForbiddenStatus(result.state)) {
    usageError(`${modulePath} reported forbidden state ${JSON.stringify(result.state)} despite passed === true`);
  }
  if (isForbiddenStatus(result.outcome)) {
    usageError(`${modulePath} reported forbidden outcome ${JSON.stringify(result.outcome)} despite passed === true`);
  }
  if (isForbiddenStatus(result.result)) {
    usageError(`${modulePath} reported forbidden result ${JSON.stringify(result.result)} despite passed === true`);
  }
  if (Array.isArray(result.errors) && result.errors.length > 0) {
    usageError(`${modulePath} reported unhandled errors despite passed === true`);
  }
  if (Array.isArray(result.failures) && result.failures.length > 0) {
    usageError(`${modulePath} reported unhandled failures despite passed === true`);
  }

  checkCasesForForbiddenStatus(result.cases, modulePath, 'cases');
  checkCasesForForbiddenStatus(result.reports, modulePath, 'reports');
  checkCasesForForbiddenStatus(result.checks, modulePath, 'checks');

  if (result.real !== true) {
    usageError(`${modulePath} did not report a real local run; mock substitution is forbidden`);
  }
  if (Array.isArray(result.cases) && result.cases.length === 0) {
    usageError(`${modulePath} reported zero executable cases`);
  }
  if (result.passed !== true) {
    usageError(`${modulePath} did not report passed === true (missing, null, or false is forbidden)`);
  }
  const count = caseCount(result);
  if (typeof count !== 'number' || !Number.isFinite(count) || !Number.isInteger(count) || count < 1) {
    usageError(`${modulePath} reported non-positive, non-integer, or NaN case count: ${count}`);
  }
  if (!result.tier || !VALID_EVIDENCE_TIERS.has(result.tier)) {
    usageError(`${modulePath} reported invalid or missing evidence tier: ${JSON.stringify(result?.tier)}`);
  }
  if (result.tier === 'source-contract' && options.requiredTier && options.requiredTier !== 'source-contract') {
    usageError(`${modulePath} is source-contract and cannot satisfy required tier "${options.requiredTier}"`);
  }
  if (options.requiredTier && result.tier !== options.requiredTier) {
    usageError(`${modulePath} reported tier "${result.tier}", but required tier is "${options.requiredTier}"`);
  }
  if (result.authenticated === true) {
    if (result.tier === 'source-contract') {
      usageError(`${modulePath} claimed authenticated scope on source-contract tier without runtime execution`);
    }
    if (result.tier !== 'authenticated' && (!Number.isInteger(result.authenticatedCases) || result.authenticatedCases < 1)) {
      usageError(`${modulePath} claimed authenticated === true without finite positive executed authenticatedCases`);
    }
  }

  const isConfirmationMatrixSuite = options.suite === 'confirmation-matrix' ||
    (typeof modulePath === 'string' && modulePath.endsWith('confirmation-matrix.mjs')) ||
    options.isConfirmationMatrix === true ||
    (result && typeof result.format === 'string' && result.format.includes('confirmation'));

  if (isConfirmationMatrixSuite) {
    return validateConfirmationMatrix(result, modulePath, options);
  }

  return count;
}

function safeError(error) {
  return String(error?.message || error)
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}

export async function runSuite(options) {
  const modules = discoverSuiteModules(options.suite);
  if (modules.length === 0) {
    usageError(`unknown or zero-case suite ${JSON.stringify(options.suite)}; no matching real local suite was found`);
  }
  const reports = [];
  for (const modulePath of modules) {
    const loaded = await import(pathToFileURL(modulePath).href);
    if (typeof loaded.run !== 'function') {
      usageError(`${modulePath} has no run() export; silent substitution is forbidden`);
    }
    const result = await loaded.run({ rootDir: projectRoot, suite: options.suite, options });
    const count = validateSuiteResult(result, modulePath, options);
    reports.push({
      modulePath,
      count,
      tier: result.tier,
      status: result.status || 'EXECUTED',
      capability: result.capability || null,
      authenticated: Boolean(result.authenticated),
      target: result.target || 'redacted-local-target',
      cases: Array.isArray(result.cases) ? result.cases : [],
      richEvidence: result.richEvidence || null,
      evidencePath: result.evidencePath || null,
    });
  }
  return reports;
}

export function writeEvidence(filePath, evidence) {
  if (!path.isAbsolute(filePath)) usageError('--evidence must be an absolute path');

  let richEvidence = null;
  if (fs.existsSync(filePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (existing?.format?.includes('confirmation') || existing?.taskId === 'P103M4T01' || existing?.requiredCases) {
        richEvidence = existing;
      }
    } catch {}
  }
  if (!richEvidence && evidence.richEvidence) {
    richEvidence = evidence.richEvidence;
  }
  if (!richEvidence && Array.isArray(evidence.reports)) {
    for (const rep of evidence.reports) {
      if (rep.richEvidence) {
        richEvidence = rep.richEvidence;
        break;
      }
    }
  }

  let authoritativeArtifactPath = null;
  let authoritativeDigest = null;

  if (richEvidence) {
    const sidecarPath = `${filePath}.authoritative.json`;
    const sanitizedRich = JSON.parse(safeError(JSON.stringify(richEvidence)));
    const tempSidecar = `${sidecarPath}.tmp-${process.pid}`;
    try {
      fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
      fs.writeFileSync(tempSidecar, `${JSON.stringify(sanitizedRich, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(tempSidecar, sidecarPath);
      authoritativeArtifactPath = sidecarPath;
      authoritativeDigest = crypto.createHash('sha256').update(fs.readFileSync(sidecarPath)).digest('hex');
    } catch (err) {
      try { fs.rmSync(tempSidecar, { force: true }); } catch {}
      usageError(`could not write authoritative sidecar evidence: ${err.message}`);
    }
  }

  const reports = evidence.reports.map((report) => ({
    modulePath: report.modulePath,
    count: report.count,
    tier: report.tier,
    status: report.status || 'EXECUTED',
    capability: report.capability || null,
    authenticated: Boolean(report.authenticated),
    target: safeError(report.target || 'redacted-local-target'),
    cases: Array.isArray(report.cases) ? report.cases : [],
  }));
  const tiers = [...new Set(reports.map((r) => r.tier).filter(Boolean))];
  const overallMode = tiers.length === 1 ? tiers[0] : (tiers.includes('source-contract') ? 'mixed-tiers' : 'real-local');
  const payload = {
    format: 'kurabe-release-evidence/v1',
    generatedAt: new Date().toISOString(),
    suite: evidence.suite,
    mode: overallMode,
    tiers,
    totalCases: evidence.totalCases,
    reports,
  };

  if (authoritativeArtifactPath && authoritativeDigest) {
    payload.authoritativeArtifact = authoritativeArtifactPath;
    payload.authoritativeDigest = authoritativeDigest;
    if (richEvidence) {
      payload.richConfirmationEvidence = richEvidence;
    }
  }

  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { fs.rmSync(temporaryPath, { force: true }); } catch { /* best effort */ }
    usageError(`could not write redacted evidence: ${error.message}`);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/verify-release.mjs --suite <name> [--tier <tier>] [--evidence <abs-path>] [--db-host 127.0.0.1 --db-port 5432 --db-name kurabe_harness --db-user postgres]');
      return;
    }
    const reports = await runSuite(options);
    const totalCases = reports.reduce((total, report) => total + report.count, 0);
    if (options.evidence) writeEvidence(options.evidence, { suite: options.suite, totalCases, reports });
    const tiers = [...new Set(reports.map((r) => r.tier))].join(',');
    console.log(`VERIFY_RELEASE PASS suite=${options.suite} modules=${reports.length} cases=${totalCases} tiers=${tiers}`);
    for (const report of reports) {
      console.log(`  PASS ${path.relative(projectRoot, report.modulePath)} cases=${report.count} tier=${report.tier}`);
    }
  } catch (error) {
    console.error(`VERIFY_RELEASE FAIL ${safeError(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
