import 'server-only';

import crypto from 'node:crypto';
import net from 'node:net';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const MAX_LOGIN_ATTEMPTS = 5; // Tối đa 5 lần thử thất bại cho 1 tài khoản
export const MAX_NETWORK_ATTEMPTS = 25; // Tối đa 25 lần thử thất bại cho 1 mạng/IP
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 phút
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60; // 900 giây
export const LOGIN_ATTEMPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày retention
export const DEFAULT_RESERVATION_TIMEOUT_SECONDS = 30; // 30 giây timeout cho admission reservation

export const THROTTLED_ERROR_MESSAGE =
  'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.';
export const SYSTEM_BUSY_ERROR_MESSAGE =
  'Hệ thống tạm thời bận. Vui lòng thử lại sau.';
export const GENERIC_AUTH_ERROR = 'Mã nhân viên hoặc mật khẩu không đúng.';

export interface TrustedProxyConfig {
  /**
   * Danh sách IP proxy tin cậy hoặc từ khóa (ví dụ: 'loopback', 'private', '127.0.0.1', '::1').
   * Được cấu hình qua biến môi trường KURABE_TRUSTED_PROXIES (phân tách bởi dấu phẩy).
   */
  trustedProxies?: string[];
  /**
   * Số hop proxy ngược tin cậy tính từ bên phải chuỗi X-Forwarded-For.
   * Được cấu hình qua biến môi trường KURABE_TRUSTED_PROXY_HOPS.
   */
  trustedHops?: number;
  /**
   * Địa chỉ IP trực tiếp của kết nối peer kết nối đến máy chủ (nếu runtime cung cấp).
   * Khi được cung cấp, các header forwarded chỉ được xem xét nếu peer này là proxy tin cậy.
   */
  immediatePeer?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  error?: string;
  lockedBy?: 'account' | 'ip' | 'db_error' | 'invalid_input' | string;
  retryAfterSeconds?: number;
  accountAttempts?: number;
  ipAttempts?: number;
  requestId?: string;
}

export interface RecordAttemptResult {
  success: boolean;
  isThrottled: boolean;
  error?: string;
  lockedBy?: string | null;
  accountAttempts?: number;
  ipAttempts?: number;
}

export interface FinalizeAdmissionResult {
  finalized: boolean;
  allowed: boolean;
  error?: string;
  lockedBy?: string | null;
  accountAttempts?: number;
  ipAttempts?: number;
  retryAfterSeconds?: number;
}

export interface RateLimitOptions {
  windowSeconds?: number;
  maxAccountAttempts?: number;
  maxNetworkAttempts?: number;
  requestId?: string;
  reservationTimeoutSeconds?: number;
}

// ============================================================
// 1. IP & TRUSTED PROXY RESOLUTION
// ============================================================

/**
 * Kiểm tra xem IP có phải là loopback không (IPv4 hoặc IPv6).
 */
export function isLoopbackIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim().toLowerCase();
  return (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === '::ffff:127.0.0.1' ||
    clean === 'localhost' ||
    clean.startsWith('127.') ||
    clean.startsWith('::ffff:127.')
  );
}

/**
 * Kiểm tra xem IP có thuộc dải mạng riêng (RFC 1918 / RFC 4193) không.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim().toLowerCase();
  if (isLoopbackIp(clean)) return true;

  // IPv4 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  }

  // IPv6 unique local (fc00::/7) or link-local (fe80::/10)
  if (net.isIPv6(clean)) {
    return clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:');
  }

  return false;
}

/**
 * Kiểm tra chuỗi có phải là địa chỉ IP hợp lệ (IPv4 hoặc IPv6).
 */
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  return net.isIP(ip.trim()) !== 0;
}

/**
 * Chuẩn hóa IP thành chuỗi sạch không khoảng trắng.
 */
export function normalizeIp(ip: string): string {
  if (!ip || typeof ip !== 'string') return '127.0.0.1';
  let clean = ip.trim();
  if (clean.startsWith('[') && clean.includes(']')) {
    clean = clean.slice(1, clean.indexOf(']'));
  } else if (clean.includes(':') && !clean.includes('::') && clean.split(':').length === 2) {
    clean = clean.split(':')[0];
  }
  return isValidIp(clean) ? clean : '127.0.0.1';
}

/**
 * Phân tích danh sách proxy tin cậy từ biến môi trường hoặc tham số.
 */
