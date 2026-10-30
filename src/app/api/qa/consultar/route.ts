import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireQAAdmin } from "@/lib/qa/auth";

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function GET(req: NextRequest) {
  const denied = await requireQAAdmin(req);
  if (denied) return denied;
  try {
    const db = getSupabaseAdmin();
    const tipo = req.nextUrl.searchParams.get("tipo") || "comparacoes";
    const id = req.nextUrl.searchParams.get("id") || "";
    const page = Math.max(1, Math.min(100000, Number(req.nextUrl.searchParams.get("page") || 1) || 1));
    const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get("limit") || 30) || 30));
    const offset = (page - 1) * limit;

    if (tipo === "comparacoes") {
      const status = req.nextUrl.searchParams.get("status") || "todos";
      const days = req.nextUrl.searchParams.get("dias") || "todos";
      const queryText = (req.nextUrl.searchParams.get("busca") || "").trim().slice(0, 100);
      if (!["todos", "concluido", "processando"].includes(status)) return fail("Filtro de status inválido.");
      if (!["todos", "7", "30", "90"].includes(days)) return fail("Filtro de período inválido.");
      let q = db.from("qa_comparacoes")
        .select("id,nome,status,arquivo_a,arquivo_b,criado_em,concluido_em", { count: "exact" });
      if (status !== "todos") q = q.eq("status", status);
      if (days !== "todos") {
        const start = new Date(Date.now() - Number(days) * 86400000).toISOString();
        q = q.gte("criado_em", start);
      }
      // Restringir operadores do filtro PostgREST antes de montar .or().
      const safeTerm = queryText.replace(/[^a-zA-Z0-9À-ÿ ._-]/g, "").trim();
      if (safeTerm) q = q.or(`nome.ilike.%${safeTerm}%,arquivo_a.ilike.%${safeTerm}%,arquivo_b.ilike.%${safeTerm}%`);
      const [lista, total, concluidas, processando, pendentes] = await Promise.all([
        q.order("criado_em", { ascending: false }).range(offset, offset + limit - 1),
        db.from("qa_comparacoes").select("id", { count: "exact", head: true }),
        db.from("qa_comparacoes").select("id", { count: "exact", head: true }).eq("status", "concluido"),
        db.from("qa_comparacoes").select("id", { count: "exact", head: true }).eq("status", "processando"),
        db.from("qa_resultados").select("id", { count: "exact", head: true }).eq("status_revisao", "pendente"),
      ]);
      const problem = [lista, total, concluidas, processando, pendentes].find(x=>x.error);
      if (problem?.error) return fail(problem.error.message, 500);
      return NextResponse.json({ items: lista.data || [], count: lista.count || 0, page, limit,
        stats: { total: total.count || 0, concluidas: concluidas.count || 0, processando: processando.count || 0, pendentes: pendentes.count || 0 } });
    }

    if (tipo === "dashboard" || tipo === "historico") {
      const { data, count, error } = await db.from("qa_comparacoes")
        .select("id,nome,status,arquivo_a,arquivo_b,criado_em,concluido_em", { count: "exact" })
        .order("criado_em", { ascending: false }).range(offset, offset + limit - 1);
      if (error) return fail(error.message, 500);
      if (tipo === "historico") return NextResponse.json({ items: data || [], count: count || 0, page, limit });
      const [produtos, pendentes, aprovados, rejeitados] = await Promise.all([
        db.from("qa_resultados").select("id", { count: "exact", head: true }),
        db.from("qa_resultados").select("id", { count: "exact", head: true }).eq("status_revisao", "pendente"),
        db.from("qa_resultados").select("id", { count: "exact", head: true }).eq("status_revisao", "aprovado"),
        db.from("qa_resultados").select("id", { count: "exact", head: true }).eq("status_revisao", "rejeitado"),
      ]);
      const problem = [produtos, pendentes, aprovados, rejeitados].find(x => x.error);
      if (problem?.error) return fail(problem.error.message, 500);
      return NextResponse.json({ items: data || [], comparacoes: count || 0, produtos: produtos.count || 0,
        pendentes: pendentes.count || 0, aprovados: aprovados.count || 0, rejeitados: rejeitados.count || 0 });
    }

    if (tipo === "resultados") {
      const filtro = req.nextUrl.searchParams.get("filtro") || "todos";
      if (!["todos", "pendente", "aprovado", "rejeitado", "exclusao"].includes(filtro)) return fail("Filtro inválido.");
      let q = db.from("qa_resultados")
        .select("id,comparacao_id,produto_a_id,produto_b_id,descricao_a,descricao_b,score,classificacao,status_revisao,motivo", { count: "exact" });
      if (id) {
        if (!UUID.test(id)) return fail("ID inválido.");
        q = q.eq("comparacao_id", id);
      }
      if (["pendente", "aprovado", "rejeitado"].includes(filtro)) q = q.eq("status_revisao", filtro);
      if (filtro === "exclusao") q = q.eq("classificacao", "exclusao");
      const { data, count, error } = await q.order("id", { ascending: false }).range(offset, offset + limit - 1);
      if (error) return fail(error.message, 500);
      return NextResponse.json({ items: data || [], count: count || 0, page, limit });
    }
    return fail("Tipo desconhecido.");
  } catch (error) {
    console.error("[PRECIFICA QA] Consultar:", error);
    return fail("Falha ao consultar o banco.", 500);
  }
}
