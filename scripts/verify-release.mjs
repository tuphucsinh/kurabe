#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

function usageError(message) {
  throw new Error(`VERIFY_RELEASE: ${message}`);
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
  return suiteRoots
    .map((relativeRoot) => path.join(projectRoot, relativeRoot, `${suite}.mjs`))
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function caseCount(result) {
  if (Array.isArray(result?.cases)) return result.cases.length;
  if (typeof result?.cases === 'number' && Number.isFinite(result.cases) && Number.isInteger(result.cases)) return result.cases;
  return NaN;
}

export function validateSuiteResult(result, modulePath, options = {}) {
  if (!result || typeof result !== 'object') {
    usageError(`${modulePath} returned a non-object suite result`);
  }
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
    });
  }
  return reports;
}

export function writeEvidence(filePath, evidence) {
  if (!path.isAbsolute(filePath)) usageError('--evidence must be an absolute path');
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
