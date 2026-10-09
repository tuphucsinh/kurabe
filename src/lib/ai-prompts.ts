// Helper thuần (KHÔNG phải server action) — prompt soạn thông báo kết quả cá nhân hóa.
// Tách khỏi actions/ai.ts vì file 'use server' không được export hàm non-async (Turbopack).
import type { AIPayloadCoverage } from '@/lib/ai-governance';
import {
  boundAIText,
  MAX_AI_COMMENT_CHARS,
  MAX_AI_CRITERIA_FIELD_CHARS,
  MAX_AI_CRITERIA_ITEMS,
  MAX_AI_EMPLOYEE_CODE_CHARS,
  MAX_AI_GRADE_CHARS,
  MAX_AI_NAME_CHARS,
  MAX_AI_NOTE_CHARS,
  MAX_AI_PERIOD_NAME_CHARS,
  MAX_AI_PREVIOUS_COMMENTS_ITEMS,
  MAX_AI_ROLE_CHARS,
} from '@/lib/ai-governance';

export interface ResultPromptInput {
  employeeCode: string;
  name?: string;
  role: string;
  totalScore: number;
  grade: string;
  criteriaDetail: { code: string; name: string; points: number; levelLabel: string }[];
  previousComments: string[];
  notesSummary: string;
  summaryNotes: string;
  periodName: string;
  payloadCoverage?: AIPayloadCoverage;
}

/**
 * Xây dựng prompt soạn thông báo kết quả cá nhân hóa (dùng chung cho đơn lẻ & hàng loạt).
 */
