"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Check, ChevronDown, Download, ExternalLink, FileSpreadsheet, Link2, Loader2, Search, ShieldCheck, UploadCloud, X } from "lucide-react";
import { fetchQA } from "@/lib/supabase/browser";

type StoreId = "mercado_livre" | "magalu" | "casas_bahia" | "amazon" | "shopee" | "americanas" | "carrefour";
const STORES: { id: StoreId; nome: string; dominio: string }[] = [
  { id: "mercado_livre", nome: "Mercado Livre", dominio: "mercadolivre.com.br" },
  { id: "magalu", nome: "Magazine Luiza", dominio: "magazineluiza.com.br" },
  { id: "casas_bahia", nome: "Casas Bahia", dominio: "casasbahia.com.br" },
  { id: "amazon", nome: "Amazon", dominio: "amazon.com.br" },
  { id: "shopee", nome: "Shopee", dominio: "shopee.com.br" },
  { id: "americanas", nome: "Americanas", dominio: "americanas.com.br" },
  { id: "carrefour", nome: "Carrefour", dominio: "carrefour.com.br" },
];
type Row = { descricao: string; codigo: string; linha: number; chave: string; codigoNumerico?: boolean };
type Group = { chave: string; descricao: string; codigo: string; quantidade: number; codigoNumerico: boolean };
type Result = { loja: string; loja_id: StoreId; titulo: string; url: string; afinidade: number };
type Choice = { loja: string; url: string; titulo: string };
const styles = { panel: "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm", input: "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100", button: "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40" };
const format = (n: number) => n.toLocaleString("pt-BR");
const cleanName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const makeKey = (d: string, c: string) => `${cleanName(d)}\u0001${c.trim()}`;
const incomplete = (s: string) => /(?:\d+(?:[.,]\d+)?[eE][+]?-?\d+)/.test(s) || (s.trim() !== "" && !/^\d{8}$|^\d{12,14}$/.test(s.replace(/[\s-]/g, "")));

