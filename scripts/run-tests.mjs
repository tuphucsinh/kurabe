#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const testsDir = path.join(rootDir, 'tests');
const testBuildDir = path.join(rootDir, '.tmp', 'testbuild');
const localTscBin = path.join(rootDir, 'node_modules', '.bin', 'tsc');

/**
 * Deterministically discover test files under `tests/` directory.
 * Excludes `tests/perf/**` and any non-test files/artifacts.
 */
function discoverTests(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relFromTests = path.relative(testsDir, fullPath).replace(/\\/g, '/');

    // Explicitly exclude tests/perf/**
    if (entry.name === 'perf' || relFromTests === 'perf' || relFromTests.startsWith('perf/')) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...discoverTests(fullPath));
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.test.mjs') || entry.name.endsWith('.test.ts')) {
        const relFromRoot = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        results.push(relFromRoot);
      }
    }
  }

  return results;
}

function cleanTestBuildDir() {
  if (fs.existsSync(testBuildDir)) {
    try {
      fs.rmSync(testBuildDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Warning: Failed to remove ${testBuildDir}:`, err.message);
    }
  }
}

function runTestFile(testRelPath) {
  console.log(`\n=== RUN ${testRelPath} ===`);

  if (testRelPath.endsWith('.test.mjs')) {
    const res = spawnSync(process.execPath, [testRelPath], {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    if (res.status === 0 && !res.error) {
      console.log(`=== PASS ${testRelPath} ===`);
      return true;
    }
    console.error(`=== FAIL ${testRelPath} (exit ${res.status ?? (res.error ? 'ERR' : 1)}) ===`);
    return false;
  }

  if (testRelPath.endsWith('.test.ts')) {
    if (!fs.existsSync(localTscBin)) {
      console.error(`\nError: Local tsc executable not found at "${localTscBin}".`);
      console.error('Please run "npm ci" to install local dependencies. Fallback to npx/network is disabled.');
      console.error(`=== FAIL ${testRelPath} (missing local tsc) ===`);
      return false;
    }

    if (!fs.existsSync(testBuildDir)) {
      fs.mkdirSync(testBuildDir, { recursive: true });
    }

    const sanitizedTestName = path.basename(testRelPath).replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempConfigPath = path.join(testBuildDir, `tsconfig.${sanitizedTestName}.json`);
    const testFileAbs = path.resolve(rootDir, testRelPath);

    const tempConfig = {
      compilerOptions: {
        module: 'commonjs',
        target: 'es2020',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        baseUrl: rootDir,
        paths: {
          '@/*': ['./src/*'],
        },
        outDir: testBuildDir,
      },
      files: [testFileAbs],
    };

    try {
      fs.writeFileSync(tempConfigPath, JSON.stringify(tempConfig, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Error: Failed to write temporary test tsconfig at "${tempConfigPath}":`, err.message);
      console.error(`=== FAIL ${testRelPath} (config write failed) ===`);
      return false;
    }

    const tscArgs = ['-p', tempConfigPath];

    let compileRes;
    try {
      compileRes = spawnSync(localTscBin, tscArgs, {
        cwd: rootDir,
        stdio: 'inherit',
        env: process.env,
      });
    } catch {
      compileRes = { status: 1 };
    }

    if (compileRes?.error) {
      compileRes = spawnSync(process.execPath, [localTscBin, ...tscArgs], {
        cwd: rootDir,
        stdio: 'inherit',
        env: process.env,
      });
    }

    if (!compileRes || compileRes.status !== 0 || compileRes.error) {
      console.error(`=== FAIL ${testRelPath} (compilation failed) ===`);
      return false;
    }

    // Support runtime resolution of @/* aliases in emitted CommonJS code
    const atSymlink = path.join(testBuildDir, '@');
    const srcDirInBuild = path.join(testBuildDir, 'src');
    if (fs.existsSync(srcDirInBuild) && !fs.existsSync(atSymlink)) {
      try {
        fs.symlinkSync(srcDirInBuild, atSymlink, 'junction');
      } catch {
        // Fallback: ignore if symlink creation is not permitted
      }
    }

    // Locate emitted JS file in .tmp/testbuild
    const jsRelPath = testRelPath.replace(/\.ts$/, '.js');
    const candidatePaths = [
      path.join(testBuildDir, jsRelPath),
      path.join(testBuildDir, path.relative('tests', testRelPath).replace(/\.ts$/, '.js')),
      path.join(testBuildDir, path.basename(jsRelPath)),
    ];

    const emittedJs = candidatePaths.find((p) => fs.existsSync(p));
    if (!emittedJs) {
      console.error(`Error: Could not locate compiled JS output for ${testRelPath} under ${testBuildDir}`);
      console.error(`=== FAIL ${testRelPath} (missing emitted JS) ===`);
      return false;
    }

    const nodePath = process.env.NODE_PATH
      ? `${testBuildDir}${path.delimiter}${process.env.NODE_PATH}`
      : testBuildDir;

    const runRes = spawnSync(process.execPath, [emittedJs], {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_PATH: nodePath,
      },
    });

    if (runRes.status === 0 && !runRes.error) {
      console.log(`=== PASS ${testRelPath} ===`);
      return true;
    }

    console.error(`=== FAIL ${testRelPath} (exit ${runRes.status ?? (runRes.error ? 'ERR' : 1)}) ===`);
    return false;
  }

  console.error(`Warning: Unrecognized test extension for ${testRelPath}`);
  return false;
}

function main() {
  const tests = discoverTests(testsDir);
  // Deterministic lexicographical sort
  tests.sort((a, b) => a.localeCompare(b));

  if (tests.length === 0) {
    console.log('No test files found matching *.test.mjs or *.test.ts.');
    process.exit(0);
  }

  // Pre-flight check for TypeScript tests
  const hasTsTests = tests.some((t) => t.endsWith('.test.ts'));
  if (hasTsTests && !fs.existsSync(localTscBin)) {
    console.error(`\nError: Local tsc executable not found at "${localTscBin}".`);
    console.error('Please run "npm ci" before running tests. Fallback to npx/network is disabled.\n');
    process.exit(1);
  }

  cleanTestBuildDir();

  let passed = 0;
  let failed = 0;
  const failedList = [];

  try {
    for (const test of tests) {
      const ok = runTestFile(test);
      if (ok) {
        passed++;
      } else {
        failed++;
        failedList.push(test);
      }
    }
  } finally {
    cleanTestBuildDir();
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test Suite Summary');
  console.log('='.repeat(60));
  console.log(`Total:  ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failedList.length > 0) {
    console.log('\nFailed Tests:');
    for (const item of failedList) {
      console.log(`  - ${item}`);
    }
  }
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
