import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  AdminSession,
  adminSessionCookieOptions,
  decodeAdminSession,
  encodeAdminSession,
} from "./admin-session-core";

export { ADMIN_SESSION_COOKIE, decodeAdminSession };
export type { AdminSession };

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();

  return decodeAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

function shouldUseSecureCookie(request?: NextRequest): boolean {
  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  if (request) {
    return request.nextUrl.protocol === "https:";
  }

  return process.env.NODE_ENV === "production";
}

export async function setAdminSessionCookie(
  response: NextResponse,
  session: AdminSession,
  request?: NextRequest,
): Promise<boolean> {
  const value = await encodeAdminSession(session);

  if (!value) {
    return false;
  }

  response.cookies.set(ADMIN_SESSION_COOKIE, value, {
    ...adminSessionCookieOptions,
    secure: shouldUseSecureCookie(request),
  });

  return true;
}

export function clearAdminSessionCookie(response: NextResponse, request?: NextRequest) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    ...adminSessionCookieOptions,
    maxAge: 0,
    secure: shouldUseSecureCookie(request),
  });
}
