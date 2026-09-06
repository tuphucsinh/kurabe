'use server';

import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import bcrypt from 'bcryptjs';
import { mapUserFromDb } from '@/lib/db/users';
import { toClientError } from '@/lib/errors';
import { isOpaqueSessionToken } from '@/lib/session-token';
import {
  completePasswordSetupCore,
  type CompletePasswordSetupResult,
  type ResetPasswordResult,
} from '@/lib/auth-password-setup';
import type { User } from '@/types';

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 phút
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 ngày
// Fixed valid bcrypt hash for dummy comparison on accounts without active normal password
// (avoids timing and state leakage; contains no raw password).
const DUMMY_BCRYPT_HASH = '$2b$10$7EqJtq98hPqEX7fNZaFWoOhi55j8KPGWprDAOWfcL6NwgVB5e3EmK';
const GENERIC_AUTH_ERROR = 'Mã nhân viên hoặc mật khẩu không đúng.';

export async function loginAction(
  employeeCode: string,
  password: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const headerStore = await headers();
    const rawIp = headerStore.get('x-forwarded-for') || headerStore.get('x-real-ip') || 'unknown';
    const ip = rawIp.split(',')[0].trim();
    const cleanCode = (employeeCode || '').trim();

    // 1. Rate-limit login: đếm login_attempts thất bại của (mã NV, IP) trong 15 phút
    const window15m = new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MS).toISOString();
    const { count: failCount } = await supabaseAdmin
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('employee_code', cleanCode)
      .eq('ip', ip)
      .gte('attempted_at', window15m);

    if ((failCount ?? 0) >= MAX_LOGIN_ATTEMPTS) {
      return {
        success: false,
        error: 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
      };
    }

    // 2. Tìm user theo mã nhân viên
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('employee_code', cleanCode)
      .eq('is_active', true)
      .maybeSingle();

    if (!user) {
      // Ghi nhận lần thử thất bại
      await supabaseAdmin.from('login_attempts').insert({ employee_code: cleanCode, ip });
      return { success: false, error: GENERIC_AUTH_ERROR };
    }

    // 3. Kiểm tra mật khẩu
    // Khi KURABE_REQUIRE_PASSWORD_LOGIN === 'true' (strict mode):
    // Fail-closed nếu password_hash là NULL hoặc password_setup_required = true.
    // Luôn thực thi đúng 1 lần bcrypt.compare cho mọi tài khoản active tồn tại:
    // dùng hash thật nếu tài khoản có mật khẩu bình thường, ngược lại dùng dummy bcrypt hash cố định.
    // Khi KURABE_REQUIRE_PASSWORD_LOGIN !== 'true' (mặc định compatibility mode):
    // Khôi phục legacy behavior: tài khoản có password_hash = NULL đăng nhập không cần mật khẩu;
    // tài khoản đã có password_hash vẫn bắt buộc nhập đúng mật khẩu.
    const requirePasswordLogin = process.env.KURABE_REQUIRE_PASSWORD_LOGIN === 'true';

    if (requirePasswordLogin) {
      const storedHash = user.password_hash ?? DUMMY_BCRYPT_HASH;
      const isSetupIncomplete = !user.password_hash || user.password_setup_required;
      const targetHash = isSetupIncomplete ? DUMMY_BCRYPT_HASH : storedHash;
      const passwordCandidate = typeof password === 'string' ? password : '';

      const valid = await bcrypt.compare(passwordCandidate, targetHash);
      if (isSetupIncomplete || !valid || !password) {
        // Ghi nhận lần thử thất bại
        await supabaseAdmin.from('login_attempts').insert({ employee_code: cleanCode, ip });
        return { success: false, error: GENERIC_AUTH_ERROR };
      }
    } else if (user.password_hash) {
      const passwordCandidate = typeof password === 'string' ? password : '';
      const valid = await bcrypt.compare(passwordCandidate, user.password_hash);
      if (!valid || !password) {
        // Ghi nhận lần thử thất bại
        await supabaseAdmin.from('login_attempts').insert({ employee_code: cleanCode, ip });
        return { success: false, error: GENERIC_AUTH_ERROR };
      }
    }

    // 4. Đăng nhập thành công -> Xóa attempts cũ của (mã NV, IP)
    await supabaseAdmin
      .from('login_attempts')
      .delete()
      .eq('employee_code', cleanCode)
      .eq('ip', ip);

    // 5. Tạo session token ngẫu nhiên 256-bit (64 hex chars)
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

    const { error: sessionError } = await supabaseAdmin.from('sessions').insert({
      token_hash: tokenHash,
      user_id: user.id,
      expires_at: expiresAt,
    });

    if (sessionError) {
      return {
        success: false,
        error: toClientError(sessionError, 'Lỗi tạo phiên đăng nhập. Vui lòng thử lại.'),
      };
    }

    // 6. Set cookie auth_session = TOKEN
    const proto = headerStore.get('x-forwarded-proto') || 'http';
    (await cookies()).set('auth_session', token, {
      httpOnly: true,
      secure: proto === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return { success: true, user: mapUserFromDb(user) }; // NEVER return password_hash
  } catch (err: unknown) {
    return {
      success: false,
      error: toClientError(err, 'Lỗi không xác định khi đăng nhập. Vui lòng thử lại.'),
    };
  }
}

export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_session')?.value;

    if (isOpaqueSessionToken(token)) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await supabaseAdmin.from('sessions').delete().eq('token_hash', tokenHash);
    }

    cookieStore.delete('auth_session');
    return { success: true };
  } catch {
    // Fallback xóa cookie dù DB delete có trục trặc
    try {
      (await cookies()).delete('auth_session');
    } catch {
      // ignore
    }
    return { success: true };
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

export type { CompletePasswordSetupResult, ResetPasswordResult };
