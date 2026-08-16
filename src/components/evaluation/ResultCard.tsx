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
    <div className="bg-gradient-to-br from-white via-indigo-50/20 to-blue-50/20 rounded-3xl p-6 md:p-8 border border-indigo-100 shadow-md space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-indigo-100/80 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold mb-2">
            <CheckCircle2 size={13} />
            <span>Kết quả chính thức đã phê duyệt</span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
            Thông báo Kết quả Đánh giá Năng lực
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Dành cho nhân sự: <span className="font-semibold text-slate-700">{employee.name}</span> ({employee.employeeCode})
            {evaluation.updatedAt && ` • Ngày duyệt: ${new Date(evaluation.updatedAt).toLocaleDateString('vi-VN')}`}
          </p>
        </div>

        {/* Big Grade Badge & Score */}
        <div className="flex items-center gap-4 bg-white px-5 py-3 rounded-2xl border border-indigo-100 shadow-sm shrink-0">
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Điểm tổng kết</p>
            <p className="text-2xl font-black text-slate-900 leading-none mt-0.5">
              {evaluation.finalScore ?? totalScore} <span className="text-sm font-semibold text-slate-500">điểm</span>
            </p>
          </div>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner ${gradeBadgeClass(evaluation.finalGrade || grade, 'solid')}`}>
            {evaluation.finalGrade || grade || '-'}
          </div>
        </div>
      </div>

      {/* Giải thích xếp loại & ngưỡng điểm & lời động viên */}
      {(() => {
        const finalGradeVal = evaluation.finalGrade || grade;
        const explanation = finalGradeVal ? GRADE_EXPLANATION[finalGradeVal] : null;
        if (!explanation) return null;

        const roleGroup = isLeaderGradingRole(employee.role) ? 'leader' : 'staff';
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
          <div className="p-4 bg-white/90 rounded-2xl border border-indigo-100/80 text-sm text-slate-700 leading-relaxed flex items-start gap-3 shadow-2xs">
            <Sparkles size={18} className="text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900">
                Xếp loại {finalGradeVal}: <span className="text-indigo-700 font-bold">{explanation}</span>
                {thresholdText ? ` (${thresholdText})` : ''}.
              </p>
              <p className="text-xs text-slate-600 mt-1 font-medium">
                Chúc anh/chị tiếp tục phát huy trong kỳ tới!
              </p>
            </div>
          </div>
        );
      })()}

      {/* Thông báo kết quả từ Quản lý (resultMessage) */}
      {evaluation.resultMessage && (
        <div className="bg-sky-50/90 border border-sky-200 rounded-2xl p-5 shadow-2xs space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-800">
            <MessageSquareQuote size={16} className="text-sky-600" />
            <span>Nhận xét & Định hướng từ Ban Quản lý</span>
          </div>
          <p className="text-sm text-sky-950 leading-relaxed whitespace-pre-wrap font-medium">
            {evaluation.resultMessage}
          </p>
        </div>
      )}
    </div>
  );
}
