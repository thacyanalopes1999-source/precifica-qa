
import Link from "next/link";
import { connection } from "next/server";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  GitCompareArrows,
  Package,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  AlertTriangle,
} from "lucide-react";

import { getDashboardData } from "@/services/comparisonService";

const formatarNumero = (valor: number) =>
  new Intl.NumberFormat("pt-BR").format(valor);

const formatarPercentual = (valor: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);

export default async function Home() {
  // Next.js 16 com cacheComponents habilitado
  await connection();

  let dados: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let erroConexao = false;

  try {
    dados = await getDashboardData();
  } catch (error) {
    erroConexao = true;
    console.error(
      "[PRECIFICA QA] Erro ao carregar dashboard:",
      error
    );
  }

  if (erroConexao || !dados) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold text-blue-600">
            PRECIFICA QA
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Visão geral
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Monitoramento e qualidade de produtos.
          </p>
        </div>

        <section className="rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
          <div className="mb-5 inline-flex rounded-2xl bg-amber-50 p-4 text-amber-600">
            <AlertTriangle size={28} />
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            Não foi possível carregar os dados
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
            O Dashboard não conseguiu consultar o banco de dados.
            Nenhum resultado fictício será exibido.
          </p>

          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Database size={18} />
              Verifique a conexão com Supabase
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Confira as variáveis do arquivo .env.local,
              a conexão com o projeto e a existência da
              função qa_dashboard_resumo no banco.
            </p>

            <p className="mt-2 text-xs text-slate-400">
              A mensagem técnica detalhada estará no terminal
              do Next.js, com o prefixo [PRECIFICA QA].
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <RefreshCw size={17} />
              Tentar novamente
            </Link>

            <Link
              href="/importar"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <UploadCloud size={17} />
              Importar arquivos
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const { resumo, historico } = dados;

  const indicadores = [
    {
      titulo: "Produtos analisados",
      valor: resumo.total_produtos,
      icon: Package,
      cor: "bg-blue-50 text-blue-600",
    },
    {
      titulo: "Matches sugeridos",
      valor: resumo.matches,
      icon: CheckCircle2,
      cor: "bg-emerald-50 text-emerald-600",
    },
    {
      titulo: "Em revisão",
      valor: resumo.em_revisao,
      icon: ClipboardCheck,
      cor: "bg-amber-50 text-amber-600",
    },
    {
      titulo: "Candidatos à exclusão",
      valor: resumo.exclusoes,
      icon: ShieldAlert,
      cor: "bg-rose-50 text-rose-600",
    },
  ];

  const distribuicao = [
    {
      nome: "Matches sugeridos",
      valor: resumo.matches,
      cor: "bg-emerald-500",
    },
    {
      nome: "Revisão",
      valor: resumo.em_revisao,
      cor: "bg-amber-400",
    },
    {
      nome: "Exclusões sugeridas",
      valor: resumo.exclusoes,
      cor: "bg-rose-500",
    },
  ];

  const taxaMatch =
    resumo.total_produtos > 0
      ? (resumo.matches / resumo.total_produtos) * 100
      : null;

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 text-xs font-semibold text-blue-600">
            PRECIFICA QA
          </p>

          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
            Visão geral
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Acompanhe suas comparações e resultados reais.
          </p>
        </div>

        <Link
          href="/importar"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <UploadCloud size={18} />
          Nova comparação
        </Link>
      </section>

      {/* INDICADORES REAIS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map((item) => {
          const Icon = item.icon;

          return (
            <article
              key={item.titulo}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div
                className={`mb-5 inline-flex rounded-xl p-3 ${item.cor}`}
              >
                <Icon size={22} />
              </div>

              <p className="text-sm text-slate-500">
                {item.titulo}
              </p>

              <p className="mt-1 text-3xl font-bold text-slate-900">
                {formatarNumero(item.valor)}
              </p>
            </article>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* DISTRIBUICAO */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">
                Distribuição dos resultados
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Classificações de comparações concluídas
              </p>
            </div>

            <FileSpreadsheet
              className="text-blue-600"
              size={22}
            />
          </div>

          {resumo.total_produtos === 0 ? (
            <div className="flex min-h-60 flex-col items-center justify-center text-center">
              <div className="mb-4 rounded-full bg-slate-100 p-5">
                <GitCompareArrows
                  size={28}
                  className="text-slate-400"
                />
              </div>

              <p className="font-semibold text-slate-800">
                Nenhuma análise concluída
              </p>

              <p className="mt-2 max-w-sm text-sm text-slate-500">
                Quando uma comparação for processada,
                os resultados aparecerão aqui.
              </p>

              <Link
                href="/importar"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Importar arquivos
                <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div className="mt-8 space-y-7">
              <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                {distribuicao.map((item) => (
                  <div
                    key={item.nome}
                    className={item.cor}
                    style={{
                      width: `${
                        (item.valor / resumo.total_produtos) * 100
                      }%`,
                    }}
                  />
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {distribuicao.map((item) => {
                  const percentual =
                    (item.valor / resumo.total_produtos) * 100;

                  return (
                    <div key={item.nome}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${item.cor}`}
                        />

                        <p className="text-sm font-semibold text-slate-800">
                          {formatarPercentual(percentual)}%
                        </p>
                      </div>

                      <p className="mt-1 text-xs text-slate-500">
                        {item.nome}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">
                  Taxa de correspondência sugerida
                </p>

                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {taxaMatch !== null
                    ? `${formatarPercentual(taxaMatch)}%`
                    : "—"}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* PROCESSAMENTOS */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold text-slate-900">
            Processamentos
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Comparações registradas no sistema
          </p>

          <p className="mt-8 text-4xl font-bold text-slate-900">
            {formatarNumero(resumo.comparacoes)}
          </p>

          <div className="mt-8 rounded-xl bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-800">
              Comparação 1 para 1
            </p>

            <p className="mt-2 text-xs leading-5 text-blue-700">
              Cada produto da Base A poderá ser vinculado
              a no máximo um produto da Base B.
            </p>
          </div>

          <div className="mt-4 rounded-xl bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">
              Exclusão protegida
            </p>

            <p className="mt-2 text-xs leading-5 text-amber-700">
              Produtos sem correspondência devem passar
              por revisão humana antes de qualquer exclusão.
            </p>
          </div>
        </section>
      </div>

      {/* HISTORICO REAL */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900">
              Comparações recentes
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Últimos processamentos registrados
            </p>
          </div>

          <Link
            href="/comparacoes"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600"
          >
            Ver todas
            <ArrowRight size={16} />
          </Link>
        </div>

        {historico.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <ClipboardCheck
              size={32}
              className="mb-3 text-slate-300"
            />

            <p className="font-medium text-slate-700">
              Nenhuma comparação registrada
            </p>

            <p className="mt-2 text-sm text-slate-500">
              Seus processamentos aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="mt-5 divide-y divide-slate-100">
            {historico.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {item.nome}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {item.arquivo_a} → {item.arquivo_b}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {item.status}
                  </span>

                  <time className="text-xs text-slate-400">
                    {new Date(
                      item.criado_em
                    ).toLocaleDateString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </time>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
