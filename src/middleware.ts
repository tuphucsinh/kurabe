import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isOpaqueSessionToken } from '@/lib/session-token';

export function middleware(request: NextRequest) {
  // Server action POST (header next-action) — bypass. Kèm method POST vì action luôn POST;
  // GET mang header này là giả mạo → vẫn đi qua luồng auth check bên dưới.
  if (request.headers.has('next-action') && request.method === 'POST') {
    return NextResponse.next();
  }

  const rawCookie = request.cookies.get('auth_session')?.value;
  const isAuthenticated = isOpaqueSessionToken(rawCookie);
  const pathname = request.nextUrl.pathname;

  if (pathname === '/') {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const protectedRoutes = ['/dashboard', '/reports', '/teams', '/employees', '/criteria', '/evaluations', '/settings'];

  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  if (isProtectedRoute && !isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
