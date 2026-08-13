'use server';

import { softDeleteTeam } from '@/lib/db/teams';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function deleteTeamAction(id: string) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    await softDeleteTeam(id);
    revalidatePath('/teams');
    await logAudit(auth.user, 'DELETE_TEAM', 'team', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
