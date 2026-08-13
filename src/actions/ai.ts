'use server';

import { requireManager } from '@/lib/auth';
import { callAI, isAIConfigured } from '@/lib/ai';

const AI_NOT_CONFIGURED = 'AI chưa được cấu hình — chờ cung cấp API key.';

function aiError(): { error: string } {
  return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };
}

/**
 * Giải thích một cảnh báo đánh giá bất thường bằng AI (Manager-only).
 * Chưa cấu hình AI_API_KEY → trả thông báo (fail-soft, không lỗi).
 * Dữ liệu gửi LLM: ẩn danh hóa (tên thật → 'Nhân viên'), chỉ số liệu cần thiết.
 */
export async function explainAnomalyAction(input: {
  evaluationId: string;
  name: string;
  round: number;
  prevScore: number;
  score: number;
}): Promise<{ explanation?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };

  if (!isAIConfigured()) {
    return { error: 'AI chưa được cấu hình — chờ cung cấp API key.' };
  }

  const prompt = `Dữ liệu đánh giá QAQC:
- Nhân viên (mã số ${input.evaluationId.slice(0, 8)}): vòng ${input.round - 1} đạt ${input.prevScore} điểm, vòng ${input.round} đạt ${input.score} điểm (chênh lệch ${Math.abs(input.score - input.prevScore)} điểm).
- Hãy đưa ra 3 khả năng có thể giải thích sự chênh lệch này (thiên kiến, thay đổi năng lực, lỗi nhập liệu...) và 1 gợi ý hành động cho quản lý. Ngắn gọn, tối đa 120 từ, tiếng Việt.`;

  const explanation = await callAI(prompt, { maxTokens: 250 });
  if (!explanation) {
    return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };
  }
  return { explanation };
}

/**
 * Gợi ý nhận xét chung khi chấm điểm — CHỈ Manager.
 * Gửi CHI TIẾT TỪNG TIÊU CHUẨN (tên + điểm + mức đạt) để AI nhận xét cụ thể,
 * không chung chung. Ẩn danh hóa: mã NV thay tên.
 */
export async function suggestCommentAction(input: {
  employeeCode: string;
  role: string;
  criteriaDetail: { code: string; name: string; points: number; levelLabel: string; note: string }[];
  previousComments: string[];
  currentComment: string;
  totalScore: number;
  grade: string;
}): Promise<{ comment?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  const detailText = input.criteriaDetail.length
    ? input.criteriaDetail
        .map((c) => `- ${c.code} ${c.name}: ${c.points} điểm (${c.levelLabel || 'không xác định'})${c.note ? ` — ghi chú: ${c.note}` : ''}`)
        .join('\n')
    : 'chưa có tiêu chí nào được chấm';
  const prevText = input.previousComments.length
    ? input.previousComments.map((c, i) => `- Vòng ${i + 1}: ${c}`).join('\n')
    : 'không có';

  const prompt = `Dữ liệu đánh giá QAQC (ẩn danh hóa — mã NV ${input.employeeCode}, vai trò ${input.role}):
- Tổng điểm: ${input.totalScore}, xếp loại: ${input.grade}
- CHI TIẾT TỪNG TIÊU CHUẨN (mã A* = Kỷ luật, E* = Năng lực, F* = Thành tích/quản lý):
${detailText}
- NHẬN XÉT CÁC VÒNG CHẤM TRƯỚC (tham khảo để nhất quán):
${prevText}
${input.currentComment ? `- Nhận xét hiện tại: ${input.currentComment}` : ''}

Hãy viết NHẬN XÉT TỔNG QUÁT (4-5 câu, tiếng Việt) theo NGUYÊN TẮC:
1. QUẢN LÝ (Leader/SubLeader/Manager): phân tích KỸ 2-3 tiêu chuẩn QUẢN LÝ nổi bật (mã F*) — điểm mạnh + đề xuất phát huy. NHÂN VIÊN: 1-2 tiêu chuẩn mạnh nhất + 1-2 yếu nhất + cách khắc phục cụ thể.
2. KỶ LUẬT (mã A*): không vi phạm → CHỈ 1 câu NGẮN nhưng DIỄN ĐẠT ĐA DẠNG, thay đổi cách nói theo từng nhân viên (vd: "Anh/chị duy trì kỷ luật và tác phong lao động tốt trong kỳ", "Không phát sinh vi phạm nội quy, chấm công ổn định", "Tinh thần chấp hành nội quy tốt, không có vấn đề kỷ luật"...). TUYỆT ĐỐI không viết y hệt câu giống nhau cho mọi người, không liệt kê tiêu chí 0 điểm, không nêu "theo dõi chấm công" khi không có vi phạm.
3. Có THAM KHẢO nhận xét vòng trước để bổ sung/nhất quán (nếu có).
4. KHÔNG nêu tổng điểm số. Kết 1 câu khuyến khích ngắn.
5. VIẾT GIỐNG NGƯỜI THẬT: tự nhiên như quản lý viết tay — TRÁNH giọng văn AI (không dùng "cho thấy sự nỗ lực", "đáng ghi nhận", "góp phần không nhỏ", "thể hiện rõ", cấu trúc liệt kê đều đều, cảm thán sáo rỗng). Mỗi nhân viên một cách viết khác nhau.
YÊU CẦU: NGẮN GỌN 4-5 câu, sát dữ liệu, cụ thể theo TÊN tiêu chuẩn, không chung chung, không thừa thãi.`;

  const comment = await callAI(prompt, { maxTokens: 800, temperature: 0.7 });
  if (!comment) return aiError();
  return { comment };
}

