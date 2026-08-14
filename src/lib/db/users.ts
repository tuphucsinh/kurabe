import { supabase } from '../supabase';
import { User, Role } from '@/types';
import { DatabaseError } from '../errors';
import { Tables, TablesInsert, TablesUpdate } from '@/types/database';
import { getEvaluationFlow } from '@/lib/evaluation-workflow';
import { resolveEvaluatorFromList, EvaluationSubject } from '@/lib/evaluator-resolver';

type DbUser = Tables<'users'>;

/**
 * Các cột users anon được phép SELECT (P69T02 — migration-i-password-revoke).
 * KHÔNG bao gồm password_hash (anon bị REVOKE — select('*') sẽ lỗi "permission denied for table users").
 * Mọi code đọc user qua anon client PHẢI dùng hằng này thay vì select('*').
 */
export const USER_SELECT =
  'id, employee_code, name, role, team_id, join_date, avatar_url, created_at, is_active, subleader_id, description';

/**
 * RULE: Team chỉ được 1 Leader; SubLeader không giới hạn số lượng.
 * Muốn thay đổi Leader → phải hạ người giữ chức hiện tại xuống
 * Employee TRƯỚC, rồi mới thăng người khác lên.
 * Throw DatabaseError nếu team đã có người giữ chức khác.
 */
async function assertLeadershipSlot(
  candidate: Partial<User>,
  existingUsers: Pick<User, 'id' | 'role' | 'teamId'>[]
): Promise<void> {
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
    throw new DatabaseError(
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
        await supabase.from('teams').update({ leader_id: user.id }).eq('id', user.teamId);
      } else {
        await supabase
          .from('teams')
          .update({ leader_id: null })
          .eq('id', user.teamId)
          .eq('leader_id', user.id); // chỉ xóa nếu đang là leader của team này
      }
    }

    // 1. Đồng bộ employee_role và team_id trên mọi evaluation
    await supabase
      .from('evaluations')
      .update({
        employee_role: user.role,
        team_id: user.teamId || null,
      })
      .eq('employee_id', user.id);

    // 2. Lấy toàn bộ user active để resolve evaluator
    const { data: allUsers } = await supabase
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
    const { data: evs } = await supabase
      .from('evaluations')
      .select('id, team_id')
      .eq('employee_id', user.id);

    for (const ev of evs || []) {
      const { data: rounds } = await supabase
        .from('evaluation_rounds')
        .select('id, round, status, submitted_at')
        .eq('evaluation_id', ev.id)
        .order('round');

      for (const r of rounds || []) {
        if (r.status === 'Submitted' || r.submitted_at) continue; // đã submit → giữ nguyên

        const step = flow.find(s => s.round === r.round);
        if (!step) continue;

        const evaluator = resolveEvaluatorFromList(step.evaluator, subject, subjects);

        await supabase
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

export async function getUsers(requester?: User | null, options?: { limit?: number; offset?: number }): Promise<User[]> {
  let query = supabase
    .from('users')
    .select(USER_SELECT)
    .eq('is_active', true);

  if (requester && requester.role !== 'Manager') {
    if (requester.role === 'Employee') {
      query = query.eq('id', requester.id);
    } else if ((requester.role === 'Leader' || requester.role === 'SubLeader') && requester.teamId) {
      query = query.eq('team_id', requester.teamId);
    }
  }

  let orderedQuery = query.order('name');
  
  if (options?.limit) {
    orderedQuery = orderedQuery.limit(options.limit);
    if (options?.offset) {
      // Supabase range is inclusive: range(start, end)
      orderedQuery = orderedQuery.range(options.offset, options.offset + options.limit - 1);
    }
  }

  const { data, error } = await orderedQuery;

  if (error) {
    throw new DatabaseError('Error fetching users', error);
  }

  return (data || []).map(mapUserFromDb);
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select(USER_SELECT)
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new DatabaseError('Error fetching user', error);
  }

  return mapUserFromDb(data);
}

export async function getUsersByTeam(teamId: string): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select(USER_SELECT)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('name');

  if (error) {
    throw new DatabaseError('Error fetching users by team', error);
  }

  return (data || []).map(mapUserFromDb);
}

