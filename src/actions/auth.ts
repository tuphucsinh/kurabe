'use server';

import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import bcrypt from 'bcryptjs';
import { mapUserFromDb } from '@/lib/db/users';
import { toClientError } from '@/lib/errors';
import { isOpaqueSessionToken } from '@/lib/session-token';
import type { User } from '@/types';

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 phút
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 ngày

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
      return { success: false, error: 'Mã nhân viên hoặc mật khẩu không đúng.' };
    }

    // 3. Kiểm tra mật khẩu (giữ nguyên luật Q3: password_hash NULL -> không cần mật khẩu)
    if (user.password_hash) {
      if (!password) {
        return { success: false, error: 'Vui lòng nhập mật khẩu.' };
      }
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        // Ghi nhận lần thử thất bại
        await supabaseAdmin.from('login_attempts').insert({ employee_code: cleanCode, ip });
        return { success: false, error: 'Mã nhân viên hoặc mật khẩu không đúng.' };
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
