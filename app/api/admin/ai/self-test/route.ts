import { NextResponse } from "next/server";
import { getAiConfigStatus, runAiConnectionSelfTest } from "@/lib/ai/client";
import { getServerEnv } from "@/lib/env";
import { getAdminSession } from "@/lib/session/admin-session";

export async function GET() {
  const session = await getAdminSession();

  if (!session?.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    config: getAiConfigStatus(getServerEnv()),
  });
}

export async function POST() {
  const session = await getAdminSession();

  if (!session?.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runAiConnectionSelfTest();

  return NextResponse.json({
    ok: result.ok,
    model: result.model,
    latencyMs: result.latencyMs,
    error: result.error,
  });
}
