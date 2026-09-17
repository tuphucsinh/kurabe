'use client';

import type {
  User,
  Team,
  Evaluation,
  EvaluationDisplayDto,
  ExportEvaluationsOptions,
  XlsxExportApi,
} from '@/types';
import type { WorkBook } from 'xlsx';

/**
 * Format a criterion column header preserving both its historical ID and label.
 * Example: `[crit-uuid-1] Kỹ năng chuyên môn`
 */
export function formatCriterionColumnKey(id: string, label: string): string {
  return `[${id}] ${label}`;
}

/**
 * Format a legacy unknown criterion column header where the historical label is unknown.
 * Example: `[crit-uuid-1] (legacy_unknown)`
 */
export function formatLegacyCriterionColumnKey(id: string): string {
  return `[${id}] (legacy_unknown)`;
}

/**
 * Prepares rows for Sheet 1: Summary ("Tổng Hợp").
 * Preserves valid final score 0 with nullish semantics (finalScore ?? '').
 */
export function buildExportSummaryRows(
  evaluations: Evaluation[],
  userMap: Map<string, User>,
  teamMap: Map<string, Team>
): Array<Record<string, string | number | null>> {
  return evaluations.map((ev) => {
    const employee = userMap.get(ev.employeeId);
    const team = ev.teamId ? teamMap.get(ev.teamId) : null;

    return {
      'Mã Nhân Viên': employee?.employeeCode || '',
      'Họ Tên': employee?.name || '',
      'Team': team?.name || '',
      'Chức Vụ': ev.employeeRole,
      'Trạng Thái': ev.status,
      'Điểm Tổng': ev.finalScore !== undefined && ev.finalScore !== null ? ev.finalScore : '',
      'Xếp Loại': ev.finalGrade || '',
    };
  });
}

/**
 * Prepares rows for Sheet 2: Round Details ("Chi Tiết Vòng").
 *
 * Requirements:
 * - Uses each round's pinned criteria snapshot/version from EvaluationDisplayDto.
 * - Preserves historical criterion ID and label in column headers (`[id] label`).
 * - Never silently falls back to current/live criteria.
 * - Legacy unknown snapshots are explicit (`legacy_unknown`).
 * - Preserves numeric score 0 without truthiness loss (`score ?? null`).
 * - Supports multiple criteria versions across evaluations/rounds.
 */
export function buildExportDetailRows(
  evaluations: Evaluation[],
  userMap: Map<string, User>,
  displayDtoMap?: Map<string, EvaluationDisplayDto> | Record<string, EvaluationDisplayDto>
): Array<Record<string, string | number | null>> {
  const getDto = (evaluationId: string): EvaluationDisplayDto | undefined => {
    if (!displayDtoMap) return undefined;
    if (displayDtoMap instanceof Map) return displayDtoMap.get(evaluationId);
    return displayDtoMap[evaluationId];
  };

  // Pass 1: Discover all distinct criteria across all authoritative rounds, plus any legacy score keys.
  // Order: by first appearance in pinned versions, preserving sortOrder and groupId.
  const orderedCriteriaColumns: string[] = [];
  const seenCriteriaColumns = new Set<string>();

  for (const ev of evaluations) {
    const dto = getDto(ev.id);
    for (const round of ev.rounds || []) {
      const displayRound = dto?.rounds.find((r) => r.round === round.round);
      const snapshotState =
        displayRound?.snapshotState ??
        round.criteriaSnapshotState ??
        (round.criteriaConfigVersionId ? 'authoritative' : 'legacy_unknown');

      if (snapshotState === 'authoritative' && displayRound?.criteriaGroups) {
        for (const group of displayRound.criteriaGroups) {
          for (const criterion of group.criteria || []) {
            const colKey = formatCriterionColumnKey(criterion.id, criterion.name);
            if (!seenCriteriaColumns.has(colKey)) {
              seenCriteriaColumns.add(colKey);
              orderedCriteriaColumns.push(colKey);
            }
          }
        }
      } else if (snapshotState === 'legacy_unknown') {
        for (const scoreId of Object.keys(round.scores || {})) {
          const colKey = formatLegacyCriterionColumnKey(scoreId);
          if (!seenCriteriaColumns.has(colKey)) {
            seenCriteriaColumns.add(colKey);
            orderedCriteriaColumns.push(colKey);
          }
        }
      }
    }
  }

  // Pass 2: Build row objects with deterministic column population.
  const detailData: Record<string, string | number | null>[] = [];

  for (const ev of evaluations) {
    const employee = userMap.get(ev.employeeId);
    const dto = getDto(ev.id);

    for (const round of ev.rounds || []) {
      const displayRound = dto?.rounds.find((r) => r.round === round.round);
      const snapshotState =
        displayRound?.snapshotState ??
        round.criteriaSnapshotState ??
        (round.criteriaConfigVersionId ? 'authoritative' : 'legacy_unknown');
      const versionId =
        displayRound?.criteriaConfigVersionId ??
        round.criteriaConfigVersionId ??
        (snapshotState === 'legacy_unknown' ? 'legacy_unknown' : 'unavailable');

      const row: Record<string, string | number | null> = {
        'Mã Nhân Viên': employee?.employeeCode || '',
        'Họ Tên': employee?.name || '',
        'Vòng': round.round,
        'Người Đánh Giá': userMap.get(round.evaluatorId)?.name || 'N/A',
        'Vai Trò ĐG': round.evaluatorRole,
        'Điểm Vòng': round.totalScore ?? 0,
        'Xếp Loại Vòng': round.grade || '',
        'Nhận Xét': round.comment || '',
        'Trạng Thái Snapshot': snapshotState,
        'Phiên Bản Tiêu Chí': versionId,
      };

      if (snapshotState === 'authoritative' && displayRound?.criteriaGroups) {
        const roundCriteria = displayRound.criteriaGroups.flatMap((g) => g.criteria || []);
        const roundCriteriaMap = new Map(roundCriteria.map((c) => [c.id, formatCriterionColumnKey(c.id, c.name)]));

        for (const colKey of orderedCriteriaColumns) {
          let foundCriterionId: string | null = null;
          for (const [cId, cColKey] of roundCriteriaMap.entries()) {
            if (cColKey === colKey) {
              foundCriterionId = cId;
              break;
            }
          }

          if (foundCriterionId !== null) {
            const rawScore = round.scores ? round.scores[foundCriterionId] : undefined;
            row[colKey] = rawScore !== undefined && rawScore !== null ? rawScore : null;
          } else {
            row[colKey] = null;
          }
        }
      } else {
        // legacy_unknown or unavailable: DO NOT silently fall back to live criteria!
        for (const colKey of orderedCriteriaColumns) {
          if (snapshotState === 'legacy_unknown') {
            let legacyMatchId: string | null = null;
            for (const scoreId of Object.keys(round.scores || {})) {
              if (formatLegacyCriterionColumnKey(scoreId) === colKey) {
                legacyMatchId = scoreId;
                break;
              }
            }
            if (legacyMatchId !== null) {
              const rawScore = round.scores[legacyMatchId];
              row[colKey] = rawScore !== undefined && rawScore !== null ? rawScore : null;
            } else {
              row[colKey] = null;
            }
          } else {
            row[colKey] = null;
          }
        }
      }

      detailData.push(row);
    }
  }

  return detailData;
}

