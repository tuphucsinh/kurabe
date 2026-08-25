import React from 'react';

/**
 * Map màu grade DÙNG CHUNG toàn app (D2 — 1 nguồn sự thật, bỏ các chuỗi ternary rải rác).
 * - soft: pill nhạt cho badge trong bảng/danh sách.
 * - solid: pill đậm cho kết quả nổi bật (header phiếu, thẻ so sánh).
 */
export const GRADE_BADGE_STYLES: Record<string, { soft: string; solid: string }> = {
  S: { soft: 'bg-indigo-100 text-indigo-700', solid: 'bg-indigo-600 text-white' },
  A: { soft: 'bg-emerald-100 text-emerald-700', solid: 'bg-teal-600 text-white' },
  AB: { soft: 'bg-teal-100 text-teal-700', solid: 'bg-teal-600 text-white' },
  B: { soft: 'bg-blue-100 text-blue-700', solid: 'bg-blue-600 text-white' },
  C: { soft: 'bg-amber-100 text-amber-700', solid: 'bg-amber-500 text-white' },
  D: { soft: 'bg-rose-100 text-rose-700', solid: 'bg-rose-600 text-white' },
};

const FALLBACK_STYLES = {
  soft: 'bg-surface-muted text-ink-muted',
  solid: 'bg-brand-strong text-white',
};

/** Lấy class màu cho grade; giá trị lạ/null → fallback xám. */
export function gradeBadgeClass(
  grade: string | null | undefined,
  variant: 'soft' | 'solid' = 'soft'
): string {
  const style = grade ? GRADE_BADGE_STYLES[grade] : undefined;
  return style?.[variant] ?? FALLBACK_STYLES[variant];
}

interface GradeBadgeProps {
  grade: string | null | undefined;
  variant?: 'soft' | 'solid';
  /** Class bổ sung (size, ring...) — nối vào class màu */
  className?: string;
  /** Mặc định hiển thị grade; truyền children để override (vd '-') */
  children?: React.ReactNode;
}

export default function GradeBadge({ grade, variant = 'soft', className = '', children }: GradeBadgeProps) {
  return (
    <span className={`${gradeBadgeClass(grade, variant)}${className ? ' ' + className : ''}`}>
      {children ?? (grade || '-')}
    </span>
  );
}