export function parseTrustedProxies(envValue?: string): string[] {
  const raw = envValue !== undefined ? envValue : process.env.KURABE_TRUSTED_PROXIES;
  if (!raw || typeof raw !== 'string') return [];
  const entries = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // A partially valid allow-list is ambiguous: silently retaining the valid
  // entries would make a deployment typo look like an approved trust policy.
  // Fail closed for the whole configuration instead.
  if (entries.some((entry) => !['loopback', 'private'].includes(entry) && !isValidIp(entry))) {
    return [];
  }
  return [...new Set(entries)];
}

/**
 * Kiểm tra xem một peer IP có nằm trong danh sách proxy tin cậy không.
 */
export function isPeerTrusted(peer: string, trustedProxies: string[]): boolean {
  if (!peer || !isValidIp(peer)) return false;
  const clean = peer.trim().toLowerCase();
  return (
    trustedProxies.includes(clean) ||
    (trustedProxies.includes('loopback') && isLoopbackIp(clean)) ||
    (trustedProxies.includes('private') && isPrivateIp(clean))
  );
}

type HeaderInput =
  | { get(name: string): string | null | undefined }
  | Record<string, string | string[] | undefined>
  | Map<string, string>;

function extractHeaderValue(headers: HeaderInput, name: string): string | null {
  if (!headers) return null;
  const lowerName = name.toLowerCase();

  if (typeof (headers as { get?: unknown }).get === 'function') {
    const getter = headers as { get: (k: string) => string | null | undefined };
    let val = getter.get(lowerName);
    if (val === undefined || val === null) {
      val = getter.get(name);
    }
    if ((val === undefined || val === null) && headers instanceof Map) {
      for (const [k, v] of (headers as Map<string, string>).entries()) {
        if (typeof k === 'string' && k.toLowerCase() === lowerName) {
          return typeof v === 'string' ? v : null;
        }
      }
    }
    return val ?? null;
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const raw = record[lowerName] ?? record[name];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

/**
 * Phân giải IP mạng máy khách theo hợp đồng proxy tin cậy tường minh.
 *
 * Hợp đồng triển khai proxy:
 * 1. Các header chuyển tiếp (X-Forwarded-For, CF-Connecting-IP, X-Real-IP) CHỈ được tin cậy
 *    khi hợp đồng proxy được chứng minh rõ ràng thông qua:
 *    - KURABE_TRUSTED_PROXIES (danh sách IP hoặc 'loopback'/'private')
 *    - KURABE_TRUSTED_PROXY_HOPS (số hop nguyên dương)
 *    - immediatePeer được cấu hình và nằm trong danh sách proxy tin cậy.
 * 2. Cấu hình mơ hồ hoặc sai định dạng (ví dụ: hops <= 0, hops không phải số nguyên,
 *    hoặc số hop trong header ít hơn số hop được cấu hình) PHẢI fail closed:
 *    không tin cậy header chuyển tiếp và trả về fallback an toàn (isTrustedProxy = false).
 * 3. Mạng không tin cậy (khi không có cấu hình proxy tin cậy):
 *    KHÔNG CHO PHÉP client tự gửi cf-/forwarded headers để mạo danh danh tính tin cậy.
 *    Trả về fallback cục bộ an toàn với isTrustedProxy = false.
 */
export function resolveClientNetwork(
  headers: HeaderInput,
  config?: TrustedProxyConfig
): { clientIp: string; isTrustedProxy: boolean; proxyChain: string[] } {
  const xForwardedFor = extractHeaderValue(headers, 'x-forwarded-for');
  const xRealIp = extractHeaderValue(headers, 'x-real-ip');
  const cfConnectingIp = extractHeaderValue(headers, 'cf-connecting-ip');

  const rawImmediatePeer = config?.immediatePeer?.trim();
  const immediatePeer = rawImmediatePeer && isValidIp(rawImmediatePeer) ? normalizeIp(rawImmediatePeer) : null;
  const trustedProxies = config?.trustedProxies ?? parseTrustedProxies();
  const rawHops =
    config?.trustedHops !== undefined ? config.trustedHops : process.env.KURABE_TRUSTED_PROXY_HOPS;

  let configuredHops: number | null = null;
  const hasInvalidTrustedProxyConfig = trustedProxies.some(
    (entry) => !['loopback', 'private'].includes(entry) && !isValidIp(entry)
  );
  if (hasInvalidTrustedProxyConfig) {
    const fallback = immediatePeer ?? '127.0.0.1';
    return { clientIp: fallback, isTrustedProxy: false, proxyChain: [fallback] };
  }
  if (rawHops !== undefined && rawHops !== null && rawHops !== '') {
    const parsed = typeof rawHops === 'number' ? rawHops : Number(rawHops);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      // Cấu hình sai định dạng -> fail closed!
      const fallback = immediatePeer ?? '127.0.0.1';
      return { clientIp: fallback, isTrustedProxy: false, proxyChain: [fallback] };
    }
    configuredHops = parsed;
  }

  const hasTrustedProxiesConfig = trustedProxies.length > 0;
  const hasTrustedHopsConfig = configuredHops !== null;
  const hasProxyTrustConfig = hasTrustedProxiesConfig || hasTrustedHopsConfig;

  // Safe untrusted-network behavior:
  // Headers alone never establish the immediate peer. Even a configured hop
  // count or proxy list must be paired with a runtime-supplied peer address.
  if (!hasProxyTrustConfig || !immediatePeer || (hasTrustedHopsConfig && !hasTrustedProxiesConfig)) {
    const fallback = immediatePeer ?? '127.0.0.1';
    return { clientIp: fallback, isTrustedProxy: false, proxyChain: [fallback] };
  }

  // Nếu immediate peer được cung cấp và danh sách proxy tin cậy được cấu hình,
  // kiểm tra xem immediate peer có được tin cậy không.
  if (immediatePeer && hasTrustedProxiesConfig && !isPeerTrusted(immediatePeer, trustedProxies)) {
    return { clientIp: immediatePeer, isTrustedProxy: false, proxyChain: [immediatePeer] };
  }

  if ((cfConnectingIp && !isValidIp(cfConnectingIp)) || (xRealIp && !isValidIp(xRealIp))) {
    const fallback = immediatePeer ?? '127.0.0.1';
    return { clientIp: fallback, isTrustedProxy: false, proxyChain: [fallback] };
  }

  if (xForwardedFor) {
    const hops = xForwardedFor.split(',').map((s) => s.trim());

    if (hops.length > 0) {
      if (hops.some((hop) => !isValidIp(hop))) {
        const fallback = immediatePeer ?? '127.0.0.1';
        return { clientIp: fallback, isTrustedProxy: false, proxyChain: hops };
      }

      // 1. Cấu hình số hop tin cậy cụ thể
      if (hasTrustedHopsConfig && configuredHops !== null) {
        if (hops.length < configuredHops) {
          // Chuỗi ngắn hơn số hop cấu hình: chuỗi không hợp lệ -> fail closed!
          const fallback = immediatePeer ?? '127.0.0.1';
          return { clientIp: fallback, isTrustedProxy: false, proxyChain: hops };
        }
        const targetIndex = hops.length - configuredHops;
        const selectedIp = normalizeIp(hops[targetIndex]);
        return { clientIp: selectedIp, isTrustedProxy: true, proxyChain: hops };
      }

      // 2. Cấu hình danh sách proxy tin cậy
      if (hasTrustedProxiesConfig) {
        const rightmostHop = hops[hops.length - 1];
        const immediateToCheck = immediatePeer ?? rightmostHop;

        if (!isPeerTrusted(immediateToCheck, trustedProxies)) {
          // Peer kết nối trực tiếp không nằm trong danh sách tin cậy -> fail closed!
          return {
            clientIp: normalizeIp(immediateToCheck),
            isTrustedProxy: false,
            proxyChain: hops,
          };
        }

        let selectedIp: string | null = null;

        for (let i = hops.length - 1; i >= 0; i--) {
          const hop = hops[i];
          if (!isPeerTrusted(hop, trustedProxies)) {
            selectedIp = hop;
            break;
          }
        }

        if (!selectedIp) {
          return { clientIp: immediatePeer ?? '127.0.0.1', isTrustedProxy: false, proxyChain: hops };
        }

        return {
          clientIp: selectedIp,
          isTrustedProxy: true,
          proxyChain: hops,
        };
      }
    }
  }

  // Cloudflare Connecting-IP: chỉ tin cậy khi có cấu hình proxy tin cậy hợp lệ
  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    if (!hasTrustedProxiesConfig || !immediatePeer || !isPeerTrusted(immediatePeer, trustedProxies)) {
      return { clientIp: immediatePeer, isTrustedProxy: false, proxyChain: [immediatePeer] };
    }
    return { clientIp: normalizeIp(cfConnectingIp), isTrustedProxy: true, proxyChain: [cfConnectingIp] };
  }

  // X-Real-IP: chỉ tin cậy khi có cấu hình proxy tin cậy hợp lệ
  if (xRealIp && isValidIp(xRealIp)) {
    if (!hasTrustedProxiesConfig || !immediatePeer || !isPeerTrusted(immediatePeer, trustedProxies)) {
      return { clientIp: immediatePeer, isTrustedProxy: false, proxyChain: [immediatePeer] };
    }
    return { clientIp: normalizeIp(xRealIp), isTrustedProxy: true, proxyChain: [xRealIp] };
  }

  const defaultFallback = immediatePeer ?? '127.0.0.1';
  return { clientIp: defaultFallback, isTrustedProxy: false, proxyChain: [defaultFallback] };
}

