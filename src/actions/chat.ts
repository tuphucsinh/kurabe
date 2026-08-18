'use server';

import { requireRole } from '@/lib/auth';
import { callAI, callAIVision, isAIConfigured } from '@/lib/ai';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getActivePeriod } from '@/lib/db/evaluations';
import { getEvaluationByEmployeeAdmin, getEvaluationsByPeriodAdmin } from '@/lib/db/evaluations-admin';
import { getDashboardData } from '@/actions/dashboard';
import { getUsersAdmin, getUserByIdAdmin } from '@/lib/db/users-admin';
import { getTeamByIdAdmin, getTeamsAdmin } from '@/lib/db/teams-admin';
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

// Mã role trong DB giữ nguyên; chỉ dùng nhãn tiếng Việt khi đưa vào ngữ cảnh/prompt Chat AI.
function roleLabel(role?: string | null): string {
  if (role === 'Employee') return 'Nhân viên';
  if (role === 'Worker') return 'Công nhân';
  return role || 'Không xác định';
}

function buildBaseRules(addr: string): string {
  return `Quy tắc:
1. Gọi khách là "${addr}", tự xưng "em".
2. Ngôn ngữ tự nhiên, tinh tế, khéo léo; TUYỆT ĐỐI không dùng emoji.
3. Chỉ trả lời về hệ thống KURABE; không trả lời ngoài lề.
4. Trả lời ngắn gọn, đúng trọng tâm, tối đa ~120 từ.
5. Nếu chưa chắc chắn, nói thẳng "em chưa rõ, ${addr} có thể xem trang Hướng dẫn hoặc hỏi Manager". Không bịa dữ liệu.
6. Nếu cần xem ảnh màn hình để trả lời chính xác, CHỈ trả về đúng dòng: [CẦN_ẢNH] — không viết thêm bất kỳ chữ nào khác (hệ thống sẽ tự chụp màn hình và phân tích lại).
7. Nếu ${addr} báo LỖI HỆ THỐNG mà em không hướng dẫn xử lý được (vd trang lỗi, không lưu được, hiển thị sai), CHỈ trả về đúng dòng: [CẦN_DEV] — không viết thêm gì khác.
8. Luôn gọi chức vụ này theo tiếng Việt ("Nhân viên" cho Employee, "Công nhân" cho Worker); không dùng tên tiếng Anh cho hai chức vụ này.`;
}

function buildSystem(role: string, gender?: string | null): string {
  const addr = address(gender);
  const Addr = capitalize(addr);
  const knowledge = getKnowledge();
  const baseRules = buildBaseRules(addr);
  if (role === 'Manager') {
    return `${knowledge}

${baseRules}
9. ${Addr} là Manager: ngoài hướng dẫn/lỗi, được trả lời các câu hỏi NÂNG CAO: báo cáo, thống kê, tìm kiếm dữ liệu, giải thích bất thường trong đánh giá, cách đọc/điều chỉnh xếp loại, chốt kỳ. Khi ${addr} hỏi về tình hình, tóm tắt, báo cáo: ĐƯA SỐ LIỆU THẬT từ ngữ cảnh kèm PHÂN TÍCH, ĐÁNH GIÁ NGẮN GỌN SÚC TÍCH (2-4 câu): nêu con số quan trọng (tiến độ %, số xong/chưa, nhóm yếu nhất, xếp loại nổi bật, bất thường) + ý nghĩa + đề xuất hành động. KHÔNG liệt kê menu, KHÔNG nói "em chưa có số liệu" khi ngữ cảnh đã có số liệu. Nếu được hỏi so sánh nhiều kỳ: nói rõ em chỉ phân tích trong kỳ hiện tại (lịch sử đa kỳ chưa có).`;
  }
  if (role === 'Leader' || role === 'SubLeader') {
    return `${knowledge}

${baseRules}
9. ${Addr} là ${role}: CHỈ trả lời về hướng dẫn sử dụng, cách thao tác, lỗi/trục trặc thường gặp trong phạm vi quyền của ${addr}. KHÔNG trả lời phân tích nâng cao (báo cáo, thống kê, bất thường đánh giá, tư vấn xếp loại...) — nếu ${addr} hỏi ngoài phạm vi, khéo léo từ chối và gợi ý liên hệ Manager.`;
  }
  return `${knowledge}

${baseRules}
9. ${Addr} là ${role === 'Worker' ? 'Công nhân' : 'Nhân viên'}: CHỈ trả lời về hướng dẫn xem kết quả đánh giá của bản thân, giải thích thắc mắc quy trình cơ bản và cách đổi mật khẩu. KHÔNG hỗ trợ các thao tác quản lý, chấm điểm hay phân tích nâng cao — nếu ${addr} hỏi ngoài phạm vi, khéo léo từ chối và gợi ý liên hệ SubLeader hoặc Manager.`;
}

