import type { Metadata } from 'next';
import AutoPrint from '@/components/support/AutoPrint';
import { getSessionUser } from '@/lib/auth';
import { guideContent, type GuideRole } from '@/lib/guide-content';

// Tham khảo định dạng và style từ /public/print-guide.html cũ. File cũ giữ nguyên theo yêu cầu.

export const metadata: Metadata = {
  title: 'In hướng dẫn sử dụng | Kurabe QAQC',
  description: 'Bản in hướng dẫn sử dụng theo khổ giấy A4 chuẩn',
};

const roleLabels: Record<GuideRole, string> = {
  Manager: 'Manager',
  Leader: 'Leader',
  SubLeader: 'SubLeader',
  Employee: 'Nhân viên',
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
};

const validRoles: GuideRole[] = ['Manager', 'Leader', 'SubLeader', 'Employee'];

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PrintGuidePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const autoPrint = sp?.autoPrint === '1';
  const roleParam = typeof sp?.role === 'string' ? sp.role : '';

  const sessionUser = await getSessionUser();
  const sessionRole: GuideRole =
    sessionUser?.role === 'Manager'
      ? 'Manager'
      : sessionUser?.role === 'Leader'
      ? 'Leader'
      : sessionUser?.role === 'SubLeader'
      ? 'SubLeader'
      : 'Employee';

  const selectedRole: GuideRole = validRoles.includes(roleParam as GuideRole)
    ? (roleParam as GuideRole)
    : sessionRole || 'Employee';

  const currentGuide = guideContent[selectedRole] || guideContent.Employee;

  return (
    <div className="min-h-screen bg-slate-100 text-[#1e293b] print:bg-white print:text-black">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm 12mm;
        }
        @media print {
          html, body {
            background: #fff !important;
            color: #1e293b !important;
            font-size: 9.5pt !important;
            line-height: 1.5 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-a4-page {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            zoom: 0.95;
          }
          .step-item-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .faq-item-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .figure-img-container {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .section-header-banner {
            break-after: avoid;
            page-break-after: avoid;
          }
        }
      `}</style>

      {autoPrint && <AutoPrint />}

      {/* Container bản in A4 */}
      <main className="mx-auto max-w-[210mm] py-6 px-4 sm:px-6 print:max-w-[190mm] print:p-0">
        <div className="print-a4-page rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-[9.5pt] leading-[1.5] text-[#1e293b]">
          {/* Doc Header */}
          <header className="border-b-[3px] border-[#07384d] pb-3 mb-4 flex justify-between items-end">
            <div>
              <div className="text-[20pt] font-black text-[#07384d] tracking-tight leading-none">
                KURABE QAQC
              </div>
              <div className="text-[13pt] font-extrabold text-[#0f172a] mt-1.5 uppercase">
                HƯỚNG DẪN SỬ DỤNG
              </div>
              <div className="text-[9pt] text-[#475569] font-medium mt-0.5">
                {roleLabels[selectedRole]} ({selectedRole}) — cập nhật 2026
              </div>
            </div>
            <div className="text-right text-[8.5pt] text-[#64748b] leading-tight">
              <p>
                <span className="font-bold">Mã tài liệu:</span> HD-QAQC-2026-{selectedRole.toUpperCase()}
              </p>
              <p>
                <span className="font-bold">Khổ giấy:</span> A4 Portrait
              </p>
              <p>
                <span className="font-bold">Ngày phát hành:</span> 2026
              </p>
            </div>
          </header>

          {/* Alert Box Intro */}
          <div className="alert-box mb-4 rounded-md border-[1.5px] border-[#3b82f6] border-l-[5px] border-l-[#1d4ed8] bg-[#eff6ff] p-3 text-[9pt] leading-relaxed text-[#1e3a8a]">
            <strong className="text-[#1e40af]">Mô tả vai trò: </strong>
            {currentGuide.intro}
          </div>

          {/* Section: Trợ lý AI */}
          <section className="mb-6">
            <div className="section-header-banner mb-3 flex items-center justify-between rounded-md bg-[#059669] px-3 py-1.5 text-white">
              <span className="text-[10pt] font-extrabold uppercase">TRỢ LÝ AI — GIÚP BẠN NGAY KHI CẦN</span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[7.5pt] font-semibold">Quan trọng nhất</span>
            </div>
            <div className="rounded-md border border-[#d1fae5] bg-[#ecfdf5] p-3 text-[8.5pt] leading-relaxed text-[#064e3b] space-y-1.5">
              <p><strong>Việc đầu tiên</strong> khi gặp lỗi hay không biết cách thao tác: <strong>nhấn icon trợ giúp (góc phải dưới màn hình)</strong> — AI hiểu vai trò và trang bạn đang mở, trả lời đúng trọng tâm: thao tác, quy trình, trạng thái đánh giá; khi cần AI tự xem màn hình để phân tích chính xác.</p>
              <p>Gặp lỗi hệ thống? Bấm nút <strong>Báo lỗi</strong> trong chat (1 lần/ngày) — lỗi được gửi về Developer xử lý.</p>
              <p><strong>Các tính năng nâng cao</strong> (phân tích số liệu, báo cáo, thống kê, giải thích bất thường đánh giá...) <strong>chỉ mở cho Manager</strong>.</p>
            </div>
          </section>

          {/* Section: Quy trình 3 vòng */}
          <section className="mb-6">
            <div className="section-header-banner mb-3 flex items-center justify-between rounded-md bg-[#4f46e5] px-3 py-1.5 text-white">
              <span className="text-[10pt] font-extrabold uppercase">QUY TRÌNH 3 VÒNG ĐÁNH GIÁ</span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[7.5pt] font-semibold">Vòng sau mở khi vòng trước đã nộp</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['Manager', 'Leader', 'SubLeader', 'Employee'] as GuideRole[]).map((role) => (
                <div key={`print-wf-${role}`} className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-2.5 break-inside-avoid">
                  <h3 className="text-[8.5pt] font-extrabold uppercase text-[#0f172a]">
                    {roleLabels[role]} — {roleWorkflows[role].length} vòng
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {roleWorkflows[role].map((step, index) => (
                      <div key={`${role}-pw-${index}`} className="flex items-center gap-1.5">
                        <div className="min-w-[96px] rounded-md border border-[#e2e8f0] bg-white px-2 py-1.5">
                          <p className="text-[7pt] font-black uppercase text-[#94a3b8]">{step.round}</p>
                          <p className="text-[7.5pt] font-semibold leading-4 text-[#1e293b]">{step.evaluator}</p>
                        </div>
                        {index < roleWorkflows[role].length - 1 && (
                          <span className="text-[8pt] text-[#94a3b8]">→</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section: Quy trình thao tác */}
          <section className="mb-6">
            <div className="section-header-banner mb-3 flex items-center justify-between rounded-md bg-[#07384d] px-3 py-1.5 text-white">
              <span className="text-[10pt] font-extrabold uppercase">
                QUY TRÌNH THAO TÁC THEO BƯỚC — VAI TRÒ {roleLabels[selectedRole].toUpperCase()}
              </span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[7.5pt] font-semibold">
                {currentGuide.steps.length} bước
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {currentGuide.steps.map((step, idx) => (
                <div
                  key={idx}
                  className="step-item-card flex gap-3 rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-2.5"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#07384d] text-[8.5pt] font-extrabold text-white mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[9.5pt] font-bold text-[#0f172a]">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-[8.5pt] text-[#334155] leading-relaxed whitespace-pre-line text-justify">
                      {step.body}
                    </p>

                    {step.screenshotPath && (
                      <figure className="figure-img-container mt-2 text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={step.screenshotPath}
                          alt={step.title}
                          className="mx-auto w-full max-w-[170mm] rounded border border-[#e2e8f0]"
                        />
                        <figcaption className="mt-1 text-[7.5pt] text-[#64748b]">
                          Minh họa: {step.title}
                        </figcaption>
                      </figure>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section: Câu hỏi thường gặp */}
          {currentGuide.faq && currentGuide.faq.length > 0 && (
            <section className="mb-6">
              <div className="section-header-banner mb-3 flex items-center justify-between rounded-md bg-[#07384d] px-3 py-1.5 text-white">
                <span className="text-[10pt] font-extrabold uppercase">
                  CÂU HỎI THƯỜNG GẶP (FAQ) — {roleLabels[selectedRole].toUpperCase()}
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[7.5pt] font-semibold">
                  {currentGuide.faq.length} câu hỏi
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 print:grid-cols-2">
                {currentGuide.faq.map((item, idx) => (
                  <div
                    key={idx}
                    className="faq-item-card rounded-md border border-[#e2e8f0] bg-[#fafafa] p-2.5"
                  >
                    <h4 className="text-[8.5pt] font-bold text-[#0f172a] leading-tight">
                      Q: {item.question}
                    </h4>
                    <p className="mt-1.5 text-[8pt] text-[#475569] leading-relaxed text-justify">
                      A: {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Doc Footer */}
          <footer className="mt-6 border-t border-[#cbd5e1] pt-2 flex justify-between text-[7.5pt] text-[#94a3b8]">
            <div>KURABE INDUSTRIAL QAQC EVALUATION SYSTEM</div>
            <div>Trang in chuẩn A4 theo vai trò</div>
          </footer>
        </div>
      </main>
    </div>
  );
}
