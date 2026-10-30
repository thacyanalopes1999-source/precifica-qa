"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Clock3, FileSpreadsheet, RefreshCcw, Search, ShieldCheck } from "lucide-react";

type Job = { id:string; nome:string; status:string; arquivo_a:string; arquivo_b:string; criado_em:string; concluido_em:string|null };
type Item = { id:string; comparacao_id:string; produto_a_id:string; produto_b_id:string|null; descricao_a:string; descricao_b:string|null; score:number|null; classificacao:string; status_revisao:string; motivo:string|null };
type ResponseData = { items: (Job | Item)[]; count?:number; page?:number; comparacoes?:number; produtos?:number; pendentes?:number; aprovados?:number; rejeitados?:number; error?:string };
const fmt = (v:number) => v.toLocaleString("pt-BR");
const dt = (v?:string | null) => v ? new Date(v).toLocaleString("pt-BR") : "—";
const shell = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const button = "rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50";
export default function Painel({ tipo, id }: { tipo:"dashboard"|"comparacoes"|"revisao"|"exclusoes"|"historico"|"configuracoes"|"detalhe"; id?:string }) {
  const [data,setData] = useState<ResponseData|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [page,setPage] = useState(1);
  const [filter,setFilter] = useState("pendente");
  const [working,setWorking] = useState<string|null>(null);
  const carregar = useCallback(async () => {
    setLoading(true);setError("");
    try {
      const isResults = ["revisao","exclusoes","detalhe"].includes(tipo);
      const query = new URLSearchParams({ tipo: isResults ? "resultados" : tipo === "configuracoes" ? "dashboard" : tipo, page:String(page), limit:"30" });
      if (id) query.set("id",id);
      if (tipo === "revisao") query.set("filtro",filter);
      if (tipo === "exclusoes") query.set("filtro","exclusao");
      const r = await fetch(`/api/qa/consultar?${query.toString()}`,{cache:"no-store"});
      const x = await r.json() as ResponseData;
      if (!r.ok) throw new Error(x.error || "Erro ao consultar Supabase");
      setData(x);
    } catch(e) { setError(e instanceof Error ? e.message : "Falha de consulta"); }
    finally { setLoading(false); }
  },[tipo,id,page,filter]);
  useEffect(()=>{void carregar();},[carregar]);
  async function revisar(rowId:string, decisao:"aprovado"|"rejeitado"|"pendente") {
    setWorking(rowId);setError("");
    try {
      const r = await fetch("/api/qa/revisar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:rowId,decisao})});
      const x = await r.json(); if(!r.ok) throw new Error(x.error || "Falha ao revisar");
      await carregar();
    } catch(e) { setError(e instanceof Error ? e.message : "Falha ao salvar"); }
    finally {setWorking(null);}
  }
  const names = {dashboard:"Dashboard",comparacoes:"Comparações",revisao:"Revisão manual",exclusoes:"Exclusões",historico:"Histórico",configuracoes:"Configurações",detalhe:"Detalhes da comparação"};
  const jobs = (data?.items || []) as Job[];
  const rows = (data?.items || []) as Item[];
  return <div className="space-y-6 pb-12 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-blue-600">PRECIFICA QA</p><h1 className="text-3xl font-bold">{names[tipo]}</h1><p className="mt-1 text-sm text-slate-500">Dados salvos no Supabase · revisão humana obrigatória</p></div><div className="flex gap-2"><button className={button} onClick={()=>void carregar()}><RefreshCcw size={16} className="mr-1 inline"/>Atualizar</button><Link href="/importar" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Nova comparação</Link></div></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    {tipo === "dashboard" && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[{n:"Comparações",v:data?.comparacoes,i:FileSpreadsheet},{n:"Registros salvos",v:data?.produtos,i:Search},{n:"Pendentes",v:data?.pendentes,i:Clock3},{n:"Aprovados",v:data?.aprovados,i:CheckCircle2},{n:"Rejeitados",v:data?.rejeitados,i:ClipboardCheck}].map(k=><div className={shell} key={k.n}><k.i className="mb-3 text-blue-600" size={22}/><div className="text-3xl font-bold">{loading ? "…" : fmt(k.v ?? 0)}</div><div className="mt-1 text-sm text-slate-500">{k.n}</div></div>)}</div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Os totais contam registros persistidos. Comparações ainda não salvas não entram nos indicadores.</div></>}
    {tipo === "configuracoes" && <div className={shell}><ShieldCheck className="text-blue-600"/><h2 className="mt-2 font-bold">Regras vigentes</h2><p className="mt-2 text-sm text-slate-600">50–100%: MATCH SUGERIDO · 20–49,99%: REVISAR · abaixo de 20%: DIFERENTE. A seleção Linha a linha / Cruzamento 1:1 permanece na página de importação. As regras são exibidas aqui e não são editáveis para evitar alterações sem persistência.</p><p className="mt-3 text-sm text-slate-600">Por segurança, os endpoints administrativos estão habilitados apenas em desenvolvimento local. Antes de publicar, configure autenticação, autorização e auditoria.</p></div>}
    {["dashboard","comparacoes","historico"].includes(tipo) && <div className={shell}><h2 className="mb-4 text-lg font-bold">{tipo === "dashboard" ? "Últimas comparações" : tipo === "historico" ? "Histórico de execuções" : "Comparações registradas"}</h2>{loading ? <p className="text-slate-500">Consultando dados…</p> : jobs.length === 0 ? <p className="text-slate-500">Nenhuma comparação salva nesta página. Execute e salve uma análise em Importar arquivos.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-3 pr-3">Comparação</th><th className="py-3 pr-3">Criada</th><th className="py-3 pr-3">Status</th><th className="py-3">Ação</th></tr></thead><tbody>{jobs.map(x=><tr key={x.id} className="border-b border-slate-100"><td className="py-3 pr-3"><strong>{x.nome}</strong><div className="text-xs text-slate-500">{x.arquivo_a} × {x.arquivo_b}</div></td><td className="py-3 pr-3">{dt(x.criado_em)}</td><td className="py-3 pr-3">{x.status}</td><td className="py-3"><Link className="font-semibold text-blue-600" href={`/comparacoes/${x.id}`}>Visualizar <ArrowRight size={14} className="inline"/></Link></td></tr>)}</tbody></table></div>}</div>}
    {["revisao","exclusoes","detalhe"].includes(tipo) && <div className={shell}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{tipo === "exclusoes" ? "Candidatos sinalizados para exclusão" : "Resultados da análise"}</h2><p className="text-sm text-slate-500">{fmt(data?.count || 0)} registros · decisões salvas individualmente</p></div>{tipo === "revisao" && <select className="rounded-lg border p-2 text-sm" value={filter} onChange={e=>{setPage(1);setFilter(e.target.value)}}><option value="pendente">Pendentes</option><option value="aprovado">Aprovados</option><option value="rejeitado">Rejeitados</option><option value="todos">Todos</option></select>}</div>{tipo === "exclusoes" && <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle size={18}/>A classificação não executa exclusão; apenas uma decisão humana pode registrar rejeição.</div>}{loading ? <p>Consultando resultados…</p> : rows.length === 0 ? <p className="text-slate-500">Nenhum resultado para este filtro.</p> : <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="py-3 pr-3">Linha A</th><th>Descrição A</th><th>Descrição B</th><th>Score</th><th>Classe</th><th>Revisão</th><th className="text-right">Decisão</th></tr></thead><tbody>{rows.map(x=><tr key={x.id} className="border-b border-slate-100 align-top"><td className="py-3 pr-3">{x.produto_a_id}</td><td className="max-w-56 p-2">{x.descricao_a}</td><td className="max-w-56 p-2">{x.descricao_b || "—"}</td><td className="p-2">{x.score == null ? "—" : `${x.score.toFixed(1)}%`}</td><td className="p-2"><strong>{x.classificacao}</strong><div className="max-w-48 text-slate-500">{x.motivo}</div></td><td className="p-2">{x.status_revisao}</td><td className="py-2 text-right"><div className="flex gap-1 justify-end"><button disabled={working===x.id} onClick={()=>void revisar(x.id,"aprovado")} className="rounded border border-emerald-300 px-2 py-1 text-emerald-800">Aprovar</button><button disabled={working===x.id} onClick={()=>void revisar(x.id,"rejeitado")} className="rounded border border-rose-300 px-2 py-1 text-rose-800">Rejeitar</button>{x.status_revisao !== "pendente" && <button disabled={working===x.id} onClick={()=>void revisar(x.id,"pendente")} className="rounded border px-2 py-1">Reabrir</button>}</div></td></tr>)}</tbody></table></div>}</div>}
    {tipo !== "configuracoes" && tipo !== "dashboard" && <div className="flex items-center justify-between text-sm"><span>Pagina {page} · {fmt(data?.count || 0)} registros</span><div className="flex gap-2"><button className={button} disabled={page===1||loading} onClick={()=>setPage(v=>v-1)}>Anterior</button><button className={button} disabled={loading || page*30 >= (data?.count || 0)} onClick={()=>setPage(v=>v+1)}>Próxima</button></div></div>}
  </div>;
}
