'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Copy,
  Check,
  ChevronRight,
  MessageSquareQuote,
  Eye,
} from 'lucide-react';
import { generateResultMessagesChunkAction, saveResultMessageAction, draftResultMessageAction } from '@/actions/ai';
import { useEvaluations, useUsers, usePeriods, useTeams } from '@/hooks/use-db';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { Evaluation, User } from '@/types';
import { useQueryClient } from '@tanstack/react-query';

interface BatchResultMessageModalProps {
  periodId: string;
}

interface MessageItem {
  evaluationId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  teamName: string;
  role: string;
  grade: string;
  score: number;
  message: string;
  status: 'draft' | 'saving' | 'saved' | 'error';
  error?: string;
}

export default function BatchResultMessageModal({ periodId }: BatchResultMessageModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: evaluations = [], isLoading: isEvalsLoading } = useEvaluations(periodId, user);
  const { data: users = [], isLoading: isUsersLoading } = useUsers(user);
  const { data: periods = [] } = usePeriods();
  const { data: teams = [] } = useTeams(user);

  const currentPeriod = periods.find((p) => p.id === periodId);
  const periodName = currentPeriod ? `${currentPeriod.name} (${currentPeriod.year})` : 'Kỳ đánh giá';

  // State processing
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [messagesList, setMessagesList] = useState<MessageItem[]>([]);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const teamNameMap = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);

  // Approved evaluations in this period
  const approvedEvals = useMemo(() => {
    return evaluations.filter((e) => e.status === 'Approved');
  }, [evaluations]);

  const approvedWithExistingMessage = useMemo(() => {
    return approvedEvals.filter((e) => !!e.resultMessage);
  }, [approvedEvals]);

  const handleOpen = () => {
    setIsOpen(true);
    // Initialize or reset list if not generated yet
    if (messagesList.length === 0 && approvedEvals.length > 0) {
      const initialItems: MessageItem[] = approvedEvals.map((ev) => {
        const emp = userMap.get(ev.employeeId);
        const lastRound = [...(ev.rounds || [])].sort((a, b) => b.round - a.round)[0];
        const grade = ev.finalGrade || lastRound?.grade || '-';
        const score = ev.finalScore ?? lastRound?.totalScore ?? 0;
        return {
          evaluationId: ev.id,
          employeeId: ev.employeeId,
          employeeName: emp?.name || 'Nhân viên',
          employeeCode: emp?.employeeCode || '',
          teamName: emp?.role === 'Manager'
            ? 'Toàn bộ bộ phận'
            : (emp?.teamId ? teamNameMap.get(emp.teamId) : undefined) || 'Chưa phân nhóm',
          role: ev.employeeRole || emp?.role || 'Employee',
          grade,
          score,
          message: ev.resultMessage || '',
          status: ev.resultMessage ? 'saved' : 'draft',
        };
      });
      setMessagesList(initialItems);
    }
  };

  const handleClose = () => {
    if (isGenerating || isSavingAll) {
      if (!confirm('Đang xử lý, bạn có chắc chắn muốn đóng cửa sổ?')) {
        return;
      }
    }
    setIsOpen(false);
  };

  // Generate batch messages
  const handleGenerateBatch = async () => {
    if (!periodId || approvedEvals.length === 0) {
      toast('Không có phiếu đánh giá nào đã hoàn thành (Approved).', 'warning');
      return;
    }

    setIsGenerating(true);
    setProgress({ current: 0, total: approvedEvals.length });

    let offset = 0;
    const limit = 5;
    const allGeneratedMap = new Map<string, { message?: string; ok: boolean; error?: string }>();

    try {
      while (true) {
        const res = await generateResultMessagesChunkAction({
          periodId,
          offset,
          limit,
        });

        if (res.error) {
          toast(res.error, 'error');
          break;
        }

        if (res.items && res.items.length > 0) {
          res.items.forEach((item) => {
            allGeneratedMap.set(item.evaluationId, {
              message: item.message,
              ok: item.ok,
              error: item.error,
            });
          });

          setProgress({
            current: allGeneratedMap.size,
            total: res.total || approvedEvals.length,
          });

          // Update message list
          setMessagesList((prev) =>
            prev.map((item) => {
              const gen = allGeneratedMap.get(item.evaluationId);
              if (!gen) return item;
              if (gen.ok && gen.message) {
                return {
                  ...item,
                  message: gen.message,
                  status: 'draft',
                  error: undefined,
                };
              } else {
                return {
                  ...item,
                  status: 'error',
                  error: gen.error || 'Lỗi tạo thông báo',
                };
              }
            })
          );
        }

        if (res.done || !res.nextOffset || (res.total && res.nextOffset >= res.total)) {
          break;
        }

        offset = res.nextOffset;
      }

      toast(`Hoàn tất soạn thông báo AI cho ${allGeneratedMap.size} nhân sự.`, 'success');
    } catch (err) {
      console.error('Batch generation error:', err);
      toast('Có lỗi xảy ra trong quá trình soạn hàng loạt.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Retry generating a single message
  const handleRetrySingle = async (item: MessageItem) => {
    setRetryingIds((prev) => new Set(prev).add(item.evaluationId));
    try {
      const emp = userMap.get(item.employeeId);
      const ev = approvedEvals.find((e) => e.id === item.evaluationId);
      const lastRound = [...(ev?.rounds || [])].sort((a, b) => b.round - a.round)[0];

      const res = await draftResultMessageAction({
        employeeCode: item.employeeCode,
        name: item.employeeName,
        role: item.role,
        totalScore: item.score,
        grade: item.grade,
        criteriaDetail: [],
        previousComments: (ev?.rounds || [])
          .filter((r) => r.round < (lastRound?.round ?? 0))
          .map((r) => r.comment || '')
          .filter(Boolean),
        notesSummary: '',
        summaryNotes: lastRound?.comment || '',
        periodName,
      });

      if (res.message) {
        setMessagesList((prev) =>
          prev.map((m) =>
            m.evaluationId === item.evaluationId
              ? { ...m, message: res.message!, status: 'draft', error: undefined }
              : m
          )
        );
        toast(`Đã soạn lại thông báo cho ${item.employeeName}`, 'success');
      } else {
        toast(res.error || 'Lỗi khi soạn lại thông báo', 'error');
      }
    } catch (err) {
      console.error('Retry error:', err);
      toast('Lỗi khi soạn lại thông báo', 'error');
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.evaluationId);
        return next;
      });
    }
  };

  // Save a single message
  const handleSaveSingle = async (item: MessageItem) => {
    if (!item.message.trim()) {
      toast('Nội dung thông báo không được để trống.', 'error');
      return;
    }

    setMessagesList((prev) =>
      prev.map((m) => (m.evaluationId === item.evaluationId ? { ...m, status: 'saving' } : m))
    );

    try {
      const res = await saveResultMessageAction({
        evaluationId: item.evaluationId,
        message: item.message.trim(),
      });

      if (res.ok) {
        setMessagesList((prev) =>
          prev.map((m) => (m.evaluationId === item.evaluationId ? { ...m, status: 'saved' } : m))
        );
        toast(`Đã lưu thông báo cho ${item.employeeName}`, 'success');
        queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      } else {
        setMessagesList((prev) =>
          prev.map((m) =>
            m.evaluationId === item.evaluationId
              ? { ...m, status: 'error', error: res.error || 'Lỗi lưu' }
              : m
          )
        );
        toast(`Lỗi lưu: ${res.error}`, 'error');
      }
    } catch (err) {
      console.error('Save error:', err);
      toast('Lỗi khi lưu thông báo.', 'error');
    }
  };

  // Save all messages
  const handleSaveAll = async () => {
    const toSave = messagesList.filter((m) => m.message.trim() && m.status !== 'saved');
    if (toSave.length === 0) {
      toast('Tất cả thông báo đã được lưu trước đó.', 'info');
      return;
    }

    setIsSavingAll(true);
    setSaveProgress({ current: 0, total: toSave.length });

    let savedCount = 0;
    for (let i = 0; i < toSave.length; i++) {
      const item = toSave[i];
      try {
        const res = await saveResultMessageAction({
          evaluationId: item.evaluationId,
          message: item.message.trim(),
        });

        if (res.ok) {
          savedCount++;
          setMessagesList((prev) =>
            prev.map((m) => (m.evaluationId === item.evaluationId ? { ...m, status: 'saved' } : m))
          );
        } else {
          setMessagesList((prev) =>
            prev.map((m) =>
              m.evaluationId === item.evaluationId
                ? { ...m, status: 'error', error: res.error || 'Lỗi lưu' }
                : m
            )
          );
        }
      } catch (err) {
        console.error('Save all item error:', err);
      }
      setSaveProgress({ current: i + 1, total: toSave.length });
    }

    setIsSavingAll(false);
    queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    toast(`Đã lưu thành công ${savedCount}/${toSave.length} thông báo kết quả!`, 'success');
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast('Đã sao chép nội dung thông báo.', 'success');
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={isEvalsLoading || isUsersLoading}
        className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-primary text-white rounded-2xl font-bold shadow-sm hover:opacity-95 active:scale-95 transition-all flex items-center gap-2 text-xs sm:text-sm shrink-0 disabled:opacity-50 w-full sm:w-auto justify-center"
      >
        <Sparkles size={16} className="text-amber-300" />
        <span>Soạn thông báo kết quả (AI)</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-outline-variant">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-[#003449] to-[#0E4B66] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                  <Sparkles className="text-amber-300" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight">Soạn thông báo kết quả hàng loạt (AI)</h2>
                  <p className="text-xs text-white/70">
                    Kỳ: <span className="font-semibold text-white">{periodName}</span> • Tự động cá nhân hóa nhận xét cho nhân sự
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isGenerating || isSavingAll}
                className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sub-header / Status KPI */}
            <div className="bg-slate-50 px-6 py-4 border-b border-outline-variant/60 flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-4 text-xs font-medium text-slate-600 flex-wrap">
                <span className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                  Tổng phiếu Approved: <b className="text-slate-900 font-bold">{approvedEvals.length}</b>
                </span>
                <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-200 shadow-2xs">
                  Đã có thông báo: <b className="font-bold">{approvedWithExistingMessage.length}</b>
                </span>
                <span className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl border border-amber-200 shadow-2xs">
                  Chưa có thông báo: <b className="font-bold">{approvedEvals.length - approvedWithExistingMessage.length}</b>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerateBatch}
                  disabled={isGenerating || isSavingAll || approvedEvals.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Đang soạn ({progress.current}/{progress.total})...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} className="text-amber-300" />
                      <span>{messagesList.some((m) => !!m.message) ? 'Soạn lại toàn bộ (AI)' : 'Bắt đầu soạn hàng loạt'}</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleSaveAll}
                  disabled={isGenerating || isSavingAll || messagesList.filter((m) => m.message && m.status !== 'saved').length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSavingAll ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Đang gửi ({saveProgress.current}/{saveProgress.total})...</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Gửi tất cả thông báo</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Warning banner */}
            <div className="px-6 py-2.5 bg-amber-50/80 border-b border-amber-200/60 flex items-center gap-2 text-xs text-amber-800 shrink-0">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span>
                <b>Lưu ý:</b> Soạn hàng loạt sẽ thực hiện gọi AI cho từng nhân viên theo từng đợt 5 người. Quản lý có thể xem trước và chỉnh sửa nội dung từng người trước khi bấm &quot;Gửi tất cả&quot;.
              </span>
            </div>

            {/* Progress bar if generating or saving */}
            {(isGenerating || isSavingAll) && (
              <div className="w-full bg-slate-100 h-1.5 overflow-hidden shrink-0">
                <div
                  className={`h-full transition-all duration-300 ${
                    isGenerating ? 'bg-indigo-600' : 'bg-emerald-600'
                  }`}
                  style={{
                    width: isGenerating
                      ? `${(progress.current / Math.max(1, progress.total)) * 100}%`
                      : `${(saveProgress.current / Math.max(1, saveProgress.total)) * 100}%`,
                  }}
                />
              </div>
            )}

            {/* Messages List Area */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/50">
              {approvedEvals.length === 0 ? (
                <div className="py-16 text-center text-slate-500 space-y-2">
                  <MessageSquareQuote size={36} className="mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-700">Kỳ này chưa có phiếu đánh giá nào ở trạng thái Approved.</p>
                  <p className="text-xs text-slate-400">Vui lòng hoàn thành phê duyệt đánh giá trước khi soạn thông báo kết quả.</p>
                </div>
              ) : messagesList.length === 0 ? (
                <div className="py-16 text-center text-slate-500 space-y-3">
                  <Sparkles size={36} className="mx-auto text-indigo-400 animate-pulse" />
                  <p className="font-semibold text-slate-700">Sẵn sàng soạn thông báo cho {approvedEvals.length} nhân sự.</p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Bấm nút &quot;Bắt đầu soạn hàng loạt&quot; phía trên để AI tự động phân tích điểm số, tiêu chuẩn và tổng hợp nhận xét cá nhân hóa.
                  </p>
                </div>
              ) : (
                messagesList.map((item) => {
                  const isRetrying = retryingIds.has(item.evaluationId);
                  return (
                    <div
                      key={item.evaluationId}
                      className={`bg-white rounded-2xl border p-4 shadow-sm transition-all duration-200 ${
                        item.status === 'saved'
                          ? 'border-emerald-200 bg-emerald-50/10'
                          : item.status === 'error'
                          ? 'border-rose-200 bg-rose-50/20'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="w-8 h-8 rounded-lg bg-[#003449] text-white flex items-center justify-center font-bold text-xs">
                            {item.employeeName.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">{item.employeeName}</span>
                              <span className="text-xs text-slate-400">({item.employeeCode})</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                              <span>{item.role}</span>
                              <span>•</span>
                              <span>{item.teamName}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          {/* Grade badge */}
                          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-xl">
                            <span className="text-xs font-bold text-slate-500">Hạng</span>
                            <span
                              className={`w-6 h-6 rounded-md flex items-center justify-center font-black text-xs ${
                                item.grade === 'S'
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : item.grade === 'A' || item.grade === 'AB'
                                  ? 'bg-teal-100 text-teal-700'
                                  : item.grade === 'B'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {item.grade}
                            </span>
                            <span className="text-xs font-bold text-slate-700">({item.score}đ)</span>
                          </div>

                          {/* Status Tag */}
                          {item.status === 'saved' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                              <CheckCircle2 size={12} /> Đã gửi
                            </span>
                          )}
                          {item.status === 'draft' && item.message && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                              <Sparkles size={12} /> Bản nháp AI
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
                              <AlertTriangle size={12} /> {item.error || 'Lỗi'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Message Content */}
                      <div className="space-y-2">
                        <textarea
                          value={item.message}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMessagesList((prev) =>
                              prev.map((m) =>
                                m.evaluationId === item.evaluationId
                                  ? { ...m, message: val, status: 'draft' }
                                  : m
                              )
                            );
                          }}
                          placeholder="Chưa có thông báo kết quả. Bấm 'Thử lại' hoặc soạn hàng loạt..."
                          rows={3}
                          disabled={isGenerating || isSavingAll || isRetrying}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all resize-y leading-relaxed"
                        />

                        <div className="flex items-center justify-between pt-1">
                          <div className="text-[11px] text-slate-400">
                            {item.message ? `${item.message.length} ký tự` : 'Chưa có nội dung'}
                          </div>

                          <div className="flex items-center gap-2">
                            {item.message && (
                              <button
                                type="button"
                                onClick={() => handleCopy(item.evaluationId, item.message)}
                                className="px-2.5 py-1 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                                title="Sao chép thông báo"
                              >
                                {copiedId === item.evaluationId ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                <span>{copiedId === item.evaluationId ? 'Đã chép' : 'Sao chép'}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRetrySingle(item)}
                              disabled={isRetrying || isGenerating || isSavingAll}
                              className="px-2.5 py-1 text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50"
                              title="Tạo lại bằng AI"
                            >
                              <RefreshCw size={12} className={isRetrying ? 'animate-spin' : ''} />
                              <span>{isRetrying ? 'Đang tạo...' : 'Soạn lại (AI)'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSaveSingle(item)}
                              disabled={!item.message.trim() || item.status === 'saving' || isSavingAll}
                              className="px-3 py-1 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50 shadow-2xs"
                            >
                              {item.status === 'saving' ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Send size={12} />
                              )}
                              <span>Lưu</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-white border-t border-outline-variant/60 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Hiển thị {messagesList.length} phiếu đánh giá
              </span>
              <button
                type="button"
                onClick={handleClose}
                disabled={isGenerating || isSavingAll}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
