import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ACCESS_TOKEN_KEY = 'suntax_access_token';

/**
 * Next.js Edge Middleware for route protection.
 *
 * Rules:
 * - /dashboard/* → requires authenticated user
 * - /admin/*     → requires admin role (checked via token claim, server-side)
 * - /login, /register → redirect already-authenticated users to /dashboard
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const accessToken = request.cookies.get(ACCESS_TOKEN_KEY)?.value;
  const isAuthenticated = Boolean(accessToken);

  // Protected dashboard routes
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/tax-returns') || pathname.startsWith('/documents') || pathname.startsWith('/profile')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Admin routes — additional role check would require JWT decode
  if (pathname.startsWith('/admin')) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Note: Full admin role verification is done server-side in page components
    // by calling GET /api/v1/auth/me and checking is_admin flag.
    return NextResponse.next();
  }

  // Redirect already-authenticated users away from auth pages
  if (isAuthenticated && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/tax-returns/:path*',
    '/documents/:path*',
    '/profile/:path*',
    '/admin/:path*',
    '/login',
    '/register',
  ],
};