/**
 * Trả về địa chỉ IP thực đã được làm sạch và xác thực.
 */
export function resolveClientIp(headers: HeaderInput, config?: TrustedProxyConfig): string {
  return resolveClientNetwork(headers, config).clientIp;
}

// ============================================================
// 2. ATOMIC ADMISSION RESERVATION & FAIL-SAFE DB ACCESS
// ============================================================

/**
 * Đặt chỗ cho một lượt đăng nhập nguyên tử theo tài khoản và mạng tin cậy (F05).
 * Giới hạn số lần thử đồng thời ngay trước khi thực thi xác thực mật khẩu.
 * Fail-safe: lỗi RPC hoặc lỗi database luôn fail-closed an toàn, không fallback truy vấn bảng.
 */
export async function acquireLoginAdmission(
  employeeCode: string,
  ip: string,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  const cleanCode = (employeeCode || '').trim();
  const cleanIp = normalizeIp(ip);
  const requestId = (options?.requestId || '').trim() || crypto.randomUUID();

  if (!cleanCode) {
    return { allowed: false, error: GENERIC_AUTH_ERROR, lockedBy: 'invalid_input', requestId };
  }

  const windowSeconds = options?.windowSeconds ?? LOGIN_ATTEMPT_WINDOW_SECONDS;
  const maxAccountAttempts = options?.maxAccountAttempts ?? MAX_LOGIN_ATTEMPTS;
  const maxNetworkAttempts = options?.maxNetworkAttempts ?? MAX_NETWORK_ATTEMPTS;
  const reservationTimeoutSeconds =
    options?.reservationTimeoutSeconds ?? DEFAULT_RESERVATION_TIMEOUT_SECONDS;

  try {
    const { data: rpcData, error: rpcError } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{
      data: Array<{
        allowed: boolean;
        account_attempts: number;
        ip_attempts: number;
        locked_by: string | null;
        retry_after_seconds: number;
      }> | null;
      error: { message?: string } | null;
    }>)('acquire_login_admission', {
      p_request_id: requestId,
      p_employee_code: cleanCode,
      p_ip: cleanIp,
      p_window_seconds: windowSeconds,
      p_max_account_attempts: maxAccountAttempts,
      p_max_ip_attempts: maxNetworkAttempts,
      p_reservation_timeout_seconds: reservationTimeoutSeconds,
    });

    if (rpcError) {
      // Fail closed: không dùng direct table fallback làm suy yếu bất biến
      return {
        allowed: false,
        error: SYSTEM_BUSY_ERROR_MESSAGE,
        lockedBy: 'db_error',
        requestId,
      };
    }

    if (rpcData && rpcData.length > 0) {
      const row = rpcData[0];
      if (!row.allowed) {
        return {
          allowed: false,
          error: THROTTLED_ERROR_MESSAGE,
          lockedBy: row.locked_by ?? 'unknown',
          retryAfterSeconds: row.retry_after_seconds,
          accountAttempts: row.account_attempts,
          ipAttempts: row.ip_attempts,
          requestId,
        };
      }
      return {
        allowed: true,
        accountAttempts: row.account_attempts,
        ipAttempts: row.ip_attempts,
        requestId,
      };
    }

    return {
      allowed: false,
      error: SYSTEM_BUSY_ERROR_MESSAGE,
      lockedBy: 'db_error',
      requestId,
    };
  } catch {
    return {
      allowed: false,
      error: SYSTEM_BUSY_ERROR_MESSAGE,
      lockedBy: 'db_error',
      requestId,
    };
  }
}

