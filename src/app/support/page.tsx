'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Bot,
  ClipboardCheck,
  HelpCircle,
  Lock,
  Printer,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { guideContent, type GuideRole } from '@/lib/guide-content';

const roleLabels: Record<GuideRole, string> = {
  Manager: 'Manager',
  Leader: 'Leader',
  SubLeader: 'SubLeader',
  Employee: 'Nhân viên',
  Worker: 'Công nhân',
};

const roleWorkflows: Record<GuideRole, { round: string; evaluator: string }[]> = {
  Manager: [
    { round: 'Vòng 1', evaluator: 'Tự đánh giá (SELF)' },
  ],
  Leader: [
    { round: 'Vòng 1', evaluator: 'Tự đánh giá (SELF)' },
    { round: 'Vòng 2', evaluator: 'Manager đánh giá' },
  ],
  SubLeader: [
    { round: 'Vòng 1', evaluator: 'Tự đánh giá (SELF)' },
    { round: 'Vòng 2', evaluator: 'Leader đánh giá' },
    { round: 'Vòng 3', evaluator: 'Manager đánh giá' },
  ],
  Employee: [
    { round: 'Vòng 1', evaluator: 'SubLeader đánh giá' },
    { round: 'Vòng 2', evaluator: 'Leader đánh giá' },
    { round: 'Vòng 3', evaluator: 'Manager đánh giá' },
  ],
  Worker: [
    { round: 'Vòng 1', evaluator: 'SubLeader đánh giá' },
    { round: 'Vòng 2', evaluator: 'Leader đánh giá' },
    { round: 'Vòng 3', evaluator: 'Manager đánh giá' },
  ],
};

const ALL_GUIDE_ROLES: GuideRole[] = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'];

