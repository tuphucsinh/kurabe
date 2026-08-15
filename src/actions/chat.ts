'use server';

import { requireRole } from '@/lib/auth';
import { callAI, callAIVision, isAIConfigured } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getActivePeriod, getEvaluationByEmployee } from '@/lib/db/evaluations';
import { getDashboardData } from '@/actions/dashboard';
import { getUsers, getUserById } from '@/lib/db/users';
import { getTeamById } from '@/lib/db/teams';
import { getAllCriteriaGroups } from '@/lib/db/criteria';
import { User } from '@/types';
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

// Xưng hô theo giới tính: Nam → 'anh', Nữ → 'chị'; whitelist chống prompt injection
function address(gender?: string | null): string {
  return gender === 'Nam' ? 'anh' : 'chị';
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildBaseRules(addr: string): string {
  return `Quy tắc:
1. Gọi khách là "${addr}", tự xưng "em".
2. Ngôn ngữ tự nhiên, tinh tế, khéo léo; TUYỆT ĐỐI không dùng emoji.
3. Chỉ trả lời về hệ thống KURABE; không trả lời ngoài lề.
4. Trả lời ngắn gọn, đúng trọng tâm, tối đa ~120 từ.
5. Nếu chưa chắc chắn, nói thẳng "em chưa rõ, ${addr} có thể xem trang Hướng dẫn hoặc hỏi Manager". Không bịa dữ liệu.
6. Nếu cần xem ảnh màn hình để trả lời chính xác, CHỈ trả về đúng dòng: [CẦN_ẢNH] — không viết thêm bất kỳ chữ nào khác (hệ thống sẽ tự chụp màn hình và phân tích lại).`;
}

function buildSystem(role: string, gender?: string | null): string {
  const addr = address(gender);
  const Addr = capitalize(addr);
  const knowledge = getKnowledge();
  const baseRules = buildBaseRules(addr);
  if (role === 'Manager') {
    return `${knowledge}

${baseRules}
7. ${Addr} là Manager: ngoài hướng dẫn/lỗi, được trả lời các câu hỏi NÂNG CAO: báo cáo, thống kê, tìm kiếm dữ liệu, giải thích bất thường trong đánh giá, cách đọc/điều chỉnh xếp loại, chốt kỳ. Khi ${addr} hỏi về tình hình, tóm tắt, báo cáo: ĐƯA SỐ LIỆU THẬT từ ngữ cảnh kèm PHÂN TÍCH, ĐÁNH GIÁ NGẮN GỌN SÚC TÍCH (2-4 câu): nêu con số quan trọng (tiến độ %, số xong/chưa, nhóm yếu nhất, xếp loại nổi bật, bất thường) + ý nghĩa + đề xuất hành động. KHÔNG liệt kê menu, KHÔNG nói "em chưa có số liệu" khi ngữ cảnh đã có số liệu.`;
  }
  return `${knowledge}

${baseRules}
7. ${Addr} là ${role === 'Leader' ? 'Leader' : 'SubLeader'}: CHỈ trả lời về hướng dẫn sử dụng, cách thao tác, lỗi/trục trặc thường gặp trong phạm vi quyền của ${addr}. KHÔNG trả lời phân tích nâng cao (báo cáo, thống kê, bất thường đánh giá, tư vấn xếp loại...) — nếu ${addr} hỏi ngoài phạm vi, khéo léo từ chối và gợi ý liên hệ Manager.`;
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

async function buildPageContext(pathname: string, role: string, user: User): Promise<string> {
  try {
    // /evaluations/{id}
    const evMatch = (pathname || '').match(/^\/evaluations\/([0-9a-f-]{36})$/);
    if (evMatch) {
      const period = await getActivePeriod();
      const ev = await getEvaluationByEmployee(evMatch[1], period?.id, user);
      if (ev) {
        const submitted = (ev.rounds || []).filter((r) => r.status === 'Submitted' || r.submittedAt);
        // Tên cụ thể (tên cuối — gọi thân mật, data nội bộ không nhạy cảm)
        const employee = await getUserById(ev.employeeId).catch(() => null);
        const empName = employee ? (employee.name || '').split(/\s+/).pop() : null;
        const subName = employee?.subleaderId ? (await getUserById(employee.subleaderId).catch(() => null))?.name : null;
        const subFirst = subName ? subName.split(/\s+/).pop() : null;
        const team = employee?.teamId ? await getTeamById(employee.teamId).catch(() => null) : null;
        const leaderName = team?.leaderId ? (await getUserById(team.leaderId).catch(() => null))?.name : null;
        const leaderFirst = leaderName ? leaderName.split(/\s+/).pop() : null;
        const who = empName ? `Nhân viên ${empName}` : `nhân viên`;
        const subWho = subFirst ? `SubLeader ${subFirst}` : 'SubLeader phụ trách';
        const leaderWho = leaderFirst ? `Leader ${leaderFirst}` : 'Leader';
        return `\nNgữ cảnh phiếu đánh giá đang mở: ${who}; vai trò = ${ev.employeeRole || '?'}; trạng thái phiếu = ${ev.status || '?'}; vòng hiện tại = ${ev.currentRound ?? '?'}; vòng đã nộp = ${submitted.length} (${submitted.map((r) => 'V' + r.round).join(', ') || 'chưa có'}); người chấm hiện tại: ${subWho} (V1) → ${leaderWho} (V2) → Manager (V3).`;
      }
    }
    // /dashboard — CHỈ Manager (getDashboardData không scope)
    if (pathname.startsWith('/dashboard') && role === 'Manager') {
      const period = await getActivePeriod();
      if (period) {
        const d = await getDashboardData(period.id);
        if (d) {
          return `\nNgữ cảnh Bảng điều khiển (Dữ liệu thật DB, kỳ ${period.name}): tổng ${d.stats.total} nhân sự; đã đánh giá ${d.stats.completed} (${d.stats.percent}%); đang thực hiện ${d.stats.inProgress}; chưa bắt đầu ${d.stats.notStarted}. Theo nhóm: ${(d.teamStatus || []).map((t) => `${t.name} ${t.progress}% (${t.membersCount} thành viên)`).join('; ')}. Phân bổ xếp loại: ${(d.gradeDistribution || []).map((g) => `${g.grade} ${g.count}`).join(', ')}.`;
        }
      }
    }
    // /reports — CHỈ Manager (dùng getDashboardData — số liệu tổng hợp)
    if (pathname.startsWith('/reports') && role === 'Manager') {
      const period = await getActivePeriod();
      if (period) {
        const d = await getDashboardData(period.id);
        if (d) {
          const dist = (d.gradeDistribution || []).map((g) => `${g.grade} ${g.count}`).join(', ');
          const recent = (d.recentActivities || []).slice(0, 3).map((a) => `${a.employeeName} ${a.status || ''}`).join('; ');
          return `\nNgữ cảnh trang Báo cáo (Dữ liệu thật DB, kỳ ${period.name}): tổng ${d.stats.total} nhân sự; đã đánh giá ${d.stats.completed} (${d.stats.percent}%); đang thực hiện ${d.stats.inProgress}; chưa bắt đầu ${d.stats.notStarted}. Theo nhóm: ${(d.teamStatus || []).map((t) => `${t.name} ${t.progress}%`).join('; ')}. Phân bổ xếp loại: ${dist || 'chưa có'}. Hoạt động gần đây: ${recent || 'chưa có'}.`;
        }
      }
    }
    // /employees — getUsers(requester) scope
    if (pathname.startsWith('/employees')) {
      const users = await getUsers(user);
      const byRole: Record<string, number> = {};
      for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1;
      const roleStr = Object.entries(byRole).map(([r, c]) => `${r}: ${c}`).join(', ');
      return `\nNgữ cảnh trang Nhân viên: ${users.length} nhân viên đang hoạt động (${roleStr}).`;
    }
    // /teams — getUsers(requester) scope nhóm theo team
    if (pathname.startsWith('/teams') && !pathname.startsWith('/teams/')) {
      const users = await getUsers(user);
      const byTeam = new Map<string, number>();
      for (const u of users) byTeam.set(u.teamId || 'Chưa có nhóm', (byTeam.get(u.teamId || 'Chưa có nhóm') || 0) + 1);
      return `\nNgữ cảnh trang Nhóm: ${users.length} nhân viên; ${[...byTeam.entries()].map(([t, c]) => `${t}: ${c}`).join('; ')}.`;
    }
    // /criteria
    if (pathname.startsWith('/criteria')) {
      const groups = await getAllCriteriaGroups();
      return `\nNgữ cảnh trang Tiêu chuẩn: ${groups.length} nhóm tiêu chí (${groups.map((g) => g.id).join(', ')}).`;
    }
  } catch {
    // fail-soft
  }
  return '';
}

export async function chatGreetingAction(pathname: string): Promise<{ greeting?: string; error?: string }> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return { error: auth.error };
  const role = auth.user?.role ?? 'Employee';
  const addr = address(auth.user?.gender);
  const Addr = capitalize(addr);
  const path = pathname || '';
  const page = pageName(path);
  let hint: string;
  if (role === 'Manager') {
    if (path.includes('/evaluations')) hint = `${Addr} cần hỗ trợ chấm điểm, trả lại đánh giá hay xem kết quả vòng, em giúp được ạ.`;
    else if (path.includes('/employees')) hint = `${Addr} cần thêm/sửa nhân viên, nhập Excel hay xem kết quả, em hỗ trợ ạ.`;
    else if (path.includes('/settings')) hint = `${Addr} cần cấu hình kỳ đánh giá, thang điểm hay tài khoản, em hướng dẫn ạ.`;
    else if (path.includes('/reports') || path.includes('/dashboard')) hint = `${Addr} cần xem tiến độ, báo cáo hay giải đáp bất thường đánh giá, em hỗ trợ được ạ.`;
    else if (path.includes('/teams')) hint = `${Addr} cần quản lý nhóm, bổ nhiệm Leader hay thêm nhân viên, em hỗ trợ ạ.`;
    else if (path.includes('/criteria')) hint = `${Addr} cần rà soát tiêu chuẩn hay mức điểm, em hỗ trợ ạ.`;
    else hint = `${Addr} cần xem tiến độ, báo cáo hay giải đáp thắc mắc về đánh giá, em hỗ trợ được ạ.`;
  } else {
    if (path.includes('/evaluations')) hint = `${Addr} cần hỗ trợ chấm điểm hay trả lại đánh giá trong phạm vi nhóm, em hướng dẫn ạ.`;
    else hint = `${Addr} gặp thắc mắc về thao tác hay gặp lỗi gì, em hướng dẫn giúp ${addr} ạ.`;
  }
  const fullName = (auth.user?.name || '').trim();
  const firstName = fullName ? fullName.split(/\s+/).pop() : '';
  const greet = firstName ? `Chào ${addr} ${firstName}` : `Chào ${addr}`;
  return { greeting: `${greet}. ${Addr} đang ở ${page} — ${hint}` };
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
  const addr = address(auth.user?.gender);
  const Addr = capitalize(addr);
  if (!userId) return { error: 'Không xác định được tài khoản.' };

  const question = (input.question || '').trim();
  if (!question) return { error: `${Addr} chưa nhập câu hỏi.` };
  if (question.length > 500) return { error: `Câu hỏi hơi dài, ${addr} rút gọn lại giúp em ạ.` };

  if (role !== 'Manager') {
    const recent = await countRecent(userId);
    if (recent >= CHAT_LIMIT) {
      return { error: `${Addr} đã dùng hết 15 lượt hỏi trong 2 giờ. Vui lòng quay lại sau nhé.` };
    }
  }
  if (!isAIConfigured()) {
    return { error: `Tính năng trợ lý chưa sẵn sàng, ${addr} vui lòng thử lại sau ạ.` };
  }

  const page = pageName(input.pathname || '');
  const pageContext = await buildPageContext(input.pathname || '', role, auth.user);

  const history = (input.history || []).slice(-12);
  let prompt = `Câu hỏi mới của ${addr}:\n${question}`;
  if (history.length > 0) {
    const historyText = history
      .map((m) => `${m.role === 'user' ? Addr : 'Em'}: ${m.text}`)
      .join('\n');
    prompt = `Lịch sử hội thoại (12 lượt gần nhất):\n${historyText}\n\n${prompt}`;
  }
  prompt = `Thông tin người hỏi: vai trò = ${role}, trang đang mở = ${page}.${pageContext}\n\n${prompt}`;

  const reply = await callAI(prompt, {
    system: buildSystem(role, auth.user?.gender),
    maxTokens: 400,
    temperature: 0.4,
  });
  if (!reply) {
    return { error: `Em chưa trả lời được lúc này, ${addr} thử lại sau nhé.` };
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
  const addr = address(auth.user?.gender);
  const Addr = capitalize(addr);
  if (!userId) return { error: 'Không xác định được tài khoản.' };
  const question = (input.question || '').trim();
  if (!question) return { error: `${Addr} chưa nhập câu hỏi.` };
  // server-side size cap: độ dài chuỗi base64 ≤ 900KB (Reviewer R2+R3)
  if (!input.imageBase64 || input.imageBase64.length > 921600) {
    return { error: `Ảnh quá lớn hoặc không hợp lệ. ${Addr} thử lại với ảnh nhỏ hơn ạ.` };
  }
  if (role !== 'Manager') {
    const recent = await countRecent(userId);
    if (recent >= CHAT_LIMIT) return { error: `${Addr} đã dùng hết 15 lượt hỏi trong 2 giờ. Vui lòng quay lại sau nhé.` };
  }
  if (!isAIConfigured()) return { error: `Tính năng trợ lý chưa sẵn sàng, ${addr} vui lòng thử lại sau ạ.` };
  const page = pageName(input.pathname || '');
  const pageContext = await buildPageContext(input.pathname || '', role, auth.user);
  const history = (input.history || []).slice(-12);
  let prompt = `Câu hỏi mới của ${addr}:\n${question}`;
  if (history.length > 0) {
    const historyText = history
      .map((m) => `${m.role === 'user' ? Addr : 'Em'}: ${m.text}`)
      .join('\n');
    prompt = `Lịch sử hội thoại (12 lượt gần nhất):\n${historyText}\n\n${prompt}`;
  }
  prompt = `Thông tin người hỏi: vai trò = ${role}, trang đang mở = ${page}.${pageContext}\n\n${prompt}`;
  const system = buildSystem(role, auth.user?.gender) + `\n${Addr} vừa gửi ẢNH MÀN HÌNH kèm câu hỏi. Hãy phân tích ảnh kết hợp câu hỏi và trả lời cụ thể.`;
  const reply = await callAIVision(`${prompt}\n\nẢnh màn hình đính kèm.`, input.imageBase64, { maxTokens: 500 });
  if (!reply) return { error: `Em chưa phân tích được ảnh lúc này, ${addr} thử lại sau nhé.` };
  if (role !== 'Manager') await recordUsage(userId);
  return { reply };
}

