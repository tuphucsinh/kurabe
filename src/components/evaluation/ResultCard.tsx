'use client';

import { CheckCircle2, Sparkles, MessageSquareQuote } from 'lucide-react';
import { User } from '@/types';
import { Evaluation, Grade } from '@/types';
import { GradeBands } from '@/lib/grade-bands';
import { isLeaderGradingRole } from '@/lib/evaluation-workflow';
import { gradeBadgeClass } from '@/components/ui/GradeBadge';

const GRADE_EXPLANATION: Record<string, string> = {
  S: 'Xuất sắc',
  AB: 'Tốt',
  B: 'Đáp ứng tốt yêu cầu',
  C: 'Cần cải thiện',
};

interface ResultCardProps {
  employee: User;
  evaluation: Evaluation;
  totalScore: number;
  grade: Grade;
  gradeBands: GradeBands;
}

/** Card "Thông báo Kết quả Đánh giá" cho Employee owner khi phiếu đã Approved (D3 — tách khỏi page). */
export default function ResultCard({ employee, evaluation, totalScore, grade, gradeBands }: ResultCardProps) {
  return (
    <div className="bg-surface-raised rounded-2xl p-4 sm:p-5 md:p-6 border border-outline-soft shadow-2xs space-y-4">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-outline-soft/70 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold mb-1.5">
            <CheckCircle2 size={13} />
            <span>Kết quả chính thức đã phê duyệt</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-ink tracking-tight">
            Thông báo Kết quả Đánh giá Năng lực
          </h2>
          <p className="text-xs sm:text-sm text-ink-muted mt-0.5">
            Dành cho nhân sự: <span className="font-semibold text-ink">{employee.name}</span> ({employee.employeeCode})
            {evaluation.updatedAt && ` • Ngày duyệt: ${new Date(evaluation.updatedAt).toLocaleDateString('vi-VN')}`}
          </p>
        </div>

        {/* Grade Badge & Score */}
        <div className="flex items-center gap-3 bg-surface-muted/60 px-4 py-2 rounded-xl border border-outline-soft shrink-0">
          <div className="text-right">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-ink-muted">Điểm tổng kết</p>
            <p className="text-xl sm:text-2xl font-black text-ink leading-none mt-0.5">
              {evaluation.finalScore ?? totalScore} <span className="text-xs sm:text-sm font-semibold text-ink-muted">điểm</span>
            </p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-2xs ${gradeBadgeClass(evaluation.finalGrade || grade, 'solid')}`}>
            {evaluation.finalGrade || grade || '-'}
          </div>
        </div>
      </div>

      {/* Giải thích xếp loại & ngưỡng điểm & lời động viên */}
      {(() => {
        const finalGradeVal = evaluation.finalGrade || grade;
        const explanation = finalGradeVal ? GRADE_EXPLANATION[finalGradeVal] : null;
        if (!explanation) return null;

        const roleGroup: keyof GradeBands = employee.role === 'Worker'
          ? 'worker'
          : isLeaderGradingRole(employee.role)
          ? 'leader'
          : 'staff';
        const bands = gradeBands[roleGroup];
        const band = bands.find((b) => b.grade === finalGradeVal);
        let thresholdText = '';
        if (band) {
          if (band.minScore != null && band.maxScore != null) {
            thresholdText = `từ ${band.minScore} đến ${band.maxScore} điểm`;
          } else if (band.minScore != null) {
            thresholdText = `từ ${band.minScore} điểm trở lên`;
          } else if (band.maxScore != null) {
            thresholdText = `dưới ${band.maxScore + 1} điểm`;
          }
        }

        return (
          <div className="p-3.5 bg-surface-muted/40 rounded-xl border border-outline-soft text-xs sm:text-sm text-ink leading-relaxed flex items-start gap-2.5">
            <Sparkles size={16} className="text-brand shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ink">
                Xếp loại {finalGradeVal}: <span className="text-brand font-bold">{explanation}</span>
                {thresholdText ? ` (${thresholdText})` : ''}.
              </p>
              <p className="text-xs text-ink-muted mt-0.5 font-medium">
                Chúc anh/chị tiếp tục phát huy trong kỳ tới!
              </p>
            </div>
          </div>
        );
      })()}

      {/* Thông báo kết quả từ Quản lý (resultMessage) */}
      {evaluation.resultMessage && (
        <div className="bg-brand-soft/40 border border-brand/20 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand">
            <MessageSquareQuote size={15} className="text-brand" />
            <span>Nhận xét & Định hướng từ Ban Quản lý</span>
          </div>
          <p className="text-xs sm:text-sm text-ink leading-relaxed whitespace-pre-wrap font-normal">
            {evaluation.resultMessage}
          </p>
        </div>
      )}
    </div>
  );
}