export function buildResultPrompt(input: ResultPromptInput): string {
  // P107M1T08: minimize/pseudonymize prompt content — bound every free-text and
  // identity field deterministically before it reaches the provider payload.
  const employeeCode = boundAIText(input.employeeCode, MAX_AI_EMPLOYEE_CODE_CHARS);
  const role = boundAIText(input.role, MAX_AI_ROLE_CHARS);
  const periodName = boundAIText(input.periodName, MAX_AI_PERIOD_NAME_CHARS);
  const grade = boundAIText(input.grade, MAX_AI_GRADE_CHARS);
  const notesSummary = boundAIText(input.notesSummary, MAX_AI_NOTE_CHARS);
  const summaryNotes = boundAIText(input.summaryNotes, MAX_AI_NOTE_CHARS);

  const detailText = input.criteriaDetail.length
    ? input.criteriaDetail
        .slice(0, MAX_AI_CRITERIA_ITEMS)
        .filter((c) => c.points !== 0)
        .map((c) => {
          const code = boundAIText(c.code, MAX_AI_CRITERIA_FIELD_CHARS);
          const name = boundAIText(c.name, MAX_AI_CRITERIA_FIELD_CHARS);
          const levelLabel = boundAIText(c.levelLabel, MAX_AI_CRITERIA_FIELD_CHARS);
          return `- ${code} ${name}: ${c.points} điểm (${levelLabel || ''})`;
        })
        .join('\n')
    : 'không có chi tiết';
  const prevText = input.previousComments.length
    ? input.previousComments
        .slice(0, MAX_AI_PREVIOUS_COMMENTS_ITEMS)
        .map((c, i) => `- Vòng ${i + 1}: ${boundAIText(c, MAX_AI_COMMENT_CHARS)}`)
        .join('\n')
    : 'không có';
  // Tên cá nhân hóa: lấy TÊN CUỐI (vd "Hoàng Thị Trang" → "Trang"); fallback "Nhân viên"
  const firstName = input.name ? boundAIText(input.name, MAX_AI_NAME_CHARS).trim().split(/\s+/).pop() || '' : '';

  const coverageNotice = input.payloadCoverage?.truncated
    ? `\n- PHẠM VI DỮ LIỆU: ${input.payloadCoverage.coverageLabel}. Không được khẳng định đã xem toàn bộ dữ liệu.\n`
    : '';

  return `Dữ liệu kết quả đánh giá QAQC (ẩn danh hóa — mã NV ${employeeCode}, vai trò ${role}, kỳ ${periodName}):${coverageNotice}
- Tổng điểm: ${input.totalScore}, xếp loại: ${grade}
- CHI TIẾT TIÊU CHUẨN VÒNG CUỐI (mã A* = Kỷ luật, E* = Năng lực, F* = Thành tích/quản lý):
${detailText}
${notesSummary ? `- GHI CHÚ QUAN TRỌNG: ${notesSummary}` : ''}
- NHẬN XÉT CÁC VÒNG TRƯỚC (tham khảo nếu có — các vòng do NHỮNG NGƯỜI ĐÁNH GIÁ KHÁC NHAU chấm, KHÔNG so sánh tiến bộ/lùi):
${prevText}
- Nhận xét tổng hợp: ${summaryNotes || 'không có'}

MẪU PHONG CÁCH (chỉ THAM KHẢO CÁCH VIẾT — không sao chép nội dung):
"Kỳ này ${firstName || 'anh/chị'} hoàn thành tốt vai trò dẫn dắt: việc bố trí nhân sự và đào tạo người mới đi vào nề nếp, kíp ít khi bị động khi có người nghỉ. Cần lưu ý thêm khâu kiểm tra sau khi giao việc để tránh sót chi tiết. Tiếp tục phát huy năng lực quản lý và chú trọng kiểm tra sau khi giao việc."

Hãy viết TIN NHẮN THÔNG BÁO KẾT QUẢ cho nhân viên (3-5 câu, tiếng Việt, chân thành):
1. Xác nhận xếp loại (KHÔNG nói điểm số cụ thể).
2. Nêu 1-2 điểm mạnh CỤ THỂ theo TÊN tiêu chuẩn (quản lý: ưu tiên F*; nhân viên: tiêu chuẩn mạnh nhất) — tham khảo NGẦM nhận xét vòng trước (KHÔNG trích dẫn "như nhận xét trước").
3. Nếu CÓ tiêu chuẩn thực sự yếu (điểm âm/thiếu sót rõ): 1 điều cần cải thiện + gợi ý ngắn. Nếu KHÔNG: 1 gợi ý phát triển nhẹ nhàng.
4. Kỷ luật (A*) không vi phạm → KHÔNG nêu hoặc tối đa nửa câu, DIỄN ĐẠT ĐA DẠNG theo từng người — không lặp lại cùng một câu.
5. XƯNG HÔ: gọi người được đánh giá BẰNG TÊN — tên cá nhân hóa là "${firstName}" (vd: "Kỳ này ${firstName} hoàn thành tốt...", "Tiếp tục phát huy năng lực..."). NẾU firstName rỗng → dùng "Nhân viên". TUYỆT ĐỐI không dùng "Anh/chị", "bạn", "em" trong câu viết cho chính người được đánh giá.
6. VAI TRÒ: LUÔN dùng từ "quản lý" (KHÔNG viết "Leader", "SubLeader", "Manager", "điều phối", "dẫn dắt" để chỉ vai trò) và ĐA DẠNG CÁCH DIỄN ĐẠT theo từng bài (vd: "Ở vai trò quản lý...", "Với vai trò quản lý...", "Là người quản lý...", "Trong vai trò quản lý...") — không lặp cùng một cụm cho mọi người.
7. NHẮC TIÊU CHUẨN: MÔ TẢ NGẮN nội dung rồi mã trong ngoặc (vd: "tiêu chuẩn về hợp tác, phối hợp (B1)") — KHÔNG viết "Ở B1" hoặc mã đứng một mình.
8. Kết bằng 1 câu khuyến khích hoặc định hướng hành động cụ thể cho người được đánh giá (vd: "Hãy tiếp tục phát huy...", "Cố gắng cải thiện...", "Tiếp tục duy trì...", "Nên chú trọng thêm..."). Câu cuối tuyệt đối không mang tính xã giao; phải hướng người được đánh giá tới một hành động hoặc điểm cần duy trì/cải thiện cụ thể.
VIẾT GIỐNG NGƯỜI THẬT, BẮT CHƯỚC PHONG CÁCH MẪU — tự nhiên, ấm áp như quản lý viết tin riêng — TRÁNH giọng văn AI (không "cho thấy sự nỗ lực", "đáng ghi nhận", liệt kê đều đều, sáo rỗng). Mỗi nhân viên một cách diễn đạt khác nhau.
YÊU CẦU: NGẮN GỌN 3-5 câu, cụ thể theo TÊN tiêu chuẩn, sát dữ liệu, không bịa thông tin, KHÔNG so sánh điểm/tiến bộ giữa các vòng.`;
}