export async function upsertUser(user: Partial<User>): Promise<User | null> {
  // Rule: 1 team = 1 Leader + 1 SubLeader — chặn thăng khi team đã có người giữ chức
  if (user.role === 'Leader' || user.role === 'SubLeader') {
    const { data: existing } = await supabase
      .from('users')
      .select('id, role, team_id')
      .eq('is_active', true);
    await assertLeadershipSlot(user, (existing || []).map(mapSlot));
  }

  const role = user.role || 'Employee';
  const dbUser: TablesInsert<'users'> = {
    id: user.id,
    employee_code: user.employeeCode || '',
    name: user.name || '',
    role,
    team_id: user.teamId || null,
    join_date: user.joinDate || null,
    avatar_url: user.avatar || null,
    subleader_id: role === 'Employee' ? (user.subleaderId || null) : null,
    description: user.description || null,
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(dbUser)
    .select(USER_SELECT)
    .single();

  if (error) {
    throw new DatabaseError('Error upserting user', error);
  }

  const saved = mapUserFromDb(data);

  // Đổi chức vụ/team/SubLeader → đồng bộ evaluation + round 1 theo flow mới
  if (user.role || user.teamId || user.subleaderId !== undefined) {
    await syncEvaluationAfterUserChange(saved);
  }


  return saved;
}

export async function upsertUsers(users: Partial<User>[]): Promise<User[]> {
  // Rule: chặn nếu batch cố thăng cấp lên slot đã có người giữ (trong DB hiện tại)
  const { data: existing } = await supabase
    .from('users')
    .select('id, role, team_id')
    .eq('is_active', true);
  const existingSlots = (existing || []).map(mapSlot);
  for (const u of users) {
    if (u.role === 'Leader' || u.role === 'SubLeader') {
      await assertLeadershipSlot(u, existingSlots);
    }
  }

  const dbUsers: TablesInsert<'users'>[] = users.map(user => {
    const role = user.role || 'Employee';
    return {
      id: user.id,
      employee_code: user.employeeCode || '',
      name: user.name || '',
      role,
      team_id: user.teamId || null,
      join_date: user.joinDate || null,
      avatar_url: user.avatar || null,
      subleader_id: role === 'Employee' ? (user.subleaderId || null) : null,
      description: user.description || null,
      is_active: true
    };
  });

  const { data, error } = await supabase
    .from('users')
    .upsert(dbUsers)
    .select(USER_SELECT);

  if (error) {
    throw new DatabaseError('Error batch upserting users', error);
  }

  const saved = (data || []).map(mapUserFromDb);

  // Đồng bộ evaluation cho user đổi chức vụ
  for (const u of saved) {
    const orig = users.find(x => x.id === u.id || x.employeeCode === u.employeeCode);
    if (orig?.role || orig?.teamId) {
      await syncEvaluationAfterUserChange(u);
    }
  }

  return saved;
}

function mapSlot(u: { id: string; role: string; team_id: string | null }): Pick<User, 'id' | 'role' | 'teamId'> {
  return { id: u.id, role: u.role as Role, teamId: u.team_id || '' };
}

export async function softDeleteUser(id: string): Promise<void> {
  const update: TablesUpdate<'users'> = { is_active: false };
  const { error } = await supabase
    .from('users')
    .update(update)
    .eq('id', id);

  if (error) throw new DatabaseError('Error soft deleting user', error);


}

export function mapUserFromDb(dbUser: Omit<DbUser, 'password_hash'>): User {
  return {
    id: dbUser.id,
    employeeCode: dbUser.employee_code || '',
    name: dbUser.name,
    role: dbUser.role as Role,
    teamId: dbUser.team_id || '',
    joinDate: dbUser.join_date || '',
    avatar: dbUser.avatar_url || undefined,
    subleaderId: dbUser.subleader_id,
    description: dbUser.description,
  };
}

