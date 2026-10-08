import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const packageLockPath = path.join(rootDir, 'package-lock.json');

console.log('=== P107M1T02 DEPENDENCY REMEDIATION REGRESSION TEST SUITE ===\n');

// Helper to test if a version string satisfies caret range ^X.Y.Z
function satisfiesCaret(version, range) {
  const matchRange = range.match(/^\^([1-9]\d*|0)\.([1-9]\d*|0)\.(\d+)$/);
  if (!matchRange) {
    throw new Error(`Unsupported caret range format: ${range}`);
  }
  const [, rMajor, rMinor, rPatch] = matchRange.map(Number);
  // Restrict accepted inputs explicitly: ^0.0.z caret range is not supported to avoid 0.0 boundary ambiguity
  if (rMajor === 0 && rMinor === 0) {
    throw new Error(`^0.0.z caret ranges are not supported by satisfiesCaret (0.0 boundary): ${range}`);
  }
  const matchVer = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!matchVer) {
    throw new Error(`Unsupported version format: ${version}`);
  }
  const [, vMajor, vMinor, vPatch] = matchVer.map(Number);

  if (vMajor !== rMajor) return false;
  if (rMajor > 0) {
    if (vMinor < rMinor) return false;
    if (vMinor === rMinor && vPatch < rPatch) return false;
    return true;
  }
  // For 0.y.z where y > 0, caret locks to 0.y
  if (vMinor !== rMinor) return false;
  return vPatch >= rPatch;
}

// -----------------------------------------------------------------------------
// SECTION 1: Package Manifest Invariants & Baseline Preservation
// -----------------------------------------------------------------------------
console.log('--- Section 1: Package Manifest Invariants ---');

assert.ok(fs.existsSync(packageJsonPath), 'package.json must exist');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

assert.strictEqual(pkg.name, 'kurabe-qaqc', 'Package name must be kurabe-qaqc');
assert.strictEqual(pkg.private, true, 'package.json must remain private');

// Scripts must remain strictly unchanged
assert.deepStrictEqual(
  pkg.scripts,
  {
    dev: 'node scripts/run-with-env.mjs next dev',
    build: 'node scripts/run-with-env.mjs next build',
    start: 'node scripts/run-with-env.mjs next start',
    lint: 'eslint',
    typecheck: 'tsc --noEmit --incremental false',
    test: 'node scripts/run-tests.mjs',
  },
  'All package scripts must remain deliberate and identical to baseline'
);

// SheetJS CDN dependency must remain unchanged
assert.strictEqual(
  pkg.dependencies?.xlsx,
  'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
  'SheetJS CDN dependency must remain unchanged'
);

// Baseline overrides must be preserved
assert.strictEqual(pkg.overrides?.['@babel/core'], '7.29.7', 'Override @babel/core preserved');
assert.strictEqual(pkg.overrides?.['baseline-browser-mapping'], '2.11.21', 'Override baseline-browser-mapping preserved');
assert.strictEqual(pkg.overrides?.browserslist, '4.28.9', 'Override browserslist preserved');
assert.strictEqual(pkg.overrides?.['js-yaml'], '4.3.2', 'Override js-yaml preserved');

console.log('  ✓ 1.1 Scripts, private flag, SheetJS CDN, and baseline overrides preserved');

// -----------------------------------------------------------------------------
// SECTION 2: Next.js & eslint-config-next Paired Version Coherence
// -----------------------------------------------------------------------------
console.log('\n--- Section 2: Next.js & eslint-config-next Version Pairing ---');

assert.strictEqual(pkg.dependencies?.next, '16.3.8', 'Next.js direct dependency bumped to 16.3.8');
assert.strictEqual(pkg.devDependencies?.['eslint-config-next'], '16.3.8', 'eslint-config-next paired bump to 16.3.8');

assert.ok(fs.existsSync(packageLockPath), 'package-lock.json must exist');
const lock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

const lockNext = lock.packages?.['node_modules/next'];
const lockEslintConfigNext = lock.packages?.['node_modules/eslint-config-next'];
const lockEslintPluginNext = lock.packages?.['node_modules/@next/eslint-plugin-next'];

assert.ok(lockNext, 'node_modules/next must exist in lockfile');
assert.strictEqual(lockNext.version, '16.3.8', 'Lockfile next resolved version must be 16.3.8');

assert.ok(lockEslintConfigNext, 'node_modules/eslint-config-next must exist in lockfile');
assert.strictEqual(lockEslintConfigNext.version, '16.3.8', 'Lockfile eslint-config-next resolved version must be 16.3.8');

assert.ok(lockEslintPluginNext, 'node_modules/@next/eslint-plugin-next must exist in lockfile');
assert.strictEqual(lockEslintPluginNext.version, '16.3.8', 'Lockfile @next/eslint-plugin-next resolved version must be 16.3.8');

// Strict paired coherence invariant
assert.strictEqual(
  lockNext.version,
  lockEslintConfigNext.version,
  'Next.js and eslint-config-next versions must be strictly coherent'
);

console.log('  ✓ 2.1 Next.js and eslint-config-next paired strictly at 16.3.8');

