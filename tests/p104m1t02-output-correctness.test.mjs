import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Direct functional imports from owned modules
import {
  formatCriterionColumnKey,
  formatLegacyCriterionColumnKey,
  buildExportSummaryRows,
  buildExportDetailRows,
  buildExportWorkbook,
} from '../src/lib/export.ts';

import { detectAnomalies } from '../src/lib/anomaly.ts';
import { projectEmployeeTableItems } from '../src/lib/employee-table-projection.ts';

const projectRoot = process.cwd();

function readProjectFile(relPath) {
  const fullPath = path.join(projectRoot, relPath);
  assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Mirror of resolveLeaderEffectiveTeamFilter from src/lib/db/users-admin.ts
 * for behavioral testing in plain Node without loading server-only modules.
 */
function resolveLeaderEffectiveTeamFilter(requestedTeamId, authorizedLedTeamIds) {
  if (authorizedLedTeamIds.length === 0) {
    return { allowed: false, effectiveTeamIds: [] };
  }
  if (!requestedTeamId) {
    return { allowed: true, effectiveTeamIds: [...authorizedLedTeamIds] };
  }
  if (!authorizedLedTeamIds.includes(requestedTeamId)) {
    return { allowed: false, effectiveTeamIds: [] };
  }
  return { allowed: true, effectiveTeamId: requestedTeamId, effectiveTeamIds: [requestedTeamId] };
}

console.log('=== P104M1T02 OUTPUT / DATA CORRECTNESS REGRESSION SUITE ===');

// =========================================================================
// SECTION 1: Finding F02 — Historical Excel Export Criteria Snapshot Integrity
// =========================================================================
console.log('\n--- Section 1: Finding F02 (Historical Excel Export) ---');

{
  // Setup synthetic fixture data with multiple versions and historical criteria changes
  const employee1 = {
    id: 'emp-01',
    employeeCode: 'EMP001',
    name: 'Nguyễn Văn An',
    role: 'Employee',
    teamId: 'team-a',
    gender: 'Nam',
  };

  const employee2 = {
    id: 'emp-02',
    employeeCode: 'EMP002',
    name: 'Trần Thị Bình',
    role: 'Employee',
    teamId: 'team-b',
    gender: 'Nữ',
  };

  const employeeLegacy = {
    id: 'emp-03',
    employeeCode: 'EMP003',
    name: 'Lê Văn Cường',
    role: 'Employee',
    teamId: 'team-a',
    gender: 'Nam',
  };

  const userMap = new Map([
    [employee1.id, employee1],
    [employee2.id, employee2],
    [employeeLegacy.id, employeeLegacy],
    ['eval-1', { id: 'eval-1', employeeCode: 'LDR01', name: 'Leader Một', role: 'Leader', teamId: 'team-a', gender: 'Nam' }],
  ]);

  const teamMap = new Map([
    ['team-a', { id: 'team-a', name: 'Đội A', leaderId: 'eval-1' }],
    ['team-b', { id: 'team-b', name: 'Đội B', leaderId: 'eval-1' }],
  ]);

  // Version 1 Criteria:
  // - crit-alpha: "Chất lượng sản phẩm (V1)"
  // - crit-beta: "Tuân thủ quy trình" (will be deleted in V2)
  const v1CriteriaGroups = [
    {
      id: 'grp-1',
      code: 'G1',
      name: 'Chuyên môn',
      shortName: 'CM',
      sortOrder: 1,
      criteria: [
        {
          id: 'crit-alpha',
          code: 'C1',
          name: 'Chất lượng sản phẩm (V1)',
          appliesTo: ['Employee'],
          levels: [{ points: 10, label: 'Tốt' }],
        },
        {
          id: 'crit-beta',
          code: 'C2',
          name: 'Tuân thủ quy trình',
          appliesTo: ['Employee'],
          levels: [{ points: 10, label: 'Tốt' }],
        },
      ],
    },
  ];

  // Version 2 Criteria:
  // - crit-alpha: RENAMED to "Chất lượng sản phẩm nâng cao (V2)"
  // - crit-beta: DELETED
  // - crit-gamma: ADDED "Sáng tạo cải tiến"
  const v2CriteriaGroups = [
    {
      id: 'grp-1',
      code: 'G1',
      name: 'Chuyên môn',
      shortName: 'CM',
      sortOrder: 1,
      criteria: [
        {
          id: 'crit-alpha',
          code: 'C1',
          name: 'Chất lượng sản phẩm nâng cao (V2)',
          appliesTo: ['Employee'],
          levels: [{ points: 10, label: 'Tốt' }],
        },
        {
          id: 'crit-gamma',
          code: 'C3',
          name: 'Sáng tạo cải tiến',
          appliesTo: ['Employee'],
          levels: [{ points: 10, label: 'Tốt' }],
        },
      ],
    },
  ];

  // Eval 1: Evaluated under Version 1
  const eval1 = {
    id: 'eval-doc-1',
    periodId: 'period-2026',
    employeeId: employee1.id,
    employeeRole: 'Employee',
    teamId: 'team-a',
    currentRound: 1,
    status: 'Approved',
    finalScore: 20,
    finalGrade: 'A',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    rounds: [
      {
        round: 1,
        evaluatorId: 'eval-1',
        evaluatorRole: 'Leader',
        status: 'Submitted',
        totalScore: 20,
        grade: 'A',
        scores: {
          'crit-alpha': 10,
          'crit-beta': 10,
        },
        criteriaConfigVersionId: 'cfg-ver-1',
        criteriaSnapshotState: 'authoritative',
        createdAt: '2026-01-01T00:00:00Z',
        submittedAt: '2026-01-01T12:00:00Z',
      },
    ],
  };

  // Eval 2: Evaluated under Version 2, with valid score 0 on one criterion
  const eval2 = {
    id: 'eval-doc-2',
    periodId: 'period-2026',
    employeeId: employee2.id,
    employeeRole: 'Employee',
    teamId: 'team-b',
    currentRound: 1,
    status: 'Submitted',
    finalScore: 8,
    finalGrade: 'B',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-02T00:00:00Z',
    rounds: [
      {
        round: 1,
        evaluatorId: 'eval-1',
        evaluatorRole: 'Leader',
        status: 'Submitted',
        totalScore: 8,
        grade: 'B',
        scores: {
          'crit-alpha': 8,
          'crit-gamma': 0, // Valid numeric score 0!
        },
        criteriaConfigVersionId: 'cfg-ver-2',
        criteriaSnapshotState: 'authoritative',
        createdAt: '2026-02-01T00:00:00Z',
        submittedAt: '2026-02-01T12:00:00Z',
      },
    ],
  };

  // Eval 3: Legacy round without pinned criteria version
  const evalLegacy = {
    id: 'eval-doc-3',
    periodId: 'period-2026',
    employeeId: employeeLegacy.id,
    employeeRole: 'Employee',
    teamId: 'team-a',
    currentRound: 1,
    status: 'Approved',
    finalScore: 0, // Valid final score 0!
    finalGrade: 'D',
    createdAt: '2025-12-01T00:00:00Z',
    updatedAt: '2025-12-02T00:00:00Z',
    rounds: [
      {
        round: 1,
        evaluatorId: 'eval-1',
        evaluatorRole: 'Leader',
        status: 'Submitted',
        totalScore: 0,
        grade: 'D',
        scores: {
          'crit-legacy-x': 0,
        },
        criteriaConfigVersionId: null,
        criteriaSnapshotState: 'legacy_unknown',
        createdAt: '2025-12-01T00:00:00Z',
        submittedAt: '2025-12-01T12:00:00Z',
      },
    ],
  };

  const displayDtos = new Map([
    [
      eval1.id,
      {
        evaluationId: eval1.id,
        employeeRoleSnapshot: 'Employee',
        rounds: [
          {
            round: 1,
            status: 'Submitted',
            totalScore: 20,
            grade: 'A',
            evaluatorRole: 'Leader',
            criteriaConfigVersionId: 'cfg-ver-1',
            gradeConfigVersionId: 'grd-ver-1',
            snapshotState: 'authoritative',
            criteriaGroups: v1CriteriaGroups,
          },
        ],
      },
    ],
    [
      eval2.id,
      {
        evaluationId: eval2.id,
        employeeRoleSnapshot: 'Employee',
        rounds: [
          {
            round: 1,
            status: 'Submitted',
            totalScore: 8,
            grade: 'B',
            evaluatorRole: 'Leader',
            criteriaConfigVersionId: 'cfg-ver-2',
            gradeConfigVersionId: 'grd-ver-2',
            snapshotState: 'authoritative',
            criteriaGroups: v2CriteriaGroups,
          },
        ],
      },
    ],
    [
      evalLegacy.id,
      {
        evaluationId: evalLegacy.id,
        employeeRoleSnapshot: 'Employee',
        rounds: [
          {
            round: 1,
            status: 'Submitted',
            totalScore: 0,
            grade: 'D',
            evaluatorRole: 'Leader',
            criteriaConfigVersionId: null,
            gradeConfigVersionId: null,
            snapshotState: 'legacy_unknown',
            criteriaGroups: [],
          },
        ],
      },
    ],
  ]);

  // Execute buildExportDetailRows
  const detailRows = buildExportDetailRows(
    [eval1, eval2, evalLegacy],
    userMap,
    displayDtos
  );

  assert.equal(detailRows.length, 3, 'Must produce 3 detail rows');

  const row1 = detailRows[0];
  const row2 = detailRows[1];
  const row3 = detailRows[2];

  // 1.1 Criteria rename after evaluation:
  // Eval 1 must retain the V1 criterion label ("Chất lượng sản phẩm (V1)") with ID crit-alpha
  const v1AlphaKey = formatCriterionColumnKey('crit-alpha', 'Chất lượng sản phẩm (V1)');
  const v2AlphaKey = formatCriterionColumnKey('crit-alpha', 'Chất lượng sản phẩm nâng cao (V2)');

  assert.ok(v1AlphaKey in row1, 'Row 1 must contain V1 column for crit-alpha');
  assert.equal(row1[v1AlphaKey], 10, 'Row 1 must have score 10 in historical V1 crit-alpha column');
  assert.equal(row1[v2AlphaKey], null, 'Row 1 must have null for V2 renamed column');

  // Eval 2 must have score in V2 renamed column, and null in V1 column
  assert.equal(row2[v2AlphaKey], 8, 'Row 2 must have score 8 in V2 crit-alpha column');
  assert.equal(row2[v1AlphaKey], null, 'Row 2 must have null for V1 crit-alpha column');

  // 1.2 Criteria delete after evaluation:
  // crit-beta was deleted in V2, but Eval 1 must preserve it with historical score
  const betaKey = formatCriterionColumnKey('crit-beta', 'Tuân thủ quy trình');
  assert.ok(betaKey in row1, 'Row 1 must contain deleted crit-beta column');
  assert.equal(row1[betaKey], 10, 'Row 1 must preserve historical score 10 for deleted crit-beta');
  assert.equal(row2[betaKey], null, 'Row 2 (V2) must have null for deleted crit-beta');

  // 1.3 Criteria add after evaluation:
  // crit-gamma was added in V2. Eval 1 must have null, Eval 2 must have its score
  const gammaKey = formatCriterionColumnKey('crit-gamma', 'Sáng tạo cải tiến');
  assert.ok(gammaKey in row2, 'Row 2 must contain newly added crit-gamma column');
  assert.equal(row1[gammaKey], null, 'Row 1 (V1) must have null for newly added crit-gamma');
  assert.equal(row2[gammaKey], 0, 'Row 2 (V2) must preserve valid score 0 for crit-gamma');

  // 1.4 Multiple criteria versions coexistence:
  assert.equal(row1['Phiên Bản Tiêu Chí'], 'cfg-ver-1');
  assert.equal(row1['Trạng Thái Snapshot'], 'authoritative');
  assert.equal(row2['Phiên Bản Tiêu Chí'], 'cfg-ver-2');
  assert.equal(row2['Trạng Thái Snapshot'], 'authoritative');

  // 1.5 Legacy unknown snapshot:
  assert.equal(row3['Trạng Thái Snapshot'], 'legacy_unknown');
  assert.equal(row3['Phiên Bản Tiêu Chí'], 'legacy_unknown');
  assert.equal(row3[v1AlphaKey], null, 'Legacy row must not populate V1 alpha');
  assert.equal(row3[v2AlphaKey], null, 'Legacy row must not populate V2 alpha');
  assert.equal(row3[betaKey], null, 'Legacy row must not populate V1 beta');
  assert.equal(row3[gammaKey], null, 'Legacy row must not populate V2 gamma');

  const legacyKey = formatLegacyCriterionColumnKey('crit-legacy-x');
  assert.equal(row3[legacyKey], 0, 'Legacy row must preserve valid score 0 under explicit legacy column');

  // 1.6 Summary Rows testing:
  const summaryRows = buildExportSummaryRows(
    [eval1, eval2, evalLegacy],
    userMap,
    teamMap
  );
  assert.equal(summaryRows[0]['Điểm Tổng'], 20, 'Eval 1 finalScore 20 preserved');
  assert.equal(summaryRows[1]['Điểm Tổng'], 8, 'Eval 2 finalScore 8 preserved');
  assert.equal(summaryRows[2]['Điểm Tổng'], 0, 'Eval 3 valid finalScore 0 preserved without truthiness loss');

  // 1.7 Mock XLSX workbook creation test:
  const mockXLSX = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      json_to_sheet: (data) => ({ '!data': data }),
      book_append_sheet: (wb, sheet, name) => {
        wb.SheetNames.push(name);
        wb.Sheets[name] = sheet;
      },
    },
  };

  const workbook = buildExportWorkbook(
    [eval1, eval2, evalLegacy],
    [employee1, employee2, employeeLegacy],
    Array.from(teamMap.values()),
    {
      includeRoundDetails: true,
      displayDtos,
      XLSX: mockXLSX,
    }
  );

  assert.deepEqual(workbook.SheetNames, ['Tổng Hợp', 'Chi Tiết Vòng']);
  assert.equal(workbook.Sheets['Tổng Hợp']['!data'].length, 3);
  assert.equal(workbook.Sheets['Chi Tiết Vòng']['!data'].length, 3);

  // 1.8 Verify src/lib/export.ts does not call getAllCriteriaGroups (no live criteria fallback!)
  const exportCode = readProjectFile('src/lib/export.ts');
  assert.ok(
    !exportCode.includes('getAllCriteriaGroups'),
    'src/lib/export.ts must NOT import or call getAllCriteriaGroups'
  );
  assert.ok(
    !exportCode.includes("from './db/criteria'"),
    'src/lib/export.ts must NOT import from ./db/criteria'
  );

  console.log('  PASS: F02 snapshot-based export, rename/delete/add, multi-version, and legacy handling');
}

