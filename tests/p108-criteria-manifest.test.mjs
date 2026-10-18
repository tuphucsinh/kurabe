import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';

// Early fail check: if an explicit P108_WORKBOOK_PATH is supplied in env but does not exist, fail immediately.
// This prevents silent skipping and avoids recursion when child process tests run.
if (process.env.P108_WORKBOOK_PATH && !fs.existsSync(process.env.P108_WORKBOOK_PATH)) {
  console.error(`REFUSE_MISSING_EXPLICIT_WORKBOOK: explicit P108_WORKBOOK_PATH not found at ${process.env.P108_WORKBOOK_PATH}`);
  process.exit(1);
}

import {
  buildManifest,
  extractManifestUnverified,
  serializeManifest,
  uuidV5,
  NAMESPACE,
  PINNED_WORKBOOK_SHA256,
  SOURCE_CELL_DIGEST,
  sourceCellDigest,
  G1_DECISION_REF,
} from '../scripts/p108-criteria-manifest.mjs';
import {
  validateManifestNodes,
  validateG1Manifest,
  buildPayload,
  computeAllSetHashes,
  getCounts,
  SYNTHETIC_FIXTURE_SHA256_ALLOWLIST,
} from '../scripts/p108-import-criteria.mjs';

const projectRoot = process.cwd();
const manifestSeedPath = path.join(projectRoot, 'db/seed/p108-criteria-manifest.json');
const scriptPath = path.join(projectRoot, 'scripts/p108-criteria-manifest.mjs');

console.log('--- TEST 1: UUIDv5 known vectors & namespace verification ---');
// Standard RFC 4122 / 9562 vector for python.org in DNS namespace
const dnsNs = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const pythonV5 = uuidV5('python.org', dnsNs);
assert.equal(pythonV5, '886313e1-3b8a-5372-9b90-0c9aee199e5d', 'RFC UUIDv5 python.org vector must match');

// Verification of kurabe criteria namespace derivation from DNS
const criteriaNs = uuidV5('kurabe.p108.criteria', dnsNs);
assert.equal(criteriaNs, NAMESPACE, 'NAMESPACE must equal UUIDv5("kurabe.p108.criteria", DNS_NAMESPACE)');
assert.equal(NAMESPACE, 'bdb8cc91-a1b0-5e76-807c-bf46cf444dc1', 'NAMESPACE constant must be exact');

// Default namespace parameter
assert.equal(
  uuidV5('p108:leader:group:A'),
  uuidV5('p108:leader:group:A', NAMESPACE),
  'uuidV5 must default to NAMESPACE'
);

// Strict namespace validation negatives
assert.throws(() => uuidV5('test', '6ba7b810-9dad-11d1-80b4-00c04fd430zz'), /Invalid namespace/);
assert.throws(() => uuidV5('test', '6ba7b810-9dad-11d1-80b4-00c04fd430c'), /Invalid namespace/);
assert.throws(() => uuidV5('test', 'short'), /Invalid namespace/);
assert.throws(() => uuidV5('test', Buffer.alloc(15)), /Namespace must/);
assert.throws(() => uuidV5('test', Buffer.alloc(17)), /Namespace must/);

console.log('--- TEST 2: Deterministic bytes & committed seed manifest loading ---');
assert.ok(fs.existsSync(manifestSeedPath), `Seed manifest must exist at ${manifestSeedPath}`);
const rawCommitted = fs.readFileSync(manifestSeedPath, 'utf8');
assert.ok(rawCommitted.endsWith('\n'), 'Serialized manifest must end with a newline');

