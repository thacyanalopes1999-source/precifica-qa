"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, CheckCircle2, Clock3, Download, FileSpreadsheet,
  Link2, Loader2, RotateCcw, Search, ShieldCheck, UploadCloud, XCircle,
} from "lucide-react";

type Preview = {
  arquivo: string;
  colunas: string[];
  amostra: Record<string, string>[];
  coluna_sugerida: string;
};
type Job = {
  id: string;
  arquivo: string;
  coluna: string;
  estado: "na_fila" | "rodando" | "concluido" | "erro" | "cancelado";
  total: number;
  processadas: number;
  resumo: Record<string, number>;
  erro: string;
  pronto: boolean;
};
type LinkRow = { linha: number; url: string; status: string; http: number | null; destino: string; motivo: string; tempo_ms: number };
type RowsData = { items: LinkRow[]; total: number; pagina: number; limite: number };

const soft = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const btn = "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const fmt = (n: number) => n.toLocaleString("pt-BR");

function apiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_QA_API_URL || "").trim().replace(/\/$/, "");
  if (configured && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(configured)) return configured;
  if (typeof window === "undefined") return configured || "http://127.0.0.1:8000";
  const current = window.location.hostname;
  if (current === "localhost" || current === "127.0.0.1") return configured || "http://127.0.0.1:8000";
  // Com acesso via IP da rede, 127.0.0.1 seria o PC de quem abriu o navegador.
  return `${window.location.protocol}//${current}:8000`;
}

async function readError(response: Response) {
  const json = await response.json().catch(() => null);
  return json?.detail || json?.error || `Erro HTTP ${response.status}`;
}

function statusStyle(status: string) {
  if (status === "OK" || status === "REDIRECIONADO") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (["BLOQUEADO", "ACESSO_RESTRITO", "LIMITE_ACESSO", "TIMEOUT", "ERRO_SSL"].includes(status)) return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
}