/**
 * Hoàn tất việc đặt chỗ đăng nhập: chuyển sang 'failed' (thất bại) hoặc dọn dẹp (thành công).
 * Đảm bảo tính lũy nghiệm (idempotent) khi gọi lại với cùng request_id.
 */
export async function finalizeLoginAdmission(
  requestId: string,
  employeeCode: string,
  ip: string,
  success: boolean,
  options?: RateLimitOptions
): Promise<FinalizeAdmissionResult> {
  const cleanCode = (employeeCode || '').trim();
  const cleanIp = normalizeIp(ip);
  const cleanRequestId = (requestId || '').trim();

  if (!cleanCode || !cleanRequestId) {
    return {
      finalized: false,
      allowed: false,
      error: 'Mã nhân viên hoặc mã yêu cầu không hợp lệ',
      lockedBy: 'invalid_input',
    };
  }

  const windowSeconds = options?.windowSeconds ?? LOGIN_ATTEMPT_WINDOW_SECONDS;
  const maxAccountAttempts = options?.maxAccountAttempts ?? MAX_LOGIN_ATTEMPTS;
  const maxNetworkAttempts = options?.maxNetworkAttempts ?? MAX_NETWORK_ATTEMPTS;

  try {
    const { data: rpcData, error: rpcError } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{
      data: Array<{
        finalized: boolean;
        allowed: boolean;
        account_attempts: number;
        ip_attempts: number;
        locked_by: string | null;
        retry_after_seconds: number;
      }> | null;
      error: { message?: string } | null;
    }>)('finalize_login_admission', {
      p_request_id: cleanRequestId,
      p_employee_code: cleanCode,
      p_ip: cleanIp,
      p_success: success,
      p_window_seconds: windowSeconds,
      p_max_account_attempts: maxAccountAttempts,
      p_max_ip_attempts: maxNetworkAttempts,
    });

    if (rpcError) {
      return {
        finalized: false,
        allowed: false,
        error: rpcError.message || 'Lỗi cơ sở dữ liệu khi hoàn tất đăng nhập',
        lockedBy: 'db_error',
      };
    }

    if (rpcData && rpcData.length > 0) {
      const row = rpcData[0];
      return {
        finalized: row.finalized,
        allowed: row.allowed,
        lockedBy: row.locked_by,
        accountAttempts: row.account_attempts,
        ipAttempts: row.ip_attempts,
        retryAfterSeconds: row.retry_after_seconds,
      };
    }

    return {
      finalized: false,
      allowed: false,
      error: 'Không nhận được kết quả hoàn tất đăng nhập',
      lockedBy: 'db_error',
    };
  } catch (err: unknown) {
    return {
      finalized: false,
      allowed: false,
      error: err instanceof Error ? err.message : 'Lỗi hệ thống khi hoàn tất đăng nhập',
      lockedBy: 'db_error',
    };
  }
}

