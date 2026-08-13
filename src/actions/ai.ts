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
  currentComment: string;
  totalScore: number;
  grade: string;
}): Promise<{ comment?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  const scored = input.criteriaDetail.filter((c) => c.points !== 0);
  const detailText = input.criteriaDetail.length
    ? input.criteriaDetail
        .map((c) => `- ${c.code} ${c.name}: ${c.points} điểm (${c.levelLabel || 'không xác định'})${c.note ? ` — ghi chú: ${c.note}` : ''}`)
        .join('\n')
    : 'chưa có tiêu chí nào được chấm';

  const prompt = `Dữ liệu đánh giá QAQC (ẩn danh hóa — mã NV ${input.employeeCode}, vai trò ${input.role}):
- Tổng điểm: ${input.totalScore}, xếp loại: ${input.grade}
- CHI TIẾT TỪNG TIÊU CHUẨN (mã A* = Kỷ luật, E* = Năng lực, F* = Thành tích/quản lý):
${detailText}
${input.currentComment ? `- Nhận xét hiện tại: ${input.currentComment}` : ''}

Hãy viết NHẬN XÉT TỔNG QUÁT (3-5 câu, tiếng Việt) theo NGUYÊN TẮC SAU:
1. Nếu vai trò là QUẢN LÝ (Leader/SubLeader/Manager): phân tích KỸ 2-3 tiêu chuẩn QUẢN LÝ nổi bật (mã F* — đào tạo, giám sát, phát triển đội ngũ) — nêu cụ thể điểm mạnh + đề xuất phát huy.
2. Nếu là NHÂN VIÊN: phân tích kỹ 1-2 tiêu chuẩn mạnh nhất (tên + ý nghĩa) và 1-2 tiêu chuẩn yếu nhất + cách khắc phục cụ thể.
3. TIÊU CHUẨN KỶ LUẬT (mã A*): nếu KHÔNG có vi phạm → CHỈ ghi 1 câu ngắn (vd: "chấp hành kỷ luật tốt, không có vi phạm"). TUYỆT ĐỐI không phân tích từng tiêu chí A, không liệt kê các tiêu chí 0 điểm, không nêu "cần theo dõi chấm công" khi không có vi phạm. Chỉ nêu A* khi CÓ vấn đề thật (điểm âm).
4. Không nêu tổng điểm số cụ thể. Kết 1 câu khuyến khích ngắn.
YÊU CẦU: NGẮN GỌN, sát dữ liệu, cụ thể theo TÊN tiêu chuẩn, có hành động — không chung chung, không thừa thãi.`;

  const comment = await callAI(prompt, { maxTokens: 800 });
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

  const prompt = `Dữ liệu kết quả đánh giá QAQC (ẩn danh hóa — mã NV ${input.employeeCode}, vai trò ${input.role}, kỳ ${input.periodName}):
- Tổng điểm: ${input.totalScore}, xếp loại: ${input.grade}
- CHI TIẾT TIÊU CHUẨN VÒNG CUỐI (mã A* = Kỷ luật, E* = Năng lực, F* = Thành tích/quản lý):
${detailText}
- Nhận xét tổng hợp: ${input.summaryNotes || 'không có'}

Hãy viết TIN NHẮN THÔNG BÁO KẾT QUẢ cho nhân viên (2-4 câu, tiếng Việt, chân thành, xây dựng):
1. Xác nhận xếp loại (KHÔNG nói điểm số cụ thể).
2. Nêu 1-2 điểm mạnh CỤ THỂ theo TÊN tiêu chuẩn (nếu là quản lý: ưu tiên tiêu chuẩn quản lý mã F*; nếu là nhân viên: tiêu chuẩn mạnh nhất).
3. Nếu CÓ tiêu chuẩn thực sự yếu (điểm âm/thiếu sót rõ): nêu 1 điều cần cải thiện + gợi ý ngắn. Nếu KHÔNG có: nêu 1 gợi ý phát triển nhẹ nhàng.
4. KHÔNG nêu các tiêu chuẩn kỷ luật A* khi không có vi phạm — chỉ ghi ngắn "chấp hành kỷ luật tốt" nếu cần thiết.
5. Kết thúc 1 câu khuyến khích.
YÊU CẦU: NGẮN GỌN, cụ thể theo TÊN tiêu chuẩn thật, sát dữ liệu, hữu ích — không chung chung, không bịa thông tin, không liệt kê dài dòng.`;

  const message = await callAI(prompt, { maxTokens: 600 });
  if (!message) return aiError();
  return { message };
}
