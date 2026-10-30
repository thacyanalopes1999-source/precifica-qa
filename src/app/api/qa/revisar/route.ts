import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1"].includes(req.nextUrl.hostname))
    return NextResponse.json({ error: "Somente no desenvolvimento local." }, { status: 403 });
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
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
