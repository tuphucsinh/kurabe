#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '..');
const suiteRoots = ['tests/integration', 'tests/browser', 'tests/operations'];

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
  if (!options.help && (!options.suite || !/^[a-z0-9][a-z0-9_-]*$/.test(options.suite))) {
    usageError('--suite must be an exact simple suite name');
  }
  if (options.evidence && !path.isAbsolute(options.evidence)) {
    usageError('--evidence must be an absolute path');
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
  if (Number.isInteger(result?.cases)) return result.cases;
  return 0;
}

export function validateSuiteResult(result, modulePath) {
  if (!result || result.real !== true) {
    usageError(`${modulePath} did not report a real local run; mock substitution is forbidden`);
  }
  const count = caseCount(result);
  if (count < 1) usageError(`${modulePath} reported zero executable cases`);
  if (result.passed === false) usageError(`${modulePath} reported failure`);
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
    const count = validateSuiteResult(result, modulePath);
    reports.push({ modulePath, count, target: result.target || 'redacted-local-target' });
  }
  return reports;
}

export function writeEvidence(filePath, evidence) {
  if (!path.isAbsolute(filePath)) usageError('--evidence must be an absolute path');
  const payload = {
    format: 'kurabe-release-evidence/v1',
    generatedAt: new Date().toISOString(),
    suite: evidence.suite,
    mode: 'real-local',
    totalCases: evidence.totalCases,
    reports: evidence.reports.map((report) => ({
      modulePath: report.modulePath,
      count: report.count,
      target: safeError(report.target || 'redacted-local-target'),
    })),
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
      console.log('Usage: node scripts/verify-release.mjs --suite <name> [--db-host 127.0.0.1 --db-port 5432 --db-name kurabe_harness --db-user postgres]');
      return;
    }
    const reports = await runSuite(options);
    const totalCases = reports.reduce((total, report) => total + report.count, 0);
    if (options.evidence) writeEvidence(options.evidence, { suite: options.suite, totalCases, reports });
    console.log(`VERIFY_RELEASE PASS suite=${options.suite} modules=${reports.length} cases=${totalCases} mode=real-local`);
    for (const report of reports) {
      console.log(`  PASS ${path.relative(projectRoot, report.modulePath)} cases=${report.count}`);
    }
  } catch (error) {
    console.error(`VERIFY_RELEASE FAIL ${safeError(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
