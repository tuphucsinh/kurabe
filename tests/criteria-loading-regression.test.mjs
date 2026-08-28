import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const pagePath = path.join(projectRoot, 'src/app/criteria/page.tsx');
const pageCode = fs.readFileSync(pagePath, 'utf8');
const normalized = pageCode.replace(/\s+/g, ' ');

assert.ok(
  normalized.includes('isLoading: criteriaLoading') || normalized.includes('isLoading: isCriteriaLoading'),
  'CriteriaPage must read the criteria query loading state'
);
assert.ok(
  /if \(isCriteriaLoading\)|if \(criteriaLoading\)/.test(normalized),
  'CriteriaPage must guard the content while criteria are loading'
);
assert.ok(
  normalized.includes('Không có tiêu chí nào trong nhóm này'),
  'CriteriaPage must retain the genuine empty state'
);

console.log('Criteria loading regression tests: ALL PASS');
