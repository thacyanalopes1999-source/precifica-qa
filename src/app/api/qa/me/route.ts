import { NextRequest, NextResponse } from "next/server";
import { requireQAAdmin } from "@/lib/qa/auth";

/** Endpoint sem acesso ao banco: apenas valida JWT + UID administrador no servidor. */
export async function GET(req: NextRequest) {
  const denied = await requireQAAdmin(req);
  if (denied) return denied;
  return NextResponse.json(
    { ok: true, role: "admin" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
