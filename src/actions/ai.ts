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
 * Ẩn danh hóa: mã NV thay tên; gửi điểm + tiêu chí nổi bật cho LLM.
 */
export async function suggestCommentAction(input: {
  employeeCode: string;
  role: string;
  scores: Record<string, number>;
  notes: Record<string, string>;
  currentComment: string;
  totalScore: number;
  grade: string;
}): Promise<{ comment?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  const topCriteria = Object.entries(input.scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  const weakCriteria = Object.entries(input.scores)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  const noteSummary = Object.entries(input.notes)
    .filter(([, v]) => v.trim())
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ');

  const prompt = `Dữ liệu đánh giá QAQC (ẩn danh hóa — mã NV ${input.employeeCode}, vai trò ${input.role}):
- Tổng điểm: ${input.totalScore}, xếp loại: ${input.grade}
- Tiêu chí mạnh nhất: ${topCriteria || 'chưa chấm'}
- Tiêu chí yếu nhất: ${weakCriteria || 'chưa chấm'}
- Ghi chú từng tiêu chí: ${noteSummary || 'không có'}
${input.currentComment ? `- Nhận xét hiện tại: ${input.currentComment}` : ''}

Hãy viết NHẬN XÉT TỔNG QUÁT (2-4 câu, tiếng Việt, mang tính xây dựng, phù hợp xem sau khi kỳ kết thúc): nêu điểm mạnh, điểm cần cải thiện, gợi ý phát triển. KHÔNG nêu điểm số cụ thể, KHÔNG dùng tên người.`;

  const comment = await callAI(prompt, { maxTokens: 300 });
  if (!comment) return aiError();
  return { comment };
}

/**
 * Soạn thông báo kết quả cá nhân hóa cho nhân viên — Manager-only.
 */
export async function draftResultMessageAction(input: {
  employeeCode: string;
  name: string;
  role: string;
  totalScore: number;
  grade: string;
  summaryNotes: string;
  periodName: string;
}): Promise<{ message?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  const prompt = `Dữ liệu kết quả đánh giá QAQC (ẩn danh hóa — mã NV ${input.employeeCode}, vai trò ${input.role}, kỳ ${input.periodName}):
- Tổng điểm: ${input.totalScore}, xếp loại: ${input.grade}
- Nhận xét tổng hợp: ${input.summaryNotes || 'không có'}

Hãy viết TIN NHẮN THÔNG BÁO KẾT QUẢ cho nhân viên (2-4 câu, tiếng Việt, chân thành, xây dựng): xác nhận kết quả (không nói điểm số, chỉ nói xếp loại), nêu điểm mạnh, gợi ý cải thiện. KHÔNG nêu điểm số cụ thể, KHÔNG dùng tên người. Kết thúc bằng lời khuyến khích.`;

  const message = await callAI(prompt, { maxTokens: 300 });
  if (!message) return aiError();
  return { message };
}
