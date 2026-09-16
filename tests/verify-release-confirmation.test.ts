import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Use dynamicImport to load ESM modules from CJS without tsc rewriting import() to require()
const dynamicImport = new Function('url', 'return import(url)');

interface VerifyReleaseModule {
  projectRoot: string;
  VALID_EVIDENCE_TIERS: Set<string>;
  FORBIDDEN_STATUS_PATTERN: RegExp;
  isForbiddenStatus: (status: string) => boolean;
  isForbiddenCaseString: (str: string) => boolean;
  resolveGitHead: (cwd?: string) => string | null;
  verifyChangedFileHashes: (changedFiles: Record<string, string>, modulePath: string, rootDir?: string) => void;
  verifyConfirmationEvidence: (
    evidencePath: string | null | undefined,
    result: Record<string, unknown>,
    modulePath: string,
    options?: Record<string, unknown>,
  ) => Record<string, unknown>;
  validateConfirmationMatrix: (
    result: Record<string, unknown>,
    modulePath: string,
    options?: Record<string, unknown>,
  ) => number;
  validateSuiteResult: (
    result: Record<string, unknown>,
    modulePath: string,
    options?: Record<string, unknown>,
  ) => number;
  writeEvidence: (filePath: string, evidence: Record<string, unknown>) => void;
  discoverSuiteModules: (suite: string) => string[];
}

interface RequiredCasesModule {
  INTEGRATION_REQUIRED_CASES: readonly string[];
  BASE_SHA: string;
  TASK_ID: string;
  CANONICAL_ANCESTORS: readonly string[];
  verifyCandidateSha: (candidateSha: string, env?: NodeJS.ProcessEnv) => string;
}

interface CiSuiteManifestModule {
  CI_SUITE_MANIFEST: ReadonlyArray<{
    id: string;
    command: string;
    modules: readonly string[];
    tiers: readonly string[];
    roles: readonly string[];
    localQualification: string;
  }>;
  run: () => Promise<Record<string, unknown>>;
}

