import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Server action POST (header next-action) — bypass. Kèm method POST vì action luôn POST;
  // GET mang header này là giả mạo → vẫn đi qua luồng auth check bên dưới.
  if (request.headers.has('next-action') && request.method === 'POST') {
    return NextResponse.next();
  }

  const authSession = request.cookies.get('auth_session');
  const pathname = request.nextUrl.pathname;

  if (pathname === '/') {
    if (!authSession) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  const protectedRoutes = ['/dashboard', '/reports', '/teams', '/employees', '/criteria', '/evaluations', '/settings'];
  
  const isProtectedRoute = protectedRoutes.some(route => request.nextUrl.pathname.startsWith(route));
  
  if (isProtectedRoute && !authSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  if (request.nextUrl.pathname === '/login' && authSession) {
    // Thẳng /dashboard (Employee sẽ được dashboard SSR redirect tiếp) — qua '/' chỉ thêm 1 hop 307
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
