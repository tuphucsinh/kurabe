import 'server-only';

import { User } from '@/types';
import { getUsersAdmin, getUserByIdAdmin, getAllUsersAdmin } from '@/lib/db/users-admin';
import { getTeamByIdAdmin } from '@/lib/db/teams-admin';
import { matchEmployeeCandidates, roleLabel } from '@/lib/vi-text';

function firstName(name?: string | null): string {
  const n = (name || '').trim();
  return n ? n.split(/\s+/).pop() || '' : '';
}

function addrOf(gender?: string | null): string {
  return gender === 'Nam' ? 'anh' : 'chị';
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

    if (cs.length === 1) {
      const u = scoped.find((x) => x.id === cs[0].id);
      if (!u) return { kind: 'not_found', text: '' };
      const team = u.teamId ? await getTeamByIdAdmin(u.teamId, requester).catch(() => null) : null;
      let leaderFirst = '';
      if (team?.leaderId) {
        const leader = await getUserByIdAdmin(team.leaderId, requester).catch(() => null);
        if (leader) leaderFirst = firstName(leader.name);
      }
      const title = (u.description || '').trim() || 'chưa có';
      return {
        kind: 'found',
        text: `\nNgười được nhắc: ${u.name}; chức vụ = ${roleLabel(u.role)}; chức danh = ${title}; nhóm = ${team?.name || 'Chưa có nhóm'}${leaderFirst ? ` (Leader ${leaderFirst})` : ''}.`,
      };
    }

    if (cs.length > 1) {
      const listed: string[] = [];
      for (const c of cs) {
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
