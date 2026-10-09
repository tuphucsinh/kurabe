import { supabaseAdmin } from '@/lib/supabase-admin';
import { redactAISecrets } from '@/lib/ai-governance';
import { User } from '@/types';

const MAX_AUDIT_DIAGNOSTIC_CHARS = 300;

/** Redacted, structured audit diagnostic — never carries tokens/secrets/raw SQL payloads. */
export interface AuditDiagnostic {
  code?: string;
  message: string;
}

/**
 * Result of an audit write. Business outcomes MUST NOT depend on this value;
 * it exists so a swallowed audit failure stays observable to the caller.
 */
export interface AuditLogResult {
  ok: boolean;
  error?: AuditDiagnostic;
}

function toRedactedAuditDiagnostic(err: unknown): AuditDiagnostic {
  const record = err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const code = typeof record.code === 'string' ? record.code.slice(0, 32) : undefined;
  const raw =
    typeof record.message === 'string'
      ? record.message
      : typeof err === 'string'
        ? err
        : 'audit-write-failed';
  const message = redactAISecrets(raw)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, MAX_AUDIT_DIAGNOSTIC_CHARS);
  return code ? { code, message } : { message };
}

/**
 * Emit a redacted structured diagnostic. Invoked for BOTH a returned Supabase
 * error and a thrown error, so an audit failure is never silent.
 */
function emitAuditDiagnostic(
  action: string,
  entity: string,
  entityId: string | null | undefined,
  diagnostic: AuditDiagnostic
): void {
  console.error('[audit-failure]', {
    action,
    entity,
    entityId: entityId ?? null,
    code: diagnostic.code ?? null,
    message: diagnostic.message,
  });
}

/**
 * Ghi nhật ký hành động (fire-and-forget — lỗi KHÔNG làm fail action chính).
 * Dùng service-role client (vượt RLS — anon chỉ SELECT).
 * P107M1T08: kiểm tra CẢ error trả về LẪN lỗi ném ra; phát diagnostic đã redact;
 * KHÔNG bao giờ throw, và KHÔNG bao giờ khiến business outcome phụ thuộc audit.
 */
export async function logAudit(
  actor: User | null,
  action: string,
  entity: string,
  entityId?: string | null,
  detail?: Record<string, unknown> | null
): Promise<AuditLogResult> {
  try {
    const { error } = await supabaseAdmin.from('audit_logs').insert({
      actor_id: actor?.id ?? null,
      actor_name: actor?.name ?? 'unknown',
      action,
      entity,
      entity_id: entityId ?? null,
      detail: detail ?? null,
    });
    if (error) {
      const diagnostic = toRedactedAuditDiagnostic(error);
      emitAuditDiagnostic(action, entity, entityId, diagnostic);
      return { ok: false, error: diagnostic };
    }
    return { ok: true };
  } catch (err) {
    const diagnostic = toRedactedAuditDiagnostic(err);
    emitAuditDiagnostic(action, entity, entityId, diagnostic);
    return { ok: false, error: diagnostic };
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
export async function logAuditBatch(actor: User | null, entries: AuditEntry[]): Promise<AuditLogResult> {
  if (!entries.length) return { ok: true };
  try {
    const { error } = await supabaseAdmin.from('audit_logs').insert(
      entries.map((e) => ({
        actor_id: actor?.id ?? null,
        actor_name: actor?.name ?? 'unknown',
        action: e.action,
        entity: e.entity,
        entity_id: e.entityId ?? null,
        detail: e.detail ?? null,
      }))
    );
    if (error) {
      const diagnostic = toRedactedAuditDiagnostic(error);
      emitAuditDiagnostic('BATCH', 'audit_logs', null, diagnostic);
      return { ok: false, error: diagnostic };
    }
    return { ok: true };
  } catch (err) {
    const diagnostic = toRedactedAuditDiagnostic(err);
    emitAuditDiagnostic('BATCH', 'audit_logs', null, diagnostic);
    return { ok: false, error: diagnostic };
  }
}
