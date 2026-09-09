import 'server-only';

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 72;
export const SETUP_TOKEN_EXPIRY_MINUTES = 30;
export const SETUP_TOKEN_MAX_AGE_MS = SETUP_TOKEN_EXPIRY_MINUTES * 60 * 1000;

export type ResetPasswordResult =
  | { success: true; setupToken: string; expiresAt: string }
  | { success: false; error: string };

export type CompletePasswordSetupResult =
  | { success: true }
  | { success: false; error: string };

export type ChangePasswordResult =
  | { success: true; revokedSessions: number }
  | {
      success: false;
      error: string;
      code?: 'SETUP_REQUIRED' | 'WRONG_PROOF' | 'CONCURRENT_CONFLICT' | 'VALIDATION_ERROR' | 'SYSTEM_ERROR';
    };

/**
 * Validates bounded password constraints (minimum 6 characters, maximum 72 characters, matching confirmation).
 */
export function validateBoundedPassword(
  newPassword: string,
  confirmPassword?: string
): { valid: true } | { valid: false; error: string } {
  if (typeof newPassword !== 'string' || !newPassword) {
    return { valid: false, error: 'Vui lòng nhập mật khẩu mới.' };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`,
    };
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự.`,
    };
  }
  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    return { valid: false, error: 'Mật khẩu xác nhận không khớp.' };
  }
  return { valid: true };
}

/**
 * Validates whether the given token matches the expected 64-character lowercase hex format.
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  return /^[0-9a-f]{64}$/i.test(token.trim());
}

/**
 * Deterministically computes the SHA-256 hex digest of a raw setup token.
 * Raw token values are NEVER persisted to the database.
 */
export function hashSetupToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Generates a high-entropy cryptographically random 256-bit setup token,
 * computes its SHA-256 hash, and sets a short bounded expiry ISO timestamp.
 */
export function generateSetupToken(): {
  token: string;
  tokenHash: string;
  expiresAt: string;
} {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSetupToken(token);
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_MAX_AGE_MS).toISOString();
  return { token, tokenHash, expiresAt };
}

/**
 * Invokes the atomic reset_password_transaction RPC with a hashed token.
 * Atomically marks setup_required = true, wipes password_hash, revokes sessions,
 * and inserts the hashed token record.
 */
export async function executePasswordResetRpc(userId: string): Promise<ResetPasswordResult> {
  try {
    const cleanUserId = (userId || '').trim();
    if (!cleanUserId) {
      return { success: false, error: 'Thiếu thông tin tài khoản.' };
    }

    const { token, tokenHash, expiresAt } = generateSetupToken();

    const { error: rpcError } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: unknown }>)(
      'reset_password_transaction',
      {
        p_user_id: cleanUserId,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
      }
    );

    if (rpcError) {
      return {
        success: false,
        error: 'Lỗi đặt lại mật khẩu. Vui lòng thử lại.',
      };
    }

    return {
      success: true,
      setupToken: token,
      expiresAt,
    };
  } catch {
    return {
      success: false,
      error: 'Lỗi không xác định khi đặt lại mật khẩu. Vui lòng thử lại.',
    };
  }
}

/**
 * Invokes the atomic change_password_transaction RPC.
 * Enforces compare/version-guard on expected password_hash,
 * checks that the account is not in setup-required state,
 * updates the bcrypt password_hash, revokes other sessions while
 * preserving the specified current session token, and revokes any pending setup tokens.
 */
export async function executeChangePasswordRpc(
  userId: string,
  expectedPasswordHash: string,
  newPasswordHash: string,
  currentSessionTokenHash?: string | null
): Promise<ChangePasswordResult> {
  try {
    const cleanUserId = (userId || '').trim();
    if (!cleanUserId) {
      return { success: false, error: 'Thiếu thông tin tài khoản.', code: 'VALIDATION_ERROR' };
    }

    const { data, error: rpcError } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: Array<{ user_id: string; revoked_sessions: number }> | null; error: { message?: string } | null }>)(
      'change_password_transaction',
      {
        p_user_id: cleanUserId,
        p_expected_password_hash: expectedPasswordHash,
        p_new_password_hash: newPasswordHash,
        p_current_session_token_hash: currentSessionTokenHash ?? null,
      }
    );

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('SETUP_REQUIRED')) {
        return {
          success: false,
          error: 'Tài khoản đang yêu cầu thiết lập mật khẩu qua mã xác thực một lần do Quản lý cung cấp. Vui lòng sử dụng trang thiết lập mật khẩu.',
          code: 'SETUP_REQUIRED',
        };
      }
      if (msg.includes('CREDENTIAL_MISMATCH')) {
        return {
          success: false,
          error: 'Thông tin tài khoản đã bị thay đổi bởi thao tác khác. Vui lòng thử lại.',
          code: 'CONCURRENT_CONFLICT',
        };
      }
      if (msg.includes('NO_EXISTING_CREDENTIAL')) {
        return {
          success: false,
          error: 'Tài khoản chưa có mật khẩu cấu hình. Vui lòng thiết lập qua liên kết một lần.',
          code: 'SETUP_REQUIRED',
        };
      }
      if (msg.includes('USER_INACTIVE')) {
        return {
          success: false,
          error: 'Tài khoản đã bị vô hiệu hóa.',
          code: 'SYSTEM_ERROR',
        };
      }
      if (msg.includes('USER_NOT_FOUND')) {
        return {
          success: false,
          error: 'Không tìm thấy tài khoản.',
          code: 'SYSTEM_ERROR',
        };
      }
      return {
        success: false,
        error: 'Lỗi cập nhật mật khẩu. Vui lòng thử lại.',
        code: 'SYSTEM_ERROR',
      };
    }

    const revokedSessions = data?.[0]?.revoked_sessions ?? 0;
    return {
      success: true,
      revokedSessions,
    };
  } catch {
    return {
      success: false,
      error: 'Lỗi không xác định khi cập nhật mật khẩu. Vui lòng thử lại.',
      code: 'SYSTEM_ERROR',
    };
  }
}

/**
 * Core validation and completion logic for setting a new password via a setup token.
 * Validates token format, password requirements, hashes password with bcrypt,
 * and executes the atomic complete_password_setup_transaction RPC.
 */
export async function completePasswordSetupCore(
  token: string,
  newPassword: string,
  confirmPassword?: string
): Promise<CompletePasswordSetupResult> {
  try {
    const cleanToken = (token || '').trim();
    if (!isValidTokenFormat(cleanToken)) {
      return {
        success: false,
        error: 'Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn.',
      };
    }

    const validation = validateBoundedPassword(newPassword, confirmPassword);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // 1. Hash new password with bcrypt (10 rounds)
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 2. Hash setup token with SHA-256
    const tokenHash = hashSetupToken(cleanToken);

    // 3. Execute transactional completion RPC
    const { error: rpcError } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: unknown }>)(
      'complete_password_setup_transaction',
      {
        p_token_hash: tokenHash,
        p_password_hash: passwordHash,
      }
    );

    if (rpcError) {
      return {
        success: false,
        error: 'Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn.',
      };
    }

    return { success: true };
  } catch {
    return {
      success: false,
      error: 'Lỗi không xác định khi hoàn tất đặt mật khẩu. Vui lòng thử lại.',
    };
  }
}
