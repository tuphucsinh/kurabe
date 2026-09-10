import 'server-only';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeAIAction } from '@/lib/ai-governance';

const AI_LIMIT_PER_HOUR = 30; // 30 lượt / giờ cho các tác vụ AI quản trị
const AI_WINDOW_MS = 60 * 60 * 1000; // 1 giờ
const CHAT_LIMIT = 15; // 15 lượt / 2 giờ cho chat widget
const CHAT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 giờ
const QUOTA_RETENTION_DAYS = 30; // dọn dữ liệu usage cũ hơn 30 ngày
const RESERVE_MAX_ATTEMPTS = 2; // bounded retry: tối đa 2 lần gọi RPC với cùng request_id
const RESERVE_TIMEOUT_MS = 10_000; // mỗi lần gọi RPC tối đa 10s

type QuotaKind = 'ai' | 'chat';

interface QuotaRpcRow {
  allowed?: boolean;
  consumed?: boolean;
  refunded?: boolean;
  error?: string | null;
}

type QuotaRpcName = 'ai_quota_reserve' | 'ai_quota_consume' | 'ai_quota_refund';

/** Args chung của 3 RPC quota — là supertype hợp lệ của từng Args cụ thể. */
interface QuotaRpcArgs {
  p_kind: string;
  p_user_id: string;
  p_request_id: string;
  p_window_seconds?: number;
  p_max_requests?: number;
  p_retention_days?: number;
  p_action?: string;
}

const AI_BUSY_MESSAGE = 'Hệ thống AI tạm thời bận, vui lòng thử lại sau.';
const AI_LIMIT_MESSAGE = (limit: number) =>
  `Bạn đã đạt giới hạn yêu cầu AI trong khoảng thời gian này (tối đa ${limit} lượt/giờ). Vui lòng thử lại sau.`;

/**
 * Request identity: một logical request luôn gắn một request_id cố định.
 * Retry cùng request_id → RPC dedup, không bao giờ ghi 2 slot.
 */
function makeRequestId(kind: QuotaKind, scope: string): string {
  return `${kind}:${scope}:${crypto.randomUUID()}`.slice(0, 128);
}

/**
 * Gọi RPC quota với bounded retry (tối đa RESERVE_MAX_ATTEMPTS lần, cùng
 * request_id, mỗi lần giới hạn thời gian). Idempotency phía DB đảm bảo retry
 * không tạo thêm slot. Lỗi kéo dài → null (fail-closed).
 */
async function callQuotaRpc<T extends QuotaRpcRow>(
  rpcName: QuotaRpcName,
  args: QuotaRpcArgs
): Promise<T | null> {
  for (let attempt = 1; attempt <= RESERVE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { data, error } = await supabaseAdmin
        .rpc(rpcName, args)
        .abortSignal(AbortSignal.timeout(RESERVE_TIMEOUT_MS));
      if (error) {
        console.error(`quota rpc ${rpcName} error (attempt ${attempt}):`, error.message);
        if (attempt < RESERVE_MAX_ATTEMPTS) continue;
        return null;
      }
      const row = Array.isArray(data) ? (data[0] as T | undefined) : undefined;
      if (!row) {
        console.error(`quota rpc ${rpcName} returned no row (attempt ${attempt})`);
        if (attempt < RESERVE_MAX_ATTEMPTS) continue;
        return null;
      }
      return row;
    } catch (err) {
      console.error(`quota rpc ${rpcName} exception (attempt ${attempt})`, err);
      if (attempt < RESERVE_MAX_ATTEMPTS) continue;
      return null;
    }
  }
  return null;
}

/**
 * Kiểm tra quota và ghi nhận slot sử dụng AI atomically (fail-close).
 * Thay thế count-then-insert cũ: RPC `ai_quota_reserve` đếm + chèn trong
 * một giao dịch có advisory lock theo user, nên request đồng thời không thể
 * vượt ngưỡng. Request identity (request_id) làm retry idempotent.
 */
export async function checkAndRecordAiUsage(
  userId: string,
  action: string = 'ai',
  limit: number = AI_LIMIT_PER_HOUR,
  windowMs: number = AI_WINDOW_MS
): Promise<{ allowed: boolean; error?: string }> {
  const safeAction = normalizeAIAction(action);
  const requestId = makeRequestId('ai', safeAction);
  const row = await callQuotaRpc<QuotaRpcRow>('ai_quota_reserve', {
    p_kind: 'ai',
    p_user_id: userId,
    p_request_id: requestId,
    p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
    p_max_requests: limit,
    p_retention_days: QUOTA_RETENTION_DAYS,
    p_action: safeAction,
  });

  if (!row) {
    // DB lỗi kéo dài → deny an toàn
    return { allowed: false, error: AI_BUSY_MESSAGE };
  }
  if (row.allowed !== true) {
    const error =
      row.error === 'LIMIT_REACHED' ? AI_LIMIT_MESSAGE(limit) : AI_BUSY_MESSAGE;
    return { allowed: false, error };
  }
  return { allowed: true };
}

/**
 * Atomic chat quota reservation (15 lượt / 2 giờ). Trả request_id để caller
 * consume/refund theo kết quả provider.
 */
export async function reserveChatQuota(
  userId: string
): Promise<{ allowed: boolean; error?: string; requestId?: string }> {
  const requestId = makeRequestId('chat', 'chat');
  const row = await callQuotaRpc<QuotaRpcRow>('ai_quota_reserve', {
    p_kind: 'chat',
    p_user_id: userId,
    p_request_id: requestId,
    p_window_seconds: Math.max(1, Math.round(CHAT_WINDOW_MS / 1000)),
    p_max_requests: CHAT_LIMIT,
    p_retention_days: QUOTA_RETENTION_DAYS,
  });

  if (!row) return { allowed: false, error: 'QUOTA_UNAVAILABLE' };
  if (row.allowed !== true) return { allowed: false, error: row.error ?? 'LIMIT_REACHED' };
  return { allowed: true, requestId };
}

/**
 * Consume reservation sau khi provider trả kết quả (terminal — không refund được).
 */
export async function consumeChatQuota(
  userId: string,
  requestId: string
): Promise<{ ok: boolean; error?: string }> {
  const row = await callQuotaRpc<QuotaRpcRow>('ai_quota_consume', {
    p_kind: 'chat',
    p_user_id: userId,
    p_request_id: requestId,
  });
  if (!row) return { ok: false, error: 'QUOTA_UNAVAILABLE' };
  return { ok: row.consumed === true, error: row.error ?? undefined };
}

/**
 * Refund reservation khi provider timeout/cancel trước khi có output
 * (chỉ hợp lệ khi slot còn ở trạng thái reserved).
 */
export async function refundChatQuota(
  userId: string,
  requestId: string
): Promise<{ ok: boolean; error?: string }> {
  const row = await callQuotaRpc<QuotaRpcRow>('ai_quota_refund', {
    p_kind: 'chat',
    p_user_id: userId,
    p_request_id: requestId,
  });
  if (!row) return { ok: false, error: 'QUOTA_UNAVAILABLE' };
  return { ok: row.refunded === true, error: row.error ?? undefined };
}