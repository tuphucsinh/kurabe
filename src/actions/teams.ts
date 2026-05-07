'use server';

import { softDeleteTeam } from '@/lib/db/teams';
import { revalidatePath } from 'next/cache';

export async function deleteTeamAction(id: string) {
  try {
    await softDeleteTeam(id);
    revalidatePath('/teams');
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
