'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  History,
  ArrowLeft,
  Lock,
  Calendar,
  Award,
  CheckCircle2,
  MessageSquareQuote,
  ChevronDown,
  ChevronUp,
  User as UserIcon,
  FileText,
} from 'lucide-react';
import { User } from '@/types';
import { roleLabel, isIndividualRole } from '@/lib/role-policy';
import type { EvaluationHistoryEntry } from '@/lib/db/evaluation-history-admin';

interface EvaluationHistoryPageProps {
  target: User | null;
  entries: EvaluationHistoryEntry[];
  viewer?: User | null;
}

function getGradeBadgeColor(grade?: string): string {
  switch (grade) {
    case 'S':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'A':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'AB':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'B':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'C':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'D':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-surface-muted text-ink-muted border-outline-soft';
  }
}

export default function EvaluationHistoryPage({
  target,
  entries,
  viewer,
}: EvaluationHistoryPageProps) {
  const [expandedEvaluationIds, setExpandedEvaluationIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedEvaluationIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const backHref = isIndividualRole(viewer?.role)
    ? `/evaluations/${viewer?.id || ''}`
    : '/employees';

  const backLabel = isIndividualRole(viewer?.role)
    ? 'Quay lại phiếu đánh giá của tôi'
    : 'Quay lại danh sách nhân viên';

  // Case 1: Target not found or access denied
  if (!target) {
    return (
      <div className="px-4 sm:px-6 md:px-10 lg:px-12 py-6 md:py-8 lg:py-6 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
        <Link
          prefetch={false}
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted hover:text-brand transition-colors"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </Link>

        <div className="bg-surface-raised rounded-2xl border border-outline-soft p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-surface-muted border border-outline-soft flex items-center justify-center mx-auto text-ink-muted">
            <UserIcon size={28} />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-ink">Không tìm thấy thông tin nhân viên</h2>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              Nhân viên không tồn tại hoặc bạn không có quyền truy cập lịch sử đánh giá này.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 md:px-10 lg:px-12 py-6 md:py-8 lg:py-6 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Top navigation & Read-only Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          prefetch={false}
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted hover:text-brand transition-colors"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </Link>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-surface-muted text-ink-muted border border-outline-soft shadow-2xs">
            <Lock size={13} className="text-ink-muted" />
            Chỉ xem
          </span>
          {target && (
            <Link
              prefetch={false}
              href={`/evaluations/${target.id}`}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-brand hover:bg-brand-soft border border-brand/20 transition-colors"
              title="Đến trang đánh giá hiện tại"
            >
              <FileText size={13} />
              Phiếu hiện tại
            </Link>
          )}
        </div>
      </div>

      {/* Target Identity Header */}
      <div className="bg-surface-raised rounded-2xl p-5 sm:p-6 border border-outline-soft shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-brand-soft border border-brand-mid/20 flex items-center justify-center font-bold text-lg text-brand-strong shrink-0">
              {target.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">
                  Lịch sử đánh giá
                </h1>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-surface-muted text-ink border border-outline-soft">
                  {target.name}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
                <span>Mã NV: <strong className="text-ink font-semibold">{target.employeeCode || target.id.slice(0, 8)}</strong></span>
                <span>•</span>
                <span>Vai trò: <strong className="text-ink font-semibold">{roleLabel(target.role)}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-muted text-xs font-semibold text-ink-muted border border-outline-soft">
              <History size={14} className="text-brand" />
              {entries.length} kỳ đã đóng
            </span>
          </div>
        </div>
      </div>

      {/* Evaluation History List */}
      <div className="space-y-4">
        {entries.length === 0 ? (
          <div className="bg-surface-raised rounded-2xl border border-outline-soft p-8 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-surface-muted border border-outline-soft flex items-center justify-center mx-auto text-ink-muted">
              <History size={22} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-ink">Chưa có lịch sử đánh giá</h3>
              <p className="text-xs sm:text-sm text-ink-muted max-w-md mx-auto">
                Chưa có kỳ đánh giá nào đã hoàn tất (trạng thái Approved và kỳ Closed) đối với nhân viên này.
              </p>
            </div>
          </div>
        ) : (
          entries.map(({ evaluation, period }) => {
            const isExpanded = !!expandedEvaluationIds[evaluation.id];
            const gradeColor = getGradeBadgeColor(evaluation.finalGrade);

            return (
              <div
                key={evaluation.id}
                className="bg-surface-raised rounded-2xl border border-outline-soft hover:border-brand/30 transition-all shadow-sm overflow-hidden"
              >
                {/* Period & Result Header Card */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-soft/60 bg-surface-muted/30">
                  <div className="flex items-start sm:items-center gap-3.5">
                    {/* Final Grade Badge */}
                    <div
                      className={`w-12 h-12 rounded-xl border flex flex-col items-center justify-center font-black text-lg shadow-2xs shrink-0 ${gradeColor}`}
                      title={`Xếp loại: ${evaluation.finalGrade || 'Chưa xếp loại'}`}
                    >
                      {evaluation.finalGrade || '—'}
                      <span className="text-[9px] font-bold opacity-75 uppercase -mt-1">Hạng</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base sm:text-lg font-bold text-ink">
                          {period.name}
                        </h2>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-surface-muted text-ink-muted border border-outline-soft">
                          Năm {period.year}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          Kỳ đã đóng
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted mt-1 flex items-center gap-2 flex-wrap">
                        <span>
                          Điểm tổng kết:{' '}
                          <strong className="text-ink font-bold text-sm">
                            {evaluation.finalScore ?? '—'}
                          </strong>
                        </span>
                        {evaluation.updatedAt && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              {new Date(evaluation.updatedAt).toLocaleDateString('vi-VN')}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    {evaluation.resultMessage && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(evaluation.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-raised border border-outline-soft text-xs font-semibold text-ink hover:text-brand hover:border-brand/30 transition-colors"
                      >
                        <MessageSquareQuote size={14} className="text-brand" />
                        <span>{isExpanded ? 'Ẩn nhận xét' : 'Xem nhận xét'}</span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Result Message (if expanded or present) */}
                {isExpanded && evaluation.resultMessage && (
                  <div className="p-4 sm:p-5 bg-surface-muted/50 border-b border-outline-soft/60 animate-in fade-in duration-150">
                    <div className="p-3.5 rounded-xl bg-surface-raised border border-brand-mid/20 text-xs sm:text-sm text-ink leading-relaxed whitespace-pre-wrap">
                      <p className="font-bold text-brand-strong mb-1.5 flex items-center gap-1.5">
                        <MessageSquareQuote size={15} className="text-brand" />
                        Nhận xét chung kỳ này:
                      </p>
                      {evaluation.resultMessage}
                    </div>
                  </div>
                )}

                {/* Round Details Summary */}
                <div className="p-4 sm:p-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                    <Award size={14} className="text-brand" />
                    Chi tiết các vòng đánh giá
                  </h3>

                  {evaluation.rounds && evaluation.rounds.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {evaluation.rounds.map((round) => (
                        <div
                          key={round.id || round.round}
                          className="p-3 rounded-xl bg-surface-muted/60 border border-outline-soft space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-ink">
                              Vòng {round.round}: {roleLabel(round.evaluatorRole)}
                            </span>
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 size={10} />
                              Đã hoàn tất
                            </span>
                          </div>

                          <div className="flex items-baseline justify-between pt-1 border-t border-outline-soft/60 text-xs">
                            <span className="text-ink-muted">Điểm vòng:</span>
                            <span className="font-bold text-ink text-sm">
                              {round.totalScore ?? '—'}
                              {round.grade && (
                                <span className="ml-1.5 text-xs text-brand font-bold">
                                  ({round.grade})
                                </span>
                              )}
                            </span>
                          </div>

                          {round.submittedAt && (
                            <p className="text-[10px] text-ink-muted">
                              Thời gian: {new Date(round.submittedAt).toLocaleDateString('vi-VN')}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted italic">
                      Không có chi tiết vòng cho kỳ này.
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
