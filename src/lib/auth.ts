import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { mapUserFromDb, USER_SELECT } from '@/lib/db/users';
import { User, Role } from '@/types';

export type AuthResult = { user: User; error: null } | { user: null; error: string };

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 ngày

/**
 * Lấy user từ session cookie `auth_session` (server-side). Trả null nếu không có/không hợp lệ.
 * - Nếu cookie là token 64 hex chars: hash sha256 -> tìm session còn hạn -> mapUser.
 * - Chuyển tiếp mềm: Nếu cookie là UUID (user.id cũ, 36 chars) -> verify user active -> tạo session mới & set cookie nếu context cho phép -> mapUser.
 * Bọc cache() của React: page + action gọi nhiều lần trong 1 request chỉ ra 1 query (C5).
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  try {
    const cookieStore = await cookies();
    const rawSession = cookieStore.get('auth_session')?.value?.trim();
    if (!rawSession) return null;

    // 1. Session token mới (64 hex characters)
    if (/^[0-9a-f]{64}$/i.test(rawSession)) {
      const tokenHash = crypto.createHash('sha256').update(rawSession).digest('hex');
      const nowIso = new Date().toISOString();

      const { data: sessionData, error: sessionErr } = await supabaseAdmin
        .from('sessions')
        .select('user_id, expires_at')
        .eq('token_hash', tokenHash)
        .gt('expires_at', nowIso)
        .maybeSingle();

      if (sessionErr || !sessionData) return null;

      const { data: userData, error: userErr } = await supabaseAdmin
        .from('users')
        .select(USER_SELECT)
        .eq('id', sessionData.user_id)
        .eq('is_active', true)
        .maybeSingle();

      if (userErr || !userData) return null;
      return mapUserFromDb(userData);
    }

    // 2. Chuyển tiếp mềm: cookie cũ là UUID (36 chars)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawSession)) {
      const { data: userData, error: userErr } = await supabaseAdmin
        .from('users')
        .select(USER_SELECT)
        .eq('id', rawSession)
        .eq('is_active', true)
        .maybeSingle();

      if (userErr || !userData) return null;

      // Thử tạo session mới và ghi đè cookie (chỉ thành công trong Server Actions / Route Handlers; RSC context sẽ throw/ignore)
      try {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

        await supabaseAdmin.from('sessions').insert({
          token_hash: tokenHash,
          user_id: userData.id,
          expires_at: expiresAt,
        });

        cookieStore.set('auth_session', token, {
          httpOnly: true,
          secure: (await headers()).get('x-forwarded-proto') === 'https',
          sameSite: 'lax',
          path: '/',
          maxAge: SESSION_MAX_AGE_SECONDS,
        });
      } catch {
        // Nếu context không cho phép set cookie (ví dụ RSC rendering), không sao — trả user bình thường để không logout
      }

      return mapUserFromDb(userData);
    }

    return null;
  } catch {
    return null;
  }
});

/** Bắt buộc đăng nhập — trả user hoặc {error} để action trả về ngay. */
export async function requireAuth(): Promise<AuthResult> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, error: 'Bạn cần đăng nhập để thực hiện thao tác này.' };
  }
  return { user, error: null };
}

/** Bắt buộc đăng nhập + thuộc một trong các role. */
export async function requireRole(roles: Role[]): Promise<AuthResult> {
  const auth = await requireAuth();
  if (auth.error !== null) return auth;
  if (!roles.includes(auth.user.role)) {
    return { user: null, error: 'Bạn không có quyền thực hiện thao tác này.' };
  }
  return { user: auth.user, error: null };
}

/** Bắt buộc Manager. */
export function requireManager(): Promise<AuthResult> {
  return requireRole(['Manager']);
}
