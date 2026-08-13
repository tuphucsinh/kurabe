'use server';

import { softDeleteUser, upsertUser } from '@/lib/db/users';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { User } from '@/types';

export async function deleteUserAction(id: string) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    await softDeleteUser(id);
    revalidatePath('/users');
    revalidatePath('/employees');
    await logAudit(auth.user, 'DELETE_USER', 'user', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function upsertUserAction(userData: Partial<User>) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const saved = await upsertUser(userData);
    revalidatePath('/employees');
    revalidatePath('/users');
    await logAudit(auth.user, userData.id ? 'UPDATE_USER' : 'CREATE_USER', 'user', saved?.id || '');
    return { success: true, data: saved };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