export default function SupportPage() {
  const { user, isManager } = useAuth();

  const currentRole: GuideRole =
    user?.role === 'Manager'
      ? 'Manager'
      : user?.role === 'Leader'
      ? 'Leader'
      : user?.role === 'SubLeader'
      ? 'SubLeader'
      : user?.role === 'Worker'
      ? 'Worker'
      : 'Employee';

  // Trang chỉ render sau khi auth load (AppLayout guard) → currentRole đúng ngay lần render đầu.
  // viewRole chỉ có ý nghĩa khi Manager đổi role xem; role khác luôn dùng currentRole.
  const [viewRole, setViewRole] = useState<GuideRole>(currentRole);

  const activeGuide = guideContent[isManager ? viewRole : currentRole] || guideContent.Employee;

  const handlePrintGuide = () => {
    window.open(`/support/print?role=${isManager ? viewRole : currentRole}&autoPrint=1`, '_blank');
  };

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 lg:py-5 space-y-8 lg:space-y-4 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto print:p-0 print:space-y-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 md:p-6 shadow-sm print:border-none print:shadow-none print:p-0">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">HƯỚNG DẪN</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-black text-slate-950">
              Hướng dẫn sử dụng theo vai trò
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Hướng dẫn từng bước cho Manager, Leader, SubLeader và Nhân viên — kèm ảnh minh họa và bản in A4.
            </p>
          </div>
          <button
            onClick={handlePrintGuide}
            className="flex items-center gap-2 rounded-2xl bg-[#07384d] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#052b3b] shadow-sm whitespace-nowrap print:hidden active:scale-95 cursor-pointer"
          >
            <Printer size={18} />
            In Hướng Dẫn (A4)
          </button>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <div id="tro-giup-ai" className="rounded-[24px] border-2 border-emerald-300 bg-gradient-to-br from-white via-emerald-50/50 to-emerald-100/70 p-6 md:p-8 shadow-lg relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
                <Bot size={32} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Tính năng quan trọng nhất</p>
                <h2 className="text-2xl md:text-3xl font-black text-slate-950">Trợ lý AI — giúp bạn ngay khi gặp lỗi hoặc chưa biết cách làm</h2>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-[15px] leading-7 text-slate-700">
              <p><b>Việc đầu tiên</b> khi gặp lỗi hay không biết cách thao tác: <b>nhấn icon trợ giúp</b>{/* eslint-disable-next-line @next/next/no-img-element -- icon inline 36px trong dòng text, next/image không phù hợp */}
                <img src="/screenshots/guide/ai-chat-icon.png" alt="Icon trợ giúp chat" className="inline-block w-9 h-9 rounded-full shadow-md align-middle mx-1" /> <b>(góc phải dưới màn hình)</b> — AI hiểu vai trò và trang bạn đang mở, trả lời đúng trọng tâm: thao tác, quy trình, trạng thái đánh giá; khi cần AI tự xem màn hình để phân tích chính xác.</p>
              <p>Gặp lỗi hệ thống? Bấm nút <b>Báo lỗi</b> trong chat (1 lần/ngày) — lỗi được gửi về Developer xử lý.</p>
              <p><b>Các tính năng nâng cao</b> (phân tích số liệu, báo cáo, thống kê, giải thích bất thường đánh giá...) <b>chỉ mở cho Manager</b>.</p>
            </div>
          </div>

          <div id="workflow" className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
                <ClipboardCheck size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Quy trình 3 vòng đánh giá</h2>
                <p className="text-sm text-slate-500">
                  Luồng đánh giá tuần tự: vòng sau chỉ mở khi vòng trước đã nộp.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {ALL_GUIDE_ROLES.map((role) => (
                <div key={role} className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                    {roleLabels[role]} — {roleWorkflows[role].length} vòng
                  </h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {roleWorkflows[role].map((step, index) => (
                      <div key={`${role}-wf-${index}`} className="flex items-center gap-2">
                        <div className="min-w-[138px] rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{step.round}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-800">{step.evaluator}</p>
                        </div>
                        {index < roleWorkflows[role].length - 1 && (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200/70 text-slate-500">
                            <ArrowRight size={14} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div id="huong-dan-vai-tro" className="rounded-[24px] border-2 border-cyan-200 bg-gradient-to-br from-white via-cyan-50/40 to-cyan-100/60 p-6 md:p-8 shadow-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800 shadow-md">
                  <UsersRound size={30} />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-950">Hướng dẫn theo vai trò của bạn</h2>
                  <p className="text-sm md:text-base text-slate-500">
                    Các bước thực hiện chuẩn theo quy trình cho vai trò đang chọn.
                  </p>
                </div>
              </div>
              {isManager ? (
                <div className="flex flex-wrap items-center gap-2 p-1.5 bg-white rounded-2xl border-2 border-cyan-200 shadow-sm">
                  {ALL_GUIDE_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setViewRole(role)}
                      className={`px-5 py-2.5 rounded-xl text-sm md:text-base font-black transition-all cursor-pointer ${
                        viewRole === role
                          ? 'bg-[#07384d] text-white shadow-md scale-[1.02]'
                          : 'text-slate-600 hover:text-[#07384d] hover:bg-cyan-50'
                      }`}
                    >
                      {roleLabels[role]}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-2xl bg-white border-2 border-cyan-200 px-4 py-2 text-sm font-black text-slate-700 shadow-sm">
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  Vai trò: {roleLabels[currentRole]}
                </div>
              )}
            </div>

            <div className="mt-6 rounded-[20px] border border-cyan-200 bg-cyan-50/80 p-5 text-base font-medium leading-7 text-cyan-950">
              {activeGuide.intro}
            </div>

            <div className="mt-6 grid gap-4">
              {activeGuide.steps.map((step, index) => (
                <div
                  key={`${viewRole}-step-${index}`}
                  className="grid gap-4 rounded-[20px] border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[56px_minmax(0,1fr)] md:items-start"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-lg font-black text-cyan-800 shadow-sm shrink-0">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 md:text-base">{step.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600 whitespace-pre-line">{step.body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[24px] border border-slate-200 bg-[#07384d] p-6 text-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
                <Lock size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black">Nguyên tắc quyền truy cập</h2>
                <p className="text-sm text-white/70">Đọc phần này để hiểu vì sao hệ thống cho sửa hoặc chỉ cho xem.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-7 text-white/80">
              <p>Cấp dưới không được mở đánh giá của cấp trên. Khi vượt quyền, màn hình sẽ chặn ngay bằng thông báo không có quyền truy cập.</p>
              <p>Mỗi vòng chỉ mở chỉnh sửa cho đúng người và đúng thời điểm. Sau khi gửi, vòng đó bị khóa và hệ thống chuyển sang vòng tiếp theo nếu workflow còn bước tiếp.</p>
              <p>Manager có phạm vi kiểm soát rộng nhất, nhưng vẫn bị khóa chỉnh sửa ở các vòng đã nộp để đảm bảo lịch sử đánh giá không bị ghi đè ngoài quy trình.</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <HelpCircle size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  Câu hỏi thường gặp — {roleLabels[viewRole]}
                </h2>
                <p className="text-sm text-slate-500">
                  Những tình huống dễ gây nhầm theo vai trò đang chọn.
                </p>
              </div>
            </div>

            {activeGuide.faq && activeGuide.faq.length > 0 ? (
              <div className="mt-6 space-y-3">
                {activeGuide.faq.map((item, idx) => (
                  <div key={idx} className="rounded-[18px] border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-sm font-black text-slate-900">{item.question}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.answer}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">Chưa có câu hỏi cho vai trò này.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
