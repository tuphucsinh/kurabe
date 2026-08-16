import { Team } from '@/types';
import { Tables } from '@/types/database';

type DbTeam = Tables<'teams'>;

export function mapTeamFromDb(dbTeam: DbTeam): Team {
  return {
    id: dbTeam.id,
    name: dbTeam.name,
    leaderId: dbTeam.leader_id || null,
  };
}
