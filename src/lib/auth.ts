import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { mapUserFromDb, USER_SELECT } from '@/lib/db/users';
import { User, Role } from '@/types';

export type AuthResult = { user: User; error: null } | { user: null; error: string };

/** Lấy user từ session cookie `auth_session` (server-side). Trả null nếu không có/không hợp lệ. */
export async function getSessionUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('auth_session')?.value;
    if (!userId) return null;

    const { data } = await supabase
      .from('users')
      .select(USER_SELECT)
      .eq('id', userId)
      .maybeSingle();

    if (!data) return null;
    return mapUserFromDb(data);
  } catch {
    return null;
  }
}

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