/**
 * Kiểm tra giới hạn tần suất đăng nhập và thực hiện đặt chỗ admission.
 * Duy trì khả năng tương thích ngược cho các lời gọi checkLoginRateLimit hiện có.
 */
export async function checkLoginRateLimit(
  employeeCode: string,
  ip: string,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  return acquireLoginAdmission(employeeCode, ip, options);
}

/**
 * Ghi nhận một lần đăng nhập thất bại và hoàn tất reservation tương ứng.
 * Duy trì tính tương thích với recordFailedLoginAttempt.
 */
export async function recordFailedLoginAttempt(
  employeeCode: string,
  ip: string,
  options?: RateLimitOptions
): Promise<RecordAttemptResult> {
  const requestId = options?.requestId || crypto.randomUUID();
  const res = await finalizeLoginAdmission(requestId, employeeCode, ip, false, options);
  return {
    success: res.finalized,
    isThrottled: !res.allowed,
    error: res.error,
    lockedBy: res.lockedBy,
    accountAttempts: res.accountAttempts,
    ipAttempts: res.ipAttempts,
  };
}

/**
 * Xóa các lần đăng nhập thất bại khi người dùng đăng nhập thành công.
 * Không fallback sang direct table delete khi RPC gặp lỗi.
 */
export async function clearLoginAttempts(
  employeeCode: string,
  ip?: string
): Promise<{ success: boolean; deletedCount: number }> {
  const cleanCode = (employeeCode || '').trim();
  if (!cleanCode) return { success: false, deletedCount: 0 };
  const cleanIp = ip ? normalizeIp(ip) : null;

  try {
    const { data, error: rpcError } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: number | null; error: { message?: string } | null }>)(
      'clear_login_attempts',
      {
        p_employee_code: cleanCode,
        p_ip: cleanIp,
      }
    );

    if (!rpcError && typeof data === 'number') {
      return { success: true, deletedCount: data };
    }
    return { success: false, deletedCount: 0 };
  } catch {
    return { success: false, deletedCount: 0 };
  }
}
