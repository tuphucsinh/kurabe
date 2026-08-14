'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import bcrypt from 'bcryptjs';

const MIN_PASSWORD_LENGTH = 6;

/**
 * Đặt/đổi mật khẩu cho tài khoản ĐANG ĐĂNG NHẬP (actor từ session — KHÔNG trust userId từ client).
 * - User CHƯA có password_hash (mới) → đặt mật khẩu lần đầu (không cần mật khẩu cũ).
 * - User ĐÃ có password_hash → bắt buộc nhập mật khẩu cũ đúng.
 *
 * KHÔNG đụng login/middleware — fake login theo mã NV giữ nguyên (Phase 44 sẽ bật password login).
 */
export async function changePassword(
  oldPassword: string | null,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAuth();
  if (auth.error !== null) return { success: false, error: auth.error };
  const userId = auth.user.id;

  try {
    if (!userId) {
      return { success: false, error: 'Thiếu thông tin tài khoản.' };
    }

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` };
    }

    // 1. Lấy user hiện tại
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, password_hash')
      .eq('id', userId)
      .maybeSingle();

    if (userError || !user) {
      return { success: false, error: 'Không tìm thấy tài khoản.' };
    }

    // 2. Nếu đã có mật khẩu → verify mật khẩu cũ
    if (user.password_hash) {
      if (!oldPassword) {
        return { success: false, error: 'Vui lòng nhập mật khẩu cũ.' };
      }
      const valid = await bcrypt.compare(oldPassword, user.password_hash);
      if (!valid) {
        return { success: false, error: 'Mật khẩu cũ không đúng.' };
      }
    }

    // 3. Hash mật khẩu mới (bcrypt, 10 rounds)
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 4. Cập nhật
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', userId);

    if (updateError) {
      return { success: false, error: 'Lỗi lưu mật khẩu: ' + updateError.message };
    }

    await logAudit(auth.user, 'CHANGE_PASSWORD', 'user', userId);
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Lỗi không xác định khi đổi mật khẩu.',
    };
  }
}

/**
 * Đặt lại mật khẩu của một nhân viên về TRỐNG (password_hash = null).
 * Nhân viên sẽ tự đặt mật khẩu mới từ Tab Tài khoản (form "Đặt mật khẩu").
 * Manager-only về mặt UI; auth thật thuộc Phase 44.
 */
export async function resetPassword(userId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    if (!userId) {
      return { success: false, error: 'Thiếu thông tin tài khoản.' };
    }

    const { error } = await supabaseAdmin
      .from('users')
      .update({ password_hash: null })
      .eq('id', userId);

    if (error) {
      return { success: false, error: 'Lỗi đặt lại mật khẩu: ' + error.message };
    }

    await logAudit(auth.user, 'RESET_PASSWORD', 'user', userId);
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Lỗi không xác định khi đặt lại mật khẩu.',
    };
  }
}
