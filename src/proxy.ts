import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isOpaqueSessionToken } from '@/lib/session-token';
import { buildContentSecurityPolicy } from '@/lib/security-csp';

const protectedRoutes = ['/dashboard', '/reports', '/teams', '/employees', '/criteria', '/evaluations', '/settings'];
const SERVER_ACTION_ID = /^[0-9a-f]{42}$/i;

type SecurityContext = {
  nonce: string;
  policy: string;
};

function createSecurityContext(): SecurityContext {
  // Next.js extracts this request-scoped nonce and applies it to its own inline tags.
  const nonce = globalThis.crypto.randomUUID();
  const policy = buildContentSecurityPolicy({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    production: process.env.NODE_ENV === 'production',
    nonce,
  });
  return { nonce, policy };
}

function addResponseSecurityHeaders(response: NextResponse, policy: string): NextResponse {
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

function isServerActionRequest(request: NextRequest): boolean {
  const actionId = request.headers.get('next-action');
  return request.method === 'POST' && actionId !== null && SERVER_ACTION_ID.test(actionId);
}

export function proxy(request: NextRequest) {
  const { nonce, policy } = createSecurityContext();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // The incoming request policy is required for Next's server-side nonce extraction.
  requestHeaders.set('Content-Security-Policy', policy);

  const pathname = request.nextUrl.pathname;
  const isAuthenticated = isOpaqueSessionToken(request.cookies.get('auth_session')?.value);
  const actionRequest = isServerActionRequest(request);

  if (!actionRequest) {
    if (pathname === '/') {
      const destination = isAuthenticated ? '/dashboard' : '/login';
      return addResponseSecurityHeaders(
        NextResponse.redirect(new URL(destination, request.url)),
        policy
      );
    }

    const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
    if (isProtectedRoute && !isAuthenticated) {
      return addResponseSecurityHeaders(
        NextResponse.redirect(new URL('/login', request.url)),
        policy
      );
    }
  }

  return addResponseSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    policy
  );
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
