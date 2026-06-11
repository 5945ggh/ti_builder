import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createDb } from "@/lib/db/client";
import { members } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/session/admin-session";

export async function GET() {
  const session = await getAdminSession();

  if (!session?.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const selectedMember = session.selectedMemberId
    ? createDb()
        .select({
          id: members.id,
          name: members.name,
          role: members.role,
        })
        .from(members)
        .where(and(eq(members.id, session.selectedMemberId), isNull(members.archivedAt)))
        .get()
    : null;

  return NextResponse.json({
    authenticated: true,
    selectedMember,
    selectedMemberId: session.selectedMemberId ?? null,
  });
}
