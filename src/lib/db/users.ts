import { supabase } from '../supabase';
import { User, Role } from '@/types';
import { DatabaseError } from '../errors';
import { Tables, TablesInsert, TablesUpdate } from '@/types/database';

type DbUser = Tables<'users'>;

export async function getUsers(requester?: User | null): Promise<User[]> {
  let query = supabase
    .from('users')
    .select('*')
    .eq('is_active', true);

  if (requester && requester.role !== 'Manager') {
    if (requester.role === 'Employee') {
      query = query.eq('id', requester.id);
    } else if ((requester.role === 'Leader' || requester.role === 'SubLeader') && requester.teamId) {
      query = query.eq('team_id', requester.teamId);
    }
  }

  const { data, error } = await query.order('name');

  if (error) {
    throw new DatabaseError('Error fetching users', error);
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
    if (error.code === 'PGRST116') return null; // Not found
    throw new DatabaseError('Error fetching user', error);
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
    throw new DatabaseError('Error fetching users by team', error);
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
    throw new DatabaseError('Error upserting user', error);
  }

  return mapUserFromDb(data);
}

export async function upsertUsers(users: Partial<User>[]): Promise<User[]> {
  const dbUsers: TablesInsert<'users'>[] = users.map(user => ({
    id: user.id,
    employee_code: user.employeeCode || '',
    name: user.name || '',
    role: user.role || 'Employee',
    team_id: user.teamId || null,
    join_date: user.joinDate || null,
    avatar_url: user.avatar || null,
    is_active: true
  }));

  const { data, error } = await supabase
    .from('users')
    .upsert(dbUsers)
    .select();

  if (error) {
    throw new DatabaseError('Error batch upserting users', error);
  }

  return (data || []).map(mapUserFromDb);
}

export async function softDeleteUser(id: string): Promise<void> {
  const update: TablesUpdate<'users'> = { is_active: false };
  const { error } = await supabase
    .from('users')
    .update(update)
    .eq('id', id);

  if (error) throw new DatabaseError('Error soft deleting user', error);
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

