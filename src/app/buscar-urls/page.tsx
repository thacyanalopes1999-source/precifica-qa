"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Check, ChevronDown, Download, ExternalLink, FileSpreadsheet, Link2, Loader2, Search, ShieldCheck, UploadCloud, X } from "lucide-react";
import { fetchQA } from "@/lib/supabase/browser";

type StoreId = "mercado_livre" | "magalu" | "casas_bahia" | "amazon" | "shopee" | "americanas" | "carrefour";
type Store = { id: StoreId; nome: string; dominio: string };
const STORES: Store[] = [
  { id: "mercado_livre", nome: "Mercado Livre", dominio: "mercadolivre.com.br" },
  { id: "magalu", nome: "Magazine Luiza", dominio: "magazineluiza.com.br" },
  { id: "casas_bahia", nome: "Casas Bahia", dominio: "casasbahia.com.br" },
  { id: "amazon", nome: "Amazon", dominio: "amazon.com.br" },
  { id: "shopee", nome: "Shopee", dominio: "shopee.com.br" },
  { id: "americanas", nome: "Americanas", dominio: "americanas.com.br" },
  { id: "carrefour", nome: "Carrefour", dominio: "carrefour.com.br" },
];

type Row = { original: string[]; descricao: string; codigo: string; linha: number; chave: string; codigoNumerico: boolean };
type Group = { chave: string; descricao: string; codigo: string; quantidade: number; codigoNumerico: boolean };
type Candidate = { loja: string; loja_id: StoreId; titulo: string; url: string; afinidade: number };
type StoreResults = Partial<Record<StoreId, Candidate[]>>;
type GroupResults = Record<string, StoreResults>;
type StoreFlags = Partial<Record<StoreId, boolean>>;
type GroupFlags = Record<string, StoreFlags>;
type StoreMessages = Partial<Record<StoreId, string>>;
type GroupMessages = Record<string, StoreMessages>;
const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500";
const secondary = "rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const numberFormat = (n: number) => n.toLocaleString("pt-BR");
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const productKey = (description: string, code: string) => `${normalize(description)}\u0001${code.trim()}`;
const needsEANReview = (s: string) => /\d+(?:[.,]\d+)?[eE][+-]?\d+/.test(s) || (s.trim() !== "" && !/^(?:\d{8}|\d{12,14})$/.test(s.replace(/[\s-]/g, "")));
const validHeading = /^(?:descricao|descricao do produto|nome|nome do produto|produto|titulo|codigo de barras|codigo barras|cod barras|ean|ean13|gtin|codigo ean)$/;

