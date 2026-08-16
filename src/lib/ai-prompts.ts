// Helper thuần (KHÔNG phải server action) — prompt soạn thông báo kết quả cá nhân hóa.
// Tách khỏi actions/ai.ts vì file 'use server' không được export hàm non-async (Turbopack).

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
}

/**
 * Xây dựng prompt soạn thông báo kết quả cá nhân hóa (dùng chung cho đơn lẻ & hàng loạt).
 */
export function buildResultPrompt(input: ResultPromptInput): string {
  const detailText = input.criteriaDetail.length
    ? input.criteriaDetail
        .filter((c) => c.points !== 0)
        .map((c) => `- ${c.code} ${c.name}: ${c.points} điểm (${c.levelLabel || ''})`)
        .join('\n')
    : 'không có chi tiết';
  const prevText = input.previousComments.length
    ? input.previousComments.map((c, i) => `- Vòng ${i + 1}: ${c}`).join('\n')
    : 'không có';
  // Tên cá nhân hóa: lấy TÊN CUỐI (vd "Hoàng Thị Trang" → "Trang"); fallback "Nhân viên"
  const firstName = input.name ? input.name.trim().split(/\s+/).pop() || '' : '';

  return `Dữ liệu kết quả đánh giá QAQC (ẩn danh hóa — mã NV ${input.employeeCode}, vai trò ${input.role}, kỳ ${input.periodName}):
- Tổng điểm: ${input.totalScore}, xếp loại: ${input.grade}
- CHI TIẾT TIÊU CHUẨN VÒNG CUỐI (mã A* = Kỷ luật, E* = Năng lực, F* = Thành tích/quản lý):
${detailText}
${input.notesSummary ? `- GHI CHÚ QUAN TRỌNG: ${input.notesSummary}` : ''}
- NHẬN XÉT CÁC VÒNG TRƯỚC (tham khảo nếu có — các vòng do NHỮNG NGƯỜI ĐÁNH GIÁ KHÁC NHAU chấm, KHÔNG so sánh tiến bộ/lùi):
${prevText}
- Nhận xét tổng hợp: ${input.summaryNotes || 'không có'}

MẪU PHONG CÁCH (chỉ THAM KHẢO CÁCH VIẾT — không sao chép nội dung):
"Kỳ này ${firstName || 'anh/chị'} hoàn thành tốt vai trò dẫn dắt: việc bố trí nhân sự và đào tạo người mới đi vào nề nếp, kíp ít khi bị động khi có người nghỉ. Cần lưu ý thêm khâu kiểm tra sau khi giao việc để tránh sót chi tiết. Chúc ${firstName || 'anh/chị'} tiếp tục phát huy."

Hãy viết TIN NHẮN THÔNG BÁO KẾT QUẢ cho nhân viên (3-5 câu, tiếng Việt, chân thành):
1. Xác nhận xếp loại (KHÔNG nói điểm số cụ thể).
2. Nêu 1-2 điểm mạnh CỤ THỂ theo TÊN tiêu chuẩn (quản lý: ưu tiên F*; nhân viên: tiêu chuẩn mạnh nhất) — tham khảo NGẦM nhận xét vòng trước (KHÔNG trích dẫn "như nhận xét trước").
3. Nếu CÓ tiêu chuẩn thực sự yếu (điểm âm/thiếu sót rõ): 1 điều cần cải thiện + gợi ý ngắn. Nếu KHÔNG: 1 gợi ý phát triển nhẹ nhàng.
4. Kỷ luật (A*) không vi phạm → KHÔNG nêu hoặc tối đa nửa câu, DIỄN ĐẠT ĐA DẠNG theo từng người — không lặp lại cùng một câu.
5. XƯNG HÔ: gọi người được đánh giá BẰNG TÊN — tên cá nhân hóa là "${firstName}" (vd: "Kỳ này ${firstName} hoàn thành tốt...", "Chúc ${firstName}..."). NẾU firstName rỗng → dùng "Nhân viên". TUYỆT ĐỐI không dùng "Anh/chị", "bạn", "em" trong câu viết cho chính người được đánh giá.
6. VAI TRÒ: LUÔN dùng từ "quản lý" (KHÔNG viết "Leader", "SubLeader", "Manager", "điều phối", "dẫn dắt" để chỉ vai trò) và ĐA DẠNG CÁCH DIỄN ĐẠT theo từng bài (vd: "Ở vai trò quản lý...", "Với vai trò quản lý...", "Là người quản lý...", "Trong vai trò quản lý...") — không lặp cùng một cụm cho mọi người.
7. NHẮC TIÊU CHUẨN: MÔ TẢ NGẮN nội dung rồi mã trong ngoặc (vd: "tiêu chuẩn về hợp tác, phối hợp (B1)") — KHÔNG viết "Ở B1" hoặc mã đứng một mình.
8. Kết 1 câu khuyến khích.
VIẾT GIỐNG NGƯỜI THẬT, BẮT CHƯỚC PHONG CÁCH MẪU — tự nhiên, ấm áp như quản lý viết tin riêng — TRÁNH giọng văn AI (không "cho thấy sự nỗ lực", "đáng ghi nhận", liệt kê đều đều, sáo rỗng). Mỗi nhân viên một cách diễn đạt khác nhau.
YÊU CẦU: NGẮN GỌN 3-5 câu, cụ thể theo TÊN tiêu chuẩn, sát dữ liệu, không bịa thông tin, KHÔNG so sánh điểm/tiến bộ giữa các vòng.`;
}
