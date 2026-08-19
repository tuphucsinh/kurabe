import 'server-only';

import { User } from '@/types';
import { getUsersAdmin, getUserByIdAdmin, getAllUsersAdmin } from '@/lib/db/users-admin';
import { getTeamByIdAdmin } from '@/lib/db/teams-admin';
import { matchEmployeeCandidates, roleLabel } from '@/lib/vi-text';
import { getActivePeriod } from '@/lib/db/evaluations';
import { getEvaluationByEmployeeAdmin } from '@/lib/db/evaluations-admin';
import { EvaluationRound } from '@/types';

function firstName(name?: string | null): string {
  const n = (name || '').trim();
  return n ? n.split(/\s+/).pop() || '' : '';
}

function addrOf(gender?: string | null): string {
  return gender === 'Nam' ? 'anh' : 'chị';
}

function roundStatusLabel(r: EvaluationRound): string {
  if (r.status === 'Submitted') return r.totalScore > 0 ? `đã nộp (${r.totalScore}đ)` : 'đã nộp';
  if (r.status === 'Draft') return 'đang nháp';
  return 'chưa nộp';
}

/** Trạng thái kỳ + từng vòng đánh giá của 1 nhân viên (scoped theo viewer) — Phase 91.2. Fail-soft → ''. */
export async function buildEvaluationStatus(employeeId: string, requester?: User | null): Promise<string> {
  try {
    if (!requester || !employeeId) return '';
    const period = await getActivePeriod();
    if (!period) return '';
    const ev = await getEvaluationByEmployeeAdmin(employeeId, period.id, requester);
    if (!ev || !Array.isArray(ev.rounds) || ev.rounds.length === 0) return '';
    const rounds = [...ev.rounds]
      .sort((a, b) => Number(a.round) - Number(b.round))
      .map((r) => `L${r.round}: ${roundStatusLabel(r)}`)
      .join('; ');
    const cur = ev.currentRound ? `vòng đang mở L${ev.currentRound}` : '';
    return `kỳ ${period.name || 'hiện tại'} (${period.status}); ${cur ? `${cur}; ` : ''}${rounds}.`;
  } catch {
    return '';
  }
}

export type EmployeeContextResult = { kind: 'found' | 'multiple' | 'different_team' | 'not_found'; text: string };

/**
 * Build ngữ cảnh người được nhắc trong câu hỏi chat (Phase 91.1).
 * - found: CÙNG nhóm (Leader/SubLeader) hoặc Manager → đủ thông tin (tên, chức vụ, chức danh=description, nhóm, Leader). KHÔNG mã NV.
 * - multiple: ≥2 người cùng tên trong scope → liệt kê + yêu cầu hỏi lại.
 * - different_team: non-Manager hỏi người KHÁC nhóm → chỉ báo 'không cùng nhóm', KHÔNG lộ thông tin.
 * - not_found: không tồn tại / ngoài phạm vi → '' (AI trả generic, không bịa).
 * Fail-soft: lỗi → not_found.
 */
export async function buildEmployeeContext(
  question?: string | null,
  requester?: User | null
): Promise<EmployeeContextResult> {
  try {
    if (!requester || !question) return { kind: 'not_found', text: '' };

    // scope: Manager=all, Leader/SubLeader=team mình, Employee/Worker=self
    const scoped = await getUsersAdmin(requester);
    const cs = matchEmployeeCandidates(question, scoped);

    if (cs.length > 0) {
      // Ưu tiên nhóm hậu tố DÀI nhất (đặc thù nhất) — chỉ 'trùng tên' khi 2+ người cùng dài nhất
      const maxLen = Math.max(...cs.map((c) => c.bestLen));
      const tight = cs.filter((c) => c.bestLen === maxLen);

      if (tight.length === 1) {
        const u = scoped.find((x) => x.id === tight[0].id);
        if (!u) return { kind: 'not_found', text: '' };
        const team = u.teamId ? await getTeamByIdAdmin(u.teamId, requester).catch(() => null) : null;
        let leaderFirst = '';
        if (team?.leaderId) {
          const leader = await getUserByIdAdmin(team.leaderId, requester).catch(() => null);
          if (leader) leaderFirst = firstName(leader.name);
        }
        const title = (u.description || '').trim() || 'chưa có';
        const evStatus = await buildEvaluationStatus(u.id, requester);
        return {
          kind: 'found',
          text: `\nNgười được nhắc: ${u.name}; chức vụ = ${roleLabel(u.role)}; chức danh = ${title}; nhóm = ${team?.name || 'Chưa có nhóm'}${leaderFirst ? ` (Leader ${leaderFirst})` : ''}.${evStatus ? `\nTrạng thái đánh giá (của ${firstName(u.name)}): ${evStatus}` : ''}`,
        };
      }

      const listed: string[] = [];
      for (const c of tight) {
        const u = scoped.find((x) => x.id === c.id);
        if (!u) continue;
        const team = u.teamId ? await getTeamByIdAdmin(u.teamId, requester).catch(() => null) : null;
        const title = (u.description || '').trim() || '';
        listed.push(`${u.name} (nhóm ${team?.name || 'Chưa có nhóm'}, chức vụ ${roleLabel(u.role)}${title ? `, chức danh ${title}` : ''})`);
      }
      return {
        kind: 'multiple',
        text: `\nCâu hỏi khớp nhiều người cùng tên: ${listed.join('; ')}. Hãy hỏi lại ${addrOf(requester.gender)} muốn nhắc tới người nào.`,
      };
    }

    // 0 trong scope → kiểm tra 'khác nhóm' (trừ Manager — Manager thấy hết)
    if (requester.role !== 'Manager') {
      const all = await getAllUsersAdmin().catch(() => []);
      const csAll = matchEmployeeCandidates(question, all);
      if (csAll.length > 0) {
        const u = all.find((x) => x.id === csAll[0].id);
        if (u && u.teamId !== requester.teamId) {
          const fName = firstName(u.name) || '(tên chưa rõ)';
          return {
            kind: 'different_team',
            text: `\nNgười được nhắc (${fName}) không cùng nhóm với ${addrOf(requester.gender)} — không tư vấn thông tin của người này.`,
          };
        }
      }
    }

    return { kind: 'not_found', text: '' };
  } catch {
    return { kind: 'not_found', text: '' };
  }
}
