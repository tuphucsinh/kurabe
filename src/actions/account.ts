'use server';

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { toClientError } from '@/lib/errors';
import { isOpaqueSessionToken } from '@/lib/session-token';
import {
  executePasswordResetRpc,
  executeChangePasswordRpc,
  completePasswordSetupCore,
  validateBoundedPassword,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  type ResetPasswordResult,
  type CompletePasswordSetupResult,
  type ChangePasswordResult,
} from '@/lib/auth-password-setup';

export interface AccountStatusResult {
  hasPassword: boolean;
  setupRequired: boolean;
}

/**
 * Trả về trạng thái tài khoản: đã đặt mật khẩu chưa và có đang yêu cầu setup không (server-side, KHÔNG lộ hash).
 */
export async function getAccountStatus(): Promise<AccountStatusResult> {
  const auth = await requireAuth();
  if (auth.error !== null) return { hasPassword: false, setupRequired: false };
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('password_hash, password_setup_required')
      .eq('id', auth.user.id)
      .maybeSingle();
    return {
      hasPassword: Boolean(data?.password_hash),
      setupRequired: Boolean(data?.password_setup_required),
    };
  } catch {
    return { hasPassword: false, setupRequired: false };
  }
}

/**
 * Đổi mật khẩu cho tài khoản ĐANG ĐĂNG NHẬP (actor từ session — KHÔNG trust userId từ client).
 * - Yêu cầu bằng chứng mật khẩu cũ (oldPassword) cho tài khoản đã cấu hình.
 * - Tài khoản ở trạng thái yêu cầu thiết lập (password_setup_required = true hoặc chưa có hash)
 *   phải sử dụng đường dẫn setup token qua Quản lý, KHÔNG cho phép tự đổi mật khẩu trực tiếp.
 * - Cập nhật nguyên tử với compare/version-guard (p_expected_password_hash).
 * - Thu hồi các phiên đăng nhập khác của user nhưng bảo toàn phiên hiện tại (qua auth_session cookie).
 * - Bounded validation [6, 72] ký tự.
 */
export async function changePassword(
  oldPassword: string | null,
  newPassword: string,
  confirmPassword?: string
): Promise<ChangePasswordResult> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return { success: false, error: auth.error, code: 'SYSTEM_ERROR' };
  }
  const userId = auth.user.id;

  try {
    if (!userId) {
      return { success: false, error: 'Thiếu thông tin tài khoản.', code: 'VALIDATION_ERROR' };
    }

    // 1. Bounded validation: độ dài [6, 72] và khớp xác nhận
    const validation = validateBoundedPassword(newPassword, confirmPassword);
    if (!validation.valid) {
      return { success: false, error: validation.error, code: 'VALIDATION_ERROR' };
    }

    // 2. Đọc trạng thái xác thực hiện tại của user trong DB
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, is_active, password_hash, password_setup_required')
      .eq('id', userId)
      .maybeSingle();

    if (userError || !user) {
      return { success: false, error: 'Không tìm thấy tài khoản.', code: 'SYSTEM_ERROR' };
    }

    if (user.is_active !== true) {
      return { success: false, error: 'Tài khoản đã bị vô hiệu hóa.', code: 'SYSTEM_ERROR' };
    }

    // 3. Nếu tài khoản yêu cầu thiết lập mật khẩu hoặc chưa có mật khẩu:
    // BẮT BUỘC dùng token path qua Quản lý, không được bypass bằng tự đổi mật khẩu
    if (user.password_setup_required === true || !user.password_hash) {
      return {
        success: false,
        error:
          'Tài khoản đang yêu cầu thiết lập mật khẩu qua mã xác thực một lần do Quản lý cung cấp. Vui lòng sử dụng trang thiết lập mật khẩu.',
        code: 'SETUP_REQUIRED',
      };
    }

    // 4. Bằng chứng mật khẩu cũ cho tài khoản đã có mật khẩu
    if (!oldPassword) {
      return { success: false, error: 'Vui lòng nhập mật khẩu cũ.', code: 'WRONG_PROOF' };
    }
    const isOldValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isOldValid) {
      return { success: false, error: 'Mật khẩu cũ không đúng.', code: 'WRONG_PROOF' };
    }

    // 5. Hash mật khẩu mới (bcrypt, 10 rounds)
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // 6. Lấy hash của session hiện tại từ cookie `auth_session` để bảo toàn phiên hiện tại
    let currentSessionTokenHash: string | null = null;
    try {
      const cookieStore = await cookies();
      const rawSession = cookieStore.get('auth_session')?.value;
      if (isOpaqueSessionToken(rawSession)) {
        currentSessionTokenHash = crypto.createHash('sha256').update(rawSession).digest('hex');
      }
    } catch {
      currentSessionTokenHash = null;
    }

    // 7. Gọi RPC change_password_transaction nguyên tử với compare/version guard
    const rpcResult = await executeChangePasswordRpc(
      userId,
      user.password_hash,
      newPasswordHash,
      currentSessionTokenHash
    );

    if (!rpcResult.success) {
      return rpcResult;
    }

    await logAudit(auth.user, 'CHANGE_PASSWORD', 'user', userId);
    return { success: true, revokedSessions: rpcResult.revokedSessions };
  } catch (err: unknown) {
    return {
      success: false,
      error: toClientError(err, 'Lỗi không xác định khi đổi mật khẩu. Vui lòng thử lại.'),
      code: 'SYSTEM_ERROR',
    };
  }
}

/**
 * Đặt lại mật khẩu của một nhân viên và khởi tạo one-time setup token ngắn hạn.
 * Manager-only; thu hồi toàn bộ session và setup tokens cũ của user một cách nguyên tử.
 */
export async function resetPassword(userId: string): Promise<ResetPasswordResult> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const cleanUserId = (userId || '').trim();
    if (!cleanUserId) {
      return { success: false, error: 'Thiếu thông tin tài khoản.' };
    }

    const result = await executePasswordResetRpc(cleanUserId);
    if (!result.success) {
      return result;
    }

    await logAudit(auth.user, 'RESET_PASSWORD', 'user', cleanUserId);
    return result;
  } catch (err: unknown) {
    return {
      success: false,
      error: toClientError(err, 'Lỗi không xác định khi đặt lại mật khẩu. Vui lòng thử lại.'),
    };
  }
}

/**
 * Hoàn tất thiết lập mật khẩu mới bằng one-time setup token (unauthenticated).
 */
export async function completePasswordSetup(
  token: string,
  newPassword: string,
  confirmPassword?: string
): Promise<CompletePasswordSetupResult> {
  return completePasswordSetupCore(token, newPassword, confirmPassword);
}

export type { ResetPasswordResult, CompletePasswordSetupResult, ChangePasswordResult };
export { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH };
