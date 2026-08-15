'use server';

import { requireRole } from '@/lib/auth';
import { callAI, callAIVision, isAIConfigured } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getActivePeriod, getEvaluationByEmployee } from '@/lib/db/evaluations';
import fs from 'node:fs';
import path from 'node:path';

const CHAT_LIMIT = 15;
const CHAT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 giờ

function pageName(pathname: string): string {
  if (pathname.includes('/dashboard')) return 'bảng điều khiển';
  if (pathname.includes('/teams')) return 'danh sách nhóm / chi tiết nhóm';
  if (pathname.includes('/employees')) return 'danh sách nhân viên';
  if (pathname.includes('/reports')) return 'báo cáo';
  if (pathname.includes('/criteria')) return 'tiêu chuẩn đánh giá';
  if (pathname.includes('/settings')) return 'cài đặt';
  if (pathname.includes('/evaluations')) return 'phiếu đánh giá';
  if (pathname.includes('/support')) return 'trang hướng dẫn';
  return 'hệ thống';
}

// Đọc knowledge MỘT LẦN ở module load (cache) — PII-sanitized
let knowledgeCache: string | null = null;
function getKnowledge(): string {
  if (knowledgeCache === null) {
    try {
      knowledgeCache = fs.readFileSync(path.join(process.cwd(), 'src/lib/chat-knowledge.md'), 'utf8');
    } catch {
      knowledgeCache = '';
    }
  }
  return knowledgeCache;
}

const BASE_RULES = `
Quy tắc:
1. Gọi khách là "chị", tự xưng "em".
2. Ngôn ngữ tự nhiên, tinh tế, khéo léo; TUYỆT ĐỐI không dùng emoji.
3. Chỉ trả lời về hệ thống KURABE; không trả lời ngoài lề.
4. Trả lời ngắn gọn, đúng trọng tâm, tối đa ~120 từ.
5. Nếu chưa chắc chắn, nói thẳng "em chưa rõ, chị có thể xem trang Hướng dẫn hoặc hỏi Manager". Không bịa dữ liệu.
6. Nếu cần xem ảnh màn hình của chị để trả lời chính xác (vd lỗi giao diện, thao tác khó diễn tả), kết thúc câu trả lời bằng đúng dòng: [CẦN_ẢNH]`;

function buildSystem(role: string): string {
  const knowledge = getKnowledge();
  if (role === 'Manager') {
    return `${knowledge}

${BASE_RULES}
7. Chị là Manager: ngoài hướng dẫn/lỗi, được trả lời các câu hỏi NÂNG CAO: báo cáo, thống kê, tìm kiếm dữ liệu, giải thích bất thường trong đánh giá, cách đọc/điều chỉnh xếp loại, chốt kỳ.`;
  }
  return `${knowledge}

${BASE_RULES}
7. Chị là ${role === 'Leader' ? 'Leader' : 'SubLeader'}: CHỈ trả lời về hướng dẫn sử dụng, cách thao tác, lỗi/trục trặc thường gặp trong phạm vi quyền của chị. KHÔNG trả lời phân tích nâng cao (báo cáo, thống kê, bất thường đánh giá, tư vấn xếp loại...) — nếu chị hỏi ngoài phạm vi, khéo léo từ chối và gợi ý liên hệ Manager.`;
}

async function countRecent(userId: string): Promise<number> {
  const since = new Date(Date.now() - CHAT_WINDOW_MS).toISOString();
  const { count, error } = await supabaseAdmin
    .from('chat_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (error) return 0;
  return count ?? 0;
}

async function recordUsage(userId: string): Promise<void> {
  await supabaseAdmin.from('chat_usage').insert({ user_id: userId });
}

export async function chatGreetingAction(pathname: string): Promise<{ greeting?: string; error?: string }> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return { error: auth.error };
  const role = auth.user?.role ?? 'Employee';
  const page = pageName(pathname || '');
  const hint = role === 'Manager'
    ? 'Chị cần xem tiến độ, báo cáo hay giải đáp thắc mắc về đánh giá, em hỗ trợ được ạ.'
    : 'Chị gặp thắc mắc về thao tác hay gặp lỗi gì, em hướng dẫn giúp chị ạ.';
  const fullName = (auth.user?.name || '').trim();
  const firstName = fullName ? fullName.split(/\s+/).pop() : '';
  const greet = firstName ? `Chào chị ${firstName}` : 'Chào chị';
  return { greeting: `${greet}. Chị đang ở ${page} — ${hint}` };
}