// =========================================================================
// SECTION 2: Finding F03 — Score 0 Truthiness Loss Across Owned Consumers
// =========================================================================
console.log('\n--- Section 2: Finding F03 (Score 0 Truthiness Loss) ---');

{
  // 2.1 Anomaly Detection: Score 0 in Round 1, Score 30 in Round 2
  const evalWithZeroScore = {
    id: 'eval-anomaly-0',
    employeeId: 'emp-anomaly',
    employeeRole: 'Employee',
    teamId: 'team-a',
    currentRound: 2,
    status: 'Submitted',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    rounds: [
      {
        round: 1,
        evaluatorId: 'ldr-1',
        evaluatorRole: 'Leader',
        status: 'Submitted',
        totalScore: 0, // Score 0
        grade: 'D',
        scores: {},
        createdAt: '2026-01-01T00:00:00Z',
        submittedAt: '2026-01-01T12:00:00Z',
      },
      {
        round: 2,
        evaluatorId: 'ldr-1',
        evaluatorRole: 'Leader',
        status: 'Submitted',
        totalScore: 30, // Score 30 -> diff = 30 >= HIGH_DIFF (30)
        grade: 'B',
        scores: {},
        createdAt: '2026-01-02T00:00:00Z',
        submittedAt: '2026-01-02T12:00:00Z',
      },
    ],
  };

  const nameMap = new Map([['emp-anomaly', 'Hoàng Văn Anomaly']]);
  const anomalies = detectAnomalies([evalWithZeroScore], nameMap);

  assert.equal(anomalies.length, 1, 'Must detect anomaly when Round 1 score is 0 and Round 2 is 30');
  assert.equal(anomalies[0].prevScore, 0, 'prevScore must be preserved as 0');
  assert.equal(anomalies[0].score, 30, 'score must be 30');
  assert.equal(anomalies[0].diff, 30, 'diff must be 30');
  assert.equal(anomalies[0].severity, 'high', 'diff 30 must be severity high');

  // Reverse case: Round 1 score 25, Round 2 score 0 -> diff = 25 >= MEDIUM_DIFF (20)
  const evalWithZeroRound2 = {
    id: 'eval-anomaly-drop',
    employeeId: 'emp-drop',
    employeeRole: 'Employee',
    teamId: 'team-a',
    currentRound: 2,
    status: 'Submitted',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    rounds: [
      {
        round: 1,
        evaluatorId: 'ldr-1',
        evaluatorRole: 'Leader',
        status: 'Submitted',
        totalScore: 25,
        grade: 'C',
        scores: {},
        createdAt: '2026-01-01T00:00:00Z',
        submittedAt: '2026-01-01T12:00:00Z',
      },
      {
        round: 2,
        evaluatorId: 'ldr-1',
        evaluatorRole: 'Leader',
        status: 'Submitted',
        totalScore: 0,
        grade: 'D',
        scores: {},
        createdAt: '2026-01-02T00:00:00Z',
        submittedAt: '2026-01-02T12:00:00Z',
      },
    ],
  };
  const nameMap2 = new Map([['emp-drop', 'Đỗ Văn Drop']]);
  const anomaliesDrop = detectAnomalies([evalWithZeroRound2], nameMap2);
  assert.equal(anomaliesDrop.length, 1, 'Must detect anomaly when dropping from 25 to 0');
  assert.equal(anomaliesDrop[0].prevScore, 25);
  assert.equal(anomaliesDrop[0].score, 0);
  assert.equal(anomaliesDrop[0].diff, 25);
  assert.equal(anomaliesDrop[0].severity, 'medium');

  console.log('  PASS: Anomaly detection preserves valid score 0 (both rise and drop)');

  // 2.2 Employee Table Projection: score 0 preservation
  const testUser = {
    id: 'u-score-0',
    employeeCode: 'EMP099',
    name: 'Phạm Văn Zero',
    role: 'Employee',
    teamId: 'team-1',
    gender: 'Nam',
  };

  const evalWithZeroFinal = {
    id: 'eval-final-0',
    periodId: 'p-1',
    employeeId: testUser.id,
    employeeRole: 'Employee',
    teamId: 'team-1',
    currentRound: 1,
    status: 'Approved',
    finalScore: 0, // Final score 0
    finalGrade: 'D',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    rounds: [
      {
        round: 1,
        evaluatorId: 'ldr-1',
        evaluatorRole: 'Leader',
        status: 'Submitted',
        totalScore: 0,
        grade: 'D',
        scores: {},
        createdAt: '2026-01-01T00:00:00Z',
        submittedAt: '2026-01-01T12:00:00Z',
      },
    ],
  };

  const projectedItems = projectEmployeeTableItems({
    users: [testUser],
    evaluationsMap: { [testUser.id]: evalWithZeroFinal },
    currentPeriodId: 'p-1',
  });

  assert.equal(projectedItems.length, 1);
  assert.equal(projectedItems[0].score, 0, 'Projected employee score must be exactly 0, not fallback');
  assert.equal(projectedItems[0].hasFinalResult, true, 'hasFinalResult must be true for graded eval');

  console.log('  PASS: Employee table projection preserves valid score 0');

  // 2.3 DB Mappers Source Inspection for Nullish Semantics
  const evalDbSrc = readProjectFile('src/lib/db/evaluations.ts');
  assert.ok(
    evalDbSrc.includes('finalScore: db.final_score ?? undefined'),
    'src/lib/db/evaluations.ts must use finalScore: db.final_score ?? undefined'
  );
  assert.ok(
    !evalDbSrc.includes('finalScore: db.final_score || undefined'),
    'src/lib/db/evaluations.ts must NOT use finalScore: db.final_score || undefined'
  );
  assert.ok(
    evalDbSrc.includes('totalScore: db.total_score ?? 0'),
    'src/lib/db/evaluations.ts must use totalScore: db.total_score ?? 0'
  );
  assert.ok(
    !evalDbSrc.includes('totalScore: db.total_score || 0'),
    'src/lib/db/evaluations.ts must NOT use totalScore: db.total_score || 0'
  );

  const evalAdminDbSrc = readProjectFile('src/lib/db/evaluations-admin.ts');
  assert.ok(
    evalAdminDbSrc.includes('totalScore: db.total_score ?? 0'),
    'src/lib/db/evaluations-admin.ts must use totalScore: db.total_score ?? 0'
  );
  assert.ok(
    !evalAdminDbSrc.includes('totalScore: db.total_score || 0'),
    'src/lib/db/evaluations-admin.ts must NOT use totalScore: db.total_score || 0'
  );
  assert.ok(
    !evalAdminDbSrc.includes('finalScore: db.final_score || undefined'),
    'src/lib/db/evaluations-admin.ts must NOT use finalScore: db.final_score || undefined'
  );

  // Count occurrences of finalScore: db.final_score ?? undefined in evaluations-admin.ts
  const nullishFinalMatches = evalAdminDbSrc.match(/finalScore:\s*db\.final_score\s*\?\?\s*undefined/g);
  assert.equal(
    nullishFinalMatches?.length,
    2,
    'Both mapEvaluationSummaryFromDb and mapEvaluationBatchSummaryFromDb must use ?? undefined'
  );

  // 2.4 Chat Action Score Semantic Context Inspection
  const chatSrc = readProjectFile('src/actions/chat.ts');
  assert.ok(
    !chatSrc.includes('.filter((r) => (r.totalScore || 0) > 0)'),
    'src/actions/chat.ts must NOT filter out valid score 0 with (r.totalScore || 0) > 0'
  );
  assert.ok(
    chatSrc.includes('r.totalScore ?? 0'),
    'src/actions/chat.ts must use nullish coalescing r.totalScore ?? 0'
  );

  // 2.5 AI Summary Score Preservation Inspection
  const aiSummarySrc = readProjectFile('src/actions/ai-summary.ts');
  assert.ok(
    aiSummarySrc.includes('score: lastRound?.totalScore ?? 0'),
    'src/actions/ai-summary.ts must use lastRound?.totalScore ?? 0'
  );

  // 2.6 Reports action must preserve score 0; T01 owns and fixes this path.
  const reportsSrc = readProjectFile('src/actions/reports.ts');
  assert.ok(
    !reportsSrc.includes('e.finalScore || (e.rounds'),
    'src/actions/reports.ts must not lose score 0 through finalScore || fallback'
  );
  assert.ok(
    reportsSrc.includes('e.finalScore ?? lastRound?.totalScore ?? 0'),
    'src/actions/reports.ts must preserve score 0 with nullish fallback'
  );

  console.log('  PASS: DB mappers, chat, and AI summary correctly preserve score 0 nullish semantics');
}

