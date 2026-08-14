'use server';

import { cookies, headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import bcrypt from 'bcryptjs';
import { mapUserFromDb } from '@/lib/db/users';
import type { User } from '@/types';

export async function loginAction(
  employeeCode: string,
  password: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('employee_code', employeeCode)
      .eq('is_active', true)
      .maybeSingle();

    if (!user) {
      return { success: false, error: 'Mã nhân viên không hợp lệ hoặc không tồn tại.' };
    }

    if (user.password_hash) {
      if (!password) {
        return { success: false, error: 'Vui lòng nhập mật khẩu.' };
      }
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return { success: false, error: 'Mật khẩu không đúng.' };
      }
    }

    // P69 fix (14-08): secure flag theo PROTOCOL THẬT, KHÔNG theo NODE_ENV —
    // npm run start (production build) trên HTTP LAN/localhost sẽ bị trình duyệt
    // TỪ CHỐI cookie Secure (chỉ chấp nhận trên https/localhost) → login "chớp rồi về login".
    // Vercel gửi x-forwarded-proto: https → secure=true. LAN HTTP → secure=false.
    const proto = (await headers()).get('x-forwarded-proto') || 'http';
    (await cookies()).set('auth_session', user.id, {
      httpOnly: true,
      secure: proto === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return { success: true, user: mapUserFromDb(user) }; // NEVER return password_hash
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Lỗi không xác định khi đăng nhập.',
    };
  }
}

export async function logoutAction(): Promise<{ success: boolean }> {
  (await cookies()).delete('auth_session');
  return { success: true };
}
