import { supabase } from '../supabase';
import { User, Role } from '@/types';
import { Tables, TablesInsert, TablesUpdate } from '@/types/database';

type DbUser = Tables<'users'>;

export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }

  return (data || []).map(mapUserFromDb);
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') { // Not found
      console.error('Error fetching user:', error);
    }
    return null;
  }

  return mapUserFromDb(data);
}

export async function getUsersByTeam(teamId: string): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching users by team:', error);
    return [];
  }

  return (data || []).map(mapUserFromDb);
}

export async function upsertUser(user: Partial<User>): Promise<User | null> {
  const dbUser: TablesInsert<'users'> = {
    id: user.id,
    employee_code: user.employeeCode || '',
    name: user.name || '',
    role: user.role || 'Employee',
    team_id: user.teamId || null,
    join_date: user.joinDate || null,
    avatar_url: user.avatar || null
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(dbUser)
    .select()
    .single();

  if (error) {
    console.error('Error upserting user:', error);
    return null;
  }

  return mapUserFromDb(data);
}

export async function softDeleteUser(id: string): Promise<void> {
  const update: TablesUpdate<'users'> = { is_active: false };
  const { error } = await supabase
    .from('users')
    .update(update)
    .eq('id', id);

  if (error) console.error('Error soft deleting user:', error);
}

export function mapUserFromDb(dbUser: DbUser): User {
  return {
    id: dbUser.id,
    employeeCode: dbUser.employee_code || '',
    name: dbUser.name,
    role: dbUser.role as Role,
    teamId: dbUser.team_id || '',
    joinDate: dbUser.join_date || '',
    avatar: dbUser.avatar_url || undefined,
  };
}

