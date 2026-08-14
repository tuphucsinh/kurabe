'use server';

import { softDeleteUser } from '@/lib/db/users';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function deleteUserAction(id: string) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    await softDeleteUser(id);
    revalidateTag('dashboard-data', 'default');
    revalidateTag('report-aggregation', 'default');
    revalidatePath('/users');
    revalidatePath('/employees');
    await logAudit(auth.user, 'DELETE_USER', 'user', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

