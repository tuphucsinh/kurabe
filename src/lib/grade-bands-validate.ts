export type GradeBandsInput = {
  roleGroup: 'leader' | 'staff';
  grade: string;
  minScore: number | null;
  maxScore: number | null;
};

export const VALID_GRADES = ['S', 'A', 'AB', 'B', 'C', 'D'] as const;

/** Kiểm tra dải điểm không chồng lấn + thứ tự đúng (S > A > AB > B > C > D). Dùng chung client (UI) + server (action). */
export function validateGradeBands(bands: GradeBandsInput[]): string | null {
  for (const group of ['leader', 'staff'] as const) {
    const rows = bands
      .filter((b) => b.roleGroup === group)
      .sort((a, b) => VALID_GRADES.indexOf(a.grade as (typeof VALID_GRADES)[number]) - VALID_GRADES.indexOf(b.grade as (typeof VALID_GRADES)[number]));

    if (rows.length !== 6) {
      return `Nhóm ${group === 'leader' ? 'Quản lý' : 'Nhân viên'} phải có đủ 6 xếp loại.`;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!VALID_GRADES.includes(row.grade as (typeof VALID_GRADES)[number])) {
        return `Xếp loại không hợp lệ: ${row.grade}.`;
      }
      if (row.minScore !== null && row.maxScore !== null && row.minScore > row.maxScore) {
        return `Xếp loại ${row.grade} (${group === 'leader' ? 'Quản lý' : 'Nhân viên'}): min không được lớn hơn max.`;
      }
      // Quy ước null duy nhất (A2): minScore null = catch-all → CHỈ band thấp nhất (D) được null min.
      // Band khác null min sẽ nuốt mọi điểm không match → phân hạng sai.
      if (row.minScore === null && i !== rows.length - 1) {
        return `Xếp loại ${row.grade} (${group === 'leader' ? 'Quản lý' : 'Nhân viên'}): chỉ xếp loại thấp nhất (${VALID_GRADES[VALID_GRADES.length - 1]}) được bỏ trống điểm tối thiểu.`;
      }
      // Không chồng lấn với grade kế tiếp: dải grade sau (next) phải nằm DƯỚI dải grade hiện tại
      // → next.maxScore < current.minScore (ví dụ A 160-169, AB 130-159: AB.max=159 < A.min=160 ✓)
      const next = rows[i + 1];
      if (
        next &&
        next.maxScore !== null &&
        row.minScore !== null &&
        next.maxScore >= row.minScore
      ) {
        return `Xếp loại ${row.grade} và ${next.grade} (${group === 'leader' ? 'Quản lý' : 'Nhân viên'}): dải điểm chồng lấn.`;
      }
    }
  }
  return null;
}
