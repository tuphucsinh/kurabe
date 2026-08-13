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
- CHI TIẾT TỪNG TIÊU CHUẨN:
${detailText}
${input.currentComment ? `- Nhận xét hiện tại: ${input.currentComment}` : ''}

Hãy viết NHẬN XÉT TỔNG QUÁT (4-7 câu, tiếng Việt) DỰA TRÊN TỪNG TIÊU CHUẨN TRÊN:
1. Nêu RÕ 2-3 tiêu chí mạnh nhất (kèm tên tiêu chuẩn) và ý nghĩa.
2. Nêu RÕ 2-3 tiêu chí yếu nhất (kèm tên tiêu chuẩn) — chỉ ra vấn đề cụ thể.
3. Đề xuất CÁCH KHẮC PHỤC / CẢI THIỆN cụ thể cho từng tiêu chí yếu (hành động thực tế, có thể làm được).
4. Kết bằng khuyến khích ngắn.
YÊU CẦU: cụ thể, sát dữ liệu, có thể hành động — TUYỆT ĐỐI không viết chung chung, không thêm thông tin không có trong dữ liệu. KHÔNG nêu tổng điểm số cụ thể.`;

  const comment = await callAI(prompt, { maxTokens: 1500 });
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
- CHI TIẾT TIÊU CHUẨN VÒNG CUỐI:
${detailText}
- Nhận xét tổng hợp: ${input.summaryNotes || 'không có'}

Hãy viết TIN NHẮN THÔNG BÁO KẾT QUẢ cho nhân viên (3-6 câu, tiếng Việt, chân thành, xây dựng):
1. Xác nhận xếp loại (KHÔNG nói điểm số cụ thể).
2. Nêu 2 ĐIỂM MẠNH cụ thể theo TÊN TIÊU CHUẨN (vd: tỷ lệ hiện diện tốt, 6S đạt mức rất tốt...).
3. Nêu 2 ĐIỀU CẦN CẢI THIỆN cụ thể theo TÊN TIÊU CHUẨN + gợi ý khắc phục ngắn gọn, thực tế.
4. Kết thúc khuyến khích.
YÊU CẦU: cụ thể theo tên tiêu chuẩn thật, sát dữ liệu, hữu ích cho nhân viên — KHÔNG chung chung, không bịa thông tin.`;

  const message = await callAI(prompt, { maxTokens: 1200 });
  if (!message) return aiError();
  return { message };
}
