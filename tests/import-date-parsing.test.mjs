import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

// ============================================================================
// P110M1T01 — Employee import must parse Vietnamese dd/mm/yyyy day-first,
// keep Excel serial + ISO behaviour, and reject invalid dates per row
// instead of silently dropping them.
// ============================================================================

const importPath = path.join(projectRoot, 'src/lib/import.ts');
const importSource = fs.readFileSync(importPath, 'utf8');

const importTranspiled = ts.transpileModule(importSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadImportModule() {
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/lib/role-policy') {
      return {
        ALL_ROLES: ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'],
      };
    }
    return require(id);
  };
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', importTranspiled)(
    mod.exports,
    customRequire,
    mod
  );
  return mod.exports;
}

const { parseJoinDateValue, parseEmployeeExcel } = loadImportModule();

// --- Direct helper contract ---
const helperCases = [
  // Vietnamese day-first text
  ['15/01/2024', '2024-01-15'],
  ['01/02/2024', '2024-02-01'],
  ['29/02/2024', '2024-02-29'],
  ['5/1/2024', '2024-01-05'],
  ['15-01-2024', '2024-01-15'],
  // ISO date-only stays canonical
  ['2024-01-15', '2024-01-15'],
  ['2024-02-29', '2024-02-29'],
];

for (const [input, expected] of helperCases) {
  const out = parseJoinDateValue(input);
  assert.equal(out.error, undefined, `valid input ${input} must not error`);
  assert.equal(out.date, expected, `parseJoinDateValue(${JSON.stringify(input)})`);
}

// Invalid dates must report an error, never a wrong or silently dropped value
const invalidCases = ['31/02/2024', '00/01/2024', '32/01/2024', '15/13/2024', 'không phải ngày'];
for (const input of invalidCases) {
  const out = parseJoinDateValue(input);
  assert.equal(out.date, undefined, `invalid input ${input} must not produce a date`);
  assert.ok(out.error, `invalid input ${input} must report an error`);
}

// Excel serial numbers keep the existing epoch conversion
assert.equal(parseJoinDateValue(45306).date, '2024-01-15', 'Excel serial 45306 = 2024-01-15');
// Date instances use local calendar components
assert.equal(parseJoinDateValue(new Date(2024, 0, 15)).date, '2024-01-15', 'Date instance local Y/M/D');
// Empty cell stays optional
assert.deepEqual(parseJoinDateValue(null), {});
assert.deepEqual(parseJoinDateValue(undefined), {});
assert.deepEqual(parseJoinDateValue(''), {});
assert.deepEqual(parseJoinDateValue('   '), {});

// ============================================================================
// Full parseEmployeeExcel path on a real workbook buffer
// ============================================================================

async function buildWorkbook(rows) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Mã NV', 'Họ tên', 'Chức vụ', 'Nhóm', 'Ngày vào làm'],
    ...rows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách nhân viên');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const FileCtor = globalThis.File ?? (await import('node:buffer')).File;
  return new FileCtor([buf], 'employees.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const rows = [
  // Manager rows need no team, isolating join-date behaviour
  ['NV001', 'Nguyễn Văn A', 'Manager', '', '15/01/2024'],
  ['NV002', 'Trần Thị B', 'Manager', '', '01/02/2024'],
  ['NV003', 'Lê Văn C', 'Manager', '', '29/02/2024'],
  ['NV004', 'Phạm Văn D', 'Manager', '', '31/02/2024'],
  ['NV005', 'Võ Thị E', 'Manager', '', '2024-01-15'],
  ['NV006', 'Bùi Văn F', 'Manager', '', 45306],
  ['NV007', 'Đỗ Thị G', 'Manager', '', ''],
  ['NV008', 'Hà Văn H', 'Manager', '', 'not a date'],
  ['NV009', 'Ngô Thị I', 'Manager', '', '15-01-2024'],
];

const file = await buildWorkbook(rows);
const result = await parseEmployeeExcel(file, []);

const byCode = new Map(result.data.map((u) => [u.employeeCode, u]));
const errorsText = result.errors.join('\n');

assert.equal(byCode.get('NV001')?.joinDate, '2024-01-15', 'dd/mm/yyyy day-first: 15/01/2024');
assert.equal(byCode.get('NV002')?.joinDate, '2024-02-01', 'dd/mm/yyyy is NOT reordered as mm/dd: 01/02/2024');
assert.equal(byCode.get('NV003')?.joinDate, '2024-02-29', 'leap day accepted');
assert.equal(byCode.get('NV005')?.joinDate, '2024-01-15', 'ISO passthrough in workbook');
assert.equal(byCode.get('NV006')?.joinDate, '2024-01-15', 'Excel serial in workbook');
assert.equal(byCode.get('NV007')?.joinDate, undefined, 'empty cell stays optional');
assert.equal(byCode.get('NV009')?.joinDate, '2024-01-15', 'dd-mm-yyyy day-first in workbook');

// Invalid dates must fail their row with a visible message
assert.ok(!byCode.has('NV004'), '31/02/2024 row must not be imported');
assert.match(errorsText, /NV004|Dòng 5:/);
assert.match(errorsText, /31\/02\/2024/);
assert.ok(!byCode.has('NV008'), 'garbage date row must not be imported');
assert.match(errorsText, /not a date/);

// Rows without date problems must not carry date errors
assert.doesNotMatch(errorsText, /NV001|NV002|NV003|NV005|NV006|NV007|NV009/);

// Source contract: no silent catch around the join-date block
assert.doesNotMatch(importSource, /\/\/ Ignore date error, just keep empty/);

console.log('P110M1T01 import date parsing: ALL PASS');