// -----------------------------------------------------------------------------
// SECTION 3: Resolved Patched Transitives & Parent-Range Justifications
// -----------------------------------------------------------------------------
console.log('\n--- Section 3: Patched Transitives & Parent-Range Justifications ---');

// 3.1 sharp (0.35.4 -> 0.35.5)
const lockSharp = lock.packages?.['node_modules/sharp'];
assert.ok(lockSharp, 'node_modules/sharp must exist in lockfile');
assert.strictEqual(lockSharp.version, '0.35.5', 'sharp resolved version must be 0.35.5');
const nextSharpParentRange = lockNext.optionalDependencies?.sharp;
assert.ok(nextSharpParentRange, 'next must declare sharp in optionalDependencies');
assert.ok(
  satisfiesCaret(lockSharp.version, nextSharpParentRange),
  `sharp ${lockSharp.version} must satisfy parent range ${nextSharpParentRange}`
);
console.log(`  ✓ 3.1 sharp resolved to ${lockSharp.version} (satisfies parent range ${nextSharpParentRange})`);

// 3.2 source-map-js (1.2.1 -> 1.2.2)
const lockSourceMapJs = lock.packages?.['node_modules/source-map-js'];
assert.ok(lockSourceMapJs, 'node_modules/source-map-js must exist in lockfile');
assert.strictEqual(lockSourceMapJs.version, '1.2.2', 'source-map-js resolved version must be 1.2.2');
const tailwindNode = lock.packages?.['node_modules/@tailwindcss/node'];
const postcss = lock.packages?.['node_modules/postcss'];
assert.ok(tailwindNode?.dependencies?.['source-map-js'], '@tailwindcss/node must declare source-map-js dependency');
assert.ok(
  satisfiesCaret(lockSourceMapJs.version, tailwindNode.dependencies['source-map-js']),
  'source-map-js satisfies @tailwindcss/node dependency range'
);
assert.ok(postcss?.dependencies?.['source-map-js'], 'postcss must declare source-map-js dependency');
assert.ok(
  satisfiesCaret(lockSourceMapJs.version, postcss.dependencies['source-map-js']),
  'source-map-js satisfies postcss dependency range'
);
console.log(`  ✓ 3.2 source-map-js resolved to ${lockSourceMapJs.version} (satisfies parent ranges)`);

// 3.3 brace-expansion (1.1.18 -> 1.1.21 and 5.0.9 -> 5.0.12)
const lockBraceExp1 = lock.packages?.['node_modules/brace-expansion'];
assert.ok(lockBraceExp1, 'node_modules/brace-expansion (1.x) must exist in lockfile');
assert.strictEqual(lockBraceExp1.version, '1.1.21', 'brace-expansion 1.x branch resolved version must be 1.1.21');

const minimatch1 = lock.packages?.['node_modules/minimatch'];
assert.ok(minimatch1, 'node_modules/minimatch must exist in lockfile');
assert.ok(
  satisfiesCaret(lockBraceExp1.version, minimatch1.dependencies['brace-expansion']),
  `brace-expansion ${lockBraceExp1.version} satisfies minimatch 3.x range ${minimatch1.dependencies['brace-expansion']}`
);

const lockBraceExp5 = lock.packages?.['node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion'];
assert.ok(lockBraceExp5, 'brace-expansion (5.x branch) must exist in lockfile');
assert.strictEqual(lockBraceExp5.version, '5.0.12', 'brace-expansion 5.x branch resolved version must be 5.0.12');

const minimatch10 = lock.packages?.['node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch'];
assert.ok(minimatch10, 'nested minimatch 10.x must exist in lockfile');
assert.ok(
  satisfiesCaret(lockBraceExp5.version, minimatch10.dependencies['brace-expansion']),
  `brace-expansion ${lockBraceExp5.version} satisfies nested minimatch range ${minimatch10.dependencies['brace-expansion']}`
);
console.log('  ✓ 3.3 brace-expansion resolved to 1.1.21 (1.x branch) and 5.0.12 (5.x branch)');

// -----------------------------------------------------------------------------
// SECTION 4: Lockfile Integrity Fields & Hashes
// -----------------------------------------------------------------------------
console.log('\n--- Section 4: Lockfile Integrity & Registry Fields ---');

const auditedPackages = [
  ['node_modules/next', lockNext],
  ['node_modules/eslint-config-next', lockEslintConfigNext],
  ['node_modules/@next/eslint-plugin-next', lockEslintPluginNext],
  ['node_modules/sharp', lockSharp],
  ['node_modules/source-map-js', lockSourceMapJs],
  ['node_modules/brace-expansion', lockBraceExp1],
  ['node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion', lockBraceExp5],
];

for (const [pkgPath, entry] of auditedPackages) {
  assert.ok(entry.integrity, `${pkgPath} must have integrity field`);
  assert.match(entry.integrity, /^sha512-|^sha1-/, `${pkgPath} integrity must be valid sha hash`);
  assert.ok(entry.resolved, `${pkgPath} must have resolved field`);
  assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, `${pkgPath} must resolve from npm registry`);
}

