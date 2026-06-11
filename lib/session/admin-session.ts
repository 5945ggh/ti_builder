import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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

export async function setAdminSessionCookie(response: NextResponse, session: AdminSession): Promise<boolean> {
  const value = await encodeAdminSession(session);

  if (!value) {
    return false;
  }

  response.cookies.set(ADMIN_SESSION_COOKIE, value, {
    ...adminSessionCookieOptions,
    secure: process.env.NODE_ENV === "production",
  });

  return true;
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    ...adminSessionCookieOptions,
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
}
