'use server';

import { softDeleteUser } from '@/lib/db/users';
import { requireManager } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function deleteUserAction(id: string) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    await softDeleteUser(id);
    revalidatePath('/users');
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
