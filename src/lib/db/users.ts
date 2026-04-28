import { supabase } from '../supabase';
import { User } from '@/types';

export async function getUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
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
    .order('name');

  if (error) {
    console.error('Error fetching users by team:', error);
    return [];
  }

  return (data || []).map(mapUserFromDb);
}

export async function upsertUser(user: Partial<User>): Promise<User | null> {
  const dbUser = {
    id: user.id,
    employee_code: user.employeeCode,
    name: user.name,
    role: user.role,
    team_id: user.teamId,
    join_date: user.joinDate,
    avatar_url: user.avatar
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

function mapUserFromDb(dbUser: any): User {
  return {
    id: dbUser.id,
    employeeCode: dbUser.employee_code,
    name: dbUser.name,
    role: dbUser.role as any,
    teamId: dbUser.team_id,
    joinDate: dbUser.join_date,
    avatar: dbUser.avatar_url,
  };
}
