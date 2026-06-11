import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, decodeAdminSession } from "@/lib/session/admin-session-core";

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);

  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const session = await decodeAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);

  if (session?.authenticated) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/admin/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return redirectToLogin(request);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
