'use server';

import { requireRole } from '@/lib/auth';
import { callAI, isAIConfigured } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase-admin';
import fs from 'node:fs';
import path from 'node:path';

const CHAT_LIMIT = 15;
const CHAT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 giờ

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
5. Nếu chưa chắc chắn, nói thẳng "em chưa rõ, chị có thể xem trang Hướng dẫn hoặc hỏi Manager". Không bịa dữ liệu.`;

function buildSystem(role: string): string {
  const knowledge = getKnowledge();
  if (role === 'Manager') {
    return `${knowledge}

${BASE_RULES}
6. Chị là Manager: ngoài hướng dẫn/lỗi, được trả lời các câu hỏi NÂNG CAO: báo cáo, thống kê, tìm kiếm dữ liệu, giải thích bất thường trong đánh giá, cách đọc/điều chỉnh xếp loại, chốt kỳ.`;
  }
  return `${knowledge}

${BASE_RULES}
6. Chị là ${role === 'Leader' ? 'Leader' : 'SubLeader'}: CHỈ trả lời về hướng dẫn sử dụng, cách thao tác, lỗi/trục trặc thường gặp trong phạm vi quyền của chị. KHÔNG trả lời phân tích nâng cao (báo cáo, thống kê, bất thường đánh giá, tư vấn xếp loại...) — nếu chị hỏi ngoài phạm vi, khéo léo từ chối và gợi ý liên hệ Manager.`;
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
  const page = pathname.includes('/dashboard') ? 'bảng điều khiển' :
    pathname.includes('/teams') ? 'danh sách nhóm / chi tiết nhóm' :
    pathname.includes('/employees') ? 'danh sách nhân viên' :
    pathname.includes('/reports') ? 'báo cáo' :
    pathname.includes('/criteria') ? 'tiêu chuẩn đánh giá' :
    pathname.includes('/settings') ? 'cài đặt' :
    pathname.includes('/evaluations') ? 'phiếu đánh giá' :
    pathname.includes('/support') ? 'trang hướng dẫn' : 'hệ thống';
  const hint = role === 'Manager'
    ? 'Chị cần xem tiến độ, báo cáo hay giải đáp thắc mắc về đánh giá, em hỗ trợ được ạ.'
    : 'Chị gặp thắc mắc về thao tác hay gặp lỗi gì, em hướng dẫn giúp chị ạ.';
  return { greeting: `Chào chị. Chị đang ở ${page} — ${hint}` };
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

  const history = (input.history || []).slice(-12);
  let prompt = question;
  if (history.length > 0) {
    const historyText = history
      .map((m) => `${m.role === 'user' ? 'Chị' : 'Em'}: ${m.text}`)
      .join('\n');
    prompt = `Lịch sử hội thoại (12 lượt gần nhất):\n${historyText}\n\nCâu hỏi mới của chị:\n${question}`;
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
