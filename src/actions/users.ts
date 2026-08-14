'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath, revalidateTag } from 'next/cache';
import { User, Role } from '@/types';
import { Database } from '@/types/database';
import { mapUserFromDb, USER_SELECT } from '@/lib/db/users';
import { ensureEvaluationsForUsers } from '@/lib/db/evaluations-write';
import { getEvaluationFlow } from '@/lib/evaluation-workflow';
import { resolveEvaluatorFromList, EvaluationSubject } from '@/lib/evaluator-resolver';

type DbUserInsert = Database['public']['Tables']['users']['Insert'];

function mapSlot(u: { id: string; role: string; team_id: string | null }): Pick<User, 'id' | 'role' | 'teamId'> {
  return { id: u.id, role: u.role as Role, teamId: u.team_id || '' };
}

/**
 * RULE: Team chỉ được 1 Leader; SubLeader không giới hạn số lượng.
 * Muốn thay đổi Leader → phải hạ người giữ chức hiện tại xuống
 * Employee TRƯỚC, rồi mới thăng người khác lên.
 */
function assertLeadershipSlot(
  candidate: Partial<User>,
  existingUsers: Pick<User, 'id' | 'role' | 'teamId'>[]
): void {
  if (candidate.role !== 'Leader' || !candidate.teamId) {
    return; // Chỉ Leader bị ràng buộc slot (SubLeader không giới hạn)
  }
  const holders = existingUsers.filter(u =>
    u.teamId === candidate.teamId &&
    u.role === candidate.role &&
    u.id !== candidate.id // không tính chính người đang sửa
  );
  if (holders.length > 0) {
    const holderName = holders[0].id; // caller có thể enrich tên
    throw new Error(
      `Nhóm này đã có ${candidate.role === 'Leader' ? 'Leader' : 'SubLeader'}` +
      (holderName ? ` (id: ${holderName})` : '') +
      `. Muốn thay đổi, hãy hạ người giữ chức hiện tại xuống Nhân viên trước, rồi mới thăng người khác lên.`
    );
  }
}

/**
 * Đồng bộ evaluation + round 1 theo role/team MỚI của user sau khi đổi chức vụ.
 * - Cập nhật employee_role trên mọi evaluation của user (role là thuộc tính người, không phụ thuộc kỳ)
 * - Round 1: Employee → gán SubLeader team (nếu team có); Leader/SubLeader/Manager → SELF
 * - KHÔNG đụng round đã submit (giữ lịch sử)
 */
async function syncEvaluationAfterUserChange(user: User): Promise<void> {
  try {
    // 0. Đồng bộ teams.leader_id theo role hiện tại (rule: Leader = role user)
    //    - user thành Leader → set leader_id của team = user.id
    //    - user bị hạ khỏi Leader → xóa leader_id nếu đang trỏ tới user
    if (user.teamId) {
      if (user.role === 'Leader') {
        await supabaseAdmin.from('teams').update({ leader_id: user.id }).eq('id', user.teamId);
      } else {
        await supabaseAdmin
          .from('teams')
          .update({ leader_id: null })
          .eq('id', user.teamId)
          .eq('leader_id', user.id); // chỉ xóa nếu đang là leader của team này
      }
    }

    // 1. Đồng bộ employee_role và team_id trên mọi evaluation
    await supabaseAdmin
      .from('evaluations')
      .update({
        employee_role: user.role,
        team_id: user.teamId || null,
      })
      .eq('employee_id', user.id);

    // 2. Lấy toàn bộ user active để resolve evaluator
    const { data: allUsers } = await supabaseAdmin
      .from('users')
      .select('id, role, team_id, subleader_id')
      .eq('is_active', true);
    const subjects: EvaluationSubject[] = (allUsers || []).map(u => ({
      id: u.id,
      role: u.role as Role,
      teamId: u.team_id || null,
      subleaderId: u.subleader_id || null,
    }));

    const subject: EvaluationSubject = {
      id: user.id,
      role: user.role,
      teamId: user.teamId || null,
      subleaderId: user.subleaderId || null,
    };

    const flow = getEvaluationFlow(user.role);

    // 3. Round 1..3 theo flow mới (chỉ khi chưa submit)
    const { data: evs } = await supabaseAdmin
      .from('evaluations')
      .select('id, team_id')
      .eq('employee_id', user.id);

    for (const ev of evs || []) {
      const { data: rounds } = await supabaseAdmin
        .from('evaluation_rounds')
        .select('id, round, status, submitted_at')
        .eq('evaluation_id', ev.id)
        .order('round');

      for (const r of rounds || []) {
        if (r.status === 'Submitted' || r.submitted_at) continue; // đã submit → giữ nguyên

        const step = flow.find(s => s.round === r.round);
        if (!step) continue;

        const evaluator = resolveEvaluatorFromList(step.evaluator, subject, subjects);

        await supabaseAdmin
          .from('evaluation_rounds')
          .update({
            evaluator_id: evaluator?.id || null,
            evaluator_role: evaluator?.role || (step.evaluator as Role),
          })
          .eq('id', r.id);
      }
    }
  } catch (err) {
    // Sync là best-effort: không làm hỏng upsert user đã thành công
    console.error('syncEvaluationAfterUserChange error:', err);
  }
}

