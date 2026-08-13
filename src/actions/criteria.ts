'use server';

import { softDeleteCriteriaGroup, softDeleteCriterion } from '@/lib/db/criteria';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export async function deleteCriteriaGroupAction(id: string) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    await softDeleteCriteriaGroup(id);
    revalidatePath('/criteria');
    await logAudit(auth.user, 'DELETE_CRITERIA_GROUP', 'criteria_group', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteCriterionAction(id: string) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    await softDeleteCriterion(id);
    revalidatePath('/criteria');
    await logAudit(auth.user, 'DELETE_CRITERION', 'criterion', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
