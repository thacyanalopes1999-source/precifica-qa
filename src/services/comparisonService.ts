
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ResumoQA = {
  total_produtos: number;
  matches: number;
  em_revisao: number;
  exclusoes: number;
  comparacoes: number;
};

export type ComparacaoQA = {
  id: string;
  nome: string;
  arquivo_a: string;
  arquivo_b: string;
  status: string;
  criado_em: string;
};

export async function getDashboardData() {
  const supabase = getSupabaseAdmin();

  const [resumoResult, historicoResult] = await Promise.all([
    supabase.rpc("qa_dashboard_resumo"),

    supabase
      .from("qa_comparacoes")
      .select("id, nome, arquivo_a, arquivo_b, status, criado_em")
      .order("criado_em", { ascending: false })
      .limit(5),
  ]);

  if (resumoResult.error) {
    throw new Error(
      `Falha ao carregar indicadores: ${resumoResult.error.message}`
    );
  }

  if (historicoResult.error) {
    throw new Error(
      `Falha ao carregar comparações: ${historicoResult.error.message}`
    );
  }

  const registro = resumoResult.data?.[0];

  if (!registro) {
    throw new Error("A consulta de indicadores não retornou dados.");
  }

  const resumo: ResumoQA = {
    total_produtos: Number(registro.total_produtos),
    matches: Number(registro.matches),
    em_revisao: Number(registro.em_revisao),
    exclusoes: Number(registro.exclusoes),
    comparacoes: Number(registro.comparacoes),
  };

  return {
    resumo,
    historico: (historicoResult.data ?? []) as ComparacaoQA[],
  };
}