function parseText(raw: string): string[][] {
  const source = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = source.split("\n").find((line) => line.trim()) || "";
  const separators = ["\t", ";", ",", "|"];
  const sep = [...separators].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0] || ";";
  const rows: string[][] = [];
  let cells: string[] = [], value = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === sep && !quoted) { cells.push(value.trim()); value = ""; }
    else if (char === "\n" && !quoted) {
      cells.push(value.trim());
      if (cells.some((x) => x)) rows.push(sep === "|" ? cells.slice(1, -1) : cells);
      cells = []; value = "";
    } else value += char;
  }
  if (quoted) throw new Error("Texto CSV com aspas não fechadas.");
  cells.push(value.trim());
  if (cells.some((x) => x)) rows.push(sep === "|" ? cells.slice(1, -1) : cells);
  return rows;
}
function parseRows(table: string[][], numericRows: Set<number>): { rows: Row[]; headers: string[] } {
  const populated = table.map((cells, index) => ({ cells, index: index + 1 })).filter((x) => x.cells.some((cell) => cell.trim()));
  if (!populated.length) throw new Error("Arquivo sem linhas válidas.");
  const first = populated[0].cells.map(normalize);
  const descriptionColumn = first.findIndex((x) => /^(?:descricao|descricao do produto|nome|nome do produto|produto|titulo)$/.test(x));
  const barcodeColumn = first.findIndex((x) => /^(?:codigo de barras|codigo barras|cod barras|ean|ean13|gtin|codigo ean)$/.test(x));
  const hasHeaders = first.some((x) => validHeading.test(x));
  const di = descriptionColumn >= 0 ? descriptionColumn : 0;
  const ci = barcodeColumn >= 0 ? barcodeColumn : di === 0 ? 1 : 0;
  const data = hasHeaders ? populated.slice(1) : populated;
  const headers = hasHeaders ? populated[0].cells.map((x, i) => x.trim() || `Coluna ${i + 1}`) : populated[0].cells.map((_, i) => `Coluna ${i + 1}`);
  const rows = data.map(({ cells, index }) => {
    const descricao = (cells[di] || "").trim();
    const codigo = ci !== di ? (cells[ci] || "").trim() : "";
    return { original: [...cells], descricao, codigo, linha: index, chave: productKey(descricao, codigo), codigoNumerico: numericRows.has(index) };
  });
  if (!rows.length) throw new Error("A planilha não contém produtos após o cabeçalho.");
  return { rows, headers };
}
function isStoreUrl(raw: string, store: Store): boolean {
  try {
    const u = new URL(raw.trim());
    return (u.protocol === "http:" || u.protocol === "https:") && (u.hostname === store.dominio || u.hostname.endsWith(`.${store.dominio}`)) && u.pathname.length > 3;
  } catch { return false; }
}
function searchLink(group: Group, store: Store): string {
  const description = group.descricao.replace(/\s*-\s*Dimens[oõ]es\s*\(.*$/i, "").slice(0, 135);
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${store.dominio} ${description}`)}`;
}
function quoteCsv(value: string): string {
  // Evita que descrições de terceiros sejam interpretadas como fórmulas no Excel.
  const safe = /^[\s]*[=+@\-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
function exportCsv(rows: Row[], headers: string[], shops: StoreId[], results: GroupResults, searched: GroupFlags, errors: GroupMessages, manual: GroupResults) {
  const stores = STORES.filter((s) => shops.includes(s.id));
  const columns = ["Linha original", ...headers];
  for (const store of stores) columns.push(`URL ${store.nome}`, `Status ${store.nome}`, `Afinidade ${store.nome} (%)`, `Título ${store.nome}`, `Alternativa ${store.nome}`);
  columns.push("Conferência do EAN");
  const content = rows.map((row) => {
    const data = [String(row.linha), ...row.original];
    for (const store of stores) {
      const chosen = manual[row.chave]?.[store.id]?.[0];
      const matches = results[row.chave]?.[store.id] || [];
      const selected = chosen || matches[0];
      const status = chosen ? "SELECIONADA MANUALMENTE" : selected ? "URL SUGERIDA - CONFERIR" : errors[row.chave]?.[store.id] ? "ERRO NA BUSCA" : searched[row.chave]?.[store.id] ? "SEM URL ENCONTRADA" : "NAO PESQUISADO";
      data.push(selected?.url || "", status, selected ? String(selected.afinidade ?? "") : "", selected?.titulo || "", matches.find((c) => c.url !== selected?.url)?.url || "");
    }
    data.push(row.codigoNumerico ? "EAN numérico no Excel: verificar precisão" : needsEANReview(row.codigo) ? "EAN incompleto ou não verificável" : "");
    return data;
  });
  const csv = "\uFEFF" + [columns, ...content].map((cells) => cells.map((x) => quoteCsv(String(x))).join(";")).join("\r\n");
  const link = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = link;
  a.download = `precifica-urls-por-marketplace-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(link), 2000);
}

export default function BuscarUrlsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [filename, setFilename] = useState("");
  const [paste, setPaste] = useState("");
  const [shops, setShops] = useState<StoreId[]>(["mercado_livre"]);
  const [results, setResults] = useState<GroupResults>({});
  const [manual, setManual] = useState<GroupResults>({});
  const [manualInputs, setManualInputs] = useState<Record<string, string>>({});
  const [searched, setSearched] = useState<GroupFlags>({});
  const [errors, setErrors] = useState<GroupMessages>({});
  const [provider, setProvider] = useState<"checking" | "ready" | "missing">("checking");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [singleTask, setSingleTask] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [visible, setVisible] = useState(20);
  const stopRef = useRef(false);
  const activeRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    let running = true;
    fetchQA("/api/qa/buscar-url")
      .then(async (response) => response.ok ? await response.json() as { busca_automatica?: boolean } : null)
      .then((json) => { if (running) setProvider(json?.busca_automatica ? "ready" : "missing"); })
      .catch(() => { if (running) setProvider("missing"); });
    return () => { running = false; };
  }, []);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const row of rows) {
      if (!row.descricao) continue;
      const entry = map.get(row.chave);
      if (entry) { entry.quantidade++; entry.codigoNumerico ||= row.codigoNumerico; }
      else map.set(row.chave, { chave: row.chave, descricao: row.descricao, codigo: row.codigo, quantidade: 1, codigoNumerico: row.codigoNumerico });
    }
    return Array.from(map.values());
  }, [rows]);
  const totalTasks = groups.length * shops.length;
  const researchedTasks = groups.reduce((sum, group) => sum + shops.filter((id) => searched[group.chave]?.[id]).length, 0);
  const foundLines = rows.filter((row) => shops.some((id) => (manual[row.chave]?.[id]?.length || results[row.chave]?.[id]?.length))).length;
  const suspectCodes = rows.filter((row) => row.codigoNumerico || needsEANReview(row.codigo)).length;

  function clearImport(next: { rows: Row[]; headers: string[] }, label: string) {
    stopRef.current = true;
    generationRef.current++;
    setRows(next.rows); setHeaders(next.headers); setFilename(label); setResults({}); setManual({});
    setSearched({}); setErrors({}); setManualInputs({}); setVisible(20); setError(""); setProgress({ done: 0, total: 0 });
  }
  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      let table: string[][]; const numeric = new Set<number>();
      if (/\.(?:xlsx|xlsm)$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const raw = await readSheet(file);
        table = raw.map((line) => line.map((cell) => cell == null ? "" : String(cell)));
        const first = (table[0] || []).map(normalize);
        const bc = first.findIndex((x) => /^(?:codigo de barras|codigo barras|cod barras|ean|ean13|gtin|codigo ean)$/.test(x));
        const col = bc >= 0 ? bc : 1;
        raw.forEach((line, i) => { if (typeof line[col] === "number") numeric.add(i + 1); });
      } else if (/\.(?:csv|tsv|txt)$/i.test(file.name)) table = parseText(await file.text());
      else throw new Error("Formatos aceitos: CSV, TSV, TXT, XLSX e XLSM.");
      clearImport(parseRows(table, numeric), file.name);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível abrir a planilha."); }
    e.target.value = "";
  }
  function toggleShop(id: StoreId) {
    if (activeRef.current) return;
    setShops((current) => current.includes(id) ? current.filter((key) => key !== id) : [...current, id]);
    setError("");
  }
  async function lookup(group: Group, storeId: StoreId, run: number): Promise<{ fatal: boolean }> {
    const taskKey = `${group.chave}:${storeId}`;
    try {
      const response = await fetchQA("/api/qa/buscar-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao: group.descricao, codigo_barras: group.codigoNumerico || needsEANReview(group.codigo) ? "" : group.codigo, lojas: [storeId] }),
      });
      const json = await response.json() as { candidatos?: Candidate[]; avisos?: string[]; error?: string };
      if (!response.ok) {
        const message = `${json.error || "Erro na API"} (HTTP ${response.status})`;
        throw new Error(message);
      }
      const candidates = (json.candidatos || []).filter((candidate) => candidate.loja_id === storeId && isStoreUrl(candidate.url, STORES.find((s) => s.id === storeId)!));
      const warning = (json.avisos || []).join(" ");
      if (generationRef.current !== run) return { fatal: true };
      setResults((current) => ({ ...current, [group.chave]: { ...current[group.chave], [storeId]: candidates } }));
      if (!warning) {
        setSearched((current) => ({ ...current, [group.chave]: { ...current[group.chave], [storeId]: true } }));
        setErrors((current) => ({ ...current, [group.chave]: { ...current[group.chave], [storeId]: "" } }));
      } else {
        setErrors((current) => ({ ...current, [group.chave]: { ...current[group.chave], [storeId]: warning } }));
        if (candidates.length) setSearched((current) => ({ ...current, [group.chave]: { ...current[group.chave], [storeId]: true } }));
      }
      return { fatal: /\b(?:401|402|403|429)\b|cr[eé]ditos?|rate limit/i.test(warning) };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha de comunicação";
      if (generationRef.current === run) setErrors((current) => ({ ...current, [group.chave]: { ...current[group.chave], [storeId]: message } }));
      return { fatal: /\b(?:401|402|403|429)\b|SERPER_API_KEY|cr[eé]ditos?|rate limit/i.test(message) };
    } finally { if (generationRef.current === run) setSingleTask((current) => current === taskKey ? "" : current); }
  }
  async function searchAll() {
    if (activeRef.current || provider !== "ready" || shops.length === 0 || !groups.length) return;
    const totalPending = groups.reduce((count, group) => count + shops.filter((id) => !searched[group.chave]?.[id]).length, 0);
    if (!totalPending) { setError("Todas as lojas selecionadas já foram pesquisadas. Você pode exportar o CSV agora."); return; }
    if (totalPending > 300 && !window.confirm(`Esta busca poderá realizar até ${numberFormat(totalPending)} consultas na Serper e consumir créditos. Continuar?`)) return;
    stopRef.current = false; activeRef.current = true;
    const run = ++generationRef.current;
    setBusy(true); setError(""); setProgress({ done: 0, total: totalPending });
    let cursor = 0, done = 0; let fatal = false;
    const possible = totalTasks;
    const worker = async () => {
      while (!stopRef.current && !fatal && generationRef.current === run) {
        let group: Group | null = null;
        let storeId: StoreId | null = null;
        while (cursor < possible) {
          const index = cursor++;
          const nextGroup = groups[Math.floor(index / shops.length)];
          const nextStore = shops[index % shops.length];
          if (!searched[nextGroup.chave]?.[nextStore]) { group = nextGroup; storeId = nextStore; break; }
        }
        if (!group || !storeId) return;
        const result = await lookup(group, storeId, run);
        done++;
        if (generationRef.current === run) setProgress({ done, total: totalPending });
        if (result.fatal) { fatal = true; stopRef.current = true; }
      }
    };
    await Promise.all([worker(), worker()]);
    if (generationRef.current === run) {
      if (fatal) setError("Busca interrompida: limite de créditos, autenticação ou API. Os resultados encontrados continuam disponíveis para exportação.");
      else if (stopRef.current) setError("Busca interrompida. Os resultados já encontrados estão preservados; clique novamente para continuar.");
      setBusy(false); activeRef.current = false; stopRef.current = false;
    }
  }
  async function searchOne(group: Group, storeId: StoreId) {
    if (activeRef.current || singleTask) return;
    const run = generationRef.current;
    setSingleTask(`${group.chave}:${storeId}`);
    await lookup(group, storeId, run);
  }
  function selectManual(group: Group, store: Store, candidate: Candidate) {
    setManual((current) => ({ ...current, [group.chave]: { ...current[group.chave], [store.id]: [candidate] } }));
  }
  function putUrl(group: Group, store: Store) {
    const text = manualInputs[`${group.chave}:${store.id}`] || "";
    if (!isStoreUrl(text, store)) { setError(`A URL deve pertencer ao marketplace ${store.nome}.`); return; }
    selectManual(group, store, { loja: store.nome, loja_id: store.id, titulo: "URL informada manualmente", url: text, afinidade: 0 });
    setError("");
  }
  function removeManual(group: Group, store: Store) {
    setManual((current) => {
      const next = { ...current[group.chave] }; delete next[store.id]; return { ...current, [group.chave]: next };
    });
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Precifica Operações</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Buscar URLs</h1><p className="mt-2 text-sm text-slate-600">Pesquise todos os produtos nas lojas selecionadas e exporte URLs sugeridas para conferir depois.</p></div>
      {!!rows.length && <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700" onClick={() => exportCsv(rows, headers, shops, results, searched, errors, manual)}><Download size={17}/> Exportar CSV com URLs ({numberFormat(rows.length)} linhas)</button>}
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>URLs sugeridas, não verificadas:</strong> não é necessário confirmar uma a uma antes de exportar. A planilha registra a situação de cada loja. Códigos de barras do Excel em notação científica podem perder precisão.</div>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className={`${panel} space-y-4`}>
        <h2 className="flex items-center gap-2 font-bold"><FileSpreadsheet className="text-blue-600" size={19}/>1. Importar planilha</h2>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 hover:border-blue-300"><UploadCloud size={24} className="text-blue-600"/><div className="flex-1"><p className="text-sm font-semibold">Selecionar arquivo</p><p className="text-xs text-slate-500">CSV, TSV, TXT, XLSX, XLSM • sem corte artificial de linhas; depende da memória do navegador</p></div><input type="file" disabled={busy} className="sr-only" accept=".csv,.tsv,.txt,.xlsx,.xlsm" onChange={(e: ChangeEvent<HTMLInputElement>) => void importFile(e)}/></label>
        <p className="text-xs text-slate-600">Ou cole as colunas Descrição e Código de barras:</p>
        <textarea className={`${input} min-h-24 resize-y font-mono text-xs`} placeholder={"Descrição\tCódigo de Barras\nTênis Asics Gel-Venture 11\t4.57163E+12"} value={paste} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPaste(e.target.value)}/>
        <button type="button" className={secondary} disabled={!paste.trim() || busy} onClick={() => { try { clearImport(parseRows(parseText(paste), new Set<number>()), "Texto colado"); } catch (err) { setError(err instanceof Error ? err.message : "Erro nos dados"); } }}>Importar texto colado</button>
        {filename && <p className="text-xs text-emerald-700">Arquivo carregado: <strong>{filename}</strong></p>}
      </section>
      <section className={`${panel} space-y-4`}>
        <h2 className="flex items-center gap-2 font-bold"><Search className="text-blue-600" size={19}/>2. Marketplaces para pesquisar</h2>
        <p className="text-xs text-slate-600">A busca usa somente as lojas marcadas. Se escolher duas, o CSV terá uma URL sugerida para cada uma, em colunas separadas.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{STORES.map((store) => <button type="button" key={store.id} disabled={busy} aria-pressed={shops.includes(store.id)} onClick={() => toggleShop(store.id)} className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold disabled:opacity-50 ${shops.includes(store.id) ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-700"}`}>{store.nome}{shops.includes(store.id) && <Check size={15}/>}</button>)}</div>
        <p className="text-xs text-slate-500">Pesquisas estimadas: <strong>{numberFormat(totalTasks)}</strong> (produtos distintos × marketplaces selecionados). Produtos repetidos reaproveitam as URLs.</p>
        <p className="text-xs text-slate-500">{provider === "ready" ? "API Serper habilitada." : provider === "checking" ? "Verificando a API de busca..." : "API de busca indisponível. Confira SERPER_API_KEY na Vercel e o login."}</p>
      </section>
    </div>
    {!!rows.length && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Linhas originais",rows.length],["Produtos distintos",groups.length],["Linhas com alguma URL",foundLines],["EANs para revisão",suspectCodes]].map(([name,value]) => <div key={String(name)} className={`${panel} !p-4`}><p className="text-xs font-semibold text-slate-500">{name}</p><p className="mt-1 text-2xl font-bold text-slate-900">{numberFormat(Number(value))}</p></div>)}</div>}
    {!!groups.length && <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">3. Buscar e exportar</h2><p className="text-xs text-slate-500">{numberFormat(researchedTasks)} de {numberFormat(totalTasks)} consultas concluídas nas lojas selecionadas</p></div><div className="flex flex-wrap gap-2">{busy && <button type="button" className={secondary} onClick={() => { stopRef.current = true; }}>Interromper</button>}<button type="button" disabled={busy || !!singleTask || !shops.length || provider !== "ready"} onClick={() => void searchAll()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "Buscando todas as URLs..." : `Buscar todas as URLs (${numberFormat(groups.length)} produtos)`}</button></div></div>
      {busy && <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><div className="flex justify-between"><span>Pesquisando {numberFormat(progress.done)} de {numberFormat(progress.total)} combinações produto × loja</span><strong>{progress.total ? Math.round(progress.done * 100 / progress.total) : 0}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full bg-blue-600 transition-all" style={{ width: `${progress.total ? progress.done * 100 / progress.total : 0}%` }}/></div><p className="mt-2 text-xs">Mantenha esta aba aberta; pode interromper e depois continuar pelos itens pendentes.</p></div>}
      {!!error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      {!shops.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Selecione pelo menos um marketplace para iniciar.</p>}
      {groups.slice(0, visible).map((group, index) => <article key={group.chave} className={`${panel} space-y-3`}>
        <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Produto {index + 1} · {numberFormat(group.quantidade)} ocorrência(s)</p><h3 className="mt-1 text-sm font-semibold text-slate-950">{group.descricao}</h3><p className="mt-1 text-xs text-slate-500">EAN: {group.codigo || "Não informado"}{(group.codigoNumerico || needsEANReview(group.codigo)) && <span className="ml-2 font-semibold text-amber-700">Conferir precisão</span>}</p></div>
        <div className="grid gap-3 xl:grid-cols-2">{STORES.filter((s) => shops.includes(s.id)).map((store) => {
          const candidates = results[group.chave]?.[store.id] || [];
          const override = manual[group.chave]?.[store.id]?.[0];
          const picked = override || candidates[0];
          const attempted = searched[group.chave]?.[store.id];
          const failed = errors[group.chave]?.[store.id];
          const taskId = `${group.chave}:${store.id}`;
          return <div key={store.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-900">{store.nome}</strong><button type="button" disabled={busy || !!singleTask || provider !== "ready"} className="inline-flex items-center gap-1 font-semibold text-blue-700 disabled:opacity-40" onClick={() => void searchOne(group, store.id)}>{singleTask === taskId ? <Loader2 className="animate-spin" size={13}/> : <Search size={13}/>} Buscar nesta loja</button></div>
            {picked ? <div className="mt-2"><p className={`font-semibold ${override ? "text-emerald-700" : "text-blue-700"}`}>{override ? "Escolhida manualmente" : `URL sugerida · ${picked.afinidade}% similaridade textual`}</p><a href={picked.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-blue-700 underline">{picked.url}</a><p className="mt-1 text-slate-600">{picked.titulo}</p></div> : <p className="mt-2 text-slate-500">{failed ? "Erro na consulta" : attempted ? "Nenhuma URL encontrada nesta loja" : "Aguardando pesquisa"}</p>}
            {failed && <p className="mt-2 text-amber-700">{failed}</p>}
            {candidates.length > 1 && <details className="mt-3"><summary className="cursor-pointer font-semibold text-slate-700">Outras {candidates.length - 1} opções <ChevronDown size={13} className="inline"/></summary><div className="mt-2 space-y-2">{candidates.slice(1, 5).map((candidate) => <div key={candidate.url} className="rounded-lg border border-slate-200 bg-white p-2"><a className="block break-all text-blue-700 underline" href={candidate.url} target="_blank" rel="noopener noreferrer">{candidate.titulo}</a><button type="button" className="mt-2 text-blue-700 underline" onClick={() => selectManual(group, store, candidate)}>Preferir esta URL</button></div>)}</div></details>}
            <details className="mt-3"><summary className="cursor-pointer font-semibold text-slate-700">Pesquisa manual / alterar URL <ExternalLink size={12} className="inline"/></summary><a href={searchLink(group, store)} target="_blank" rel="noopener noreferrer" className="mt-2 block text-blue-700 underline">Abrir pesquisa em {store.nome}</a><input type="url" className={`${input} mt-2`} value={manualInputs[taskId] || ""} placeholder="https://..." onChange={(e: ChangeEvent<HTMLInputElement>) => setManualInputs((cur) => ({ ...cur, [taskId]: e.target.value }))}/><div className="mt-2 flex gap-3"><button type="button" className="font-semibold text-blue-700" onClick={() => putUrl(group, store)}>Usar esta URL</button>{override && <button type="button" className="flex items-center gap-1 text-rose-700" onClick={() => removeManual(group, store)}><X size={13}/> Desfazer</button>}</div></details>
          </div>;
        })}</div>
      </article>)}
      {groups.length > visible && <button type="button" className={`${secondary} mx-auto flex items-center gap-2`} onClick={() => setVisible((current) => current + 20)}><ChevronDown size={15}/> Mostrar mais {numberFormat(groups.length - visible)} produtos</button>}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"><ShieldCheck className="shrink-0 text-blue-600" size={18}/><p>O CSV tem uma coluna de URL por marketplace selecionado e mantém todas as linhas originais, incluindo repetições. Os links são sugestões, não produtos validados; confira-os depois. Não há exclusão nem gravação no Supabase.</p></div>
    </section>}
    {!rows.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Link2 size={30} className="mx-auto text-slate-400"/><p className="mt-3 text-sm font-semibold text-slate-700">Importe sua planilha para começar</p></div>}
  </div>;
}