export async function chatAskAction(input: {
  question: string;
  pathname: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<{ reply?: string; error?: string }> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return { error: auth.error };
  const userId = auth.user?.id;
  const role = auth.user?.role ?? 'Employee';
  if (!userId) return { error: 'Không xác định được tài khoản.' };

  const question = (input.question || '').trim();
  if (!question) return { error: 'Chị chưa nhập câu hỏi.' };
  if (question.length > 500) return { error: 'Câu hỏi hơi dài, chị rút gọn lại giúp em ạ.' };

  if (role !== 'Manager') {
    const recent = await countRecent(userId);
    if (recent >= CHAT_LIMIT) {
      return { error: 'Chị đã dùng hết 15 lượt hỏi trong 2 giờ. Vui lòng quay lại sau nhé.' };
    }
  }
  if (!isAIConfigured()) {
    return { error: 'Tính năng trợ lý chưa sẵn sàng, chị vui lòng thử lại sau ạ.' };
  }

  const page = pageName(input.pathname || '');

  let evalContext = '';
  const m = (input.pathname || '').match(/^\/evaluations\/([0-9a-f-]{36})$/);
  if (m) {
    try {
      const period = await getActivePeriod();
      const ev = await getEvaluationByEmployee(m[1], period?.id, auth.user);
      if (ev) {
        const submitted = (ev.rounds || []).filter((r) => r.status === 'Submitted' || r.submittedAt);
        evalContext = `\nNgữ cảnh phiếu đánh giá đang mở (ẨN DANH — không có tên): vai trò nhân viên = ${ev.employeeRole || '?'}; trạng thái phiếu = ${ev.status || '?'}; vòng hiện tại = ${ev.currentRound ?? '?'}; số vòng đã nộp = ${submitted.length}; các vòng đã nộp = [${submitted.map((r) => 'V' + r.round).join(', ')}].`;
      }
    } catch { /* fail-soft: bỏ qua context */ }
  }

  const history = (input.history || []).slice(-12);
  let prompt = `Thông tin người hỏi: vai trò = ${role}, trang đang mở = ${page}.${evalContext ? `\n${evalContext}` : ''}\n\nCâu hỏi mới của chị:\n${question}`;
  if (history.length > 0) {
    const historyText = history
      .map((m) => `${m.role === 'user' ? 'Chị' : 'Em'}: ${m.text}`)
      .join('\n');
    prompt = `Thông tin người hỏi: vai trò = ${role}, trang đang mở = ${page}.\n\nLịch sử hội thoại (12 lượt gần nhất):\n${historyText}${evalContext ? `\n${evalContext}` : ''}\n\nCâu hỏi mới của chị:\n${question}`;
  }

  const reply = await callAI(prompt, {
    system: buildSystem(role),
    maxTokens: 400,
    temperature: 0.4,
  });
  if (!reply) {
    return { error: 'Em chưa trả lời được lúc này, chị thử lại sau nhé.' };
  }
  if (role !== 'Manager') {
    await recordUsage(userId);
  }
  return { reply };
}

export async function chatAskWithScreenshotAction(input: {
  question: string;
  pathname: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
  imageBase64: string;
}): Promise<{ reply?: string; error?: string }> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return { error: auth.error };
  const userId = auth.user?.id;
  const role = auth.user?.role ?? 'Employee';
  if (!userId) return { error: 'Không xác định được tài khoản.' };
  const question = (input.question || '').trim();
  if (!question) return { error: 'Chị chưa nhập câu hỏi.' };
  // server-side size cap: độ dài chuỗi base64 ≤ 900KB (Reviewer R2+R3)
  if (!input.imageBase64 || input.imageBase64.length > 921600) {
    return { error: 'Ảnh quá lớn hoặc không hợp lệ. Chị thử lại với ảnh nhỏ hơn ạ.' };
  }
  if (role !== 'Manager') {
    const recent = await countRecent(userId);
    if (recent >= CHAT_LIMIT) return { error: 'Chị đã dùng hết 15 lượt hỏi trong 2 giờ. Vui lòng quay lại sau nhé.' };
  }
  if (!isAIConfigured()) return { error: 'Tính năng trợ lý chưa sẵn sàng, chị vui lòng thử lại sau ạ.' };
  const page = pageName(input.pathname || '');
  const history = (input.history || []).slice(-12);
  let prompt = `Thông tin người hỏi: vai trò = ${role}, trang đang mở = ${page}.\n\nCâu hỏi mới của chị:\n${question}`;
  if (history.length > 0) {
    const historyText = history
      .map((m) => `${m.role === 'user' ? 'Chị' : 'Em'}: ${m.text}`)
      .join('\n');
    prompt = `Thông tin người hỏi: vai trò = ${role}, trang đang mở = ${page}.\n\nLịch sử hội thoại (12 lượt gần nhất):\n${historyText}\n\nCâu hỏi mới của chị:\n${question}`;
  }
  const system = buildSystem(role) + '\nChị vừa gửi ẢNH MÀN HÌNH kèm câu hỏi. Hãy phân tích ảnh kết hợp câu hỏi và trả lời cụ thể.';
  const reply = await callAIVision(`${prompt}\n\nẢnh màn hình đính kèm.`, input.imageBase64, { maxTokens: 500 });
  if (!reply) return { error: 'Em chưa phân tích được ảnh lúc này, chị thử lại sau nhé.' };
  if (role !== 'Manager') await recordUsage(userId);
  return { reply };
}