function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function runTests() {
  const rootDir = process.cwd();
  const verifyReleasePath = path.resolve(rootDir, 'scripts/verify-release.mjs');
  const requiredCasesPath = path.resolve(rootDir, 'tests/operations/p103-required-cases.mjs');
  const ciManifestPath = path.resolve(rootDir, 'tests/operations/ci-suite-manifest.mjs');

  const verifyMod = (await dynamicImport(pathToFileURL(verifyReleasePath).href)) as VerifyReleaseModule;
  const requiredCasesMod = (await dynamicImport(pathToFileURL(requiredCasesPath).href)) as RequiredCasesModule;
  const ciManifestMod = (await dynamicImport(pathToFileURL(ciManifestPath).href)) as CiSuiteManifestModule;

  const {
    validateSuiteResult,
    validateConfirmationMatrix,
    writeEvidence,
    discoverSuiteModules,
    isForbiddenStatus,
    isForbiddenCaseString,
  } = verifyMod;

  const { INTEGRATION_REQUIRED_CASES, BASE_SHA } = requiredCasesMod;

  const candidateSha = '117215934afaaca9553815db462d2e5fb8da68e8';
  const dummyModule = path.join(rootDir, 'tests/integration/confirmation-matrix.mjs');

  const changedFiles = {
    'tests/operations/p103-required-cases.mjs': sha256(path.join(rootDir, 'tests/operations/p103-required-cases.mjs')),
    'tests/integration/confirmation-matrix.mjs': sha256(path.join(rootDir, 'tests/integration/confirmation-matrix.mjs')),
    'tests/browser/confirmation-matrix.mjs': sha256(path.join(rootDir, 'tests/browser/confirmation-matrix.mjs')),
  };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-test-verify-confirmation-'));

  try {
    function createEvidenceFile(filename: string, content: Record<string, unknown>): string {
      const filePath = path.join(tempDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
      return filePath;
    }

    function makeValidRichEvidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        format: 'kurabe-p103m4t01-confirmation-integration/v1',
        taskId: 'P103M4T01',
        tier: 'real-DB',
        authenticated: true,
        status: 'QUALIFIED',
        requiredCases: [...INTEGRATION_REQUIRED_CASES],
        cases: INTEGRATION_REQUIRED_CASES.map((id) => ({
          id,
          delegate: id.split(':')[0],
          status: 'PASS',
          evidence: 'delegate-real-next-action-db',
        })),
        caseCount: INTEGRATION_REQUIRED_CASES.length,
        candidate: {
          baseSha: BASE_SHA,
          candidateSha,
          canonicalAncestors: [
            'd2142155fb633b70db4ad22d69edd426e50f5924',
            '36d696c1367fbfd76afd5d15db14a493b753f733',
            'ea04a894bd4fee8214fa9a395fc5a279255fd596',
          ],
          changedFileSha256: { ...changedFiles },
        },
        runtime: { stack: 'owned-loopback-disposable' },
        migrations: {
          manifestFormat: 'kurabe-p103-manifest/v1',
          productionWrites: 0,
          productionMigrations: 0,
        },
        cleanup: {
          ownedDisposableRuntimeOnly: true,
          residue: 0,
          productionWrites: 0,
          productionMigrations: 0,
        },
        ...overrides,
      };
    }

    function makeValidMatrixResult(evidencePath: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        real: true,
        passed: true,
        tier: 'authenticated',
        nativeTier: 'real-DB',
        authenticated: true,
        status: 'QUALIFIED',
        cases: [...INTEGRATION_REQUIRED_CASES],
        authenticatedCases: INTEGRATION_REQUIRED_CASES.length,
        requiredCases: [...INTEGRATION_REQUIRED_CASES],
        candidateSha,
        baseSha: BASE_SHA,
        changedFileSha256: { ...changedFiles },
        evidencePath,
        productionWrites: 0,
        productionMigrations: 0,
        target: 'real-disposable-postgresql-postgrest-next-authenticated-delegates',
        ...overrides,
      };
    }

    const defaultOptions = {
      suite: 'confirmation-matrix',
      requiredTier: 'authenticated',
      env: { KURABE_CONFIRMATION_CANDIDATE_SHA: candidateSha },
      gitHead: candidateSha,
    };

    console.log('\n--- Group 1: Poisoned statuses & cases ---');
    {
      const forbiddenTopStatuses = [
        'FAIL', 'FAILED', 'ERROR', 'ERRORED', 'BLOCKED',
        'BLOCKED_CAPABILITY', 'SKIP', 'SKIPPED', 'NOT_RUN', 'NOT-RUN',
      ];
      for (const st of forbiddenTopStatuses) {
        assert.equal(isForbiddenStatus(st), true, `status ${st} should be forbidden`);
        assert.throws(
          () => {
            validateSuiteResult(
              { real: true, passed: true, tier: 'source-contract', status: st, cases: ['valid-case'] },
              'dummy/test.mjs',
            );
          },
          /forbidden status|VERIFY_RELEASE/,
          `Top-level status ${st} must be rejected`,
        );
      }

      // Poisoned state
      assert.throws(
        () => {
          validateSuiteResult(
            { real: true, passed: true, tier: 'source-contract', status: 'EXECUTED', state: 'FAIL', cases: ['c1'] },
            'dummy/test.mjs',
          );
        },
        /forbidden state/,
      );

      // Top-level failed === true despite passed === true
      assert.throws(
        () => {
          validateSuiteResult(
            { real: true, passed: true, failed: true, tier: 'source-contract', status: 'EXECUTED', cases: ['c1'] },
            'dummy/test.mjs',
          );
        },
        /failed === true/,
      );

      // Top-level unhandled errors/failures
      assert.throws(
        () => {
          validateSuiteResult(
            { real: true, passed: true, tier: 'source-contract', status: 'EXECUTED', cases: ['c1'], errors: ['err'] },
            'dummy/test.mjs',
          );
        },
        /unhandled errors/,
      );
      assert.throws(
        () => {
          validateSuiteResult(
            { real: true, passed: true, tier: 'source-contract', status: 'EXECUTED', cases: ['c1'], failures: ['fail'] },
            'dummy/test.mjs',
          );
        },
        /unhandled failures/,
      );

      // Poisoned case objects
      const forbiddenCaseStatuses = ['FAIL', 'ERROR', 'BLOCKED', 'SKIP', 'SKIPPED', 'NOT_RUN'];
      for (const cst of forbiddenCaseStatuses) {
        assert.throws(
          () => {
            validateSuiteResult(
              {
                real: true,
                passed: true,
                tier: 'source-contract',
                status: 'EXECUTED',
                cases: [{ id: 'case-1', status: 'PASS' }, { id: 'case-2', status: cst }],
              },
              'dummy/test.mjs',
            );
          },
          /forbidden case status/,
          `Case status ${cst} must be rejected`,
        );
      }

      // Case with passed: false
      assert.throws(
        () => {
          validateSuiteResult(
            {
              real: true,
              passed: true,
              tier: 'source-contract',
              status: 'EXECUTED',
              cases: [{ id: 'case-1', passed: false }],
            },
            'dummy/test.mjs',
          );
        },
        /failed case/,
      );

      // Case with failed: true
      assert.throws(
        () => {
          validateSuiteResult(
            {
              real: true,
              passed: true,
              tier: 'source-contract',
              status: 'EXECUTED',
              cases: [{ id: 'case-1', failed: true }],
            },
            'dummy/test.mjs',
          );
        },
        /failed case/,
      );

      // Poisoned string cases
      assert.equal(isForbiddenCaseString('FAIL'), true);
      assert.equal(isForbiddenCaseString('case-1: FAIL'), true);
      assert.equal(isForbiddenCaseString('case-1 SKIPPED'), true);
      assert.equal(isForbiddenCaseString('case-1: NOT_RUN'), true);
      assert.throws(
        () => {
          validateSuiteResult(
            { real: true, passed: true, tier: 'source-contract', status: 'EXECUTED', cases: ['case-1: FAIL'] },
            'dummy/test.mjs',
          );
        },
        /forbidden case status/,
      );

      // Crucial: Legitimate case ID containing "skipped" as a substring (like 'h1h2:skipped-round-denial')
      // MUST NOT be falsely flagged as poisoned!
      assert.equal(isForbiddenCaseString('h1h2:skipped-round-denial'), false);
      assert.doesNotThrow(() => {
        validateSuiteResult(
          { real: true, passed: true, tier: 'source-contract', status: 'EXECUTED', cases: ['h1h2:skipped-round-denial'] },
          'dummy/test.mjs',
        );
      });
      console.log('✓ Group 1: Poisoned statuses and contradictory results rejected; legitimate names preserved');
    }

    console.log('\n--- Group 2: Missing / duplicate / unknown / skipped IDs ---');
    {
      const evFile = createEvidenceFile('ev-group2.json', makeValidRichEvidence());

      // Missing required case ID
      const missingCases = INTEGRATION_REQUIRED_CASES.slice(1); // 53 cases
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evFile, { cases: missingCases, authenticatedCases: missingCases.length }),
            dummyModule,
            defaultOptions,
          );
        },
        /missing required case IDs/,
      );

      // Duplicate case ID
      const duplicateCases = [...INTEGRATION_REQUIRED_CASES, INTEGRATION_REQUIRED_CASES[0]]; // 55 cases
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evFile, { cases: duplicateCases, authenticatedCases: duplicateCases.length }),
            dummyModule,
            defaultOptions,
          );
        },
        /duplicate required case IDs/,
      );

      // Unknown case ID
      const unknownCases = [...INTEGRATION_REQUIRED_CASES.slice(1), 'h1h2:unauthorized-fake-case'];
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evFile, { cases: unknownCases, authenticatedCases: unknownCases.length }),
            dummyModule,
            defaultOptions,
          );
        },
        /unknown case IDs/,
      );

      // Skipped case in evidence
      const skippedEvidenceCases = INTEGRATION_REQUIRED_CASES.map((id, index) => ({
        id,
        status: index === 0 ? 'SKIP' : 'PASS',
      }));
      const evWithSkip = createEvidenceFile('ev-with-skip.json', makeValidRichEvidence({ cases: skippedEvidenceCases }));
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evWithSkip),
            dummyModule,
            defaultOptions,
          );
        },
        /non-PASS status: SKIP/,
      );

      // Zero executable cases
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evFile, { cases: [] }),
            dummyModule,
            defaultOptions,
          );
        },
        /reported zero executable cases/,
      );
      console.log('✓ Group 2: Missing, duplicate, unknown, and skipped IDs rejected');
    }

    console.log('\n--- Group 3: Wrong SHA & hash values ---');
    {
      const evFile = createEvidenceFile('ev-group3.json', makeValidRichEvidence());

      // Candidate SHA mismatch with env
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evFile, { candidateSha: '0000000000000000000000000000000000000000' }),
            dummyModule,
            defaultOptions,
          );
        },
        /candidate SHA.*does not match env/,
      );

      // Candidate SHA mismatch with git HEAD
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evFile),
            dummyModule,
            { ...defaultOptions, gitHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          );
        },
        /candidate SHA.*does not match current Git HEAD/,
      );

      // Candidate SHA malformed (non-40 hex)
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evFile, { candidateSha: 'short-sha' }),
            dummyModule,
            { ...defaultOptions, env: { KURABE_CONFIRMATION_CANDIDATE_SHA: 'short-sha' }, gitHead: 'short-sha' },
          );
        },
        /missing or invalid candidate SHA/,
      );

      // Base SHA mismatch from p103 manifest
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evFile, { baseSha: 'wrong-base-sha-1234567890abcdef12345678' }),
            dummyModule,
            defaultOptions,
          );
        },
        /base SHA.*expected p103 manifest BASE_SHA/,
      );

      // Changed-file SHA-256 mismatch from actual disk file
      const poisonedHashes = {
        ...changedFiles,
        'tests/operations/p103-required-cases.mjs': '0000000000000000000000000000000000000000000000000000000000000000',
      };
      const evWrongHash = createEvidenceFile(
        'ev-wrong-hash.json',
        makeValidRichEvidence({
          candidate: {
            baseSha: BASE_SHA,
            candidateSha,
            changedFileSha256: poisonedHashes,
          },
        }),
      );
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evWrongHash, { changedFileSha256: poisonedHashes }),
            dummyModule,
            defaultOptions,
          );
        },
        /changed-file SHA-256 mismatch/,
      );

      // Changed-file pointing to non-existent file
      const missingFileHashes = {
        ...changedFiles,
        'tests/does-not-exist.mjs': '1111111111111111111111111111111111111111111111111111111111111111',
      };
      const evMissingFile = createEvidenceFile(
        'ev-missing-file.json',
        makeValidRichEvidence({
          candidate: {
            baseSha: BASE_SHA,
            candidateSha,
            changedFileSha256: missingFileHashes,
          },
        }),
      );
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evMissingFile, { changedFileSha256: missingFileHashes }),
            dummyModule,
            defaultOptions,
          );
        },
        /changed file does not exist on disk/,
      );
      console.log('✓ Group 3: Candidate SHA, Base SHA, and file SHA-256 verification strictly enforced');
    }

    console.log('\n--- Group 4: Absent & malformed evidence & nonzero production writes ---');
    {
      // Absent evidence: no path provided
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult('', { evidencePath: null }),
            dummyModule,
            { ...defaultOptions, evidence: undefined },
          );
        },
        /evidence is absent/,
      );

      // Absent evidence: file does not exist
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult('/tmp/non-existent-evidence-file-12345.json'),
            dummyModule,
            { ...defaultOptions, evidence: '/tmp/non-existent-evidence-file-12345.json' },
          );
        },
        /evidence is absent: file does not exist/,
      );

      // Malformed evidence: invalid JSON
      const malformedPath = path.join(tempDir, 'malformed.json');
      fs.writeFileSync(malformedPath, '{ invalid json: [ corrupt', 'utf8');
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(malformedPath),
            dummyModule,
            { ...defaultOptions, evidence: malformedPath },
          );
        },
        /malformed JSON/,
      );

      // Evidence format wrong
      const wrongFormat = createEvidenceFile('ev-wrong-format.json', makeValidRichEvidence({ format: 'untrusted/v1' }));
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(wrongFormat),
            dummyModule,
            { ...defaultOptions, evidence: wrongFormat },
          );
        },
        /wrong or unrecognized format/,
      );

      // Evidence status not QUALIFIED
      const wrongStatus = createEvidenceFile('ev-wrong-status.json', makeValidRichEvidence({ status: 'EXECUTED' }));
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(wrongStatus),
            dummyModule,
            { ...defaultOptions, evidence: wrongStatus },
          );
        },
        /evidence reported status.*expected "QUALIFIED"/,
      );

      // Nonzero production writes in migrations
      const nonzeroWrites = createEvidenceFile(
        'ev-nonzero-writes.json',
        makeValidRichEvidence({ migrations: { productionWrites: 1, productionMigrations: 0 } }),
      );
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(nonzeroWrites),
            dummyModule,
            { ...defaultOptions, evidence: nonzeroWrites },
          );
        },
        /nonzero production writes in migrations/,
      );

      // Nonzero production migrations in migrations
      const nonzeroMigrations = createEvidenceFile(
        'ev-nonzero-migrations.json',
        makeValidRichEvidence({ migrations: { productionWrites: 0, productionMigrations: 1 } }),
      );
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(nonzeroMigrations),
            dummyModule,
            { ...defaultOptions, evidence: nonzeroMigrations },
          );
        },
        /nonzero production migrations in migrations/,
      );

      // Nonzero production writes in cleanup
      const nonzeroCleanupWrites = createEvidenceFile(
        'ev-nonzero-cleanup.json',
        makeValidRichEvidence({ cleanup: { productionWrites: 2, productionMigrations: 0 } }),
      );
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(nonzeroCleanupWrites),
            dummyModule,
            { ...defaultOptions, evidence: nonzeroCleanupWrites },
          );
        },
        /nonzero production writes in cleanup/,
      );

      // Nonzero production writes in result
      const evValid = createEvidenceFile('ev-valid-for-res.json', makeValidRichEvidence());
      assert.throws(
        () => {
          validateSuiteResult(
            makeValidMatrixResult(evValid, { productionWrites: 1 }),
            dummyModule,
            { ...defaultOptions, evidence: evValid },
          );
        },
        /result reports nonzero production writes/,
      );
      console.log('✓ Group 4: Absent/malformed evidence and nonzero production writes/migrations rejected');
    }

    console.log('\n--- Group 5: Valid acceptance & evidence retention ---');
    {
      const validEvPath = createEvidenceFile('ev-valid.json', makeValidRichEvidence());
      const validResult = makeValidMatrixResult(validEvPath);

      // Test validateSuiteResult acceptance
      const count = validateSuiteResult(validResult, dummyModule, { ...defaultOptions, evidence: validEvPath });
      assert.equal(count, INTEGRATION_REQUIRED_CASES.length, `must accept 54 cases, got ${count}`);

      // Test validateConfirmationMatrix acceptance
      const directCount = validateConfirmationMatrix(validResult, dummyModule, { ...defaultOptions, evidence: validEvPath });
      assert.equal(directCount, INTEGRATION_REQUIRED_CASES.length);

      // Test writeEvidence retention:
      // When writeEvidence is called on a path that already has rich evidence:
      const targetEvidenceFile = path.join(tempDir, 'ci-local-matrix.json');
      fs.writeFileSync(targetEvidenceFile, JSON.stringify(makeValidRichEvidence(), null, 2), 'utf8');

      writeEvidence(targetEvidenceFile, {
        suite: 'confirmation-matrix',
        totalCases: INTEGRATION_REQUIRED_CASES.length,
        reports: [
          {
            modulePath: dummyModule,
            count: INTEGRATION_REQUIRED_CASES.length,
            tier: 'authenticated',
            status: 'QUALIFIED',
            authenticated: true,
            target: 'real-disposable-postgresql-postgrest-next-authenticated-delegates',
            cases: [...INTEGRATION_REQUIRED_CASES],
          },
        ],
      });

      // Sidecar file must exist and retain rich evidence
      const sidecarPath = `${targetEvidenceFile}.authoritative.json`;
      assert.ok(fs.existsSync(sidecarPath), 'Authoritative sidecar file must exist');

      const sidecarData = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
      assert.equal(sidecarData.format, 'kurabe-p103m4t01-confirmation-integration/v1');
      assert.equal(sidecarData.status, 'QUALIFIED');
      assert.equal(sidecarData.cases.length, INTEGRATION_REQUIRED_CASES.length);

      // Recomputed sidecar digest must match payload.authoritativeDigest
      const computedSidecarDigest = crypto.createHash('sha256').update(fs.readFileSync(sidecarPath)).digest('hex');
      const envelopeData = JSON.parse(fs.readFileSync(targetEvidenceFile, 'utf8'));
      assert.equal(envelopeData.format, 'kurabe-release-evidence/v1');
      assert.equal(envelopeData.authoritativeArtifact, sidecarPath);
      assert.equal(envelopeData.authoritativeDigest, computedSidecarDigest);
      assert.ok(envelopeData.richConfirmationEvidence, 'Envelope must retain richConfirmationEvidence');

      // Re-validating using the envelope path must succeed because it points to authoritativeArtifact
      const envelopeValidationCount = validateSuiteResult(
        validResult,
        dummyModule,
        { ...defaultOptions, evidence: targetEvidenceFile },
      );
      assert.equal(envelopeValidationCount, INTEGRATION_REQUIRED_CASES.length);
      console.log('✓ Group 5: Genuine confirmation matrix accepted and rich evidence retained with authoritative digest');
    }

    console.log('\n--- Group 6: Legacy compatibility ---');
    {
      // Legacy source-contract suite with string cases
      const legacyResult1 = {
        real: true,
        passed: true,
        tier: 'source-contract',
        status: 'EXECUTED',
        cases: ['contract-1', 'contract-2', 'contract-3'],
        target: 'checked-in-source',
      };
      const count1 = validateSuiteResult(legacyResult1, path.join(rootDir, 'tests/operations/ci-suite-manifest.mjs'));
      assert.equal(count1, 3);

      // Legacy suite with numeric case count
      const legacyResult2 = {
        real: true,
        passed: true,
        tier: 'real-DB',
        status: 'EXECUTED',
        cases: 7,
        target: 'disposable-db',
      };
      const count2 = validateSuiteResult(legacyResult2, path.join(rootDir, 'tests/integration/some-suite.mjs'));
      assert.equal(count2, 7);

      // writeEvidence for legacy suite produces standard envelope with NO sidecars
      const legacyEvidenceFile = path.join(tempDir, 'legacy-evidence.json');
      writeEvidence(legacyEvidenceFile, {
        suite: 'ci-suite-manifest',
        totalCases: 3,
        reports: [
          {
            modulePath: 'tests/operations/ci-suite-manifest.mjs',
            count: 3,
            tier: 'source-contract',
            status: 'EXECUTED',
            authenticated: false,
            target: 'checked-in-source',
            cases: ['contract-1', 'contract-2', 'contract-3'],
          },
        ],
      });
      assert.ok(fs.existsSync(legacyEvidenceFile));
      assert.ok(!fs.existsSync(`${legacyEvidenceFile}.authoritative.json`), 'Legacy suites must not create authoritative sidecar');
      const legacySaved = JSON.parse(fs.readFileSync(legacyEvidenceFile, 'utf8'));
      assert.equal(legacySaved.format, 'kurabe-release-evidence/v1');
      assert.equal(legacySaved.suite, 'ci-suite-manifest');
      assert.equal(legacySaved.authoritativeArtifact, undefined);
      console.log('✓ Group 6: Legacy suite shapes and writeEvidence backward compatibility preserved');
    }

    console.log('\n--- Group 7: Manifest & workflow no bypass ---');
    {
      const manifest = ciManifestMod.CI_SUITE_MANIFEST;
      const matrixEntry = manifest.find((entry) => entry.id === 'confirmation-matrix');
      assert.ok(matrixEntry, 'CI_SUITE_MANIFEST must contain confirmation-matrix');
      assert.equal(
        matrixEntry.command,
        'node scripts/verify-release.mjs --suite confirmation-matrix --tier authenticated --evidence "$EVIDENCE/ci-local-matrix.json"',
      );
      assert.deepEqual(matrixEntry.modules, ['tests/integration/confirmation-matrix.mjs']);
      assert.ok(matrixEntry.tiers.includes('real-DB'));
      assert.ok(matrixEntry.tiers.includes('authenticated'));
      assert.equal(matrixEntry.localQualification, 'workflow-baseline');

      // Run ci-suite-manifest
      const manifestRunResult = await ciManifestMod.run();
      assert.equal(manifestRunResult.passed, true);
      assert.equal(manifestRunResult.status, 'EXECUTED');

      // Discover modules for confirmation-matrix uses manifest
      const discovered = discoverSuiteModules('confirmation-matrix');
      assert.deepEqual(discovered, [path.join(rootDir, 'tests/integration/confirmation-matrix.mjs')]);

      // Check workflow content directly
      const workflowContent = fs.readFileSync(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8');
      assert.match(
        workflowContent,
        /node scripts\/verify-release\.mjs --suite confirmation-matrix --tier authenticated/,
        'Workflow must run confirmation matrix with authenticated tier',
      );
      assert.doesNotMatch(workflowContent, /continue-on-error:\s*true/i, 'Workflow must not allow continue-on-error');
      assert.doesNotMatch(workflowContent, /allow-failure/i, 'Workflow must not allow allow-failure');
      assert.doesNotMatch(
        workflowContent,
        /(?:prod_password|prod_key|production_url|production_key)/i,
        'Workflow must not contain production credentials',
      );
      console.log('✓ Group 7: CI manifest and workflow require confirmation matrix with no bypass');
    }

    console.log('\n=== ALL P103M4T02 CONFIRMATION VERIFICATION TESTS PASSED ===\n');
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

runTests().catch((err) => {
  console.error('\nFAIL verify-release-confirmation.test.ts:', err);
  process.exit(1);
});
