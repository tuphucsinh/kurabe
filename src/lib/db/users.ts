import { supabase } from '../supabase';
import { User } from '@/types';
import { DatabaseError } from '../errors';
import { Tables } from '@/types/database';
import { parseRole } from '@/lib/parsers';

type DbUser = Tables<'users'>;

/**
 * Các cột users anon được phép SELECT (P69T02 — migration-i-password-revoke).
 * KHÔNG bao gồm password_hash (anon bị REVOKE — select('*') sẽ lỗi "permission denied for table users").
 * Mọi code đọc user qua anon client PHẢI dùng hằng này thay vì select('*').
 */
export const USER_SELECT =
  'id, employee_code, name, role, team_id, join_date, avatar_url, created_at, is_active, subleader_id, description, gender';

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

export function mapUserFromDb(dbUser: Omit<DbUser, 'password_hash'>): User {
  return {
    id: dbUser.id,
    employeeCode: dbUser.employee_code || '',
    name: dbUser.name,
    role: parseRole(dbUser.role),
    teamId: dbUser.team_id || '',
    joinDate: dbUser.join_date || '',
    avatar: dbUser.avatar_url || undefined,
    subleaderId: dbUser.subleader_id,
    description: dbUser.description,
    gender: dbUser.gender || 'Nữ',
  };
}
