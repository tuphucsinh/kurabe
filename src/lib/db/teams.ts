import { supabase } from '../supabase';
import { Team } from '@/types';
import { Database } from '@/types/database';

type DbTeam = Database['public']['Tables']['teams']['Row'];

export async function upsertTeam(team: Partial<Team>): Promise<void> {
  const { error } = await supabase
    .from('teams')
    .upsert({
      id: team.id,
      name: team.name,
      leader_id: team.leaderId
    } as any);

  if (error) console.error('Error upserting team:', error.message || error);
}

export async function getTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching teams:', error);
    return [];
  }

  return (data || []).map(mapTeamFromDb);
}

export async function getTeamById(id: string): Promise<Team | null> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching team:', error);
    }
    return null;
  }

  return mapTeamFromDb(data);
}

function mapTeamFromDb(dbTeam: DbTeam): Team {
  return {
    id: dbTeam.id,
    name: dbTeam.name,
    leaderId: dbTeam.leader_id || null,
  };
}
