import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed Middleware to Proxy. This runs an *optimistic* auth check
// (cookie presence only) to redirect at the edge of the request. The real,
// authoritative check lives in the Data Access Layer (`src/lib/dal.ts`) which
// reads and validates the session on the server.

const AUTH_PAGES = ["/login", "/register"];

// Matches the page itself and anything beneath it, so /register/partner is
// treated as an auth page too.
function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`)
  );
}

// Auth.js stores the session JWT under one of these cookie names
// (the `__Secure-` prefix is used when served over HTTPS).
function hasSessionCookie(req: NextRequest): boolean {
  return Boolean(
    req.cookies.get("authjs.session-token") ??
      req.cookies.get("__Secure-authjs.session-token")
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAuthed = hasSessionCookie(req);

  // Logged-in users shouldn't see the login/register screens.
  if (isAuthed && isAuthPage(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Guard protected areas. (Role enforcement for /users happens in the page
  // via requireAdmin — this is just an optimistic signed-in check.)
  if (
    !isAuthed &&
    (pathname.startsWith("/dashboard") || pathname.startsWith("/users"))
  ) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/users/:path*",
    "/login",
    "/register",
    "/register/:path*",
  ],
};
