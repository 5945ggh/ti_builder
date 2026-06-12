import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createDb } from "@/lib/db/client";
import { members } from "@/lib/db/schema";
import { getAdminSession, setAdminSessionCookie } from "@/lib/session/admin-session";

const selectMemberSchema = z.object({
  memberId: z.string().min(1),
});

const createMemberSchema = z.object({
  name: z.string().trim().min(1, "Member name is required.").max(80, "Member name must be 80 characters or less."),
});

export async function POST(request: NextRequest) {
  const session = await getAdminSession();

  if (!session?.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = selectMemberSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const selectedMember = createDb()
    .select({
      id: members.id,
      name: members.name,
      role: members.role,
    })
    .from(members)
    .where(and(eq(members.id, parsed.data.memberId), isNull(members.archivedAt)))
    .get();

  if (!selectedMember) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }

  const response = NextResponse.json({
    ok: true,
    selectedMember,
  });
  const didSetSession = await setAdminSessionCookie(response, {
    authenticated: true,
    selectedMemberId: selectedMember.id,
  }, request);

  if (!didSetSession) {
    return NextResponse.json({ error: "session_secret_not_configured" }, { status: 503 });
  }

  return response;
}

export async function PUT(request: NextRequest) {
  const session = await getAdminSession();

  if (!session?.authenticated) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = createMemberSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const db = createDb();
  const existingMember = db
    .select({
      id: members.id,
      name: members.name,
      role: members.role,
    })
    .from(members)
    .where(and(eq(members.name, parsed.data.name), isNull(members.archivedAt)))
    .get();
  const selectedMember =
    existingMember ??
    db
      .insert(members)
      .values({
        id: nanoid(21),
        name: parsed.data.name,
        role: "member",
        createdAt: new Date(),
      })
      .returning({
        id: members.id,
        name: members.name,
        role: members.role,
      })
      .get();
  const response = NextResponse.json({
    ok: true,
    created: !existingMember,
    selectedMember,
  });
  const didSetSession = await setAdminSessionCookie(response, {
    authenticated: true,
    selectedMemberId: selectedMember.id,
  }, request);

  if (!didSetSession) {
    return NextResponse.json({ error: "session_secret_not_configured" }, { status: 503 });
  }

  return response;
}
