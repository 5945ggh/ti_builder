import "server-only";
import { eq, isNull, and } from "drizzle-orm";
import { createDb } from "@/lib/db/client";
import { members } from "@/lib/db/schema";
import { getAdminSession } from "@/lib/session/admin-session";

export type SelectedAdminMember = {
  id: string;
  name: string;
  role: string;
};

export async function getSelectedAdminMember(): Promise<SelectedAdminMember | null> {
  const session = await getAdminSession();

  if (!session?.authenticated || !session.selectedMemberId) {
    return null;
  }

  return (
    createDb()
      .select({
        id: members.id,
        name: members.name,
        role: members.role,
      })
      .from(members)
      .where(and(eq(members.id, session.selectedMemberId), isNull(members.archivedAt)))
      .get() ?? null
  );
}

export async function requireSelectedAdminMember(): Promise<SelectedAdminMember> {
  const member = await getSelectedAdminMember();

  if (!member) {
    throw new Error("Admin member selection is required for attribution.");
  }

  return member;
}
