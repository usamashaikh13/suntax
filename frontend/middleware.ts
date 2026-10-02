import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const accessToken = request.cookies.get('suntax_access_token')?.value
  const isAuthenticated = Boolean(accessToken)

  const protectedPaths = ['/dashboard', '/tax-returns', '/documents', '/profile']
  const authPaths = ['/login', '/register']

  const isProtected = protectedPaths.some(p => pathname.startsWith(p))
  const isAuthPage = authPaths.some(p => pathname.startsWith(p))

  if (isProtected && !isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
}
