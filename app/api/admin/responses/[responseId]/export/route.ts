import { NextResponse } from "next/server";
import { z } from "zod";
import { createDb } from "@/lib/db/client";
import { buildResponseJsonExport } from "@/lib/export/response-export";

type ResponseExportRouteProps = {
  params: Promise<{
    responseId: string;
  }>;
};

const responseIdSchema = z.string().trim().min(1).max(120);

function attachmentFilename(responseId: string) {
  return `response-${responseId.replace(/[^a-zA-Z0-9_-]/g, "_")}-export.json`;
}

export async function GET(_request: Request, { params }: ResponseExportRouteProps) {
  const { responseId } = await params;
  const parsed = responseIdSchema.safeParse(responseId);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid response ID." }, { status: 400 });
  }

  const result = buildResponseJsonExport(createDb(), parsed.data);

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 500;
    return NextResponse.json({ error: result.error === "not_found" ? "Response not found." : "Export data is invalid." }, { status });
  }

  return new NextResponse(JSON.stringify(result.export, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${attachmentFilename(parsed.data)}"`,
      "cache-control": "no-store",
    },
  });
}
