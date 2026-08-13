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
  entityId?: string,
  detail?: Record<string, unknown>
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
