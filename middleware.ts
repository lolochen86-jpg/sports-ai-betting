import { NextRequest, NextResponse } from 'next/server';

// Middleware for authentication and routing
export function middleware(request: NextRequest) {
  // Add middleware logic here
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
