'use server';

import { requireAuth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const ALLOWED_ACTIONS = new Set([
  'CREATE_PERIOD',
  'CLOSE_PERIOD',
  'DELETE_PERIOD',
  'UPDATE_PERIOD_TARGET',
  'CREATE_USER',
  'UPDATE_USER',
  'DELETE_USER',
  'IMPORT_USERS',
  'CREATE_TEAM',
  'UPDATE_TEAM',
  'DELETE_TEAM',
  'CREATE_CRITERIA_GROUP',
  'UPDATE_CRITERIA_GROUP',
  'DELETE_CRITERIA_GROUP',
  'CREATE_CRITERION',
  'UPDATE_CRITERION',
  'DELETE_CRITERION',
  'UPDATE_GRADE_BANDS',
  'SUBMIT_EVALUATION_ROUND',
  'RETURN_EVALUATION',
  'SAVE_RESULT_MESSAGE',
  'CHANGE_PASSWORD',
  'RESET_PASSWORD',
]);

const ALLOWED_ENTITIES = new Set([
  'period',
  'user',
  'team',
  'criteria_group',
  'criterion',
  'grade_bands',
  'evaluation',
]);

export async function logAuditAction(
  action: string,
  entity: string,
  entityId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAuth();
  if (auth.error !== null) return { success: false, error: auth.error };

  const cleanAction = (action || '').trim().toUpperCase();
  const cleanEntity = (entity || '').trim().toLowerCase();

  if (!ALLOWED_ACTIONS.has(cleanAction) || !ALLOWED_ENTITIES.has(cleanEntity)) {
    console.warn(`logAuditAction rejected unknown action/entity: action="${action}", entity="${entity}" by user=${auth.user.id}`);
    return { success: false, error: 'Hành động hoặc đối tượng không hợp lệ.' };
  }

  try {
    await logAudit(auth.user, cleanAction, cleanEntity, entityId);
    return { success: true };
  } catch {
    return { success: false };
  }
}
