import 'server-only';

import net from 'node:net';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const MAX_LOGIN_ATTEMPTS = 5; // Tối đa 5 lần thử thất bại cho 1 tài khoản
export const MAX_NETWORK_ATTEMPTS = 25; // Tối đa 25 lần thử thất bại cho 1 mạng/IP
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 phút
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60; // 900 giây
export const LOGIN_ATTEMPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày retention

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
}

export interface RateLimitResult {
  allowed: boolean;
  error?: string;
  lockedBy?: 'account' | 'ip' | 'db_error' | 'invalid_input' | string;
  retryAfterSeconds?: number;
  accountAttempts?: number;
  ipAttempts?: number;
}

export interface RecordAttemptResult {
  success: boolean;
  isThrottled: boolean;
  error?: string;
  lockedBy?: string | null;
  accountAttempts?: number;
  ipAttempts?: number;
}

export interface RateLimitOptions {
  windowSeconds?: number;
  maxAccountAttempts?: number;
  maxNetworkAttempts?: number;
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
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
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
 * Không giả định Next.js cung cấp raw TCP socket address (vì server actions không có socket).
 *
 * Nguyên tắc:
 * 1. Nếu có cấu hình KURABE_TRUSTED_PROXY_HOPS: lấy IP ở vị trí `hops` tính từ phải sang trái.
 * 2. Nếu có cấu hình KURABE_TRUSTED_PROXIES: duyệt từ phải sang trái, bỏ qua các proxy tin cậy;
 *    IP đầu tiên không thuộc danh sách tin cậy chính là IP thực của client.
 * 3. Nếu không có cấu hình proxy tin cậy (mặc định tương thích an toàn):
 *    - Nếu có X-Forwarded-For: lấy IP ngoài cùng bên phải (hop gần server nhất do proxy kế tiếp thêm vào),
 *      tránh tin tưởng phần tử đầu tiên do client gửi tự do.
 *    - Fallback về X-Real-IP hoặc loopback.
 */
export function resolveClientNetwork(
  headers: HeaderInput,
  config?: TrustedProxyConfig
): { clientIp: string; isTrustedProxy: boolean; proxyChain: string[] } {
  const xForwardedFor = extractHeaderValue(headers, 'x-forwarded-for');
  const xRealIp = extractHeaderValue(headers, 'x-real-ip');
  const cfConnectingIp = extractHeaderValue(headers, 'cf-connecting-ip');

  const trustedProxies = config?.trustedProxies ?? parseTrustedProxies();
  const trustedHopsEnv = process.env.KURABE_TRUSTED_PROXY_HOPS;
  const configuredHops =
    config?.trustedHops ?? (trustedHopsEnv ? parseInt(trustedHopsEnv, 10) : undefined);

  if (xForwardedFor) {
    const hops = xForwardedFor
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (hops.length > 0) {
      // 1. Nếu cấu hình số hop tin cậy cụ thể
      if (configuredHops && Number.isInteger(configuredHops) && configuredHops > 0) {
        const targetIndex = Math.max(0, hops.length - configuredHops);
        const selectedIp = normalizeIp(hops[targetIndex]);
        return { clientIp: selectedIp, isTrustedProxy: true, proxyChain: hops };
      }

      // 2. Nếu cấu hình danh sách proxy tin cậy (IP hoặc 'loopback' / 'private')
      if (trustedProxies.length > 0) {
        let selectedIp = hops[0];
        let foundUntrusted = false;

        for (let i = hops.length - 1; i >= 0; i--) {
          const hop = hops[i];
          const hopLower = hop.toLowerCase();

          const isTrusted =
            trustedProxies.includes(hopLower) ||
            (trustedProxies.includes('loopback') && isLoopbackIp(hop)) ||
            (trustedProxies.includes('private') && isPrivateIp(hop));

          if (!isTrusted) {
            selectedIp = hop;
            foundUntrusted = true;
            break;
          }
        }

        return {
          clientIp: normalizeIp(selectedIp),
          isTrustedProxy: foundUntrusted,
          proxyChain: hops,
        };
      }

      // 3. Mặc định tương thích (không có cấu hình proxy tường minh):
      // Lấy hop ngoài cùng bên phải (hop gần server nhất), tránh nhận prefix giả mạo từ client.
      const fallbackIp = hops[hops.length - 1];
      return {
        clientIp: normalizeIp(fallbackIp),
        isTrustedProxy: false,
        proxyChain: hops,
      };
    }
  }

  if (cfConnectingIp && isValidIp(cfConnectingIp)) {
    return { clientIp: normalizeIp(cfConnectingIp), isTrustedProxy: true, proxyChain: [cfConnectingIp] };
  }

  if (xRealIp && isValidIp(xRealIp)) {
    return { clientIp: normalizeIp(xRealIp), isTrustedProxy: false, proxyChain: [xRealIp] };
  }

  return { clientIp: '127.0.0.1', isTrustedProxy: false, proxyChain: ['127.0.0.1'] };
}

/**
 * Trả về địa chỉ IP thực đã được làm sạch và xác thực.
 */
export function resolveClientIp(headers: HeaderInput): string {
  return resolveClientNetwork(headers).clientIp;
}

// ============================================================
// 2. ATOMIC RATE LIMITING & FAIL-SAFE DB ACCESS
// ============================================================

/**
 * Kiểm tra giới hạn tần suất đăng nhập trước khi xác thực mật khẩu.
 * Fail-safe: nếu database gặp lỗi, trả về lỗi chung an toàn thay vì fail-open.
 */
export async function checkLoginRateLimit(
  employeeCode: string,
  ip: string,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  const cleanCode = (employeeCode || '').trim();
  const cleanIp = normalizeIp(ip);

  if (!cleanCode) {
    return { allowed: false, error: GENERIC_AUTH_ERROR, lockedBy: 'invalid_input' };
  }

  const windowSeconds = options?.windowSeconds ?? LOGIN_ATTEMPT_WINDOW_SECONDS;
  const maxAccountAttempts = options?.maxAccountAttempts ?? MAX_LOGIN_ATTEMPTS;
  const maxNetworkAttempts = options?.maxNetworkAttempts ?? MAX_NETWORK_ATTEMPTS;

  // Thử gọi RPC check_login_rate_limit nếu đã được cài đặt
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
    }>)('check_login_rate_limit', {
      p_employee_code: cleanCode,
      p_ip: cleanIp,
      p_window_seconds: windowSeconds,
      p_max_account_attempts: maxAccountAttempts,
      p_max_ip_attempts: maxNetworkAttempts,
    });

    if (rpcError) {
      const msg = (rpcError.message || '').toLowerCase();
      const code = (rpcError as { code?: string }).code;
      if (
        msg.includes('function') ||
        msg.includes('not found') ||
        msg.includes('does not exist') ||
        code === 'PGRST202' ||
        code === '42883'
      ) {
        // Fallback sang truy vấn bảng login_attempts trực tiếp bên dưới
      } else {
        return {
          allowed: false,
          error: SYSTEM_BUSY_ERROR_MESSAGE,
          lockedBy: 'db_error',
        };
      }
    } else if (rpcData && rpcData.length > 0) {
      const row = rpcData[0];
      if (!row.allowed) {
        return {
          allowed: false,
          error: THROTTLED_ERROR_MESSAGE,
          lockedBy: row.locked_by ?? 'unknown',
          retryAfterSeconds: row.retry_after_seconds,
          accountAttempts: row.account_attempts,
          ipAttempts: row.ip_attempts,
        };
      }
      return {
        allowed: true,
        accountAttempts: row.account_attempts,
        ipAttempts: row.ip_attempts,
      };
    }
  } catch {
    // Fallback sang truy vấn bảng login_attempts trực tiếp bên dưới
  }

  // Fallback: truy vấn bảng login_attempts trực tiếp với kiểm tra lỗi fail-closed nghiêm ngặt
  try {
    const windowCutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();

    // 1. Kiểm tra số lần thử sai theo mã tài khoản
    const { count: accountCount, error: accountError } = await supabaseAdmin
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('employee_code', cleanCode)
      .gte('attempted_at', windowCutoff);

    if (accountError) {
      return {
        allowed: false,
        error: SYSTEM_BUSY_ERROR_MESSAGE,
        lockedBy: 'db_error',
      };
    }

    if ((accountCount ?? 0) >= maxAccountAttempts) {
      return {
        allowed: false,
        error: THROTTLED_ERROR_MESSAGE,
        lockedBy: 'account',
        accountAttempts: accountCount ?? 0,
        retryAfterSeconds: windowSeconds,
      };
    }

    // 2. Kiểm tra số lần thử sai theo mạng/IP tin cậy
    const { count: ipCount, error: ipError } = await supabaseAdmin
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', cleanIp)
      .gte('attempted_at', windowCutoff);

    if (ipError) {
      return {
        allowed: false,
        error: SYSTEM_BUSY_ERROR_MESSAGE,
        lockedBy: 'db_error',
      };
    }

    if ((ipCount ?? 0) >= maxNetworkAttempts) {
      return {
        allowed: false,
        error: THROTTLED_ERROR_MESSAGE,
        lockedBy: 'ip',
        ipAttempts: ipCount ?? 0,
        retryAfterSeconds: windowSeconds,
      };
    }

    return {
      allowed: true,
      accountAttempts: accountCount ?? 0,
      ipAttempts: ipCount ?? 0,
    };
  } catch {
    return {
      allowed: false,
      error: SYSTEM_BUSY_ERROR_MESSAGE,
      lockedBy: 'db_error',
    };
  }
}

