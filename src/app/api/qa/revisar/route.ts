import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireQAAdmin, checkMutationOrigin } from "@/lib/qa/auth";
export async function POST(req: NextRequest) {
  const denied = await requireQAAdmin(req);
  if (denied) return denied;
  const badOrigin = checkMutationOrigin(req);
  if (badOrigin) return badOrigin;
  let body: { id?: string; decisao?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  if (!body.id || !/^[a-f0-9-]{36}$/i.test(body.id) || !["pendente", "aprovado", "rejeitado"].includes(body.decisao || ""))
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("qa_resultados").update({ status_revisao: body.decisao })
    .eq("id", body.id).select("id,status_revisao").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
