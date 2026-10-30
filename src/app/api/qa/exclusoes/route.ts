import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireQAAdmin } from "@/lib/qa/auth";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const VALID_STATUS = ["todos", "pendente", "aprovado", "rejeitado"] as const;
const errorResponse = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * Somente registros salvos como classificacao = 'exclusao'.
 * O código de persistência mapeia SEM_CANDIDATO para essa classificação.
 * Não remove produtos e não declara que um item inexiste na base de referência.
 */
export async function GET(req: NextRequest) {
  const denied = await requireQAAdmin(req);
  if (denied) return denied;
  try {
    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Math.min(100000, Number(params.get("page") || "1") || 1));
    const limit = Math.max(1, Math.min(100, Number(params.get("limit") || "20") || 20));
    const revisao = params.get("revisao") || "todos";
    if (!VALID_STATUS.includes(revisao as typeof VALID_STATUS[number])) return errorResponse("Status de revisão inválido.");
    const comparacao = (params.get("comparacao") || "").trim();
    if (comparacao && !UUID.test(comparacao)) return errorResponse("ID de comparação inválido.");

    // Retira caracteres com sintaxe PostgREST .or() e limita busca.
    const busca = (params.get("busca") || "").trim().slice(0, 80)
      .replace(/[(),%*\\]/g, "").replace(/[^\p{L}\p{N} _./-]/gu, "").trim();
    const db = getSupabaseAdmin();
    const offset = (page - 1) * limit;
    const base = () => {
      let q = db.from("qa_resultados").select("id", { count: "exact", head: true })
        .eq("classificacao", "exclusao");
      if (comparacao) q = q.eq("comparacao_id", comparacao);
      return q;
    };
    let list = db.from("qa_resultados")
      .select("id,comparacao_id,produto_a_id,produto_b_id,descricao_a,descricao_b,score,classificacao,status_revisao,motivo", { count: "exact" })
      .eq("classificacao", "exclusao");
    if (comparacao) list = list.eq("comparacao_id", comparacao);
    if (revisao !== "todos") list = list.eq("status_revisao", revisao);
    if (busca) list = list.or(`descricao_a.ilike.%${busca}%,descricao_b.ilike.%${busca}%,produto_a_id.ilike.%${busca}%`);

    const [pagina, total, pendentes, aprovados, rejeitados] = await Promise.all([
      list.order("id", { ascending: false }).range(offset, offset + limit - 1),
      base(),
      base().eq("status_revisao", "pendente"),
      base().eq("status_revisao", "aprovado"),
      base().eq("status_revisao", "rejeitado"),
    ]);
    const problem = [pagina, total, pendentes, aprovados, rejeitados].find((x) => x.error);
    if (problem?.error) {
      console.error("[Precifica QA] consulta de exclusões:", problem.error.message);
      return errorResponse("Não foi possível consultar os candidatos no Supabase.", 500);
    }
    const rows = pagina.data || [];
    const ids = Array.from(new Set(rows.map((row) => row.comparacao_id).filter((id): id is string => typeof id === "string" && UUID.test(id))));
    let names: Record<string, string> = {};
    if (ids.length) {
      const lookup = await db.from("qa_comparacoes").select("id,nome").in("id", ids);
      if (!lookup.error) names = Object.fromEntries((lookup.data || []).map((r) => [r.id, r.nome]));
    }
    return NextResponse.json({
      items: rows.map((row) => ({ ...row, comparacao_nome: names[row.comparacao_id] || "Comparação" })),
      page, limit, count: pagina.count || 0,
      totals: { total: total.count || 0, pendente: pendentes.count || 0,
        aprovado: aprovados.count || 0, rejeitado: rejeitados.count || 0 },
      // Esses totais consideram a comparação escolhida, mas não o texto buscado.
      totals_scope: comparacao ? "comparacao" : "geral",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[Precifica QA] exclusões:", e);
    return errorResponse("Falha ao carregar exclusões.", 500);
  }
}