export default function ValidarUrlsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [column, setColumn] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<RowsData | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [error, setError] = useState("");
  const [api, setApi] = useState("");

  useEffect(() => {
    setApi(apiBase());
    const previous = sessionStorage.getItem("precifica_url_job");
    if (previous) {
      fetch(`${apiBase()}/url-validator/jobs/${previous}`)
        .then(async (r) => { if (!r.ok) throw new Error(await readError(r)); return r.json() as Promise<Job>; })
        .then(setJob)
        .catch(() => sessionStorage.removeItem("precifica_url_job"));
    }
  }, []);

  const getJob = useCallback(async (id: string) => {
    const r = await fetch(`${api}/url-validator/jobs/${id}`, { cache: "no-store" });
    if (!r.ok) throw new Error(await readError(r));
    setJob(await r.json() as Job);
  }, [api]);

  useEffect(() => {
    if (!api || !job?.id || !["na_fila", "rodando"].includes(job.estado)) return;
    const timer = window.setInterval(() => { void getJob(job.id).catch((e) => setError(String(e))); }, 1800);
    return () => window.clearInterval(timer);
  }, [api, job?.id, job?.estado, getJob]);

  useEffect(() => {
    if (!job?.id || !api) return;
    let cancelled = false;
    fetch(`${api}/url-validator/jobs/${job.id}/rows?pagina=${page}&limite=30&situacao=${encodeURIComponent(statusFilter)}`, { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(await readError(r)); return r.json() as Promise<RowsData>; })
      .then((data) => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setRows(null); });
    return () => { cancelled = true; };
  }, [api, job?.id, job?.processadas, page, statusFilter]);

  async function choose(f?: File) {
    setFile(f || null); setPreview(null); setColumn(""); setError("");
    if (!f) return;
    setLoadingPreview(true);
    try {
      const form = new FormData(); form.append("file", f);
      const r = await fetch(`${api}/url-validator/preview`, { method: "POST", body: form });
      if (!r.ok) throw new Error(await readError(r));
      const p: Preview = await r.json();
      setPreview(p); setColumn(p.coluna_sugerida);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao ler a planilha");
    } finally { setLoadingPreview(false); }
  }

  async function start() {
    if (!file || !column) return;
    setError(""); setSubmitting(true); setJob(null); setRows(null);
    try {
      const form = new FormData(); form.append("file", file); form.append("coluna", column);
      const r = await fetch(`${api}/url-validator/jobs`, { method: "POST", body: form });
      if (!r.ok) throw new Error(await readError(r));
      const j: Job = await r.json();
      sessionStorage.setItem("precifica_url_job", j.id);
      setPage(1); setStatusFilter("TODOS"); setJob(j);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao iniciar validação"); }
    finally { setSubmitting(false); }
  }

  function reset() {
    setJob(null); setRows(null); setError(""); setFile(null); setPreview(null); setColumn("");
    sessionStorage.removeItem("precifica_url_job"); setPage(1); setStatusFilter("TODOS");
  }

  const counts = job?.resumo || {};
  const okCount = (counts.OK || 0) + (counts.REDIRECIONADO || 0);
  const failures = (job?.processadas || 0) - okCount;
  const pct = job?.total ? Math.min(100, Math.round((job.processadas / job.total) * 100)) : 0;
  const distinctStatuses = useMemo(() => Object.keys(counts).sort(), [job?.resumo]);

  return <main className="mx-auto max-w-[1450px] space-y-6 pb-16 text-slate-900">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600"><Link2 size={15}/> Precifica QA / Ferramentas</div>
        <h1 className="text-3xl font-extrabold tracking-tight">Validar URLs</h1>
        <p className="mt-1 text-sm text-slate-500">Importe uma planilha, selecione a coluna dos links e verifique a resposta real de cada endereço.</p>
      </div>
      <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700"><ShieldCheck size={16}/> Somente URLs públicas · Sem exclusões</div>
    </header>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle className="shrink-0" size={19}/>{error}</div>}

    {!job && <section className="grid gap-5 lg:grid-cols-12">
      <div className={`${soft} space-y-4 lg:col-span-5`}>
        <div className="flex items-center gap-3"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><UploadCloud size={22}/></div><div><h2 className="font-bold">1. Importar planilha</h2><p className="text-xs text-slate-500">Excel (.xlsx) e CSV/TSV, até 50 MB</p></div></div>
        <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-blue-400 hover:bg-blue-50">
          <FileSpreadsheet size={30} className="text-blue-600"/>
          <span className="text-sm font-semibold">{file ? file.name : "Clique para selecionar uma planilha"}</span>
          <span className="text-xs text-slate-500">A planilha original será preservada na exportação</span>
          <input type="file" accept=".xlsx,.csv,.tsv" className="hidden" onChange={e => { void choose(e.currentTarget.files?.[0]); }}/>
        </label>
        {loadingPreview && <div className="flex items-center gap-2 text-sm text-blue-600"><Loader2 className="animate-spin" size={16}/> Lendo colunas...</div>}
        {preview && <div className="space-y-2"><label htmlFor="url-column" className="text-sm font-semibold">2. Coluna que contém a URL</label><select id="url-column" className={input} value={column} onChange={e => setColumn(e.target.value)}>{preview.colunas.map((c, i) => <option key={`${c}-${i}`} value={c}>{c}</option>)}</select><p className="text-xs text-slate-500">Ex.: URL Produto Monitorado, Link, Website, Endereço</p></div>}
        <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!file || !column || loadingPreview || submitting} onClick={() => void start()}>{submitting ? <Loader2 className="animate-spin" size={17}/> : <Search size={17}/>} {submitting ? "Enviando planilha..." : "Iniciar validação das URLs"}</button>
        <p className="text-xs leading-relaxed text-slate-500">Até 50 mil linhas por execução. A checagem usa a API Python do Precifica na porta 8000 e não altera o motor de comparação nem o Supabase.</p>
      </div>
      <div className={`${soft} space-y-3 lg:col-span-7`}>
        <h2 className="flex items-center gap-2 font-bold"><Activity size={20} className="text-blue-600"/> Prévia dos endereços</h2>
        {preview ? <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Linha</th><th className="p-3">{column || "URL"}</th></tr></thead><tbody>{preview.amostra.map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="p-3 text-slate-500">{i + 2}</td><td className="max-w-[580px] break-all p-3">{r[column] || "—"}</td></tr>)}</tbody></table></div> : <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 text-center text-sm text-slate-500"><Link2 size={32} className="text-slate-300"/> Selecione sua planilha para visualizar alguns links.</div>}
        <div className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><strong>Como interpretar:</strong> HTTP 200 é acessível; 301/302 são seguidos; 404/410 indicam ausência; 401/403 podem ser bloqueio por login/anti-bot; 429 significa limitação; timeout e erro SSL são reportados separadamente. Uma URL bloqueada para robôs não está necessariamente fora do ar.</div>
      </div>
    </section>}

    {job && <>
      <section className={`${soft} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Resultado da verificação</h2><p className="mt-1 text-sm text-slate-500">{job.arquivo} · coluna <strong>{job.coluna}</strong></p></div><div className="flex flex-wrap gap-2"><button className={btn} onClick={() => void getJob(job.id)}><RotateCcw size={16} className="mr-1 inline"/> Atualizar</button><button className={btn} onClick={reset}>Nova planilha</button>{job.pronto && <a href={`${api}/url-validator/jobs/${job.id}/download`} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"><Download size={16}/> Exportar Excel (.xlsx)</a>}</div></div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Total</p><p className="mt-1 text-2xl font-bold">{fmt(job.total)}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">Verificadas</p><p className="mt-1 text-2xl font-bold">{fmt(job.processadas)}</p></div>
          <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">Acessíveis / Redirecionadas</p><p className="mt-1 text-2xl font-bold text-emerald-700">{fmt(okCount)}</p></div>
          <div className="rounded-xl bg-rose-50 p-4"><p className="text-xs font-semibold text-rose-700">Erros / Restritas</p><p className="mt-1 text-2xl font-bold text-rose-700">{fmt(failures)}</p></div>
        </div>
        <div><div className="mb-2 flex items-center justify-between text-xs font-medium"><span className="flex items-center gap-2 text-slate-500">{job.estado === "rodando" ? <Loader2 className="animate-spin" size={14}/> : <Clock3 size={14}/>} {job.estado === "concluido" ? "Verificação concluída" : job.estado === "erro" ? "Erro na verificação" : job.estado === "cancelado" ? "Cancelada" : "Verificando URLs..."}</span><span>{pct}%</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-3 rounded-full bg-blue-600 transition-all duration-300" style={{width: `${pct}%`}}/></div></div>
        {job.erro && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{job.erro}</p>}
        {Object.keys(counts).length > 0 && <div className="flex flex-wrap gap-2">{Object.entries(counts).sort((a, b) => b[1]-a[1]).map(([status, count]) => <span key={status} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${statusStyle(status)}`}>{status.replaceAll("_", " ")}: {fmt(count)}</span>)}</div>}
        {job.pronto && <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 size={17}/> Planilha pronta: abas BASE_COM_STATUS, STATUS_URLS e RESUMO.</p>}
      </section>
      <section className={soft}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Status por URL</h2><p className="text-xs text-slate-500">Todas as linhas são preservadas no Excel; tabela paginada para facilitar a conferência.</p></div><select value={statusFilter} onChange={e => {setPage(1); setStatusFilter(e.target.value);}} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="TODOS">Todos os status</option>{distinctStatuses.map(s => <option value={s} key={s}>{s} ({fmt(counts[s])})</option>)}</select></div>
        <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[970px] w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Linha</th><th className="p-3">URL original</th><th className="p-3">HTTP</th><th className="p-3">Status</th><th className="p-3">Motivo / Detalhe</th><th className="p-3">Tempo</th></tr></thead><tbody>{rows?.items.map(item => <tr key={item.linha} className="border-t border-slate-100 align-top"><td className="p-3 font-semibold">{item.linha}</td><td className="max-w-sm break-all p-3" title={item.url}>{item.url ? <a href={item.url.startsWith("https://") || item.url.startsWith("http://") ? item.url : undefined} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">{item.url}</a> : "—"}</td><td className="p-3 font-bold">{item.http ?? "—"}</td><td className="p-3"><span className={`inline-flex rounded-lg border px-2 py-1 font-semibold ${statusStyle(item.status)}`}>{item.status.replaceAll("_", " ")}</span></td><td className="max-w-sm p-3 text-slate-600">{item.motivo}</td><td className="p-3 text-slate-600">{fmt(item.tempo_ms)} ms</td></tr>)}{!rows?.items.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">{job.processadas ? "Nenhuma URL corresponde ao filtro." : "Aguardando os primeiros resultados..."}</td></tr>}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500"><span>{fmt(rows?.total || 0)} resultados · página {page}</span><div className="flex gap-2"><button className={btn} disabled={page <= 1} onClick={() => setPage(p => Math.max(1,p-1))}>Anterior</button><button className={btn} disabled={!rows || page*30 >= rows.total} onClick={() => setPage(p => p+1)}>Próxima</button></div></div>
      </section>
    </>}
  </main>;
}