const manifest = JSON.parse(rawCommitted);
const reSerialized = serializeManifest(manifest);
assert.equal(reSerialized, rawCommitted, 'Re-serialization of manifest must produce exact byte-for-byte identity');
assert.doesNotMatch(rawCommitted, /"signed":/i, 'Manifest must not include a signed flag');
assert.doesNotMatch(rawCommitted, /\/home\/|\/Users\//i, 'Manifest must not include absolute machine paths');

console.log('--- TEST 3: Metadata verification, exact counts, and maxima ---');
const meta = manifest._metadata;
assert.ok(meta, '_metadata object must be present');
assert.equal(meta.workbook_sha256, PINNED_WORKBOOK_SHA256, 'workbook_sha256 must match pinned SHA');
assert.equal(meta.source_workbook, 'TCDG2026.xls', 'source_workbook must be basename TCDG2026.xls');
assert.equal(meta.uuid_namespace, NAMESPACE, 'uuid_namespace must match NAMESPACE constant');
assert.equal(meta.revision, '07', 'revision must be 07');
assert.equal(meta.effective_date, '2026-10-01', 'effective_date must be 2026-10-01');
assert.equal(meta.revised_date, '2026-07-28', 'revised_date must be 2026-07-28');
assert.equal(meta.first_period, 'Kỳ 2026', 'first_period must be Kỳ 2026');
assert.equal(meta.period_frequency, 'yearly', 'period_frequency must be yearly');
assert.equal(meta.g1_decision_ref, G1_DECISION_REF, 'g1_decision_ref must match G1_DECISION_REF constant');

// Counts
assert.deepStrictEqual(
  meta.counts,
  {
    leader: { groups: 6, criteria: 33 },
    staff: { groups: 6, criteria: 30 },
    worker: { groups: 6, criteria: 30 },
    total_groups: 18,
    total_criteria: 93,
  },
  'Counts metadata must be exact (6/6/6 groups, 33/30/30 criteria, 18/93 total)'
);

// Maxima: Leader 190, Staff 175, Worker 175
assert.deepStrictEqual(
  meta.maxima,
  {
    leader: 190,
    staff: 175,
    worker: 175,
  },
  'Maxima must equal Leader 190, Staff 175, Worker 175'
);

// Verify maxima calculation independently from groups
for (const setKey of ['leader', 'staff', 'worker']) {
  const gList = manifest.groups.filter((g) => g.set_key === setKey);
  let computedMax = 0;
  for (const g of gList) {
    for (const c of g.criteria) {
      const maxLevelPts = Math.max(...c.levels.map((l) => l.points));
      computedMax += maxLevelPts;
    }
  }
  assert.equal(computedMax, meta.maxima[setKey], `Computed max for ${setKey} must match metadata`);
}

console.log('--- TEST 4: Checksum recomputation & import-criteria compatibility ---');
const recomputedPayloadSha = crypto.createHash('sha256')
  .update(JSON.stringify({ groups: manifest.groups }))
  .digest('hex');
assert.equal(
  meta.payload_sha256,
  recomputedPayloadSha,
  'payload_sha256 must equal SHA-256(JSON.stringify({ groups: manifest.groups }))'
);

// Node validation via existing importer tool
validateManifestNodes(manifest);

const payload = buildPayload(manifest);
const importerCounts = getCounts(payload);
assert.deepStrictEqual(importerCounts, meta.counts, 'Importer getCounts must match manifest metadata counts');

const recomputedSetHashes = computeAllSetHashes(payload);
assert.deepStrictEqual(
  meta.set_hashes,
  recomputedSetHashes,
  'set_hashes must equal computeAllSetHashes(buildPayload(manifest))'
);

console.log('--- TEST 5: Globally unique UUIDv5, name recomputation & FK integrity ---');
const allUuids = new Set();
let totalLevelsCount = 0;

for (const group of manifest.groups) {
  assert.ok(group.id, `Group ${group.code} must have id`);
  const expectedGroupId = uuidV5(`p108:${group.set_key}:group:${group.code}`);
  assert.equal(group.id, expectedGroupId, `Group ${group.code} id must match deterministic UUIDv5`);
  assert.ok(!allUuids.has(group.id), `Duplicate UUID found: ${group.id}`);
  allUuids.add(group.id);

  assert.ok(['leader', 'staff', 'worker'].includes(group.set_key), `Invalid set_key: ${group.set_key}`);
  assert.match(group.code, /^[A-F]$/, `Group code must be A-F: ${group.code}`);
  assert.equal(group.short_name, group.code, 'short_name must match code');

  const expectedDocCode = group.set_key === 'leader'
    ? 'KIV-AD-WI-007/01'
    : group.set_key === 'staff'
    ? 'KIV-AD-WI-007/02'
    : 'KIV-AD-WI-007/03';
  assert.equal(group.document_code, expectedDocCode, `Group ${group.code} document_code must match ${expectedDocCode}`);
  assert.equal(group.provenance.document_code, expectedDocCode, `Group ${group.code} provenance.document_code must match ${expectedDocCode}`);
  assert.equal(group.provenance.document_code_cell, 'A1', `Group ${group.code} provenance.document_code_cell must be A1`);
  assert.equal(group.provenance.raw_document_code, expectedDocCode, `Group ${group.code} provenance.raw_document_code must match ${expectedDocCode}`);

  for (const criterion of group.criteria) {
    assert.ok(criterion.id, `Criterion ${criterion.code} must have id`);
    const expectedCritId = uuidV5(`p108:${criterion.set_key}:criterion:${criterion.code}`);
    assert.equal(criterion.id, expectedCritId, `Criterion ${criterion.code} id must match deterministic UUIDv5`);
    assert.ok(!allUuids.has(criterion.id), `Duplicate UUID found: ${criterion.id}`);
    allUuids.add(criterion.id);

    // Foreign keys
    assert.equal(criterion.group_id, group.id, 'criterion.group_id must match group.id');
    assert.equal(criterion.set_key, group.set_key, 'criterion.set_key must match group.set_key');

    // Invariants
    assert.equal(criterion.weight, 0, `Criterion ${criterion.code} weight must be 0`);
    assert.equal(criterion.default_level_index, null, `Criterion ${criterion.code} default_level_index must be null`);

    assert.ok(Array.isArray(criterion.levels) && criterion.levels.length > 0, `Levels missing on ${criterion.code}`);

    for (let idx = 0; idx < criterion.levels.length; idx += 1) {
      const level = criterion.levels[idx];
      totalLevelsCount += 1;
      assert.ok(level.id, `Level ${idx} on ${criterion.code} must have id`);
      const expectedLevelId = uuidV5(`p108:${criterion.set_key}:level:${criterion.code}:${level.sort_order}`);
      assert.equal(level.id, expectedLevelId, `Level ${idx} on ${criterion.code} id must match deterministic UUIDv5`);
      assert.ok(!allUuids.has(level.id), `Duplicate UUID found: ${level.id}`);
      allUuids.add(level.id);

      assert.equal(level.criterion_id, criterion.id, 'level.criterion_id must match criterion.id');
      assert.equal(level.sort_order, idx, 'level.sort_order must be sequential zero-based');
      assert.ok(typeof level.points === 'number', 'level.points must be numeric');
      assert.ok(level.label && level.label.trim().length > 0, `level.label must not be empty on ${criterion.code}`);
    }
  }
}

assert.equal(totalLevelsCount, 444, 'Total levels across all 3 sets must equal 444 (158 + 143 + 143)');
assert.equal(allUuids.size, 18 + 93 + 444, 'All 555 UUIDs across manifest must be globally unique');

console.log('--- TEST 6: Owner-approved G1 rules & boundary alignment verification ---');
for (const group of manifest.groups) {
  for (const criterion of group.criteria) {
    // Rule: no bare '-' display level anywhere
    for (const level of criterion.levels) {
      assert.notEqual(level.label.trim(), '-', `Bare '-' display label forbidden on ${criterion.code}`);
      assert.notEqual(level.description?.trim(), '-', `Bare '-' description forbidden on ${criterion.code}`);
    }

    // A1 Attendance bands: >=99% (5), 98..<99% (4), 95..<98% (3), 93..<95% (2), <93% (1)
    if (criterion.code === 'A1') {
      assert.equal(criterion.levels.length, 5, 'A1 must have exactly 5 levels');
      const expectedLabels = ['>=99%', '98..<99%', '95..<98%', '93..<95%', '<93%'];
      const expectedPoints = [5, 4, 3, 2, 1];
      const expectedJa = ['99%以上', '98%以上99%未満', '95%以上98%未満', '93%以上95%未満', '93%未満'];

      assert.deepStrictEqual(criterion.levels.map((l) => l.label), expectedLabels);
      assert.deepStrictEqual(criterion.levels.map((l) => l.points), expectedPoints);
      assert.deepStrictEqual(criterion.levels.map((l) => l.description), expectedJa);

      // Verify provenance retains raw workbook labels
      assert.equal(criterion.levels[0].raw_vi, 'Trên 99%');
      assert.equal(criterion.levels[1].raw_vi, 'Trên 98%');
      assert.equal(criterion.levels[3].raw_vi, 'Dưới 95%');
      assert.equal(criterion.levels[4].raw_vi, 'Dưới 93%');
      assert.match(criterion.levels[0].raw_ja, /99%以上/);
    }

    // A4: counts 0, 1, 2, >=3 -> points 0, -15, -20, -25
    if (criterion.code === 'A4') {
      assert.equal(criterion.levels.length, 4, 'A4 must have exactly 4 levels (no dash)');
      assert.deepStrictEqual(criterion.levels.map((l) => l.points), [0, -15, -20, -25]);
      assert.deepStrictEqual(criterion.levels.map((l) => l.label), ['0 lần', '1 lần', '2 lần', '3 lần trở lên']);
      assert.deepStrictEqual(criterion.levels.map((l) => l.description), ['0 回', '1 回', '2回', '3 回以上']);
    }

    // A5: counts 0, 1, 2, >=3 -> points 0, -5, -10, -15
    if (criterion.code === 'A5') {
      assert.equal(criterion.levels.length, 4, 'A5 must have exactly 4 levels (no dash)');
      assert.deepStrictEqual(criterion.levels.map((l) => l.points), [0, -5, -10, -15]);
      assert.deepStrictEqual(criterion.levels.map((l) => l.label), ['0 lần', '1 lần', '2 lần', '3 lần trở lên']);
    }

    // A6: counts 0, 1, 2, >=3 -> points 0, -3, -6, -10
    if (criterion.code === 'A6') {
      assert.equal(criterion.levels.length, 4, 'A6 must have exactly 4 levels (no dash)');
      assert.deepStrictEqual(criterion.levels.map((l) => l.points), [0, -3, -6, -10]);
      assert.deepStrictEqual(criterion.levels.map((l) => l.label), ['0 lần', '1 lần', '2 lần', '3 lần trở lên']);
    }

    // A7: counts 0, 1, 2, >=3 -> points 0, -3, -6, -10; does not count as unexcused absence
    if (criterion.code === 'A7') {
      assert.equal(criterion.levels.length, 4, 'A7 must have exactly 4 levels (no dash)');
      assert.deepStrictEqual(criterion.levels.map((l) => l.points), [0, -3, -6, -10]);
      assert.deepStrictEqual(criterion.levels.map((l) => l.label), ['0 lần', '1 lần', '2 lần', '3 lần trở lên']);
      assert.deepStrictEqual(criterion.levels.map((l) => l.description), ['0 回', '1 回', '2 回', '3 回以上']);
      // Real semantic assertion for JA >=3 on last level
      const lastLevel = criterion.levels[3];
      assert.match(lastLevel.description, /3\s*回以上/, 'A7 last level description must semantically represent >=3 (3 回以上)');
      if (group.set_key === 'worker') {
        assert.equal(lastLevel.raw_ja, '3 回', 'Worker A7 last level must retain original raw_ja (3 回)');
        assert.equal(lastLevel.provenance.raw_ja, '3 回', 'Worker A7 last level provenance must retain original raw_ja (3 回)');
        assert.equal(lastLevel.provenance.normalized_ja, '3 回以上', 'Worker A7 last level must record normalized_ja in provenance');
      } else {
        assert.equal(lastLevel.raw_ja, '3 回以上', 'Leader/Staff A7 last level must retain original raw_ja');
        assert.equal(lastLevel.provenance.raw_ja, '3 回以上', 'Leader/Staff A7 last level provenance must retain original raw_ja');
      }
      assert.ok(criterion.name.includes('không tính vào vắng không phép'), 'A7 must preserve exclusion of unexcused absence');
    }

    // A8: Có (0), Không có (-3), N/A (0); exactly one explicit N/A
    if (criterion.code === 'A8') {
      const expectedJaDesc = '適切な運転免許証を所持しているか（50cc超のバイク・自動車で通勤する従業員、または会社送迎車の乗車地点までバイクで移動する従業員に適用）';
      assert.equal(criterion.description, expectedJaDesc, 'A8 description must match aligned JA description');
      assert.ok(criterion.description.includes('自動車'), 'A8 description must contain 自動車');
      assert.ok(criterion.description.includes('送迎'), 'A8 description must contain 送迎');
      assert.ok(criterion.provenance.raw_ja, 'A8 must retain original raw_ja in provenance');
      assert.equal(criterion.provenance.aligned, true, 'A8 must be marked aligned in provenance');
      assert.equal(criterion.provenance.decision_ref, G1_DECISION_REF, 'A8 must reference G1_DECISION_REF in provenance');
      assert.ok(criterion.name.startsWith('Có bằng lái xe phù hợp hay không?'), 'A8 name must retain original VI');

      assert.equal(criterion.levels.length, 3, 'A8 must have exactly 3 levels (Có, Không có, N/A)');
      assert.deepStrictEqual(criterion.levels.map((l) => l.points), [0, -3, 0]);
      assert.deepStrictEqual(criterion.levels.map((l) => l.label), ['Có', 'Không có', 'N/A']);
      assert.deepStrictEqual(criterion.levels.map((l) => l.description), ['有', 'なし', 'N/A']);
      assert.equal(criterion.levels[2].provenance.derived, true, 'A8 N/A level must be marked derived in provenance');
      assert.ok(criterion.levels[2].provenance.collapsed_cells, 'A8 N/A level must record collapsed cells');
    }

    // C14: VI counts >=4, 3, 2, 1, 0 -> points 5, 4, 3, 2, 1; JA aligned
    if (criterion.code === 'C14') {
      assert.equal(criterion.levels.length, 5, 'C14 must have 5 levels');
      assert.deepStrictEqual(criterion.levels.map((l) => l.points), [5, 4, 3, 2, 1]);
      assert.deepStrictEqual(criterion.levels.map((l) => l.label), ['Từ 4 lần trở lên', '3 lần', '2 lần', '1 lần', '0 lần']);
      assert.deepStrictEqual(criterion.levels.map((l) => l.description), ['4 回以上', '3 回', '2 回', '1 回', '0 回']);
      // Raw JA in provenance retains original 5/4/2/1/0
      assert.equal(criterion.levels[0].raw_ja, '5 回以上');
      assert.equal(criterion.levels[1].raw_ja, '4 回');
    }

    // C15: proposals >=3, 2, 1, 0 -> points 5, 4, 3, 0; collapsed zero proposals
    if (criterion.code === 'C15') {
      assert.equal(criterion.levels.length, 4, 'C15 must have 4 levels');
      assert.deepStrictEqual(criterion.levels.map((l) => l.points), [5, 4, 3, 0]);
      assert.deepStrictEqual(criterion.levels.map((l) => l.label), ['3 vụ trở lên', '2 vụ', '1 vụ', '0 vụ']);
      assert.deepStrictEqual(criterion.levels.map((l) => l.description), ['3件以上', '2件', '1件', '0件']);
      assert.equal(criterion.levels[3].provenance.derived, true, 'C15 level 3 must be marked derived in provenance');
      assert.ok(criterion.levels[3].provenance.collapsed_cells, 'C15 level 3 must record collapsed cells');
    }

    // Group F criteria points: 15, 12, 9, 6, 3
    if (group.code === 'F') {
      assert.equal(criterion.levels.length, 5, `Group F criterion ${criterion.code} must have 5 levels`);
      assert.deepStrictEqual(criterion.levels.map((l) => l.points), [15, 12, 9, 6, 3]);
    }
  }
}

console.log('--- TEST 7: Full source row/cell provenance & drift preservation ---');
// Verify Staff JA number drift in provenance
const staffSet = manifest.groups.filter((g) => g.set_key === 'staff');
let driftedCriteriaCount = 0;
for (const g of staffSet) {
  for (const c of g.criteria) {
    if (c.provenance.ja_number_drift) {
      driftedCriteriaCount += 1;
      assert.notEqual(
        c.provenance.ja_number_drift.vi_number,
        c.provenance.ja_number_drift.ja_number,
        `Staff criterion ${c.code} drift must have differing VI and JA numbers`
      );
    }
  }
}
assert.ok(driftedCriteriaCount >= 17, `Staff must preserve at least 17 drifted criteria, found ${driftedCriteriaCount}`);

// Verify Leader stale revision header in provenance
const leaderGroupA = manifest.groups.find((g) => g.set_key === 'leader' && g.code === 'A');
assert.ok(leaderGroupA.provenance.stale_revision_header, 'Leader Group A must record stale_revision_header');
assert.equal(leaderGroupA.provenance.stale_revision_header.raw_vi_revision, 'Lbh: 07');
assert.equal(leaderGroupA.provenance.stale_revision_header.raw_ja_revision, 'Lbh: 06');

// Verify revision provenance across sets: Leader has stale S2=06, Staff and Worker have null (no JA revision header)
for (const group of manifest.groups) {
  assert.equal(group.provenance.vi_revision, '07', 'vi_revision must be 07 across all groups');
  if (group.set_key === 'leader') {
    assert.equal(group.provenance.ja_revision, '06', 'Leader ja_revision must reflect real observed S2 header (06)');
  } else {
    assert.equal(group.provenance.ja_revision, null, `Staff/Worker ja_revision must be null for absent header on ${group.code}`);
  }
}

// Verify numeric points origin across sets
for (const group of manifest.groups) {
  for (const criterion of group.criteria) {
    if (['A1', 'A4', 'A5', 'A6', 'A7', 'A8', 'C15'].includes(criterion.code)) continue;

    for (const level of criterion.levels) {
      if (group.set_key === 'worker') {
        assert.ok(
          level.points_origin.includes('header'),
          `Worker level ${criterion.code} must reference group header points origin: ${level.points_origin}`
        );
      } else {
        assert.match(
          level.points_origin,
          /^[H-L]\d+$/,
          `Leader/Staff level ${criterion.code} must reference H-L cell: ${level.points_origin}`
        );
      }
    }
  }
}

console.log('--- TEST 8: CLI refusal verification ---');
// Subtest 8a: Missing workbook argument
const missingArgRes = spawnSync(process.execPath, [scriptPath], {
  cwd: projectRoot,
  encoding: 'utf8',
});
assert.notEqual(missingArgRes.status, 0, 'CLI must exit non-zero when workbook is missing');

// Subtest 8b: Non-existent workbook file
const notFoundRes = spawnSync(process.execPath, [scriptPath, '--workbook', '/non/existent/path/workbook.xls'], {
  cwd: projectRoot,
  encoding: 'utf8',
});
assert.notEqual(notFoundRes.status, 0, 'CLI must exit non-zero when workbook does not exist');
assert.match(notFoundRes.stderr || notFoundRes.stdout, /REFUSE_WORKBOOK_NOT_FOUND/);

// Subtest 8c: Synthetic file with invalid SHA in task-local .tmp/
const dummyTmpPath = path.join(projectRoot, '.tmp', 'dummy-corrupted-wb.xls');
fs.mkdirSync(path.dirname(dummyTmpPath), { recursive: true });
fs.writeFileSync(dummyTmpPath, 'NOT_REAL_WORKBOOK_DATA_FOR_SHA_CHECK');
const dummyOutPath = path.join(projectRoot, '.tmp', 'dummy-out.json');
if (fs.existsSync(dummyOutPath)) fs.unlinkSync(dummyOutPath);

const wrongShaRes = spawnSync(process.execPath, [scriptPath, '--workbook', dummyTmpPath, '--output', dummyOutPath], {
  cwd: projectRoot,
  encoding: 'utf8',
});
assert.notEqual(wrongShaRes.status, 0, 'CLI must exit non-zero when workbook SHA fails verification');
assert.match(wrongShaRes.stderr || wrongShaRes.stdout, /REFUSE_WORKBOOK_SHA_MISMATCH/);
assert.ok(!fs.existsSync(dummyOutPath), 'CLI must not write any output file when SHA verification fails');

// Cleanup task-local scratch dummy file
if (fs.existsSync(dummyTmpPath)) fs.unlinkSync(dummyTmpPath);

// Subtest 8d: Synthetic input overwrite refusal: direct, symlink, and hardlink aliases
const syntheticWbPath = path.join(projectRoot, '.tmp', 'synthetic-safety-wb.xls');
const syntheticSymlinkPath = path.join(projectRoot, '.tmp', 'synthetic-safety-symlink.xls');
const syntheticHardlinkPath = path.join(projectRoot, '.tmp', 'synthetic-safety-hardlink.xls');
const syntheticBytes = Buffer.from('SYNTHETIC_WORKBOOK_DATA_FOR_ALIAS_SAFETY_TEST_2026');
const syntheticHashBefore = crypto.createHash('sha256').update(syntheticBytes).digest('hex');

fs.mkdirSync(path.dirname(syntheticWbPath), { recursive: true });
fs.writeFileSync(syntheticWbPath, syntheticBytes);

if (fs.existsSync(syntheticSymlinkPath)) fs.unlinkSync(syntheticSymlinkPath);
if (fs.existsSync(syntheticHardlinkPath)) fs.unlinkSync(syntheticHardlinkPath);

fs.symlinkSync(syntheticWbPath, syntheticSymlinkPath);
fs.linkSync(syntheticWbPath, syntheticHardlinkPath);

try {
  // Direct same-path alias
  const directAliasRes = spawnSync(process.execPath, [scriptPath, '--workbook', syntheticWbPath, '--output', syntheticWbPath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.notEqual(directAliasRes.status, 0, 'CLI must exit non-zero when --output is identical to --workbook');
  assert.match(
    directAliasRes.stderr || directAliasRes.stdout,
    /REFUSE_OUTPUT_OVERWRITES_WORKBOOK/,
    'CLI must refuse identical output path with REFUSE_OUTPUT_OVERWRITES_WORKBOOK'
  );
  const hashAfterDirect = crypto.createHash('sha256').update(fs.readFileSync(syntheticWbPath)).digest('hex');
  assert.equal(hashAfterDirect, syntheticHashBefore, 'Synthetic input file must be completely untouched after direct alias rejection');

  // Symlink alias
  const symlinkAliasRes = spawnSync(process.execPath, [scriptPath, '--workbook', syntheticWbPath, '--output', syntheticSymlinkPath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.notEqual(symlinkAliasRes.status, 0, 'CLI must exit non-zero when --output is a symlink to --workbook');
  assert.match(
    symlinkAliasRes.stderr || symlinkAliasRes.stdout,
    /REFUSE_OUTPUT_OVERWRITES_WORKBOOK/,
    'CLI must refuse symlink output path with REFUSE_OUTPUT_OVERWRITES_WORKBOOK'
  );
  const hashAfterSymlink = crypto.createHash('sha256').update(fs.readFileSync(syntheticWbPath)).digest('hex');
  assert.equal(hashAfterSymlink, syntheticHashBefore, 'Synthetic input file must be completely untouched after symlink alias rejection');

  // Hardlink alias
  const hardlinkAliasRes = spawnSync(process.execPath, [scriptPath, '--workbook', syntheticWbPath, '--output', syntheticHardlinkPath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.notEqual(hardlinkAliasRes.status, 0, 'CLI must exit non-zero when --output is a hardlink to --workbook');
  assert.match(
    hardlinkAliasRes.stderr || hardlinkAliasRes.stdout,
    /REFUSE_OUTPUT_OVERWRITES_WORKBOOK/,
    'CLI must refuse hardlink output path with REFUSE_OUTPUT_OVERWRITES_WORKBOOK'
  );
  const hashAfterHardlink = crypto.createHash('sha256').update(fs.readFileSync(syntheticWbPath)).digest('hex');
  assert.equal(hashAfterHardlink, syntheticHashBefore, 'Synthetic input file must be completely untouched after hardlink alias rejection');
} finally {
  if (fs.existsSync(syntheticSymlinkPath)) fs.unlinkSync(syntheticSymlinkPath);
  if (fs.existsSync(syntheticHardlinkPath)) fs.unlinkSync(syntheticHardlinkPath);
  if (fs.existsSync(syntheticWbPath)) fs.unlinkSync(syntheticWbPath);
}

console.log('--- TEST 9: Optional live workbook parity check & explicit env validation ---');

// Subtest 9a: Synthetic nonexistent explicit-env path must fail in child check
const syntheticNonexistentEnvWb = path.join(projectRoot, '.tmp', 'synthetic-nonexistent-workbook.xls');
const missingEnvChildRes = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
  cwd: projectRoot,
  env: { ...process.env, P108_WORKBOOK_PATH: syntheticNonexistentEnvWb },
  encoding: 'utf8',
});
assert.notEqual(
  missingEnvChildRes.status,
  0,
  'Child process must exit non-zero when explicit P108_WORKBOOK_PATH is supplied but missing'
);
assert.match(
  missingEnvChildRes.stderr || missingEnvChildRes.stdout,
  /REFUSE_MISSING_EXPLICIT_WORKBOOK/,
  'Child process must output REFUSE_MISSING_EXPLICIT_WORKBOOK error'
);

// Subtest 9b: Actual workbook parity test when host supplies path or canonical path exists
const explicitEnvPath = process.env.P108_WORKBOOK_PATH;
const canonicalPath = '/home/pi5/projects/kurabe/TCDG2026.xls';

function runWorkbookParity(wbPath) {
  console.log(`Live workbook detected at ${wbPath}. Running exact parity test...`);
  const rawBytes = fs.readFileSync(wbPath);
  const actualSha = crypto.createHash('sha256').update(rawBytes).digest('hex');
  assert.equal(actualSha, PINNED_WORKBOOK_SHA256, 'Workbook SHA must match pinned constant');

  const liveManifest = buildManifest(rawBytes, {
    source_workbook: path.basename(wbPath),
  });
  const liveSerialized = serializeManifest(liveManifest);

  assert.equal(
    liveSerialized,
    rawCommitted,
    'Live workbook extraction must produce exact byte-for-byte identical output to committed manifest'
  );
  console.log('Live workbook parity check: EXACT BYTE MATCH');
}

if (explicitEnvPath && fs.existsSync(explicitEnvPath)) {
  runWorkbookParity(explicitEnvPath);
} else if (fs.existsSync(canonicalPath)) {
  runWorkbookParity(canonicalPath);
} else if (process.env.P108_REQUIRE_WORKBOOK === '1' && process.env.P108_WORKBOOK_PATH) {
  throw new Error('REFUSE_REQUIRED_WORKBOOK_UNAVAILABLE: P108_REQUIRE_WORKBOOK===1 but supplied P108_WORKBOOK_PATH is unreadable');
} else {
  console.log(`[INFO] Absent readable P108_WORKBOOK_PATH and canonical workbook inaccessible at ${canonicalPath}; optional live workbook parity check skipped cleanly.`);
}

console.log('--- TEST 10: Extractor negative tests with structuredClone ---');
let extractorWorkbook = null;
if (process.env.P108_WORKBOOK_PATH && fs.existsSync(process.env.P108_WORKBOOK_PATH)) {
  extractorWorkbook = xlsx.read(fs.readFileSync(process.env.P108_WORKBOOK_PATH), { type: 'buffer' });
} else if (process.env.P108_WORKBOOK_VIEW_JSON && fs.existsSync(process.env.P108_WORKBOOK_VIEW_JSON)) {
  extractorWorkbook = JSON.parse(fs.readFileSync(process.env.P108_WORKBOOK_VIEW_JSON, 'utf8'));
} else if (fs.existsSync(canonicalPath)) {
  extractorWorkbook = xlsx.read(fs.readFileSync(canonicalPath), { type: 'buffer' });
}

if (!extractorWorkbook) {
  if (process.env.P108_REQUIRE_WORKBOOK === '1') {
    throw new Error('REFUSE_REQUIRED_WORKBOOK_UNAVAILABLE: P108_REQUIRE_WORKBOOK===1 but neither P108_WORKBOOK_PATH nor P108_WORKBOOK_VIEW_JSON provided a workbook');
  }
  console.log('[INFO] negative extractor tests skipped: no workbook source');
} else {
  // Digest verification
  assert.equal(
    sourceCellDigest(extractorWorkbook),
    SOURCE_CELL_DIGEST,
    'sourceCellDigest of valid workbook must match SOURCE_CELL_DIGEST'
  );

  // (1) delete change-sheet cells A9/B9/G9 => extractManifestUnverified throws REFUSE_MISSING_CHANGE_METADATA
  const changeSheets = extractorWorkbook.SheetNames.filter((n) => n.toLowerCase().includes('thay đổi'));
  for (const cs of changeSheets) {
    for (const cellAddr of ['A9', 'B9', 'G9']) {
      const clone1 = structuredClone(extractorWorkbook);
      delete clone1.Sheets[cs][cellAddr];
      assert.throws(
        () => extractManifestUnverified(clone1),
        /REFUSE_MISSING_CHANGE_METADATA/,
        `Expected REFUSE_MISSING_CHANGE_METADATA when ${cellAddr} is deleted on ${cs}`
      );
    }
  }

  // (2) alter one source point/label cell (e.g. 007.01 H7 => 123) => REFUSE_SOURCE_CONTENT_MISMATCH and NO manifest returned
  const clone2 = structuredClone(extractorWorkbook);
  const critSheet01 = clone2.SheetNames.find((n) => n.includes('007.01') && !n.toLowerCase().includes('thay đổi'));
  clone2.Sheets[critSheet01]['H7'] = { t: 'n', v: 123 };
  let manifestReturned = false;
  assert.throws(
    () => {
      const res = extractManifestUnverified(clone2);
      if (res) manifestReturned = true;
    },
    /REFUSE_SOURCE_CONTENT_MISMATCH/,
    'Expected REFUSE_SOURCE_CONTENT_MISMATCH when H7 is altered'
  );
  assert.equal(manifestReturned, false, 'No manifest returned when content mismatch occurs');

  // (3) add an extra cell => REFUSE_SOURCE_CONTENT_MISMATCH
  const clone3 = structuredClone(extractorWorkbook);
  clone3.Sheets[critSheet01]['Z99'] = { t: 's', v: 'tamper' };
  assert.throws(
    () => extractManifestUnverified(clone3),
    /REFUSE_SOURCE_CONTENT_MISMATCH/,
    'Expected REFUSE_SOURCE_CONTENT_MISMATCH when extra cell is added'
  );

  // (4) shift a row (move criterion row A8 or swap two rows) => throws
  const clone4 = structuredClone(extractorWorkbook);
  const s01 = clone4.Sheets[critSheet01];
  for (const k of Object.keys(s01)) {
    if (k.endsWith('14')) {
      const col = k.slice(0, -2);
      const val14 = s01[col + '14'];
      const val15 = s01[col + '15'];
      s01[col + '14'] = val15;
      s01[col + '15'] = val14;
    }
  }
  assert.throws(
    () => extractManifestUnverified(clone4),
    Error,
    'Expected extractManifestUnverified to throw when rows are shifted'
  );

  // (5) Raw bytes buildManifest binding and byte-distinct rejection:
  assert.throws(
    () => buildManifest('not a buffer'),
    /REFUSE_INVALID_BUFFER/,
    'buildManifest must throw REFUSE_INVALID_BUFFER when argument is not a Buffer'
  );
  const dummyBuffer = Buffer.from('byte-distinct fake workbook buffer content');
  assert.throws(
    () => buildManifest(dummyBuffer),
    /REFUSE_WORKBOOK_SHA_MISMATCH/,
    'buildManifest must throw REFUSE_WORKBOOK_SHA_MISMATCH for byte-distinct buffer'
  );
  try {
    const biffBuffer = xlsx.write(extractorWorkbook, { type: 'buffer', bookType: 'biff8' });
    assert.throws(
      () => buildManifest(biffBuffer),
      /REFUSE_WORKBOOK_SHA_MISMATCH/,
      'buildManifest must reject reconstructed biff8 buffer with REFUSE_WORKBOOK_SHA_MISMATCH'
    );
  } catch {
    const tamperedBytes = Buffer.concat([dummyBuffer, Buffer.from([0x00])]);
    assert.throws(
      () => buildManifest(tamperedBytes),
      /REFUSE_WORKBOOK_SHA_MISMATCH/
    );
  }

  // (6) Point provenance negatives:
  // Alter Leader point cell H18 from 5 to 99 => throws REFUSE_SOURCE_STRUCTURE
  {
    const clonePt = structuredClone(extractorWorkbook);
    const sLeader = clonePt.Sheets[clonePt.SheetNames.find((n) => n.includes('007.01') && !n.toLowerCase().includes('thay đổi'))];
    sLeader['H18'] = { t: 'n', v: 99 };
    assert.throws(
      () => extractManifestUnverified(clonePt),
      /REFUSE_SOURCE_STRUCTURE|REFUSE_SOURCE_CONTENT_MISMATCH/,
      'Altered Leader point cell must throw REFUSE_SOURCE_STRUCTURE or content mismatch'
    );
  }
  // Alter Worker header point cell C17 from "5 điểm" to "99 điểm" => throws REFUSE_SOURCE_STRUCTURE
  {
    const clonePtW = structuredClone(extractorWorkbook);
    const sWorker = clonePtW.Sheets[clonePtW.SheetNames.find((n) => n.includes('007.03') && !n.toLowerCase().includes('thay đổi'))];
    sWorker['C17'] = { t: 's', v: '99 điểm' };
    assert.throws(
      () => extractManifestUnverified(clonePtW),
      /REFUSE_SOURCE_STRUCTURE|REFUSE_SOURCE_CONTENT_MISMATCH/,
      'Altered Worker header point cell must throw REFUSE_SOURCE_STRUCTURE or content mismatch'
    );
  }

  // (7) Unverified extraction leaves workbook_sha256 as null; when set to pinned SHA equals committed bytes
  const unverifiedManifest = extractManifestUnverified(extractorWorkbook, { source_workbook: 'TCDG2026.xls' });
  assert.equal(unverifiedManifest._metadata.workbook_sha256, null, 'extractManifestUnverified must return workbook_sha256 as null');
  unverifiedManifest._metadata.workbook_sha256 = PINNED_WORKBOOK_SHA256;
  const liveBytes = serializeManifest(unverifiedManifest);
  assert.equal(liveBytes, rawCommitted, 'Unmodified view manifest with pinned workbook_sha256 must equal committed manifest bytes');
}

console.log('--- TEST 11: Importer preflight validator negatives & positive tests ---');
// Positive checks
validateManifestNodes(manifest);
validateG1Manifest(manifest);

const syntheticFixturePath = path.join(projectRoot, 'tests/fixtures/p108/synthetic-manifest.json');
const rawSyntheticBytes = fs.readFileSync(syntheticFixturePath);
const syntheticSha = crypto.createHash('sha256').update(rawSyntheticBytes).digest('hex');
assert.ok(SYNTHETIC_FIXTURE_SHA256_ALLOWLIST.includes(syntheticSha), 'Synthetic fixture SHA must be in allowlist');

const syntheticFixture = JSON.parse(rawSyntheticBytes.toString('utf8'));
validateManifestNodes(syntheticFixture);
assert.notEqual(syntheticFixture._metadata?.uuid_namespace, NAMESPACE, 'Synthetic fixture must not use G1 namespace');

function recomputeChecksums(m) {
  m._metadata.payload_sha256 = crypto.createHash('sha256')
    .update(JSON.stringify({ groups: m.groups }))
    .digest('hex');
  m._metadata.set_hashes = computeAllSetHashes(buildPayload(m));
}

const tableDrivenCases = [
  {
    name: 'fixture_type bypass (fixture_type=SYNTHETIC added to malformed real manifest)',
    mutate: (m) => {
      m._metadata.fixture_type = 'SYNTHETIC';
      m.groups[0].criteria[0].default_level_index = 0;
    },
    expectedCode: 'REFUSE_G1_DEFAULT_LEVEL_INDEX_NOT_NULL',
    validator: 'g1',
  },
  {
    name: 'missing group_id on criterion',
    mutate: (m) => {
      delete m.groups[0].criteria[0].group_id;
    },
    expectedCode: 'REFUSE_RELATION_MISSING',
    validator: 'nodes',
  },
  {
    name: 'missing criterion_id on level',
    mutate: (m) => {
      delete m.groups[0].criteria[0].levels[0].criterion_id;
    },
    expectedCode: 'REFUSE_RELATION_MISSING',
    validator: 'nodes',
  },
  {
    name: 'mismatched group_id on criterion',
    mutate: (m) => {
      m.groups[0].criteria[0].group_id = '00000000-0000-0000-0000-000000000000';
    },
    expectedCode: 'REFUSE_RELATION_MISMATCH',
    validator: 'nodes',
  },
  {
    name: 'mismatched criterion_id on level',
    mutate: (m) => {
      m.groups[0].criteria[0].levels[0].criterion_id = '00000000-0000-0000-0000-000000000000';
    },
    expectedCode: 'REFUSE_RELATION_MISMATCH',
    validator: 'nodes',
  },
  {
    name: 'tampered payload_sha256',
    mutate: (m) => {
      m._metadata.payload_sha256 = '0'.repeat(64);
    },
    expectedCode: 'REFUSE_G1_PAYLOAD_SHA_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'tampered set_hashes',
    mutate: (m) => {
      m._metadata.set_hashes.leader = '0'.repeat(64);
    },
    expectedCode: 'REFUSE_G1_SET_HASHES_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'wrong group UUID (not matching UUIDv5 name)',
    mutate: (m) => {
      m.groups[0].id = '11111111-1111-4111-8111-111111111111';
      for (const c of m.groups[0].criteria) {
        c.group_id = '11111111-1111-4111-8111-111111111111';
      }
    },
    expectedCode: 'REFUSE_G1_INVALID_UUID',
    validator: 'g1',
  },
  {
    name: 'wrong criterion UUID (not matching UUIDv5 name)',
    mutate: (m) => {
      m.groups[0].criteria[0].id = '22222222-2222-4222-8222-222222222222';
      for (const l of m.groups[0].criteria[0].levels) {
        l.criterion_id = '22222222-2222-4222-8222-222222222222';
      }
    },
    expectedCode: 'REFUSE_G1_INVALID_UUID',
    validator: 'g1',
  },
  {
    name: 'wrong level UUID (not matching UUIDv5 name)',
    mutate: (m) => {
      m.groups[0].criteria[0].levels[0].id = '33333333-3333-4333-8333-333333333333';
    },
    expectedCode: 'REFUSE_G1_INVALID_UUID',
    validator: 'g1',
  },
  {
    name: 'wrong namespace',
    mutate: (m) => {
      m._metadata.uuid_namespace = '00000000-0000-0000-0000-000000000000';
    },
    expectedCode: 'REFUSE_G1_INVALID_NAMESPACE',
    validator: 'g1',
  },
  {
    name: 'nonzero weight',
    mutate: (m) => {
      m.groups[0].criteria[0].weight = 5;
    },
    expectedCode: 'REFUSE_G1_INVALID_WEIGHT',
    validator: 'g1',
  },
  {
    name: 'changed label with recomputed checksums',
    mutate: (m) => {
      m.groups[0].criteria[0].levels[0].label = 'Tampered Label';
    },
    recompute: true,
    expectedCode: 'REFUSE_G1_CANONICAL_CONTENT_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'changed description with recomputed checksums',
    mutate: (m) => {
      m.groups[0].criteria[0].description = 'Tampered Description';
    },
    recompute: true,
    expectedCode: 'REFUSE_G1_CANONICAL_CONTENT_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'changed points keeping same max with recomputed checksums',
    mutate: (m) => {
      const c = m.groups.find((g) => g.code === 'B').criteria[0];
      c.levels[1].points = 3;
      c.levels[2].points = 4;
    },
    recompute: true,
    expectedCode: 'REFUSE_G1_CANONICAL_CONTENT_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'extra level with recomputed checksums',
    mutate: (m) => {
      const c = m.groups[0].criteria[0];
      const extraL = structuredClone(c.levels[0]);
      extraL.sort_order = c.levels.length;
      extraL.points = 0;
      extraL.id = uuidV5(`p108:leader:level:A1:${extraL.sort_order}`, NAMESPACE);
      c.levels.push(extraL);
    },
    recompute: true,
    expectedCode: 'REFUSE_G1_CANONICAL_CONTENT_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'reordered criteria with recomputed checksums',
    mutate: (m) => {
      const g = m.groups[0];
      const temp = g.criteria[0];
      g.criteria[0] = g.criteria[1];
      g.criteria[1] = temp;
    },
    recompute: true,
    expectedCode: 'REFUSE_G1_CANONICAL_CONTENT_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'changed sort_order with recomputed checksums',
    mutate: (m) => {
      m.groups[0].criteria[0].sort_order = 99;
    },
    recompute: true,
    expectedCode: 'REFUSE_G1_CANONICAL_CONTENT_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'wrong metadata workbook_sha256',
    mutate: (m) => {
      m._metadata.workbook_sha256 = '0'.repeat(64);
    },
    expectedCode: 'REFUSE_G1_METADATA_WORKBOOK_SHA_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'wrong metadata revision',
    mutate: (m) => {
      m._metadata.revision = '08';
    },
    expectedCode: 'REFUSE_G1_METADATA_REVISION_MISMATCH',
    validator: 'g1',
  },
  {
    name: 'missing group provenance',
    mutate: (m) => {
      delete m.groups[0].provenance;
    },
    expectedCode: 'REFUSE_G1_MISSING_PROVENANCE',
    validator: 'g1',
  },
  {
    name: 'missing criterion provenance',
    mutate: (m) => {
      delete m.groups[0].criteria[0].provenance;
    },
    expectedCode: 'REFUSE_G1_MISSING_PROVENANCE',
    validator: 'g1',
  },
  {
    name: 'missing level provenance',
    mutate: (m) => {
      delete m.groups[0].criteria[0].levels[0].provenance;
    },
    expectedCode: 'REFUSE_G1_MISSING_PROVENANCE',
    validator: 'g1',
  },
];

for (const tc of tableDrivenCases) {
  const clone = structuredClone(manifest);
  tc.mutate(clone);
  if (tc.recompute) {
    recomputeChecksums(clone);
  }

  if (tc.validator === 'nodes') {
    assert.throws(
      () => validateManifestNodes(clone),
      new RegExp(tc.expectedCode),
      `Expected validateManifestNodes to throw ${tc.expectedCode} for ${tc.name}`
    );
  } else {
    assert.throws(
      () => validateG1Manifest(clone),
      new RegExp(tc.expectedCode),
      `Expected validateG1Manifest to throw ${tc.expectedCode} for ${tc.name}`
    );
  }
}

console.log('--- TEST 12: Importer CLI-level preflight refusal tests (table-driven) ---');
const importerScript = path.join(projectRoot, 'scripts/p108-import-criteria.mjs');
const tmpDir = path.join(projectRoot, '.tmp', 'p108-cli-negatives');
fs.mkdirSync(tmpDir, { recursive: true });

for (let i = 0; i < tableDrivenCases.length; i++) {
  const tc = tableDrivenCases[i];
  const clone = structuredClone(manifest);
  tc.mutate(clone);
  if (tc.recompute) {
    recomputeChecksums(clone);
  }

  const tmpPath = path.join(tmpDir, `table-case-${i}.json`);
  fs.writeFileSync(tmpPath, JSON.stringify(clone, null, 2), 'utf8');

  try {
    // Dry-run mode
    const dryRunRes = spawnSync(
      process.execPath,
      [importerScript, '--dry-run', '--manifest', tmpPath],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      }
    );
    assert.notEqual(dryRunRes.status, 0, `CLI --dry-run must exit non-zero for ${tc.name}`);
    const dryRunOut = (dryRunRes.stdout || '') + (dryRunRes.stderr || '');
    assert.match(dryRunOut, new RegExp(tc.expectedCode), `CLI --dry-run output must contain ${tc.expectedCode} for ${tc.name}`);

    // Apply mode with bogus loopback URL and dummy key
    const applyRes = spawnSync(
      process.execPath,
      [importerScript, '--apply', '--expected-version', '1', '--manifest', tmpPath, '--disposable'],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          KURABE_SUPABASE_URL: 'http://127.0.0.1:9',
          KURABE_SUPABASE_SERVICE_ROLE_KEY: 'x',
        },
        encoding: 'utf8',
      }
    );
    assert.notEqual(applyRes.status, 0, `CLI --apply must exit non-zero for ${tc.name}`);
    const applyOut = (applyRes.stdout || '') + (applyRes.stderr || '');
    assert.match(applyOut, new RegExp(tc.expectedCode), `CLI --apply output must contain ${tc.expectedCode} for ${tc.name}`);
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

// Also test positive synthetic fixture CLI dry-run
const synDryRunRes = spawnSync(
  process.execPath,
  [importerScript, '--dry-run', '--manifest', syntheticFixturePath],
  {
    cwd: projectRoot,
    encoding: 'utf8',
  }
);
assert.equal(synDryRunRes.status, 0, 'Synthetic fixture CLI --dry-run must exit zero');
const synDryRunOut = JSON.parse(synDryRunRes.stdout);
assert.equal(synDryRunOut.success, true);
assert.equal(synDryRunOut.manifest_sha256, syntheticSha);

try {
  fs.rmdirSync(tmpDir);
} catch {
  // ignore
}

console.log('\n========================================');
console.log('p108-criteria-manifest tests: ALL PASS');
console.log('========================================');
