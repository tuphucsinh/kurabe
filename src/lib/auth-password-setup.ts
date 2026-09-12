import 'server-only';

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LOGIN_ATTEMPT_WINDOW_SECONDS, MAX_LOGIN_ATTEMPTS } from '@/lib/login-rate-limit';

export const MIN_PASSWORD_LENGTH = 6;
/** bcrypt consumes at most 72 UTF-8 bytes, not 72 JavaScript string units. */
export const MAX_PASSWORD_BYTES = 72;
/** Compatibility alias for existing callers; the limit is bytes, not characters. */
export const MAX_PASSWORD_LENGTH = MAX_PASSWORD_BYTES;
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

export type IssueSessionResult =
  | { success: true }
  | { success: false; error: string };

export interface IssueSessionAdmission {
  requestId: string;
  employeeCode: string;
  ip: string;
  maxNetworkAttempts: number;
}

/**
 * Validates bounded password constraints. bcrypt's maximum is measured in UTF-8 bytes.
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
  if (Buffer.byteLength(newPassword, 'utf8') > MAX_PASSWORD_BYTES) {
    return {
      valid: false,
      error: `Mật khẩu không được vượt quá ${MAX_PASSWORD_BYTES} byte UTF-8.`,
    };
  }
  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    return { valid: false, error: 'Mật khẩu xác nhận không khớp.' };
  }
  return { valid: true };
}

/**
 * Atomically validates the credential snapshot and inserts a session while holding
 * the target user's row lock. A login proof collected before reset/change cannot
 * issue a session after the credential revision changes.
 */
export async function executeIssueSessionRpc(
  userId: string,
  expectedPasswordHash: string | null,
  expectedSetupRequired: boolean,
  expectedCredentialRevision: number,
  tokenHash: string,
  expiresAt: string,
  admission?: IssueSessionAdmission
): Promise<IssueSessionResult> {
  try {
    const cleanUserId = (userId || '').trim();
    if (!cleanUserId || !Number.isInteger(expectedCredentialRevision) || expectedCredentialRevision < 0) {
      return { success: false, error: 'Lỗi tạo phiên đăng nhập. Vui lòng thử lại.' };
    }

    let rpcError: { message?: string } | null = null;
    if (admission) {
      const { error } = await supabaseAdmin.rpc('issue_session_finalize_login_admission', {
        p_user_id: cleanUserId,
        p_expected_password_hash: expectedPasswordHash,
        p_expected_password_setup_required: expectedSetupRequired,
        p_expected_credential_revision: expectedCredentialRevision,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
        p_request_id: admission.requestId,
        p_employee_code: admission.employeeCode,
        p_ip: admission.ip,
        p_max_account_attempts: MAX_LOGIN_ATTEMPTS,
        p_max_ip_attempts: admission.maxNetworkAttempts,
        p_window_seconds: LOGIN_ATTEMPT_WINDOW_SECONDS,
      });
      rpcError = error;
    } else {
      const { error } = await supabaseAdmin.rpc('issue_session_transaction', {
        p_user_id: cleanUserId,
        p_expected_password_hash: expectedPasswordHash,
        p_expected_password_setup_required: expectedSetupRequired,
        p_expected_credential_revision: expectedCredentialRevision,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
      });
      rpcError = error;
    }

    if (rpcError) {
      return { success: false, error: 'Thông tin xác thực đã thay đổi. Vui lòng đăng nhập lại.' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Lỗi tạo phiên đăng nhập. Vui lòng thử lại.' };
  }
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
        p_expected_credential_revision: null,
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
  currentSessionTokenHash?: string | null,
  expectedCredentialRevision?: number
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
        p_expected_credential_revision: expectedCredentialRevision ?? null,
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
        p_expected_credential_revision: null,
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
