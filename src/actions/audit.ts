'use server';

import { requireAuth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function logAuditAction(
  action: string,
  entity: string,
  entityId: string
): Promise<{ success: boolean }> {
  const auth = await requireAuth();
  if (auth.error !== null) return { success: false };
  try {
    await logAudit(auth.user, action, entity, entityId);
    return { success: true };
  } catch {
    return { success: false };
  }
}
