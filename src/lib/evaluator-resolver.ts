import { supabase } from './supabase';
import { Role } from '@/types';
import { EvaluatorSelector } from './evaluation-workflow';

export interface EvaluatorResolution {
  id: string;
  role: Role;
}

export interface EvaluationSubject {
  id: string;
  role: Role;
  teamId: string | null;
  subleaderId?: string | null;
}

/**
 * Tìm evaluator tương ứng với selector từ Database (Runtime).
 */
export async function resolveEvaluatorFromDb(
  selector: EvaluatorSelector,
  subject: EvaluationSubject
): Promise<EvaluatorResolution | null> {
  if (selector === 'SELF') {
    return { id: subject.id, role: subject.role };
  }

  if (selector === 'SubLeader') {
    let subleaderId = subject.subleaderId;
    if (subleaderId === undefined) {
      const { data: user } = await supabase
        .from('users')
        .select('subleader_id')
        .eq('id', subject.id)
        .maybeSingle();
      subleaderId = user?.subleader_id;
    }

    if (subleaderId) {
      const { data: subLeader } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', subleaderId)
        .eq('role', 'SubLeader')
        .eq('is_active', true)
        .maybeSingle();

      if (subLeader) {
        return { id: subLeader.id, role: subLeader.role as Role };
      }
    }
    return null;
  }

  if (selector === 'Leader' && subject.teamId) {
    // 1. Tìm theo teams.leader_id trước
    const { data: team } = await supabase
      .from('teams')
      .select('leader_id')
      .eq('id', subject.teamId)
      .single();

    if (team?.leader_id) {
      const { data: teamLeader } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', team.leader_id)
        .eq('role', 'Leader')
        .eq('is_active', true)
        .single();

      if (teamLeader) {
        return { id: teamLeader.id, role: teamLeader.role as Role };
      }
    }

    // 2. Fallback tìm user bất kỳ có role Leader trong team
    const { data: fallbackLeader } = await supabase
      .from('users')
      .select('id, role')
      .eq('team_id', subject.teamId)
      .eq('role', 'Leader')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (fallbackLeader) {
      return { id: fallbackLeader.id, role: fallbackLeader.role as Role };
    }
  }

  if (selector === 'Manager') {
    const { data: manager } = await supabase
      .from('users')
      .select('id, role')
      .eq('role', 'Manager')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (manager) {
      return { id: manager.id, role: manager.role as Role };
    }
  }

  return null;
}

/**
 * Tìm evaluator tương ứng với selector từ danh sách bộ nhớ (Batch).
 */
export function resolveEvaluatorFromList(
  selector: EvaluatorSelector,
  subject: EvaluationSubject,
  allUsers: EvaluationSubject[]
): EvaluatorResolution | null {
  if (selector === 'SELF') {
    return { id: subject.id, role: subject.role };
  }

  if (selector === 'SubLeader') {
    if (!subject.subleaderId) return null;
    const subLeader = allUsers.find(u =>
      u.id === subject.subleaderId && u.role === 'SubLeader'
    );
    return subLeader ? { id: subLeader.id, role: subLeader.role } : null;
  }

  if (selector === 'Leader') {
    if (!subject.teamId) return null;
    const leader = allUsers.find(u =>
      u.teamId === subject.teamId && u.role === 'Leader'
    );
    return leader ? { id: leader.id, role: leader.role } : null;
  }

  if (selector === 'Manager') {
    const manager = allUsers.find(u => u.role === 'Manager');
    return manager ? { id: manager.id, role: manager.role } : null;
  }

  return null;
}