console.log('  ✓ 4.1 All patched lockfile entries contain valid sha512 integrity and npm registry URLs');

// -----------------------------------------------------------------------------
// SECTION 5: Deterministic Dependency Graph Assertions & Residual Dev Chain
// -----------------------------------------------------------------------------
console.log('\n--- Section 5: Dependency Graph Assertions & Residual Dev Chain ---');

// 5.1 braces remains strictly in development-only chain
const lockBraces = lock.packages?.['node_modules/braces'];
assert.ok(lockBraces, 'node_modules/braces exists in lockfile');
assert.strictEqual(lockBraces.version, '3.0.3', 'braces resolved version is 3.0.3');
assert.strictEqual(lockBraces.dev, true, 'braces lock flag must be dev: true');

assert.strictEqual(
  pkg.dependencies?.braces,
  undefined,
  'braces must not exist in direct production dependencies'
);
assert.strictEqual(
  lock.packages?.['']?.dependencies?.braces,
  undefined,
  'braces must not exist in root lockfile production dependencies'
);
console.log('  ✓ 5.1 braces 3.0.3 verified isolated strictly within development-only chain');

// 5.2 Verified lock flags, ranges, and edges for development chain:
// @next/eslint-plugin-next -> fast-glob -> micromatch -> braces
const lockFastGlob = lock.packages?.['node_modules/fast-glob'];
assert.ok(lockFastGlob, 'node_modules/fast-glob exists in lockfile');
assert.strictEqual(lockFastGlob.version, '3.3.1', 'fast-glob resolved version is 3.3.1');
assert.strictEqual(lockFastGlob.dev, true, 'fast-glob lock flag must be dev: true');

const lockMicromatch = lock.packages?.['node_modules/micromatch'];
assert.ok(lockMicromatch, 'node_modules/micromatch exists in lockfile');
assert.strictEqual(lockMicromatch.version, '4.0.8', 'micromatch resolved version is 4.0.8');
assert.strictEqual(lockMicromatch.dev, true, 'micromatch lock flag must be dev: true');

assert.strictEqual(
  lockEslintPluginNext.dev,
  true,
  '@next/eslint-plugin-next lock flag must be dev: true'
);

// Edge 1: @next/eslint-plugin-next -> fast-glob
const nextPluginFastGlobRange = lockEslintPluginNext.dependencies?.['fast-glob'];
assert.ok(nextPluginFastGlobRange, '@next/eslint-plugin-next declares fast-glob dependency');
assert.strictEqual(
  lockFastGlob.version,
  nextPluginFastGlobRange,
  'fast-glob version matches @next/eslint-plugin-next declared dependency'
);

// Edge 2: fast-glob -> micromatch
const fastGlobMicromatchRange = lockFastGlob.dependencies?.micromatch;
assert.ok(fastGlobMicromatchRange, 'fast-glob declares micromatch dependency');
assert.strictEqual(
  fastGlobMicromatchRange,
  '^4.0.4',
  'fast-glob declares micromatch range ^4.0.4'
);
assert.ok(
  satisfiesCaret(lockMicromatch.version, fastGlobMicromatchRange),
  `micromatch ${lockMicromatch.version} satisfies fast-glob range ${fastGlobMicromatchRange}`
);

// Edge 3: micromatch -> braces
const micromatchBracesRange = lockMicromatch.dependencies?.braces;
assert.ok(micromatchBracesRange, 'micromatch declares braces dependency');
assert.strictEqual(
  micromatchBracesRange,
  '^3.0.3',
  'micromatch declares braces range ^3.0.3'
);
assert.ok(
  satisfiesCaret(lockBraces.version, micromatchBracesRange),
  `braces ${lockBraces.version} satisfies micromatch range ${micromatchBracesRange}`
);
console.log('  ✓ 5.2 Lock flags, ranges, and edges verified for chain: @next/eslint-plugin-next -> fast-glob -> micromatch -> braces');

// 5.3 Next.js & eslint-config-next paired bump enforces toolchain coherence
// Paired bump maintains framework/lint coherence; this pairing does not constitute a claim of downstream security remediation for transitive dev advisories.
assert.strictEqual(pkg.dependencies?.next, '16.3.8', 'Next.js dependency is 16.3.8');
assert.strictEqual(pkg.devDependencies?.['eslint-config-next'], '16.3.8', 'eslint-config-next devDependency is 16.3.8');
assert.strictEqual(
  pkg.dependencies?.next,
  pkg.devDependencies?.['eslint-config-next'],
  'Next.js and eslint-config-next versions are strictly coherent'
);
assert.strictEqual(
  lockEslintConfigNext.dependencies?.['@next/eslint-plugin-next'],
  '16.3.8',
  'eslint-config-next references @next/eslint-plugin-next at coherent version 16.3.8'
);
console.log('  ✓ 5.3 Paired next / eslint-config-next bump enforces coherence without claiming transitive dev advisory remediation');

console.log('\n=============================================================');
console.log('ALL P107M1T02 DEPENDENCY REGRESSION CHECKS PASS (Exit 0)');
console.log('=============================================================');
