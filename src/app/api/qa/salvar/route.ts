import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireQAAdmin, checkMutationOrigin } from "@/lib/qa/auth";



type InputRow = {
  linha_a: number;
  descricao_a: string;
  linha_b: number | null;
  descricao_b: string;
  score: number | null;
  classificacao: string;
  motivo: string;
};

const isUUID = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const fail = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

export async function POST(req: NextRequest) {
  const denied = await requireQAAdmin(req);
  if (denied) return denied;
  const badOrigin = checkMutationOrigin(req);
  if (badOrigin) return badOrigin;
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return fail("Envie application/json.", 415);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return fail("JSON inválido."); }

  const supabase = getSupabaseAdmin();
  const acao = body.acao;

  if (acao === "iniciar") {
    const nomeA = String(body.arquivo_a || "").trim().slice(0, 240);
    const nomeB = String(body.arquivo_b || "").trim().slice(0, 240);
    if (!nomeA || !nomeB) return fail("Informe os dois arquivos.");
    const nome = String(body.nome || `Comparação ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`).trim().slice(0, 240);
    const { data, error } = await supabase
      .from("qa_comparacoes")
      .insert({ nome, arquivo_a: nomeA, arquivo_b: nomeB, status: "processando" })
      .select("id")
      .single();
    if (error) return fail(`Erro ao criar comparação: ${error.message}`, 500);
    return NextResponse.json({ id: data.id });
  }

  if (!isUUID(body.id)) return fail("ID da comparação inválido.");
  const id = body.id;
  const { data: run, error: runErr } = await supabase
    .from("qa_comparacoes").select("id,status").eq("id", id).single();
  if (runErr || !run) return fail("Comparação não encontrada.", 404);

  if (acao === "cancelar") {
    if (run.status === "concluido") return fail("Comparação concluída não pode ser cancelada por esta rota.", 409);
    const { error } = await supabase.from("qa_comparacoes").delete().eq("id", id);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }

  if (run.status !== "processando") return fail("Comparação não está em processamento.", 409);

  if (acao === "lote") {
    if (!Array.isArray(body.resultados) || !body.resultados.length || body.resultados.length > 100)
      return fail("Cada lote precisa ter de 1 a 100 resultados.");

    const rows = (body.resultados as InputRow[]).map((r) => {
      if (!Number.isSafeInteger(r.linha_a) || r.linha_a < 2 || typeof r.descricao_a !== "string" || r.descricao_a.length > 10000)
        throw new Error("Linha ou descrição A inválida.");
      if (r.linha_b != null && (!Number.isSafeInteger(r.linha_b) || r.linha_b < 2))
        throw new Error("Linha B inválida.");
      if (r.score != null && (!Number.isFinite(r.score) || r.score < 0 || r.score > 100))
        throw new Error("Score inválido.");
      const labels: Record<string, "match" | "revisar" | "exclusao"> = {
        MATCH_SUGERIDO: "match", REVISAR: "revisar",
        VINCULO_PENDENTE: "revisar", DIFERENTE: "revisar",
        CONFLITO_1_1: "revisar", SEM_CANDIDATO: "exclusao",
      };
      if (!labels[r.classificacao]) throw new Error("Classificação desconhecida.");
      if (r.linha_b == null && r.classificacao === "MATCH_SUGERIDO")
        throw new Error("Match sem produto B.");
      return {
        comparacao_id: id,
        produto_a_id: String(r.linha_a),
        descricao_a: r.descricao_a,
        produto_b_id: r.linha_b == null ? null : String(r.linha_b),
        descricao_b: r.linha_b == null ? null : String(r.descricao_b || "").slice(0, 10000),
        score: r.score,
        classificacao: labels[r.classificacao],
        status_revisao: "pendente",
        motivo: `[${r.classificacao}] ${String(r.motivo || "").slice(0, 4000)}`,
      };
    });
    // OnConflict permite reenvio do mesmo lote sem duplicar produtos.
    const { error } = await supabase.from("qa_resultados")
      .upsert(rows, { onConflict: "comparacao_id,produto_a_id" });
    return error ? fail(`Erro ao gravar lote: ${error.message}`, 500) : NextResponse.json({ ok: true, gravados: rows.length });
  }

  if (acao === "concluir") {
    const esperado = Number(body.total_a);
    if (!Number.isSafeInteger(esperado) || esperado < 1 || esperado > 500000)
      return fail("Total de registros inválido.");
    const { count, error } = await supabase.from("qa_resultados")
      .select("id", { count: "exact", head: true }).eq("comparacao_id", id);
    if (error) return fail(`Erro ao contar resultados: ${error.message}`, 500);
    if (count !== esperado) return fail(`Gravação incompleta: ${count ?? 0} de ${esperado} registros.`, 409);
    const { error: finishError } = await supabase.from("qa_comparacoes")
      .update({ status: "concluido", concluido_em: new Date().toISOString() })
      .eq("id", id).eq("status", "processando");
    return finishError ? fail(finishError.message, 500) : NextResponse.json({ ok: true, id, total: count });
  }

  return fail("Ação desconhecida.");
}
