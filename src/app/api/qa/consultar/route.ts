import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development" || !["localhost", "127.0.0.1"].includes(req.nextUrl.hostname))
    return NextResponse.json({ error: "Disponível apenas em desenvolvimento local." }, { status: 403 });
  const db = getSupabaseAdmin();
  const tipo = req.nextUrl.searchParams.get("tipo") || "comparacoes";
  const id = req.nextUrl.searchParams.get("id") || "";
  const page = Math.max(1, Math.min(100000, Number(req.nextUrl.searchParams.get("page") || 1) || 1));
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit") || 30) || 30));
  const offset = (page - 1) * limit;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (tipo === "comparacoes" || tipo === "dashboard" || tipo === "historico") {
    const { data, count, error } = await db.from("qa_comparacoes")
      .select("id,nome,status,arquivo_a,arquivo_b,criado_em,concluido_em", { count: "exact" })
      .order("criado_em", { ascending: false }).range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (tipo !== "dashboard") return NextResponse.json({ items: data || [], count: count || 0, page, limit });
    const [produtos, pendentes, aprovados, rejeitados] = await Promise.all([
      db.from("qa_resultados").select("id", { count: "exact", head: true }),
      db.from("qa_resultados").select("id", { count: "exact", head: true }).eq("status_revisao", "pendente"),
      db.from("qa_resultados").select("id", { count: "exact", head: true }).eq("status_revisao", "aprovado"),
      db.from("qa_resultados").select("id", { count: "exact", head: true }).eq("status_revisao", "rejeitado"),
    ]);
    const problem = [produtos, pendentes, aprovados, rejeitados].find(x => x.error);
    if (problem?.error) return NextResponse.json({ error: problem.error.message }, { status: 500 });
    return NextResponse.json({ items: data || [], comparacoes: count || 0, produtos: produtos.count || 0,
      pendentes: pendentes.count || 0, aprovados: aprovados.count || 0, rejeitados: rejeitados.count || 0 });
  }
  if (tipo === "resultados") {
    const filtro = req.nextUrl.searchParams.get("filtro") || "todos";
    let q = db.from("qa_resultados").select("id,comparacao_id,produto_a_id,produto_b_id,descricao_a,descricao_b,score,classificacao,status_revisao,motivo", { count: "exact" });
    if (id) { if (!uuid.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 }); q = q.eq("comparacao_id", id); }
    if (filtro === "pendente" || filtro === "aprovado" || filtro === "rejeitado") q = q.eq("status_revisao", filtro);
    if (filtro === "exclusao") q = q.eq("classificacao", "exclusao");
    const { data, count, error } = await q.order("id", { ascending: false }).range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data || [], count: count || 0, page, limit });
  }
  return NextResponse.json({ error: "Tipo desconhecido" }, { status: 400 });
}
