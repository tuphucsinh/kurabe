'use server';

import { softDeleteUser } from '@/lib/db/users';
import { revalidatePath } from 'next/cache';

export async function deleteUserAction(id: string) {
  try {
    await softDeleteUser(id);
    revalidatePath('/users');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
