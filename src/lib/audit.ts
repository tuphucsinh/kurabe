import { supabaseAdmin } from '@/lib/supabase-admin';
import { User } from '@/types';

/**
 * Ghi nhật ký hành động (fire-and-forget — lỗi KHÔNG làm fail action chính).
 * Dùng service-role client (vượt RLS — anon chỉ SELECT).
 */
export async function logAudit(
  actor: User | null,
  action: string,
  entity: string,
  entityId?: string | null,
  detail?: Record<string, unknown> | null
): Promise<void> {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor?.id ?? null,
      actor_name: actor?.name ?? 'unknown',
      action,
      entity,
      entity_id: entityId ?? null,
      detail: detail ?? null,
    });
  } catch (err) {
    // Không bao giờ làm fail action chính
    console.error('logAudit error:', err);
  }
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: Record<string, unknown> | null;
}

/**
 * Ghi N audit log trong 1 insert duy nhất (batch import — C4).
 * Fire-and-forget như logAudit — lỗi không làm fail action chính.
 */
export async function logAuditBatch(actor: User | null, entries: AuditEntry[]): Promise<void> {
  if (!entries.length) return;
  try {
    await supabaseAdmin.from('audit_logs').insert(
      entries.map((e) => ({
        actor_id: actor?.id ?? null,
        actor_name: actor?.name ?? 'unknown',
        action: e.action,
        entity: e.entity,
        entity_id: e.entityId ?? null,
        detail: e.detail ?? null,
      }))
    );
  } catch (err) {
    console.error('logAuditBatch error:', err);
  }
}
