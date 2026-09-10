export type GradeBandsInput = {
  roleGroup: 'leader' | 'staff' | 'worker';
  grade: string;
  minScore: number | null;
  maxScore: number | null;
  sortOrder?: number;
  version?: number;
};

export const VALID_GRADES = ['S', 'A', 'AB', 'B', 'C', 'D'] as const;
const VALID_GROUPS = ['leader', 'staff', 'worker'] as const;
const GROUP_NAMES: Record<(typeof VALID_GROUPS)[number], string> = {
  leader: 'Quản lý',
  staff: 'Nhân viên',
  worker: 'Công nhân',
};

/**
 * Validate one complete, contiguous configuration snapshot. The DB RPC repeats
 * these predicates because the browser is never the authority for scoring config.
 */
export function validateGradeBands(bands: GradeBandsInput[]): string | null {
  if (!Array.isArray(bands) || bands.length !== 18) {
    return 'Dữ liệu thang điểm phải có đúng 18 dòng.';
  }

  for (const group of VALID_GROUPS) {
    const groupName = GROUP_NAMES[group];
    const rows = bands.filter((band) => band.roleGroup === group);
    if (rows.length !== VALID_GRADES.length) {
      return `Nhóm ${groupName} phải có đủ 6 xếp loại.`;
    }

    const grades = rows.map((row) => row.grade);
    if (new Set(grades).size !== VALID_GRADES.length || grades.some((grade) => !VALID_GRADES.includes(grade as (typeof VALID_GRADES)[number]))) {
      return `Nhóm ${groupName} phải có đúng các xếp loại S, A, AB, B, C, D.`;
    }

    const ordered = [...rows].sort(
      (a, b) => VALID_GRADES.indexOf(a.grade as (typeof VALID_GRADES)[number]) - VALID_GRADES.indexOf(b.grade as (typeof VALID_GRADES)[number])
    );
    for (let index = 0; index < ordered.length; index += 1) {
      const row = ordered[index];
      if (row.minScore !== null && (!Number.isFinite(row.minScore) || !Number.isInteger(row.minScore) || Math.abs(row.minScore) > 1_000_000)) {
        return `Xếp loại ${row.grade} (${groupName}) có điểm tối thiểu không hợp lệ.`;
      }
      if (row.maxScore !== null && (!Number.isFinite(row.maxScore) || !Number.isInteger(row.maxScore) || Math.abs(row.maxScore) > 1_000_000)) {
        return `Xếp loại ${row.grade} (${groupName}) có điểm tối đa không hợp lệ.`;
      }
      if (row.minScore !== null && row.maxScore !== null && row.minScore > row.maxScore) {
        return `Xếp loại ${row.grade} (${groupName}): min không được lớn hơn max.`;
      }
      if (row.grade === 'S' && row.maxScore !== null) {
        return `Xếp loại S (${groupName}) phải là dải mở phía trên.`;
      }
      if (row.grade === 'D' && row.minScore !== null) {
        return `Xếp loại D (${groupName}) phải là dải bắt đáy.`;
      }
      if (row.grade !== 'S' && row.grade !== 'D' && (row.minScore === null || row.maxScore === null)) {
        return `Xếp loại ${row.grade} (${groupName}) phải có đủ min và max.`;
      }
      const next = ordered[index + 1];
      if (next && (row.minScore === null || next.maxScore === null || next.maxScore !== row.minScore - 1)) {
        return `Xếp loại ${row.grade} và ${next.grade} (${groupName}): dải điểm phải liền nhau, không gap/overlap.`;
      }
      if (row.sortOrder !== undefined && row.sortOrder !== index) {
        return `Thứ tự xếp loại ${row.grade} (${groupName}) không hợp lệ.`;
      }
    }
  }

  return null;
}
