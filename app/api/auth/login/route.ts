import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { setAdminSessionCookie } from "@/lib/session/admin-session";

const loginSchema = z.object({
  password: z.string().min(1),
});

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const adminPassword = getServerEnv().ADMIN_ACCESS_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: "admin_password_not_configured" }, { status: 503 });
  }

  if (!constantTimeEqual(parsed.data.password, adminPassword)) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const didSetSession = await setAdminSessionCookie(response, { authenticated: true });

  if (!didSetSession) {
    return NextResponse.json({ error: "session_secret_not_configured" }, { status: 503 });
  }

  return response;
}
