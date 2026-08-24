import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run: node tests/public-asset-privacy.test.mjs

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const screenshotsDir = path.join(projectRoot, 'public', 'screenshots');
const guideContentPath = path.join(projectRoot, 'src', 'lib', 'guide-content.ts');

function scanDirectoryRecursively(dir, baseDir = dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDirectoryRecursively(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      results.push(relPath);
    }
  }

  return results;
}

// 1. Recursively scan public/screenshots
const allScreenshotFiles = scanDirectoryRecursively(screenshotsDir);
const rasterExtensions = new Set(['.jpg', '.jpeg', '.png']);

const rasterFiles = allScreenshotFiles.filter((relPath) => {
  const ext = path.extname(relPath).toLowerCase();
  return rasterExtensions.has(ext);
});

// 2. Assert no .jpg, .jpeg, or .png exists except exactly guide/ai-chat-icon.png
const allowedRasterRelativePath = 'guide/ai-chat-icon.png';
const allowedIconFullPath = path.join(screenshotsDir, allowedRasterRelativePath);

assert.ok(
  fs.existsSync(allowedIconFullPath),
  `Expected allowed icon to exist at: ${allowedRasterRelativePath}`
);

const forbiddenRasterFiles = rasterFiles.filter((file) => file !== allowedRasterRelativePath);

assert.deepStrictEqual(
  forbiddenRasterFiles,
  [],
  `Forbidden raster screenshots found in public/screenshots: ${forbiddenRasterFiles.join(', ')}`
);

// 3. Read src/lib/guide-content.ts as UTF-8 and assert it contains no screenshotPath: property references
assert.ok(fs.existsSync(guideContentPath), `File must exist: ${guideContentPath}`);
const guideContentRaw = fs.readFileSync(guideContentPath, 'utf8');

const hasScreenshotPathProp = /\bscreenshotPath\s*:/.test(guideContentRaw);
assert.strictEqual(
  hasScreenshotPathProp,
  false,
  'src/lib/guide-content.ts must not contain screenshotPath: property references'
);

// 4. Assert no path string in guide-content points to a deleted raster screenshot
const stringLiteralRegex = /['"`]([^'"`\n]+)['"`]/g;
const rasterPathRegex = /\.(?:jpe?g|png)$/i;

let match;
const referencedRasterPaths = [];
while ((match = stringLiteralRegex.exec(guideContentRaw)) !== null) {
  const str = match[1];
  if (str.includes('/screenshots/') || rasterPathRegex.test(str)) {
    referencedRasterPaths.push(str);
  }
}

for (const refPath of referencedRasterPaths) {
  const normalized = refPath.replace(/^\/+/, '');
  const targetOnDisk = path.join(projectRoot, 'public', normalized);
  assert.ok(
    fs.existsSync(targetOnDisk),
    `guide-content.ts points to a deleted raster screenshot: "${refPath}"`
  );
}

assert.deepStrictEqual(
  referencedRasterPaths,
  [],
  `guide-content.ts must not contain raster screenshot paths: ${referencedRasterPaths.join(', ')}`
);

// 6. Print confirmation only when all assertions pass
console.log('public asset privacy tests: ALL PASS');
