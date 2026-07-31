import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed Middleware to Proxy. This runs an *optimistic* auth check
// (cookie presence only) to redirect at the edge of the request. The real,
// authoritative check lives in the Data Access Layer (`src/lib/dal.ts`) which
// reads and validates the session on the server.

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

  // Guard protected areas. (Role enforcement for /users happens in the page
  // via requireAdmin — this is just an optimistic signed-in check.) Auth
  // pages deliberately do not use this cookie-presence shortcut: an expired
  // cookie is not proof of a valid session and previously caused a redirect
  // loop between /dashboard and /login or /register.
  if (
    !isAuthed &&
    (pathname.startsWith("/dashboard") || pathname.startsWith("/users"))
  ) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/users/:path*"],
};
