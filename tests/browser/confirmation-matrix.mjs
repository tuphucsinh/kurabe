#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BASE_SHA,
  BROWSER_REQUIRED_CASES,
  CANONICAL_ANCESTORS,
  REQUIRED_CASES,
  verifyRequiredCaseManifest,
  verifyCandidateSha,
} from '../operations/p103-required-cases.mjs';
import { validateRuntimeEnvironment } from '../support/confirmation-runtime.mjs';
import { psql, sqlLiteral } from '../support/confirmation-fixtures.mjs';
import { run as runRealRequiredCases } from './real-required-cases.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');
export const NATIVE_TIER = 'actual-Next-browser';
export const AUTHENTICATED_TIER = 'authenticated';

function safeError(error) {
  return String(error?.message || error)
    .replace(/https?:\/\/[^\s)]+/gi, '[REDACTED_URL]')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function git(args) {
  return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
}

function identity() {
  const candidateSha = process.env.KURABE_CONFIRMATION_CANDIDATE_SHA || git(['rev-parse', 'HEAD']);
  verifyCandidateSha(candidateSha, process.env);
  if (fs.existsSync(path.join(projectRoot, '.git'))) {
    for (const ancestor of CANONICAL_ANCESTORS) {
      execFileSync('git', ['merge-base', '--is-ancestor', ancestor, candidateSha], { cwd: projectRoot });
    }
  }
  return { baseSha: BASE_SHA, candidateSha, canonicalAncestors: [...CANONICAL_ANCESTORS] };
}

function writeEvidence(filePath, payload) {
  if (!filePath) return null;
  assert.ok(path.isAbsolute(filePath), 'matrix evidence path must be absolute');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sanitized = JSON.parse(safeError(JSON.stringify(payload)));
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  return filePath;
}

function assertNoSourceSubstitution(result) {
  assert.equal(result.real, true, 'browser result must be a real local run');
  assert.equal(result.passed, true, 'browser result must pass');
  assert.equal(result.tier, NATIVE_TIER, 'browser result must retain actual-Next-browser tier');
  assert.equal(result.authenticated, true, 'browser result must identify authenticated execution');
  assert.ok(!/mock|synthetic|source-contract|blocked|skipped/i.test(JSON.stringify(result)), 'browser result contains a forbidden substitution marker');
}

function verifyCaseEvidence(caseReports) {
  const ids = caseReports.map((item) => typeof item === 'string' ? item : item.id);
  assert.equal(new Set(ids).size, ids.length, 'browser matrix contains duplicate case evidence');
  assert.ok(ids.every((id) => BROWSER_REQUIRED_CASES.includes(id)), 'browser evidence contains an unknown case');
  for (const required of BROWSER_REQUIRED_CASES) assert.ok(ids.includes(required), `browser case was not executed: ${required}`);
  return caseReports;
}

function verifyBrowserCleanup(target) {
  const residue = psql(target, `
    SELECT (
      (SELECT count(*) FROM public.users WHERE employee_code LIKE 'P103-%') +
      (SELECT count(*) FROM public.teams WHERE name LIKE 'P103 %') +
      (SELECT count(*) FROM public.evaluation_periods WHERE name LIKE 'P103 %') +
      (SELECT count(*) FROM public.evaluations WHERE id::text IN (
        SELECT id::text FROM public.evaluations WHERE period_id IN (
          SELECT id FROM public.evaluation_periods WHERE name LIKE 'P103 %'
        )
      ))
    )::text;
  `);
  assert.equal(residue, '0', `browser cleanup residue=${residue}`);
  return { residue: 0 };
}

export async function run(context = {}) {
  const manifest = verifyRequiredCaseManifest();
  const evidencePath = context?.options?.evidence || process.env.KURABE_CONFIRMATION_BROWSER_EVIDENCE;
  let candidate;
  try {
    candidate = identity();
    const env = validateRuntimeEnvironment(process.env);
    assert.ok(env.supabaseUrl, 'PostgREST loopback URL is required');
    const helper = await runRealRequiredCases();
    assertNoSourceSubstitution(helper);
    verifyCaseEvidence(helper.cases);
    const cleanup = verifyBrowserCleanup(env.dbTarget);
    const evidence = {
      format: 'kurabe-p103m4t01-confirmation-browser/v1',
      taskId: 'P103M4T01',
      requiredCaseManifest: manifest,
      tier: NATIVE_TIER,
      authenticated: true,
      status: 'QUALIFIED',
      requiredCases: [...BROWSER_REQUIRED_CASES],
      cases: helper.cases,
      candidate,
      runtime: helper.browserRuntime,
      cleanup: { ownedDisposableRuntimeOnly: true, ...cleanup, productionWrites: 0, productionMigrations: 0 },
    };
    const written = writeEvidence(evidencePath, evidence);
    return {
      real: true,
      passed: true,
      tier: context?.options?.requiredTier === AUTHENTICATED_TIER ? AUTHENTICATED_TIER : NATIVE_TIER,
      nativeTier: NATIVE_TIER,
      authenticated: true,
      status: 'QUALIFIED',
      cases: helper.cases,
      authenticatedCases: BROWSER_REQUIRED_CASES.length,
      requiredCases: [...BROWSER_REQUIRED_CASES],
      candidateSha: candidate.candidateSha,
      baseSha: candidate.baseSha,
      evidencePath: written,
      productionWrites: 0,
      productionMigrations: 0,
      target: 'actual-next-production-build-chrome-cdp-authenticated',
    };
  } catch (error) {
    const failure = {
      format: 'kurabe-p103m4t01-confirmation-browser/v1',
      taskId: 'P103M4T01',
      tier: NATIVE_TIER,
      authenticated: false,
      status: error?.code === 'MISSING_RUNTIME_CAPABILITY' ? 'BLOCKED_CAPABILITY' : 'UNKNOWN',
      requiredCases: [...BROWSER_REQUIRED_CASES],
      cases: [],
      firstFailure: safeError(error),
      candidate: candidate || { baseSha: BASE_SHA, candidateSha: process.env.KURABE_CONFIRMATION_CANDIDATE_SHA || 'UNKNOWN' },
      cleanup: { ownedDisposableRuntimeOnly: true, residue: 'UNKNOWN', productionWrites: 0, productionMigrations: 0 },
    };
    writeEvidence(evidencePath, failure);
    return {
      real: false,
      passed: false,
      tier: NATIVE_TIER,
      nativeTier: NATIVE_TIER,
      authenticated: false,
      status: failure.status,
      capability: error?.code || 'UNKNOWN',
      reason: failure.firstFailure,
      firstFailure: failure.firstFailure,
      requiredCases: [...REQUIRED_CASES],
      cases: [],
      evidencePath: evidencePath || null,
      productionWrites: 0,
      productionMigrations: 0,
      target: 'no-qualified-browser-evidence',
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await run({ options: { evidence: process.env.KURABE_CONFIRMATION_BROWSER_EVIDENCE } });
  console.log(`CONFIRMATION_BROWSER ${result.status} cases=${result.cases.length} tier=${result.tier}${result.reason ? ` firstFailure=${result.reason}` : ''}`);
  if (!result.passed) process.exitCode = 1;
}