/**
 * Soạn thông báo kết quả cá nhân hóa cho nhân viên — Manager-only.
 * Dựa trên CHI TIẾT tiêu chuẩn của vòng cuối để thông báo cụ thể, hữu ích.
 */
export async function draftResultMessageAction(input: {
  employeeCode: string;
  name: string;
  role: string;
  totalScore: number;
  grade: string;
  criteriaDetail: { code: string; name: string; points: number; levelLabel: string }[];
  previousComments: string[];
  summaryNotes: string;
  periodName: string;
}): Promise<{ message?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  const detailText = input.criteriaDetail.length
    ? input.criteriaDetail
        .filter((c) => c.points !== 0)
        .map((c) => `- ${c.code} ${c.name}: ${c.points} điểm (${c.levelLabel || ''})`)
        .join('\n')
    : 'không có chi tiết';
  const prevText = input.previousComments.length
    ? input.previousComments.map((c, i) => `- Vòng ${i + 1}: ${c}`).join('\n')
    : 'không có';

  const prompt = `Dữ liệu kết quả đánh giá QAQC (ẩn danh hóa — mã NV ${input.employeeCode}, vai trò ${input.role}, kỳ ${input.periodName}):
- Tổng điểm: ${input.totalScore}, xếp loại: ${input.grade}
- CHI TIẾT TIÊU CHUẨN VÒNG CUỐI (mã A* = Kỷ luật, E* = Năng lực, F* = Thành tích/quản lý):
${detailText}
- NHẬN XÉT CÁC VÒNG TRƯỚC (tham khảo):
${prevText}
- Nhận xét tổng hợp: ${input.summaryNotes || 'không có'}

Hãy viết TIN NHẮN THÔNG BÁO KẾT QUẢ cho nhân viên (3-5 câu, tiếng Việt, chân thành):
1. Xác nhận xếp loại (KHÔNG nói điểm số cụ thể).
2. Nêu 1-2 điểm mạnh CỤ THỂ theo TÊN tiêu chuẩn (quản lý: ưu tiên F*; nhân viên: tiêu chuẩn mạnh nhất) — tham khảo nhận xét vòng trước để nhắc lại thành tích đã ghi nhận.
3. Nếu CÓ tiêu chuẩn thực sự yếu (điểm âm/thiếu sót rõ): 1 điều cần cải thiện + gợi ý ngắn. Nếu KHÔNG: 1 gợi ý phát triển nhẹ nhàng.
4. Kỷ luật (A*) không vi phạm → KHÔNG nêu hoặc tối đa nửa câu, DIỄN ĐẠT ĐA DẠNG theo từng người — không lặp lại cùng một câu.
5. Kết 1 câu khuyến khích.
VIẾT GIỐNG NGƯỜI THẬT: tự nhiên, ấm áp như quản lý viết tin riêng cho nhân viên — TRÁNH giọng văn AI (không "cho thấy sự nỗ lực", "đáng ghi nhận", liệt kê đều đều, sáo rỗng). Mỗi nhân viên một cách diễn đạt khác nhau.
YÊU CẦU: NGẮN GỌN 3-5 câu, cụ thể theo TÊN tiêu chuẩn, sát dữ liệu, không bịa thông tin.`;

  const message = await callAI(prompt, { maxTokens: 700, temperature: 0.7 });
  if (!message) return aiError();
  return { message };
}
