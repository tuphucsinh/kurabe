'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Logout server-side: xóa cookie session + redirect /login.
 * Redirect từ server action → trình duyệt chuyển thẳng trang login,
 * KHÔNG có frame trung gian (client-side navigation giữ trang cũ render).
 */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('auth_session');
  redirect('/login');
}