function revalidateUserPaths() {
  revalidateTag('dashboard-data', 'default');
  revalidateTag('report-aggregation', 'default');
  revalidatePath('/employees');
  revalidatePath('/teams');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  revalidatePath('/users');
}

export async function upsertUserAction(
  user: Partial<User>
): Promise<{ success: boolean; user?: User; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    let isNewUser = true;
    if (user.id) {
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (existingUser) {
        isNewUser = false;
      }
    }

    // Rule: 1 team = 1 Leader + 1 SubLeader — chặn thăng khi team đã có người giữ chức
    if (user.role === 'Leader' || user.role === 'SubLeader') {
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id, role, team_id')
        .eq('is_active', true);
      assertLeadershipSlot(user, (existing || []).map(mapSlot));
    }

    const role = user.role || 'Employee';
    const userId = user.id || crypto.randomUUID();
    const dbUser: DbUserInsert = {
      id: userId,
      employee_code: user.employeeCode || '',
      name: user.name || '',
      role,
      team_id: user.teamId || null,
      join_date: user.joinDate || null,
      avatar_url: user.avatar || null,
      subleader_id: role === 'Employee' ? (user.subleaderId || null) : null,
      description: user.description || null,
      is_active: true,
    };

    const { data, error } = await supabaseAdmin
      .from('users')
      .upsert(dbUser)
      .select(USER_SELECT)
      .single();

    if (error || !data) {
      return { success: false, error: 'Error upserting user: ' + (error?.message || 'unknown') };
    }

    const saved = mapUserFromDb(data);

    // Đổi chức vụ/team/SubLeader → đồng bộ evaluation + round 1 theo flow mới
    if (user.role || user.teamId || user.subleaderId !== undefined) {
      await syncEvaluationAfterUserChange(saved);
    }

    // Nếu user mới → gọi ensureEvaluationsForUsers (admin) nội bộ
    if (isNewUser) {
      try {
        await ensureEvaluationsForUsers([saved]);
      } catch (err) {
        console.error('ensureEvaluationsForUsers error:', err);
      }
    }

    await logAudit(
      auth.user,
      isNewUser ? 'CREATE_USER' : 'UPDATE_USER',
      'user',
      saved.id,
      { name: saved.name, role: saved.role, teamId: saved.teamId }
    );

    revalidateUserPaths();

    return { success: true, user: saved };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function upsertUsersAction(
  users: Partial<User>[]
): Promise<{ success: boolean; users?: User[]; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    if (!users || users.length === 0) {
      return { success: true, users: [] };
    }

    // Lấy danh sách users hiện có để check slot và check isNew
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id, role, team_id')
      .eq('is_active', true);
    
    const existingSlots = (existing || []).map(mapSlot);
    const existingIdSet = new Set((existing || []).map(e => e.id));

    for (const u of users) {
      if (u.role === 'Leader' || u.role === 'SubLeader') {
        assertLeadershipSlot(u, existingSlots);
      }
    }

    const dbUsers: DbUserInsert[] = users.map(user => {
      const role = user.role || 'Employee';
      return {
        id: user.id || crypto.randomUUID(),
        employee_code: user.employeeCode || '',
        name: user.name || '',
        role,
        team_id: user.teamId || null,
        join_date: user.joinDate || null,
        avatar_url: user.avatar || null,
        subleader_id: role === 'Employee' ? (user.subleaderId || null) : null,
        description: user.description || null,
        is_active: true,
      };
    });

    const { data, error } = await supabaseAdmin
      .from('users')
      .upsert(dbUsers)
      .select(USER_SELECT);

    if (error || !data) {
      return { success: false, error: 'Error batch upserting users: ' + (error?.message || 'unknown') };
    }

    const saved = (data || []).map(d => mapUserFromDb(d));

    // Đồng bộ evaluation cho user đổi chức vụ
    const newUsersList: User[] = [];
    for (const u of saved) {
      const orig = users.find(x => x.id === u.id || (x.employeeCode && x.employeeCode === u.employeeCode));
      if (orig?.role || orig?.teamId) {
        await syncEvaluationAfterUserChange(u);
      }
      if (!existingIdSet.has(u.id)) {
        newUsersList.push(u);
      }
    }

    // Tự tạo evaluation cho các user mới
    if (newUsersList.length > 0) {
      try {
        await ensureEvaluationsForUsers(newUsersList);
      } catch (err) {
        console.error('ensureEvaluationsForUsers batch error:', err);
      }
    }

    for (const u of saved) {
      const isNew = !existingIdSet.has(u.id);
      await logAudit(
        auth.user,
        isNew ? 'CREATE_USER' : 'UPDATE_USER',
        'user',
        u.id,
        { name: u.name, role: u.role, teamId: u.teamId }
      );
    }

    revalidateUserPaths();

    return { success: true, users: saved };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function softDeleteUserAction(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ is_active: false })
      .eq('id', id)
      .select('id');

    if (error) {
      return { success: false, error: 'Error soft deleting user: ' + error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Không tìm thấy nhân viên' };
    }

    revalidateUserPaths();
    await logAudit(auth.user, 'DELETE_USER', 'user', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export const deleteUserAction = softDeleteUserAction;