// =========================================================================
// SECTION 3: Finding F04 — Leader Selected-Team Pagination & Boundaries
// =========================================================================
console.log('\n--- Section 3: Finding F04 (Leader Selected-Team Filter & Boundaries) ---');

{
  const authorizedTeams = ['team-a', 'team-b'];

  // 3.1 Leader Requests Authorized Selected Team B
  const filterB = resolveLeaderEffectiveTeamFilter('team-b', authorizedTeams);
  assert.deepEqual(filterB, {
    allowed: true,
    effectiveTeamId: 'team-b',
    effectiveTeamIds: ['team-b'],
  });

  // 3.2 Leader Requests All Teams (teamId undefined)
  const filterAll = resolveLeaderEffectiveTeamFilter(undefined, authorizedTeams);
  assert.deepEqual(filterAll, {
    allowed: true,
    effectiveTeamIds: ['team-a', 'team-b'],
  });

  // 3.3 Leader Requests Out-of-Scope Team C (Unauthorized)
  const filterC = resolveLeaderEffectiveTeamFilter('team-c', authorizedTeams);
  assert.deepEqual(filterC, {
    allowed: false,
    effectiveTeamIds: [],
  });

  // 3.4 Leader With No Teams
  const filterEmpty = resolveLeaderEffectiveTeamFilter('team-a', []);
  assert.deepEqual(filterEmpty, {
    allowed: false,
    effectiveTeamIds: [],
  });

  // 3.5 Pagination Boundaries & Count simulation for Leader Team Filter
  // Simulate Team A having 30 users, Team B having 10 users, Team C having 50 users
  const mockDatabase = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `u-a-${i}`, team_id: 'team-a', name: `A User ${i}` })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `u-b-${i}`, team_id: 'team-b', name: `B User ${i}` })),
    ...Array.from({ length: 50 }, (_, i) => ({ id: `u-c-${i}`, team_id: 'team-c', name: `C User ${i}` })),
  ];

  // Helper simulating the query construction in getUsersBatchAdmin
  function simulateBatchQuery(requesterRole, leaderTeams, requestedTeamId, offset = 0, limit = 20) {
    if (requesterRole === 'Leader') {
      const leaderFilter = resolveLeaderEffectiveTeamFilter(requestedTeamId, leaderTeams);
      if (!leaderFilter.allowed) {
        return { items: [], hasMore: false, totalCount: 0 };
      }

      let filtered = mockDatabase;
      if (leaderFilter.effectiveTeamId) {
        filtered = filtered.filter((u) => u.team_id === leaderFilter.effectiveTeamId);
      } else {
        filtered = filtered.filter((u) => leaderFilter.effectiveTeamIds.includes(u.team_id));
      }

      const totalCount = filtered.length;
      // range(offset, offset + limit) fetches limit + 1 items to determine hasMore
      const sliced = filtered.slice(offset, offset + limit + 1);
      const hasMore = sliced.length > limit;
      const items = sliced.slice(0, limit);

      return { items, hasMore, totalCount };
    }
    return { items: [], hasMore: false, totalCount: 0 };
  }

  // Case A: Leader queries Team B (10 users total, limit 20)
  // MUST return totalCount: 10, items: 10, hasMore: false
  // (Under old code, it would return totalCount: 40 because it queried both team-a and team-b!)
  const batchB = simulateBatchQuery('Leader', authorizedTeams, 'team-b', 0, 20);
  assert.equal(batchB.totalCount, 10, 'Total count for Team B must be 10, not 40');
  assert.equal(batchB.items.length, 10, 'Must return 10 items');
  assert.equal(batchB.hasMore, false, 'hasMore must be false when items <= limit');
  assert.ok(batchB.items.every((u) => u.team_id === 'team-b'), 'All items must belong to team-b');

  // Case B: Leader queries Team A (30 users total, page 1: offset 0, limit 20)
  const batchA_p1 = simulateBatchQuery('Leader', authorizedTeams, 'team-a', 0, 20);
  assert.equal(batchA_p1.totalCount, 30, 'Total count for Team A must be 30');
  assert.equal(batchA_p1.items.length, 20, 'Page 1 must have 20 items');
  assert.equal(batchA_p1.hasMore, true, 'hasMore must be true for Page 1 of Team A');
  assert.ok(batchA_p1.items.every((u) => u.team_id === 'team-a'), 'All items must belong to team-a');

  // Case C: Leader queries Team A (30 users total, page 2: offset 20, limit 20)
  const batchA_p2 = simulateBatchQuery('Leader', authorizedTeams, 'team-a', 20, 20);
  assert.equal(batchA_p2.totalCount, 30, 'Total count for Team A must remain 30 on Page 2');
  assert.equal(batchA_p2.items.length, 10, 'Page 2 must have remaining 10 items');
  assert.equal(batchA_p2.hasMore, false, 'hasMore must be false on last page of Team A');
  assert.ok(batchA_p2.items.every((u) => u.team_id === 'team-a'), 'All items must belong to team-a');

  // Case D: Leader queries unauthorized Team C
  const batchC = simulateBatchQuery('Leader', authorizedTeams, 'team-c', 0, 20);
  assert.equal(batchC.totalCount, 0, 'Unauthorized team request must fail closed with 0 count');
  assert.equal(batchC.items.length, 0, 'Unauthorized team request must fail closed with 0 items');
  assert.equal(batchC.hasMore, false);

  // Case E: Leader queries all authorized teams (teamId: undefined)
  const batchAll = simulateBatchQuery('Leader', authorizedTeams, undefined, 0, 20);
  assert.equal(batchAll.totalCount, 40, 'Total count for all authorized teams must be 30 + 10 = 40');
  assert.equal(batchAll.items.length, 20);
  assert.equal(batchAll.hasMore, true);
  assert.ok(batchAll.items.every((u) => u.team_id === 'team-a' || u.team_id === 'team-b'));

  // 3.6 Verify src/lib/db/users-admin.ts source code implementation
  const usersAdminSrc = readProjectFile('src/lib/db/users-admin.ts');
  assert.ok(
    usersAdminSrc.includes('export function resolveLeaderEffectiveTeamFilter'),
    'src/lib/db/users-admin.ts must export resolveLeaderEffectiveTeamFilter'
  );
  assert.ok(
    usersAdminSrc.includes('const leaderFilter = resolveLeaderEffectiveTeamFilter(teamId, leaderTeamIds);'),
    'getUsersBatchAdmin must resolve leaderFilter before query execution'
  );
  assert.ok(
    usersAdminSrc.includes("query = query.eq('team_id', leaderFilter.effectiveTeamId);"),
    'getUsersBatchAdmin must filter by eq(team_id) when effectiveTeamId is present'
  );
  assert.ok(
    usersAdminSrc.includes("query = query.in('team_id', leaderFilter.effectiveTeamIds);"),
    'getUsersBatchAdmin must filter by in(team_id) across authorized teams when no teamId is specified'
  );

  console.log('  PASS: Leader selected-team filtering, pagination boundaries, and fail-closed RBAC');
}

console.log('\n=== ALL P104M1T02 OUTPUT / DATA CORRECTNESS REGRESSION CHECKS PASSED ===');