/**
 * Ghi nhận một lần đăng nhập thất bại một cách nguyên tử và an toàn.
 * Có kiểm soát tương tranh (concurrency control) và dọn dẹp lưu trữ giới hạn (bounded retention).
 */
export async function recordFailedLoginAttempt(
  employeeCode: string,
  ip: string,
  options?: RateLimitOptions
): Promise<RecordAttemptResult> {
  const cleanCode = (employeeCode || '').trim();
  const cleanIp = normalizeIp(ip);

  if (!cleanCode) {
    return { success: false, isThrottled: false, error: 'Mã nhân viên không hợp lệ' };
  }

  const windowSeconds = options?.windowSeconds ?? LOGIN_ATTEMPT_WINDOW_SECONDS;
  const maxAccountAttempts = options?.maxAccountAttempts ?? MAX_LOGIN_ATTEMPTS;
  const maxNetworkAttempts = options?.maxNetworkAttempts ?? MAX_NETWORK_ATTEMPTS;

  // Thử gọi RPC record_failed_login_transaction (sử dụng advisory locks & atomic prune)
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
    }>)('record_failed_login_transaction', {
      p_employee_code: cleanCode,
      p_ip: cleanIp,
      p_window_seconds: windowSeconds,
      p_max_account_attempts: maxAccountAttempts,
      p_max_ip_attempts: maxNetworkAttempts,
    });

    if (rpcError) {
      const msg = (rpcError.message || '').toLowerCase();
      const code = (rpcError as { code?: string }).code;
      if (
        msg.includes('function') ||
        msg.includes('not found') ||
        msg.includes('does not exist') ||
        code === 'PGRST202' ||
        code === '42883'
      ) {
        // Fallback sang insert trực tiếp bên dưới
      } else {
        return {
          success: false,
          isThrottled: false,
          error: 'Lỗi ghi nhận đăng nhập thất bại: ' + (rpcError.message || 'db error'),
        };
      }
    } else if (rpcData && rpcData.length > 0) {
      const row = rpcData[0];
      return {
        success: true,
        isThrottled: !row.allowed,
        lockedBy: row.locked_by,
        accountAttempts: row.account_attempts,
        ipAttempts: row.ip_attempts,
      };
    }
  } catch {
    // Fallback sang insert trực tiếp bên dưới
  }

  // Fallback: ghi trực tiếp vào bảng login_attempts
  try {
    const { error: insertError } = await supabaseAdmin.from('login_attempts').insert({
      employee_code: cleanCode,
      ip: cleanIp,
    });

    if (insertError) {
      return {
        success: false,
        isThrottled: false,
        error: 'Lỗi ghi nhận đăng nhập thất bại',
      };
    }

    // Bounded retention: dọn dẹp các bản ghi cũ hơn 30 ngày một cách bất đồng bộ
    try {
      const retentionCutoff = new Date(Date.now() - LOGIN_ATTEMPT_RETENTION_MS).toISOString();
      await supabaseAdmin.from('login_attempts').delete().lt('attempted_at', retentionCutoff);
    } catch {
      // Bỏ qua lỗi dọn dẹp phụ trợ
    }

    return { success: true, isThrottled: false };
  } catch {
    return { success: false, isThrottled: false, error: 'Lỗi hệ thống khi ghi nhận đăng nhập' };
  }
}

/**
 * Xóa các lần đăng nhập thất bại khi người dùng đăng nhập thành công.
 */
export async function clearLoginAttempts(
  employeeCode: string,
  ip?: string
): Promise<{ success: boolean; deletedCount: number }> {
  const cleanCode = (employeeCode || '').trim();
  if (!cleanCode) return { success: false, deletedCount: 0 };
  const cleanIp = ip ? normalizeIp(ip) : null;

  // Thử gọi RPC clear_login_attempts
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
  } catch {
    // Fallback sang query delete bên dưới
  }

  try {
    let query = supabaseAdmin.from('login_attempts').delete().eq('employee_code', cleanCode);
    if (cleanIp) {
      query = query.eq('ip', cleanIp);
    }
    const { error } = await query;
    if (error) {
      return { success: false, deletedCount: 0 };
    }
    return { success: true, deletedCount: 0 };
  } catch {
    return { success: false, deletedCount: 0 };
  }
}
