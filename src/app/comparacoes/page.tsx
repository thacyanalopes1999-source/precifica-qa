"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, FileSpreadsheet, Filter, Loader2, LockKeyhole, Plus, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { fetchQA, getSupabaseBrowser } from "@/lib/supabase/browser";

type Comparacao = { id: string; nome: string; status: string; arquivo_a: string; arquivo_b: string; criado_em: string; concluido_em: string | null };
type Stats = { total: number; concluidas: number; processando: number; pendentes: number };
type Result = { items: Comparacao[]; count: number; page: number; limit: number; stats?: Stats; error?: string };
const emptyStats: Stats = { total: 0, concluidas: 0, processando: 0, pendentes: 0 };
const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");
const fmtDate = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit" }) : "—";
const box = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
function statusClass(status: string) {
  if (status === "concluido") return "bg-emerald-50 text-emerald-700";
  if (status === "processando") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

export default function ComparacoesPage() {
  const [items, setItems] = useState<Comparacao[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [days, setDays] = useState("todos");
  const pageSize = 20;

  const carregar = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ tipo: "comparacoes", page: String(page), limit: String(pageSize), status, dias: days });
      if (busca.trim()) query.set("busca", busca.trim());
      const response = await fetchQA(`/api/qa/consultar?${query}`);
      const payload = (await response.json()) as Result;
      if (!response.ok) {
        if ([401,403].includes(response.status)) setAuthRequired(true);
        throw new Error(payload.error || "Não foi possível consultar as comparações.");
      }
      setItems(payload.items || []);
      setCount(payload.count || 0);
      setStats(payload.stats || emptyStats);
      setAuthRequired(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao consultar Supabase.";
      if (/Entre na sua conta|Faça login/i.test(message)) setAuthRequired(true);
      setError(message);
    } finally { setLoading(false); }
  }, [page, status, busca, days]);
  useEffect(() => { void carregar(); }, [carregar]);

  function pesquisar(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setPage(1); setBusca(search); }
  async function sair() { await getSupabaseBrowser().auth.signOut(); setItems([]); setCount(0); setAuthRequired(true); }

  return <div className="space-y-6 pb-12 text-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold tracking-wider text-blue-600">PRECIFICA QA / WORKSPACE</p>
        <h1 className="mt-1 text-3xl font-bold">Comparações</h1>
        <p className="mt-2 text-sm text-slate-500">Histórico das análises persistidas no Supabase · decisões humanas obrigatórias</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={()=>void carregar()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16}/>Atualizar</button>
        <Link href="/importar" className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"><Plus size={17}/>Nova comparação</Link>
      </div>
    </div>
    {authRequired ? <section className={box + " text-center"}><LockKeyhole className="mx-auto mb-3 text-blue-600" size={32}/><h2 className="text-lg font-bold">Acesso protegido</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Para proteger as informações das empresas, as comparações só podem ser consultadas por um usuário autorizado.</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-5 flex justify-center gap-3"><Link href="/login" className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-bold text-white">Fazer login</Link><button type="button" onClick={()=>void sair()} className="rounded-lg border px-4 py-3 text-sm">Sair da sessão</button></div>
    </section> : <>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {name:"Comparações",value:stats.total,icon:FileSpreadsheet,color:"text-blue-600 bg-blue-50"},
          {name:"Concluídas",value:stats.concluidas,icon:CheckCircle2,color:"text-emerald-600 bg-emerald-50"},
          {name:"Em processamento",value:stats.processando,icon:Clock3,color:"text-sky-600 bg-sky-50"},
          {name:"Revisões pendentes",value:stats.pendentes,icon:ShieldCheck,color:"text-amber-600 bg-amber-50"},
        ].map(s => <section key={s.name} className={box}><span className={`inline-flex rounded-xl p-3 ${s.color}`}><s.icon size={20}/></span><p className="mt-4 text-3xl font-bold">{loading ? "…" : fmt(s.value)}</p><p className="mt-1 text-sm text-slate-500">{s.name}</p></section>)}
      </div>
      <section className={box + " space-y-5"}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Comparações registradas</h2><p className="text-xs text-slate-500">Use os filtros para localizar uma análise salva</p></div><span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{fmt(count)} registro(s) nos filtros</span></div>
        <div className="flex flex-wrap gap-2">
          {[["todos","Todas"],["concluido","Concluídas"],["processando","Processando"]].map(([value,label]) =>
            <button key={value} onClick={()=>{setStatus(value);setPage(1)}} className={`rounded-lg px-4 py-2 text-sm font-semibold ${status===value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <form onSubmit={pesquisar} className="flex gap-2"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={17} className="text-slate-400"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar comparação ou arquivo..." maxLength={100} className="w-full bg-transparent py-3 text-sm outline-none"/></div>
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Buscar</button></form>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Filter size={17} className="text-slate-400"/><span className="sr-only">Período</span>
            <select value={days} onChange={e=>{setDays(e.target.value);setPage(1)}} className="bg-white py-3 text-sm outline-none"><option value="todos">Todo período</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></label>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="p-4">Comparação</th><th className="p-4">Bases analisadas</th><th className="p-4">Criada em</th><th className="p-4">Status</th><th className="p-4 text-right">Ação</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={5} className="p-8 text-center text-slate-500"><Loader2 className="mr-2 inline animate-spin" size={18}/>Consultando Supabase...</td></tr> : items.length===0 ? <tr><td colSpan={5} className="p-10 text-center"><FileSpreadsheet size={32} className="mx-auto mb-3 text-slate-300"/><p className="font-semibold">Nenhuma comparação encontrada</p><p className="mt-1 text-xs text-slate-500">Altere os filtros ou salve uma análise na área Importar.</p><Link href="/importar" className="mt-4 inline-flex text-sm font-semibold text-blue-600 hover:underline">Criar comparação <ArrowRight size={16} className="ml-1"/></Link></td></tr> : items.map(x=><tr key={x.id} className="border-t border-slate-100 align-top hover:bg-slate-50"><td className="p-4"><p className="font-semibold text-slate-900">{x.nome}</p><p className="mt-1 font-mono text-[11px] text-slate-400">{x.id.slice(0,8)}</p></td><td className="max-w-xs p-4"><p className="truncate text-slate-700" title={x.arquivo_a}>A: {x.arquivo_a}</p><p className="mt-1 truncate text-slate-500" title={x.arquivo_b}>B: {x.arquivo_b}</p></td><td className="p-4 text-slate-600">{fmtDate(x.criado_em)}</td><td className="p-4"><span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${statusClass(x.status)}`}>{x.status==="concluido"?<CheckCircle2 size={13}/>:x.status==="processando"?<Clock3 size={13}/>:<XCircle size={13}/>} {x.status}</span></td><td className="p-4 text-right"><Link href={`/comparacoes/${x.id}`} className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline">Visualizar <ArrowRight size={15}/></Link></td></tr>)}</tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-slate-500">Página {page} de {Math.max(1,Math.ceil(count/pageSize))} · {fmt(count)} registros</span><div className="flex gap-2"><button disabled={loading||page===1} onClick={()=>setPage(p=>p-1)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">Anterior</button><button disabled={loading||page*pageSize>=count} onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">Próxima</button></div></div>
      </section>
    </>}
  </div>;
}
