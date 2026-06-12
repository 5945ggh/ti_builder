import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearAdminSessionCookie } from "@/lib/session/admin-session";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  clearAdminSessionCookie(response, request);

  return response;
}
