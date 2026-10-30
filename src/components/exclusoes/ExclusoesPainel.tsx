"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArchiveX, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardCheck, Download, FileSearch, Info, LoaderCircle,
  RefreshCcw, Search, ShieldCheck, X, XCircle,
} from "lucide-react";
import { fetchQA } from "@/lib/supabase/browser";

type Status = "pendente" | "aprovado" | "rejeitado";
type StatusFilter = "todos" | Status;
type Candidate = {
  id: string;
  comparacao_id: string;
  comparacao_nome: string;
  produto_a_id: string;
  produto_b_id: string | null;
  descricao_a: string;
  descricao_b: string | null;
  score: number | null;
  classificacao: string;
  status_revisao: Status;
  motivo: string | null;
};
type SearchResponse = {
  items: Candidate[];
  page: number;
  limit: number;
  count: number;
  totals: { total: number; pendente: number; aprovado: number; rejeitado: number };
  totals_scope: "geral" | "comparacao";
  error?: string;
};
type Comparison = { id: string; nome: string; arquivo_a: string; arquivo_b: string };
const fmt = (n: number) => n.toLocaleString("pt-BR");
const limit = 20;
const input = "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100";
const panel = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const statusLabel: Record<Status, string> = { pendente: "Pendente", aprovado: "Sinalização validada", rejeitado: "Sinalização descartada" };
const statusStyle: Record<Status, string> = {
  pendente: "bg-amber-50 text-amber-800 border-amber-200",
  aprovado: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejeitado: "bg-slate-100 text-slate-600 border-slate-200",
};
function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  const safe = /^[\s]*[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export default function ExclusoesPainel() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [comparacaoId, setComparacaoId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [comparacoes, setComparacoes] = useState<Comparison[]>([]);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ row: Candidate; decision: Status } | null>(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(limit), revisao: status });
      if (search) query.set("busca", search);
      if (comparacaoId) query.set("comparacao", comparacaoId);
      const response = await fetchQA(`/api/qa/exclusoes?${query}`);
      const body = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(body.error || "Falha ao consultar candidatos à exclusão.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na consulta.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, status, comparacaoId, search, reload]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    let mounted = true;
    async function loadComparisons() {
      try {
        const response = await fetchQA("/api/qa/consultar?tipo=comparacoes&limit=100&page=1");
        if (!response.ok) return;
        const body = await response.json() as { items?: Comparison[] };
        if (mounted) setComparacoes(body.items || []);
      } catch { /* o filtro de comparação é opcional */ }
    }
    void loadComparisons();
    return () => { mounted = false; };
  }, []);

  async function registrarDecisao() {
    if (!confirmation || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetchQA("/api/qa/revisar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: confirmation.row.id, decisao: confirmation.decision }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível registrar a decisão.");
      setNotice("Decisão registrada no Supabase. Nenhum produto foi excluído.");
      setConfirmation(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao registrar decisão.");
      setConfirmation(null);
    } finally {
      setSaving(false);
    }
  }

  function exportPage() {
    if (!data?.items.length) return;
    const headers = ["comparacao_id", "comparacao_nome", "produto_a_id", "descricao_a", "produto_b_id", "descricao_b", "score", "classificacao", "status_revisao", "motivo"] as const;
    const lines = [headers.join(";"), ...data.items.map((row) => headers.map((key) => csvCell(row[key])).join(";"))];
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `precifica-exclusoes-pagina-${page}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const totals = data?.totals ?? { total: 0, pendente: 0, aprovado: 0, rejeitado: 0 };
  const lastPage = Math.max(1, Math.ceil((data?.count ?? 0) / limit));

  return <div className="space-y-6 pb-12 text-slate-900">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.17em] text-slate-500">Precifica Operações / Qualidade</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Candidatos à exclusão</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Triagem de registros sem candidato localizado. Valide cada sinalização antes de qualquer decisão operacional.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setNotice(""); setReload(n => n + 1); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50"><RefreshCcw size={16}/> Atualizar</button>
        <Link href="/importar" className="rounded-xl bg-[#182230] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#25364a]">Nova comparação</Link>
      </div>
    </header>

    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
      <ShieldCheck className="mt-0.5 shrink-0" size={20}/>
      <p><strong>Exclusão não é automática.</strong> A classe <code>exclusao</code> corresponde, na persistência atual, a <code>SEM_CANDIDATO</code>. A busca pode não ter localizado um item existente. Aprovar uma sinalização <strong>não exclui produtos</strong> de planilhas, banco ou catálogo.</p>
    </div>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de exclusões">
      {[
        { label: "Sinalizações", count: totals.total, Icon: FileSearch, color: "text-slate-700" },
        { label: "Aguardando revisão", count: totals.pendente, Icon: AlertTriangle, color: "text-amber-600" },
        { label: "Validadas", count: totals.aprovado, Icon: CheckCircle2, color: "text-emerald-600" },
        { label: "Descartadas", count: totals.rejeitado, Icon: ArchiveX, color: "text-slate-600" },
      ].map(({ label, count, Icon, color }) => <div className={`${panel} p-5`} key={label}>
        <Icon size={20} className={color}/><p className="mt-3 text-3xl font-semibold tabular-nums">{loading && !data ? "…" : fmt(count)}</p><p className="mt-1 text-sm text-slate-500">{label}</p>
      </div>)}
    </section>
    <p className="-mt-3 text-xs text-slate-400">Os indicadores consideram {comparacaoId ? "a comparação selecionada" : "todas as comparações salvas"}; a busca por texto não altera esses totais.</p>

    <section className={`${panel} p-5`} aria-label="Filtros de exclusão">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Search size={18}/> Localizar sinalizações</h2>
        <button className="text-xs font-semibold text-slate-500 underline-offset-2 hover:underline" type="button" onClick={() => { setStatus("todos"); setComparacaoId(""); setSearchInput(""); setSearch(""); setPage(1); }}>Limpar filtros</button>
      </div>
      <form className="grid items-end gap-3 lg:grid-cols-[1.2fr_1fr_0.9fr_auto]" onSubmit={e => {e.preventDefault(); setPage(1); setSearch(searchInput.trim());}}>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600">Descrição ou ID da linha
          <input className={input} type="search" value={searchInput} maxLength={80} onChange={e => setSearchInput(e.target.value)} placeholder="Buscar produto na Base A…"/>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600">Comparação
          <select className={input} value={comparacaoId} onChange={e => {setComparacaoId(e.target.value);setPage(1);}}>
            <option value="">Todas as comparações</option>
            {comparacoes.map(item => <option value={item.id} key={item.id}>{item.nome}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600">Situação
          <select className={input} value={status} onChange={e => {setStatus(e.target.value as StatusFilter);setPage(1);}}>
            <option value="todos">Todas</option><option value="pendente">Pendente</option><option value="aprovado">Validada</option><option value="rejeitado">Descartada</option>
          </select>
        </label>
        <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"><Search size={16}/> Buscar</button>
      </form>
      <p className="mt-3 text-xs text-slate-400">O seletor lista até 100 comparações recentes. A consulta e os filtros são feitos no Supabase.</p>
    </section>

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error} <Link href="/login" className="font-semibold underline">Ir ao login</Link></div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

    <section className={panel} aria-label="Lista de sinalizações">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div><h2 className="text-lg font-semibold">Fila de conferência</h2><p className="text-sm text-slate-500">{loading ? "Carregando…" : `${fmt(data?.count ?? 0)} registro(s) encontrados`}</p></div>
        <button type="button" onClick={exportPage} disabled={!data?.items.length || loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><Download size={16}/> Exportar página CSV</button>
      </div>
      {loading ? <div className="flex items-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18}/> Consultando Supabase…</div> : !data?.items.length ?
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center"><FileSearch size={34} className="text-slate-300"/><p className="font-semibold">Nenhuma sinalização encontrada</p><p className="max-w-md text-sm text-slate-500">Altere os filtros ou execute e salve uma nova comparação. A fila só contém resultados persistidos com classe de exclusão.</p><Link href="/importar" className="mt-1 text-sm font-semibold text-blue-600">Ir para Importar arquivos</Link></div> :
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead><tr className="bg-slate-50 text-xs text-slate-500"><th className="px-5 py-3 font-medium">Origem</th><th className="px-4 py-3 font-medium">Produto / evidência</th><th className="px-4 py-3 font-medium">Score</th><th className="px-4 py-3 font-medium">Situação</th><th className="px-4 py-3 text-right font-medium">Ações</th></tr></thead>
        <tbody>{data.items.map(item => <tr key={item.id} className="border-t border-slate-100 align-top">
          <td className="max-w-48 px-5 py-5"><p className="font-medium text-slate-800">{item.comparacao_nome}</p><p className="mt-1 text-xs text-slate-500">Linha A: {item.produto_a_id}</p><Link className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline" href={`/comparacoes/${item.comparacao_id}`}>Ver comparação</Link></td>
          <td className="max-w-md px-4 py-5"><p className="line-clamp-2 font-medium text-slate-800">{item.descricao_a || "Descrição não informada"}</p><p className="mt-1 text-xs text-slate-500">Base B: {item.produto_b_id ? `linha ${item.produto_b_id}` : "nenhum vínculo confirmado"}</p><button type="button" onClick={() => setExpanded(expanded === item.id ? null : item.id)} className="mt-2 text-xs font-semibold text-blue-600 hover:underline">{expanded === item.id ? "Ocultar detalhes" : "Ver justificativa"}</button>{expanded === item.id && <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><p><strong>Motivo:</strong> {item.motivo || "Sem justificativa registrada"}</p><p><strong>Descrição B:</strong> {item.descricao_b || "Não disponível"}</p><p><strong>Classificação no banco:</strong> {item.classificacao}</p></div>}</td>
          <td className="px-4 py-5 tabular-nums text-slate-700">{item.score == null ? "—" : `${item.score.toFixed(1)}%`}</td>
          <td className="px-4 py-5"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle[item.status_revisao] || statusStyle.pendente}`}>{statusLabel[item.status_revisao] || item.status_revisao}</span></td>
          <td className="px-4 py-5"><div className="flex justify-end gap-2">
            {item.status_revisao !== "aprovado" && <button type="button" className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50" onClick={() => setConfirmation({row:item,decision:"aprovado"})}>Validar</button>}
            {item.status_revisao !== "rejeitado" && <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setConfirmation({row:item,decision:"rejeitado"})}>Descartar</button>}
            {item.status_revisao !== "pendente" && <button type="button" className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50" onClick={() => setConfirmation({row:item,decision:"pendente"})}>Reabrir</button>}
          </div></td>
        </tr>)}</tbody></table></div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-500"><span>Página {page} de {lastPage} · até {limit} registros por página</span><div className="flex gap-2"><button type="button" disabled={page<=1 || loading} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40" onClick={() => setPage(p => Math.max(1,p-1))}><ChevronLeft size={15}/> Anterior</button><button type="button" disabled={loading || page>=lastPage} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40" onClick={() => setPage(p => p+1)}>Próxima <ChevronRight size={15}/></button></div></footer>
    </section>
    <div className="flex items-start gap-2 text-xs leading-5 text-slate-500"><Info className="mt-0.5 shrink-0" size={15}/><p>O CSV exporta somente os registros desta página. O sistema registra a decisão de revisão no Supabase, mas a estrutura atual não possui histórico imutável de quem mudou cada decisão. Veja as pendências de entrega em <Link href="/configuracoes" className="font-semibold text-blue-600">Informações do sistema</Link>.</p></div>
    {confirmation && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4" role="presentation" onMouseDown={(event) => {if(event.target === event.currentTarget && !saving) setConfirmation(null);}}>
      <section role="dialog" aria-modal="true" aria-labelledby="confirmacao-exclusao-titulo" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100"><ClipboardCheck size={21}/></div><button type="button" disabled={saving} onClick={()=>setConfirmation(null)} aria-label="Fechar confirmação"><X size={20}/></button></div>
        <h2 id="confirmacao-exclusao-titulo" className="mt-4 text-xl font-semibold">{confirmation.decision === "aprovado" ? "Validar sinalização" : confirmation.decision === "rejeitado" ? "Descartar sinalização" : "Reabrir revisão"}?</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Produto A, linha {confirmation.row.produto_a_id}: <strong>{confirmation.row.descricao_a}</strong></p>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Esta ação apenas atualiza o status da revisão no Supabase. <strong>Nenhum produto será apagado.</strong></p>
        <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={saving} onClick={()=>setConfirmation(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold">Cancelar</button><button type="button" disabled={saving} onClick={()=>void registrarDecisao()} className="inline-flex items-center gap-2 rounded-lg bg-[#182230] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving && <LoaderCircle size={16} className="animate-spin"/>} Confirmar decisão</button></div>
      </section>
    </div>}
  </div>;
}