function delimiter(line: string): string {
  if (line.trim().startsWith("|") && line.trim().endsWith("|")) return "|";
  const test = ["\t", ";", ","].map((sep) => ({ sep, count: line.split(sep).length - 1 }));
  return test.sort((a, b) => b.count - a.count)[0]?.sep || ";";
}
function parseDelimited(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const sep = delimiter(text.split("\n").find((l) => l.trim()) || "");
  const lines: string[][] = [];
  let line: string[] = [], value = "", quote = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quote && text[i + 1] === '"') { value += '"'; i++; } else quote = !quote;
    } else if (char === sep && !quote) {
      line.push(value.trim()); value = "";
    } else if (char === "\n" && !quote) {
      line.push(value.trim());
      if (line.some((v) => v !== "")) lines.push(sep === "|" ? line.filter((_, j) => j > 0 && j < line.length - 1) : line);
      line = []; value = "";
    } else value += char;
    if (lines.length > 5002) throw new Error("Limite de 5.000 linhas por importação no navegador. Divida o arquivo em lotes menores.");
  }
  if (quote) throw new Error("Arquivo CSV com aspas não fechadas.");
  line.push(value.trim());
  if (line.some((v) => v !== "")) lines.push(sep === "|" ? line.filter((_, j) => j > 0 && j < line.length - 1) : line);
  return lines;
}
function asRows(table: string[][]): Row[] {
  const nonEmpty = table.filter((r) => r.some((x) => x.trim()));
  if (!nonEmpty.length) throw new Error("Nenhum produto encontrado.");
  const first = nonEmpty[0].map(cleanName);
  const descriptionIndex = first.findIndex((x) => /^(?:descricao|descricao do produto|nome|nome do produto|produto|titulo)$/.test(x));
  const barcodeIndex = first.findIndex((x) => /^(?:codigo de barras|codigo barras|cod barras|ean|ean13|gtin|codigo ean)$/.test(x));
  const hasHeader = descriptionIndex >= 0 || barcodeIndex >= 0;
  const di = descriptionIndex >= 0 ? descriptionIndex : 0;
  const ci = barcodeIndex >= 0 ? barcodeIndex : (di === 0 ? 1 : 0);
  if (nonEmpty[0].length < 2) throw new Error("Informe duas colunas: Descrição e Código de Barras.");
  const result: Row[] = [];
  for (const [index, row] of nonEmpty.slice(hasHeader ? 1 : 0).entries()) {
    const descricao = (row[di] || "").trim();
    const codigo = (row[ci] || "").trim();
    if (!descricao || /^\|?\s*-{3,}/.test(descricao)) continue;
    if (descricao.length > 500) throw new Error(`Descrição acima de 500 caracteres na linha ${index + 2}.`);
    result.push({ descricao, codigo, linha: index + (hasHeader ? 2 : 1), chave: makeKey(descricao, codigo) });
  }
  if (!result.length) throw new Error("Não há descrições válidas.");
  if (result.length > 5000) throw new Error("Limite de 5.000 linhas por importação. Divida o arquivo.");
  return result;
}
function safeMarketplaceUrl(urlString: string): { url: string; nome: string } | null {
  try {
    const url = new URL(urlString.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const loja = STORES.find((s) => url.hostname === s.dominio || url.hostname.endsWith(`.${s.dominio}`));
    if (!loja || url.pathname.length < 4) return null;
    return { url: url.toString(), nome: loja.nome };
  } catch { return null; }
}
function searchLink(group: Group, store: typeof STORES[number]): string {
  const main = group.descricao.replace(/\s*-\s*Dimens[oõ]es\s*\(.*$/i, "").slice(0, 125);
  const codigo = group.codigoNumerico || incomplete(group.codigo) ? "" : group.codigo;
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${store.dominio} ${codigo} ${main}`)}`;
}
function csvValue(value: string): string { return `"${value.replace(/"/g, '""')}"`; }
function downloadCsv(rows: Row[], selections: Record<string, Choice>) {
  const header = ["Linha original", "Descrição", "Código de barras original", "Marketplace", "URL selecionada", "Situação", "Aviso EAN"];
  const table = rows.map((r) => { const chosen = selections[r.chave]; return [String(r.linha), r.descricao, r.codigo, chosen?.loja || "", chosen?.url || "", chosen ? "CONFIRMADO MANUALMENTE" : "PENDENTE", r.codigoNumerico ? "EAN numérico no Excel - verifique precisão" : incomplete(r.codigo) ? "EAN incompleto ou não verificável" : ""]; });
  const csv = "\uFEFF" + [header, ...table].map((cells) => cells.map(csvValue).join(";")).join("\r\n");
  const download = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = download; a.download = `precifica-urls-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(download);
}

export default function BuscarUrlsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [paste, setPaste] = useState("");
  const [filename, setFilename] = useState("");
  const [lojas, setLojas] = useState<StoreId[]>(["mercado_livre", "magalu"]);
  const [results, setResults] = useState<Record<string, Result[]>>({});
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [manual, setManual] = useState<Record<string, string>>({});
  const [searched, setSearched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");
  const [provider, setProvider] = useState<"unknown" | "ready" | "manual">("unknown");
  const [loading, setLoading] = useState<string | null>(null);
  const [visible, setVisible] = useState(20);
  useEffect(() => {
    let alive = true;
    fetchQA("/api/qa/buscar-url")
      .then(async (res) => res.ok ? await res.json() as { busca_automatica?: boolean } : null)
      .then((data) => { if (alive && data) setProvider(data.busca_automatica ? "ready" : "manual"); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const row of rows) { const found = map.get(row.chave); if (found) { found.quantidade++; found.codigoNumerico ||= Boolean(row.codigoNumerico); } else map.set(row.chave, { chave: row.chave, descricao: row.descricao, codigo: row.codigo, quantidade: 1, codigoNumerico: Boolean(row.codigoNumerico) }); }
    return [...map.values()];
  }, [rows]);
  const done = rows.filter((row) => Boolean(choices[row.chave])).length;
  const uncertain = rows.filter((row) => row.codigoNumerico || incomplete(row.codigo)).length;
  const loadRows = (list: Row[], label: string) => { setRows(list); setFilename(label); setResults({}); setChoices({}); setSearched({}); setErrors({}); setManual({}); setVisible(20); setGeneralError(""); };
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error("Arquivo acima de 12 MB. Divida em lotes menores.");
      let table: string[][];
      let numericBarcodeLines = new Set<number>();
      if (/\.xlsx$|\.xlsm$/i.test(file.name)) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const raw = await readXlsxFile(file);
        table = raw.map((line) => line.map((cell) => cell == null ? "" : String(cell)));
        const heads = (table[0] || []).map(cleanName);
        const headerIndex = heads.findIndex((x) => /^(?:codigo de barras|codigo barras|cod barras|ean|ean13|gtin|codigo ean)$/.test(x));
        const barcodeColumn = headerIndex >= 0 ? headerIndex : 1;
        numericBarcodeLines = new Set(raw.flatMap((cells, idx) => typeof cells[barcodeColumn] === "number" ? [idx + 1] : []));
      } else if (/\.(csv|tsv|txt)$/i.test(file.name)) table = parseDelimited(await file.text());
      else throw new Error("Formatos aceitos: CSV, TSV, TXT, XLSX e XLSM. Converta XLS antigo para XLSX.");
      loadRows(asRows(table).map((row) => ({ ...row, codigoNumerico: numericBarcodeLines.has(row.linha) })), file.name);
    } catch (error) { setGeneralError(error instanceof Error ? error.message : "Erro ao abrir o arquivo."); }
    e.target.value = "";
  };
  const toggle = (key: StoreId) => setLojas((old) => old.includes(key) ? old.filter((x) => x !== key) : old.length < 3 ? [...old, key] : old);

  const find = async (group: Group) => {
    if (!lojas.length) { setGeneralError("Escolha ao menos um marketplace."); return; }
    setLoading(group.chave);
    setErrors((e) => ({ ...e, [group.chave]: "" }));
    try {
      const response = await fetchQA("/api/qa/buscar-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descricao: group.descricao, codigo_barras: group.codigoNumerico ? "" : group.codigo, lojas }) });
      const data: { candidatos?: Result[]; error?: string; avisos?: string[] } = await response.json();
      if (!response.ok) {
        if (response.status === 503 && /SERPER_API_KEY/.test(data.error || "")) setProvider("manual");
        throw new Error(data.error || `Erro HTTP ${response.status}`);
      }
      setProvider("ready");
      setResults((old) => ({ ...old, [group.chave]: data.candidatos || [] }));
      setSearched((old) => ({ ...old, [group.chave]: true }));
      if (data.avisos?.length) setErrors((old) => ({ ...old, [group.chave]: data.avisos!.join(" ") }));
    } catch (error) { setErrors((old) => ({ ...old, [group.chave]: error instanceof Error ? error.message : "Falha na pesquisa." })); }
    finally { setLoading(null); }
  };
  const select = (key: string, value: Choice) => setChoices((old) => ({ ...old, [key]: value }));
  const remove = (key: string) => setChoices((old) => { const copy = { ...old }; delete copy[key]; return copy; });
  const useManual = (group: Group) => {
    const checked = safeMarketplaceUrl(manual[group.chave] || "");
    if (!checked) { setErrors((old) => ({ ...old, [group.chave]: "A URL precisa ser de uma loja suportada e apontar para uma página de produto." })); return; }
    select(group.chave, { loja: checked.nome, url: checked.url, titulo: "URL informada e conferida pelo usuário" });
    setErrors((old) => ({ ...old, [group.chave]: "" }));
  };
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Precifica Operações</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Buscar URLs</h1><p className="mt-2 text-sm text-slate-500">Encontre anúncios por descrição e código de barras. Confirme os candidatos antes de exportar.</p></div>
      {rows.length > 0 && <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700" onClick={() => downloadCsv(rows, choices)}><Download size={17}/>Exportar CSV ({format(rows.length)} linhas)</button>}
    </div>
    <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"><strong>Conferência obrigatória:</strong> um anúncio parecido não garante ser o mesmo produto. Códigos como <code>7.901E+12</code> podem estar arredondados: nesses casos, a busca utiliza a descrição e exige confirmação humana. Esta ferramenta não altera sua base nem exclui produtos.</section>
    <div className="grid gap-5 xl:grid-cols-[1.05fr_1fr]">
      <section className={`${styles.panel} space-y-4`}><div className="flex items-center gap-2"><FileSpreadsheet className="text-blue-600" size={19}/><h2 className="font-bold">1. Importar produtos</h2></div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 hover:border-blue-300"><UploadCloud className="text-blue-600" size={24}/><div className="flex-1"><p className="text-sm font-semibold">Selecionar planilha</p><p className="text-xs text-slate-500">CSV, TSV, TXT, XLSX ou XLSM • Até 12 MB e 5.000 linhas por lote</p></div><input type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm" className="sr-only" onChange={(e) => void upload(e)} /></label>
        <div className="relative"><p className="mb-2 text-xs font-medium text-slate-600">Ou cole as duas colunas copiadas do Excel/ONLYOFFICE:</p><textarea className={`${styles.input} min-h-25 resize-y font-mono text-xs`} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Descrição\tCódigo de Barras\nLuminária Abajur Mesa\t7.901E+12\nTênis Asics Gel-Venture 11\t4.57163E+12"} /></div>
        <button className={styles.button} disabled={!paste.trim()} onClick={() => { try { loadRows(asRows(parseDelimited(paste)), "Texto colado"); } catch (error) { setGeneralError(error instanceof Error ? error.message : "Dados inválidos."); } }}>Importar texto colado</button>
        {filename && <p className="text-xs text-emerald-700">Arquivo carregado: <strong>{filename}</strong></p>}
        {generalError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{generalError}</p>}
      </section>
      <section className={`${styles.panel} space-y-4`}><div className="flex items-center gap-2"><Search className="text-blue-600" size={19}/><h2 className="font-bold">2. Escolher marketplaces</h2></div>
        <p className="text-xs text-slate-500">Selecione até 3 lojas por pesquisa para controlar o consumo de créditos.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{STORES.map((store) => <button type="button" key={store.id} aria-pressed={lojas.includes(store.id)} onClick={() => toggle(store.id)} className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${lojas.includes(store.id) ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}><span>{store.nome}</span>{lojas.includes(store.id) && <Check size={15}/>}</button>)}</div>
        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><p className="font-semibold text-slate-800">Pesquisa automática opcional</p>Com `SERPER_API_KEY` configurada na Vercel, o sistema apresenta URLs candidatas. Sem essa chave, use os links de pesquisa manual por loja. Não existe captura automática garantida.</div>
      </section>
    </div>
    {rows.length > 0 && <section className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Linhas",rows.length],["Produtos distintos",groups.length],["URLs confirmadas",done],["EANs para revisão",uncertain]].map(([label, value]) => <div key={String(label)} className={`${styles.panel} !p-4`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{format(Number(value))}</p></div>)}</section>}
    {groups.length > 0 && <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">3. Conferir resultados</h2><p className="text-xs text-slate-500">Produtos repetidos são pesquisados uma única vez; o CSV mantém todas as linhas originais.</p></div><button type="button" disabled={Boolean(loading) || !lojas.length || provider === "manual"} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" onClick={async () => { const pending = groups.filter((g) => !searched[g.chave] && !choices[g.chave]).slice(0, 5); for (const group of pending) await find(group); }}>{loading ? "Pesquisando..." : "Buscar próximos 5 produtos"}</button></div>
      {provider === "manual" && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Pesquisa automática indisponível sem `SERPER_API_KEY`. Abra as pesquisas das lojas abaixo e cole a URL do anúncio escolhido.</p>}
      {groups.slice(0, visible).map((group, index) => { const selected = choices[group.chave]; const candidates = results[group.chave] || []; const processing = loading === group.chave;
        return <article key={group.chave} className={`${styles.panel} space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Produto {index + 1} · {format(group.quantidade)} ocorrência(s)</p><h3 className="mt-1 text-sm font-bold leading-6 text-slate-950">{group.descricao}</h3><p className="mt-1 text-xs text-slate-500">EAN informado: {group.codigo || "Não informado"} {(group.codigoNumerico || incomplete(group.codigo)) && <span className="font-semibold text-amber-700">· {group.codigoNumerico ? "numérico no Excel: confirmar dígitos" : "incompleto ou não verificável"}</span>}</p></div>
            <button type="button" disabled={Boolean(loading) || !lojas.length} onClick={() => void find(group)} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 disabled:opacity-40">{processing ? <Loader2 size={15} className="animate-spin"/> : <Search size={15}/>}Buscar candidatos</button></div>
          {selected && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs"><div className="min-w-0 flex-1"><p className="font-bold text-emerald-800">URL confirmada manualmente · {selected.loja}</p><a href={selected.url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-emerald-900 underline">{selected.url}</a></div><button type="button" className="flex items-center gap-1 text-rose-700" onClick={() => remove(group.chave)}><X size={14}/> Remover</button></div>}
          {errors[group.chave] && <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{errors[group.chave]}</p>}
          {searched[group.chave] && !candidates.length && <p className="text-xs text-slate-500">Nenhum link de produto localizado automaticamente. Use a pesquisa manual.</p>}
          {candidates.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold text-slate-600">Candidatos encontrados — verifique modelo, tamanho, marca e EAN antes de selecionar:</p>{candidates.slice(0, 8).map((candidate) => <div key={candidate.url} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-blue-700">{candidate.loja} · Afinidade textual aproximada {candidate.afinidade}%</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{candidate.titulo}</p><a href={candidate.url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-slate-500 underline">{candidate.url}</a></div><button type="button" onClick={() => select(group.chave, { url: candidate.url, loja: candidate.loja, titulo: candidate.titulo })} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Selecionar URL</button></div>)}</div>}
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Pesquisar manualmente ou informar URL <ChevronDown size={14} className="ml-1 inline"/></summary><div className="mt-3 flex flex-wrap gap-2">{STORES.filter((s) => lojas.includes(s.id)).map((store) => <a key={store.id} href={searchLink(group, store)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">{store.nome}<ExternalLink size={12}/></a>)}</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className={styles.input} type="url" value={manual[group.chave] || ""} onChange={(e) => setManual((m) => ({ ...m, [group.chave]: e.target.value }))} placeholder="Cole a URL do produto após conferir"/><button type="button" className={`${styles.button} whitespace-nowrap`} onClick={() => useManual(group)}>Confirmar URL</button></div></details>
        </article>;
      })}
      {groups.length > visible && <button type="button" onClick={() => setVisible((x) => x + 20)} className={`${styles.button} mx-auto flex items-center gap-2`}><ChevronDown size={16}/> Mostrar mais produtos ({format(groups.length - visible)})</button>}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><ShieldCheck size={20} className="shrink-0 text-blue-600"/><p>URLs escolhidas são mantidas somente nesta sessão até exportar CSV. Não são gravadas automaticamente no Supabase. O sistema não visita nem compra produtos nessas páginas.</p></div>
    </section>}
    {!rows.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Link2 size={30} className="mx-auto text-slate-400"/><p className="mt-3 text-sm font-semibold text-slate-700">Importe uma lista para começar</p><p className="mt-1 text-xs text-slate-500">Descrição do produto e código de barras, mesmo que incompleto.</p></div>}
  </div>;
}