/**
 * Builds an in-memory XLSX workbook from evaluation and display data.
 */
export function buildExportWorkbook(
  evaluations: Evaluation[],
  users: User[],
  teams: Team[],
  options: Pick<ExportEvaluationsOptions, 'includeRoundDetails' | 'displayDtos'> & {
    XLSX?: XlsxExportApi;
  } = {}
): WorkBook {
  const XLSX = options.XLSX;
  if (!XLSX) {
    throw new Error('XLSX library must be provided to buildExportWorkbook');
  }

  const userMap = new Map<string, User>(users.map((u) => [u.id, u]));
  const teamMap = new Map<string, Team>(teams.map((t) => [t.id, t]));

  // Sheet 1: Summary
  const summaryData = buildExportSummaryRows(evaluations, userMap, teamMap);
  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng Hợp');

  // Sheet 2: Detail
  if (options.includeRoundDetails) {
    const detailData = buildExportDetailRows(evaluations, userMap, options.displayDtos);
    const wsDetail = XLSX.utils.json_to_sheet(detailData);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Chi Tiết Vòng');
  }

  return wb;
}

/**
 * Xuất dữ liệu đánh giá của một kỳ ra file Excel.
 * Dùng các Server Actions được phân quyền để đọc an toàn.
 * Sử dụng snapshot tiêu chí lịch sử của từng round (F02) và bảo toàn điểm 0 hợp lệ (F03).
 */
export async function exportEvaluationsToExcel(
  periodId: string,
  options: ExportEvaluationsOptions = {}
): Promise<void> {
  try {
    const XLSX = options.XLSX ?? (await import('xlsx'));

    let evaluations = options.evaluations;
    let users = options.users;
    let teams = options.teams;
    let periodData = options.periodData;

    if (!evaluations || !users || !teams || periodData === undefined) {
      const readActions = await import('@/actions/read');
      const [fetchedEvals, fetchedUsers, fetchedTeams, fetchedPeriod] = await Promise.all([
        evaluations ? Promise.resolve(evaluations) : readActions.getEvaluationsAction(periodId),
        users ? Promise.resolve(users) : readActions.getUsersAction(),
        teams ? Promise.resolve(teams) : readActions.getTeamsAction(),
        periodData !== undefined ? Promise.resolve(periodData) : readActions.getPeriodByIdAction(periodId),
      ]);
      evaluations = fetchedEvals;
      users = fetchedUsers;
      teams = fetchedTeams;
      periodData = fetchedPeriod;
    }

    const periodName = periodData ? periodData.name : 'KyDanhGia';

    // Build or reuse displayDtoMap for pinned criteria snapshots
    const displayDtoMap = new Map<string, EvaluationDisplayDto>();
    if (options.displayDtos) {
      if (options.displayDtos instanceof Map) {
        for (const [k, v] of options.displayDtos.entries()) {
          displayDtoMap.set(k, v);
        }
      } else {
        for (const [k, v] of Object.entries(options.displayDtos)) {
          displayDtoMap.set(k, v);
        }
      }
    } else if (options.includeRoundDetails) {
      const readActions = await import('@/actions/read');
      const dtoList = await Promise.all(
        evaluations.map(async (ev) => {
          try {
            const dto = await readActions.getEvaluationDisplayAction(ev.id);
            return [ev.id, dto] as const;
          } catch (err) {
            console.error(`Error loading evaluation display for ${ev.id}:`, err);
            return [ev.id, null] as const;
          }
        })
      );
      for (const [evId, dto] of dtoList) {
        if (dto) displayDtoMap.set(evId, dto);
      }
    }

    const wb = buildExportWorkbook(evaluations, users, teams, {
      includeRoundDetails: options.includeRoundDetails,
      displayDtos: displayDtoMap,
      XLSX,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `Kurabe_${periodName.replace(/\s+/g, '_')}_${timestamp}.xlsx`;
    XLSX.writeFile(wb, fileName);
  } catch (error) {
    console.error('Lỗi khi xuất file Excel:', error);
    throw error;
  }
}
