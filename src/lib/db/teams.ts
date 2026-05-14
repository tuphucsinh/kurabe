import { supabase } from '../supabase';
import { Team, User } from '@/types';
import { DatabaseError } from '../errors';
import { Tables, TablesInsert, TablesUpdate } from '@/types/database';

type DbTeam = Tables<'teams'>;

export async function upsertTeam(team: Partial<Team>): Promise<void> {
  const dbTeam: TablesInsert<'teams'> = {
    id: team.id,
    name: team.name || '',
    leader_id: team.leaderId || null
  };

  const { error } = await supabase
    .from('teams')
    .upsert(dbTeam);

  if (error) throw new DatabaseError('Error upserting team', error);
}

export async function getTeams(requester?: User | null): Promise<Team[]> {
  let query = supabase
    .from('teams')
    .select('*')
    .eq('is_active', true);

  if (requester && requester.role !== 'Manager') {
    if ((requester.role === 'Leader' || requester.role === 'SubLeader') && requester.teamId) {
      query = query.eq('id', requester.teamId);
    } else if (requester.role === 'Employee') {
      // Employees might not need to see teams, but if they do, only their own
      query = query.eq('id', requester.teamId);
    }
  }

  const { data, error } = await query.order('name');

  if (error) {
    throw new DatabaseError('Error fetching teams', error);
  }

  return (data || []).map(mapTeamFromDb);
}

export async function getTeamById(id: string): Promise<Team | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new DatabaseError('Error fetching team', error);
  }

  return mapTeamFromDb(data);
}

export async function softDeleteTeam(id: string): Promise<void> {
  const update: TablesUpdate<'teams'> = { is_active: false };
  const { error } = await supabase
    .from('teams')
    .update(update)
    .eq('id', id);

  if (error) throw new DatabaseError('Error soft deleting team', error);
}

function mapTeamFromDb(dbTeam: DbTeam): Team {
  return {
    id: dbTeam.id,
    name: dbTeam.name,
    leaderId: dbTeam.leader_id || null,
  };
}

