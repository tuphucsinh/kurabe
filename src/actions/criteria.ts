'use server';

import { softDeleteCriteriaGroup, softDeleteCriterion } from '@/lib/db/criteria';
import { revalidatePath } from 'next/cache';

export async function deleteCriteriaGroupAction(id: string) {
  try {
    await softDeleteCriteriaGroup(id);
    revalidatePath('/criteria');
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function deleteCriterionAction(id: string) {
  try {
    await softDeleteCriterion(id);
    revalidatePath('/criteria');
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