async function countRecent(userId: string): Promise<number> {
  try {
    const since = new Date(Date.now() - CHAT_WINDOW_MS).toISOString();
    const { count, error } = await supabaseAdmin
      .from('chat_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);
    if (error) {
      console.error('countRecent DB error:', error.message);
      return CHAT_LIMIT; // fail-close: nếu lỗi DB, chặn thay vì cho qua
    }
    return count ?? 0;
  } catch (err) {
    console.error('countRecent exception:', err);
    return CHAT_LIMIT; // fail-close
  }
}

/**
 * Tính toán ngữ cảnh so sánh / tìm kiếm ngữ nghĩa nội bộ trong kỳ (Manager-only, deterministic).
 */
async function buildManagerSemanticContext(periodId: string, periodName: string, user: User): Promise<string> {
  try {
    const [evaluations, users, teams] = await Promise.all([
      getEvaluationsByPeriodAdmin(periodId, user),
      getUsersAdmin(user),
      getTeamsAdmin(user),
    ]);

    if (!evaluations.length) return '';

    const userMap = new Map(users.map((u) => [u.id, u]));
    const teamMap = new Map(teams.map((t) => [t.id, t.name]));

    interface EmpDelta {
      name: string;
      shortName: string;
      role: string;
      teamName: string;
      roundsStr: string;
      lastScore: number;
      delta: number | null;
      grade: string;
    }

    const empList: EmpDelta[] = [];
    const gradeCounts: Record<string, number> = {};

    for (const ev of evaluations) {
      const emp = userMap.get(ev.employeeId);
      const fullName = emp?.name || 'Không xác định';
      const shortName = fullName.split(/\s+/).pop() || fullName;
      const teamName = (emp?.teamId && teamMap.get(emp.teamId)) || 'Chung';
      const role = roleLabel(ev.employeeRole || emp?.role || 'Employee');

      const scoredRounds = (ev.rounds || [])
        .filter((r) => (r.totalScore || 0) > 0)
        .sort((a, b) => a.round - b.round);

      let delta: number | null = null;
      let lastScore = 0;
      const roundsStr = scoredRounds.map((r) => `V${r.round}:${r.totalScore}`).join(' ');

      if (scoredRounds.length > 0) {
        lastScore = scoredRounds[scoredRounds.length - 1].totalScore || 0;
      }

      if (scoredRounds.length >= 2) {
        const prev = scoredRounds[scoredRounds.length - 2].totalScore || 0;
        const curr = scoredRounds[scoredRounds.length - 1].totalScore || 0;
        delta = curr - prev;
      }

      const lastRound = scoredRounds[scoredRounds.length - 1];
      const grade = ev.finalGrade || lastRound?.grade || '';
      if (grade) {
        gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
      }

      empList.push({
        name: fullName,
        shortName,
        role,
        teamName,
        roundsStr,
        lastScore,
        delta,
        grade,
      });
    }

    // Top 5 tăng nhiều nhất (delta > 0)
    const increases = empList
      .filter((e): e is EmpDelta & { delta: number } => e.delta !== null && e.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);

    // Top 5 giảm nhiều nhất (delta < 0)
    const decreases = empList
      .filter((e): e is EmpDelta & { delta: number } => e.delta !== null && e.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 5);

    const incText = increases.length
      ? increases.map((x) => `${x.shortName} (+${x.delta})`).join(', ')
      : 'không có';

    const decText = decreases.length
      ? decreases.map((x) => `${x.shortName} (${x.delta})`).join(', ')
      : 'không có';

    // Nhóm tổng hợp (membersCount & approved count)
    const teamGroups = new Map<string, { total: number; approved: number }>();
    for (const ev of evaluations) {
      const emp = userMap.get(ev.employeeId);
      const tName = (emp?.teamId && teamMap.get(emp.teamId)) || 'Chung';
      if (!teamGroups.has(tName)) {
        teamGroups.set(tName, { total: 0, approved: 0 });
      }
      const tg = teamGroups.get(tName)!;
      tg.total++;
      if (ev.status === 'Approved') tg.approved++;
    }

    const teamStr = [...teamGroups.entries()]
      .map(([tName, tg]) => {
        const pct = tg.total > 0 ? Math.round((tg.approved / tg.total) * 100) : 0;
        return `${tName} ${tg.approved}/${tg.total} xong (${pct}%)`;
      })
      .join('; ');

    // Xếp loại
    const gradeStr = Object.entries(gradeCounts)
      .map(([g, c]) => `${g} ${c}`)
      .join(', ');

    // Role count
    const roleCounts: Record<string, number> = {};
    for (const e of empList) {
      roleCounts[e.role] = (roleCounts[e.role] || 0) + 1;
    }
    const roleStr = Object.entries(roleCounts)
      .map(([r, c]) => `${r}: ${c}`)
      .join(', ');

    // Điểm nhân viên tóm tắt
    const empScoreList = empList
      .filter((e) => e.roundsStr)
      .map((e) => `${e.shortName}(${e.roundsStr}${e.grade ? ` ${e.grade}` : ''})`)
      .join(', ');

    let summary = `Dữ liệu chi tiết cho câu hỏi so sánh/tìm kiếm (Kỳ ${periodName}): ${empList.length} NV (${roleStr}). TĂNG: ${incText}. GIẢM: ${decText}. Nhóm: ${teamStr}. Xếp loại: ${gradeStr || 'chưa có'}. Điểm NV: ${empScoreList}.`;

    if (summary.length > 1200) {
      summary = summary.slice(0, 1200) + '...';
    }

    return `\n${summary}`;
  } catch (err) {
    console.error('Error building Manager semantic context:', err);
    return '';
  }
}

async function buildPageContext(pathname: string, role: string, user: User): Promise<string> {
  try {
    // /evaluations/{id}
    const evMatch = (pathname || '').match(/^\/evaluations\/([0-9a-f-]{36})$/);
    if (evMatch) {
      const period = await getActivePeriod();
      const ev = await getEvaluationByEmployeeAdmin(evMatch[1], period?.id, user);
      if (ev) {
        const submitted = (ev.rounds || []).filter((r) => r.status === 'Submitted' || r.submittedAt);
        // Tên cụ thể (tên cuối — gọi thân mật, data nội bộ không nhạy cảm)
        const employee = await getUserByIdAdmin(ev.employeeId, user).catch(() => null);
        const empName = employee ? (employee.name || '').split(/\s+/).pop() : null;
        const subName = employee?.subleaderId ? (await getUserByIdAdmin(employee.subleaderId, user).catch(() => null))?.name : null;
        const subFirst = subName ? subName.split(/\s+/).pop() : null;
        const team = employee?.teamId ? await getTeamByIdAdmin(employee.teamId, user).catch(() => null) : null;
        const leaderName = team?.leaderId ? (await getUserByIdAdmin(team.leaderId, user).catch(() => null))?.name : null;
        const leaderFirst = leaderName ? leaderName.split(/\s+/).pop() : null;
        const who = empName ? `Nhân viên ${empName}` : `nhân viên`;
        const subWho = subFirst ? `SubLeader ${subFirst}` : 'SubLeader phụ trách';
        const leaderWho = leaderFirst ? `Leader ${leaderFirst}` : 'Leader';
        return `\nNgữ cảnh phiếu đánh giá đang mở: ${who}; chức vụ = ${roleLabel(ev.employeeRole)}; trạng thái phiếu = ${ev.status || '?'}; vòng hiện tại = ${ev.currentRound ?? '?'}; vòng đã nộp = ${submitted.length} (${submitted.map((r) => 'V' + r.round).join(', ') || 'chưa có'}); người chấm hiện tại: ${subWho} (V1) → ${leaderWho} (V2) → Manager (V3).`;
      }
    }
    // /dashboard — CHỈ Manager (getDashboardData không scope)
    if (pathname.startsWith('/dashboard') && role === 'Manager') {
      const period = await getActivePeriod();
      if (period) {
        const d = await getDashboardData(period.id);
        if (d) {
          let base = `\nNgữ cảnh Bảng điều khiển (Dữ liệu thật DB, kỳ ${period.name}): tổng ${d.stats.total} nhân sự; đã đánh giá ${d.stats.completed} (${d.stats.percent}%); đang thực hiện ${d.stats.inProgress}; chưa bắt đầu ${d.stats.notStarted}. Theo nhóm: ${(d.teamStatus || []).map((t) => `${t.name} ${t.progress}% (${t.membersCount} thành viên)`).join('; ')}. Phân bổ xếp loại: ${(d.gradeDistribution || []).map((g) => `${g.grade} ${g.count}`).join(', ')}.`;
          const detail = await buildManagerSemanticContext(period.id, period.name, user);
          if (detail) base += detail;
          return base;
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
          let base = `\nNgữ cảnh trang Báo cáo (Dữ liệu thật DB, kỳ ${period.name}): tổng ${d.stats.total} nhân sự; đã đánh giá ${d.stats.completed} (${d.stats.percent}%); đang thực hiện ${d.stats.inProgress}; chưa bắt đầu ${d.stats.notStarted}. Theo nhóm: ${(d.teamStatus || []).map((t) => `${t.name} ${t.progress}%`).join('; ')}. Phân bổ xếp loại: ${dist || 'chưa có'}. Hoạt động gần đây: ${recent || 'chưa có'}.`;
          const detail = await buildManagerSemanticContext(period.id, period.name, user);
          if (detail) base += detail;
          return base;
        }
      }
    }
    // /employees — getUsers(requester) scope
    if (pathname.startsWith('/employees')) {
      const users = await getUsersAdmin(user);
      const byRole: Record<string, number> = {};
      for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1;
      const roleStr = Object.entries(byRole).map(([r, c]) => `${roleLabel(r)}: ${c}`).join(', ');
      return `\nNgữ cảnh trang Nhân viên: ${users.length} nhân viên đang hoạt động (${roleStr}).`;
    }
    // /teams — getUsers(requester) scope nhóm theo team
    if (pathname.startsWith('/teams') && !pathname.startsWith('/teams/')) {
      const users = await getUsersAdmin(user);
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
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader', 'Worker']);
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
  } else if (role === 'Leader' || role === 'SubLeader') {
    if (path.includes('/evaluations')) hint = `${Addr} cần hỗ trợ chấm điểm hay trả lại đánh giá trong phạm vi nhóm, em hướng dẫn ạ.`;
    else hint = `${Addr} gặp thắc mắc về thao tác hay gặp lỗi gì, em hướng dẫn giúp ${addr} ạ.`;
  } else {
    if (path.includes('/evaluations')) hint = `${Addr} cần xem kết quả đánh giá hay thắc mắc về quy trình, em hướng dẫn ạ.`;
    else hint = `${Addr} gặp thắc mắc về tài khoản hay quy trình đánh giá, em hướng dẫn giúp ${addr} ạ.`;
  }
  const fullName = (auth.user?.name || '').trim();
  const firstName = fullName ? fullName.split(/\s+/).pop() : '';
  const greet = firstName ? `Chào ${addr} ${firstName}` : `Chào ${addr}`;
  return { greeting: `${greet}. ${Addr} đang ở ${page} — ${hint}` };
}

interface ChatAskInputBase {
  question: string;
  pathname: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
}

interface ChatPrepared {
  userId: string;
  role: string;
  addr: string;
  Addr: string;
  user: User | null;
  question: string;
  prompt: string;
}

/**
 * Phần chung của chatAskAction / chatAskWithScreenshotAction (D4 — gom ~90% logic trùng):
 * auth → validate câu hỏi → rate limit (non-Manager) → AI configured → page context → build prompt.
 */
async function prepareChatContext(
  input: ChatAskInputBase
): Promise<{ ok: true; data: ChatPrepared } | { ok: false; error: string }> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader', 'Worker']);
  if (auth.error !== null) return { ok: false, error: auth.error };
  const userId = auth.user?.id;
  const role = auth.user?.role ?? 'Employee';
  const addr = address(auth.user?.gender);
  const Addr = capitalize(addr);
  if (!userId) return { ok: false, error: 'Không xác định được tài khoản.' };

  const question = (input.question || '').trim();
  if (!question) return { ok: false, error: `${Addr} chưa nhập câu hỏi.` };

  const recent = await countRecent(userId);
  if (recent >= CHAT_LIMIT) {
    return { ok: false, error: `${Addr} đã dùng hết 15 lượt hỏi trong 2 giờ. Vui lòng quay lại sau nhé.` };
  }

  if (!isAIConfigured()) {
    return { ok: false, error: `Tính năng trợ lý chưa sẵn sàng, ${addr} vui lòng thử lại sau ạ.` };
  }

  // Reserve slot: ghi nhận usage TRƯỚC khi gọi AI (tránh race condition / burn quota)
  const { error: reserveErr } = await supabaseAdmin.from('chat_usage').insert({ user_id: userId });
  if (reserveErr) {
    console.error('chat_usage reserve error:', reserveErr.message);
    return { ok: false, error: `Hệ thống tạm thời bận, ${addr} vui lòng thử lại sau nhé.` };
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
  prompt = `Thông tin người hỏi: chức vụ = ${roleLabel(role)}, trang đang mở = ${page}.${pageContext}\n\n${prompt}`;

  return { ok: true, data: { userId, role, addr, Addr, user: auth.user, question, prompt } };
}

export async function chatAskAction(input: {
  question: string;
  pathname: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<{ reply?: string; error?: string }> {
  const prepared = await prepareChatContext(input);
  if (!prepared.ok) return { error: prepared.error };
  const { role, addr, user, prompt } = prepared.data;

  if (input.question.length > 500) {
    return { error: `Câu hỏi hơi dài, ${addr} rút gọn lại giúp em ạ.` };
  }

  const reply = await callAI(prompt, {
    system: buildSystem(role, user?.gender),
    maxTokens: 800,
    temperature: 0.4,
  });
  if (!reply) {
    return { error: `Em chưa trả lời được lúc này, ${addr} thử lại sau nhé.` };
  }
  return { reply };
}

export async function chatAskWithScreenshotAction(input: {
  question: string;
  pathname: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
  imageBase64: string;
}): Promise<{ reply?: string; error?: string }> {
  // server-side size cap: độ dài chuỗi base64 ≤ 900KB (Reviewer R2+R3) — check trước khi tốn quota
  if (!input.imageBase64 || input.imageBase64.length > 921600) {
    const addr = 'anh/chị';
    return { error: `Ảnh quá lớn hoặc không hợp lệ. ${capitalize(addr)} thử lại với ảnh nhỏ hơn ạ.` };
  }

  const prepared = await prepareChatContext(input);
  if (!prepared.ok) return { error: prepared.error };
  const { role, addr, Addr, user, prompt } = prepared.data;

  const system = buildSystem(role, user?.gender) + `\n${Addr} vừa gửi ẢNH MÀN HÌNH kèm câu hỏi. Hãy phân tích ảnh kết hợp câu hỏi và trả lời cụ thể.`;
  const reply = await callAIVision(`${prompt}\n\nẢnh màn hình đính kèm.`, input.imageBase64, { maxTokens: 800, system });
  if (!reply) return { error: `Em chưa phân tích được ảnh lúc này, ${addr} thử lại sau nhé.` };
  return { reply };
}

export async function chatReportErrorAction(input: {
  question: string;
  pathname: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<{ reply?: string; error?: string }> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader', 'Worker']);
  if (auth.error !== null) return { error: auth.error };
  const userId = auth.user?.id;
  if (!userId) return { error: 'Không xác định được tài khoản.' };
  const addr = address(auth.user?.gender);
  const Addr = capitalize(addr);

  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const vnNow = new Date(Date.now() + VN_OFFSET_MS);
  const startOfDayVn = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate());
  const startOfDay = new Date(startOfDayVn - VN_OFFSET_MS).toISOString();
  const { count, error: countErr } = await supabaseAdmin
    .from('chat_reports').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).gte('created_at', startOfDay);
  if (!countErr && (count ?? 0) >= 1) {
    return { reply: `Hôm nay ${addr} đã gửi báo lỗi rồi, ngày mai gửi lại nhé. Em vẫn theo dõi và sẽ phản hồi sớm ạ.` };
  }

  const question = (input.question || '').trim().slice(0, 2000);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_HOME_CHANNEL;
  if (!token || !chatId) {
    return { error: `Em chưa gửi được báo lỗi tới Developer lúc này, ${addr} vui lòng thông báo cho Manager nhé.` };
  }
  try {
    const page = pageName(input.pathname || '');
    const name = auth.user?.name || '?';
    const role = auth.user?.role || '?';

    const historyText = (input.history || []).map((m) => `${m.role === 'user' ? Addr : 'Em'}: ${m.text}`).join('\n').slice(0, 8000);
    // Tóm tắt AI (gpt-5.6-luna) — ngữ cảnh lỗi gọn; fallback: 6 lượt gần nhất
    let contextSummary = historyText.split('\n').slice(-6).join('\n');
    try {
      if (isAIConfigured()) {
        const s = await callAI(
          `Hãy tóm tắt NGẮN GỌN (~100 từ) nội dung hội thoại hỗ trợ dưới đây để developer điều tra lỗi: vấn đề chính, user đã thử gì, kết quả. Không thêm giả định.\n\nHội thoại:\n${historyText || '(không có)'}`,
          { system: 'Bạn là trợ lý tóm tắt kỹ thuật tiếng Việt. Trả về đúng ~100 từ, không dẫn dắt.', maxTokens: 200, temperature: 0.2 }
        );
        if (s) contextSummary = s;
      }
    } catch { /* fallback giữ 6 lượt */ }

    // Lưu vào chat_reports (service role) để Mika cron tự điều tra
    let reportId: string | null = null;
    try {
      const { data: reportRow } = await supabaseAdmin
        .from('chat_reports').insert({
          user_name: name,
          role,
          pathname: input.pathname || '',
          question,
          history: historyText,
          user_id: userId,
        })
        .select('id').single();
      reportId = reportRow?.id || null;
    } catch (err) {
      console.error('chat_reports insert error:', err);
    }

    // POST webhook tức thì → Mika điều tra (event-driven; chỉ khi env cấu hình — KURABE chạy Pi5/LAN; Vercel bỏ trống → fallback cron)
    const webhookUrl = process.env.KURABE_WEBHOOK_URL;
    const webhookSecret = process.env.KURABE_WEBHOOK_SECRET;
    if (webhookUrl && webhookSecret) {
      try {
        const payload = JSON.stringify({
          user_name: name,
          role,
          pathname: input.pathname || '',
          question,
          summary: contextSummary,
          report_id: reportId,
        });
        const ts = Math.floor(Date.now() / 1000).toString();
        const crypto = await import('node:crypto');
        const sig = crypto
          .createHmac('sha256', webhookSecret)
          .update(`${ts}.${payload}`)
          .digest('hex');
        const wh = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature-V2': sig,
            'X-Webhook-Timestamp': ts,
          },
          body: payload,
          signal: AbortSignal.timeout(10000),
        });
        if (!wh.ok) console.error('webhook POST error:', wh.status);
      } catch (err) {
        console.error('webhook POST error:', err);
      }
    }
    const summary = `[BÁO LỖI KURABE]\nNgười: ${name} (${role})\nTrang: ${page}\nCâu hỏi/lỗi: ${question}\nBối cảnh: ${contextSummary.slice(0, 400)}\nLúc: ${new Date().toLocaleString('vi-VN')}`;

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: summary, parse_mode: 'Markdown' }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error('Telegram send error:', res.status);
      return { error: `Em chưa gửi được báo lỗi tới Developer lúc này, ${addr} vui lòng thông báo cho Manager nhé.` };
    }
    return { reply: `${Addr} hãy thông báo lỗi này cho Manager nhé. Lỗi này cũng đã được gửi về cho Developer để xử lý.` };
  } catch (err) {
    console.error('Telegram send error:', err);
    return { error: `Em chưa gửi được báo lỗi tới Developer lúc này, ${addr} vui lòng thông báo cho Manager nhé.` };
  }
}

