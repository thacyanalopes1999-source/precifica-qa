"use client";

import { useState } from "react";
import { FileSpreadsheet, UploadCloud, AlertTriangle, Download, CheckCircle2, RotateCcw } from "lucide-react";

type Preview = { nome: string; total: number; colunas: string[]; amostra: Record<string, string>[] };
type Result = {
  linha_a: number; descricao_a: string; linha_b: number | null; descricao_b: string;
  score: number | null; classificacao: string; faixa?: string; motivo: string; revisao: "PENDENTE" | "APROVADO" | "REJEITADO";
};
type CompareResponse = { total_a: number; total_b: number; totais: Record<string, number>; resultados: Result[]; avisos: string[] };
const API = process.env.NEXT_PUBLIC_QA_API_URL || "http://127.0.0.1:8000";
const accepted = ".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.xlsb,.ods,.json,.jsonl,.ndjson,.xml,.parquet";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  // Proteção contra execução de fórmulas ao abrir CSV no Excel.
  const safe = /^[\s]*[=+@\-\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function exportCsv(rows: Result[]) {
  const cols: (keyof Result)[] = ["linha_a", "descricao_a", "linha_b", "descricao_b", "score", "faixa", "classificacao", "motivo", "revisao"];
  const data = "\uFEFF" + [cols.join(";"), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(";"))].join("\r\n");
  const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
  const el = document.createElement("a");
  el.href = url; el.download = `precifica-qa-resultado-${new Date().toISOString().slice(0, 10)}.csv`;
  el.click(); URL.revokeObjectURL(url);
}

export default function ImportarPage() {
  const [modo, setModo] = useState<"linha_a_linha" | "cruzamento_1a1">("linha_a_linha");
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [previewA, setPreviewA] = useState<Preview | null>(null);
  const [previewB, setPreviewB] = useState<Preview | null>(null);
  const [columnA, setColumnA] = useState("");
  const [columnB, setColumnB] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<CompareResponse | null>(null);
  const [filter, setFilter] = useState("TODOS");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");

  async function sendFile(file: File): Promise<Preview> {
    const body = new FormData(); body.append("file", file);
    const res = await fetch(`${API}/preview`, { method: "POST", body });
    const json = await res.json();
    if (!res.ok) throw new Error(typeof json.detail === "string" ? json.detail : "Falha ao ler arquivo");
    return json as Preview;
  }
  async function selectFile(file: File | undefined, side: "a" | "b") {
    setError(""); setData(null); setSavedId(null); setSaveError("");
    if (side === "a") { setFileA(file || null); setPreviewA(null); setColumnA(""); }
    else { setFileB(file || null); setPreviewB(null); setColumnB(""); }
    if (!file) return;
    setBusy(true);
    try {
      const preview = await sendFile(file);
      const guessed = preview.colunas.find((c) => /descri|description|nome|product|produto/i.test(c)) || preview.colunas[0];
      if (side === "a") { setPreviewA(preview); setColumnA(guessed); }
      else { setPreviewB(preview); setColumnB(guessed); }
    } catch (e) { setError(e instanceof Error ? e.message : "Falha desconhecida"); }
    finally { setBusy(false); }
  }
  async function compare() {
    if (!fileA || !fileB || !columnA || !columnB) return;
    setBusy(true); setError(""); setData(null); setSavedId(null); setSaveError("");
    try {
      const body = new FormData();
      body.append("file_a", fileA); body.append("file_b", fileB);
      body.append("col_a", columnA); body.append("col_b", columnB);
      body.append("modo", modo);
      const res = await fetch(`${API}/compare`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.detail === "string" ? json.detail : "Erro no processamento");
      setData(json as CompareResponse);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha desconhecida"); }
    finally { setBusy(false); }
  }
  async function exportarExcelCompleto() {
    if (!data || !fileA) return;
    setExporting(true); setError("");
    try {
      const body = new FormData();
      body.append("file_a", fileA);
      body.append(
        "resultados_json",
        new Blob([JSON.stringify(data.resultados)], { type: "application/json" }),
        "resultados.json"
      );
      const resp = await fetch(`${API}/export`, { method: "POST", body });
      if (!resp.ok) {
        const msg = await resp.json().catch(() => null);
        throw new Error(msg?.detail || "Erro ao montar XLSX completo");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `precifica-qa-base-a-completa-${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na exportação");
    } finally { setExporting(false); }
  }
  async function persistirComparacao() {
    if (!data || !fileA || !fileB || savedId) return;
    setSaving(true);
    setSaveError("");
    let currentId: string | null = null;
    try {
      const post = async (payload: Record<string, unknown>) => {
        const response = await fetch("/api/qa/salvar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Falha ao salvar resultados.");
        return json;
      };
      const inicio = await post({ acao: "iniciar", arquivo_a: fileA.name, arquivo_b: fileB.name, nome: `QA ${modo === "linha_a_linha" ? "Linha a linha" : "Cruzamento 1:1"} - ${fileA.name}` });
      currentId = inicio.id;
      for (let i = 0; i < data.resultados.length; i += 100) {
        await post({ acao: "lote", id: currentId, resultados: data.resultados.slice(i, i + 100) });
      }
      await post({ acao: "concluir", id: currentId, total_a: data.total_a });
      setSavedId(currentId);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro desconhecido ao persistir.");
      // Em falha, tenta remover o processamento parcial; se falhar, fica em 'processando'
      // e NÃO entra nos indicadores de comparações concluídas.
      if (currentId) {
        try {
          await fetch("/api/qa/salvar", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acao: "cancelar", id: currentId }),
          });
        } catch { /* Falha de limpeza permanece visível no log do servidor. */ }
      }
    } finally { setSaving(false); }
  }
  function review(index: number, value: "APROVADO" | "REJEITADO") {
    setData((old) => old ? { ...old, resultados: old.resultados.map((r, i) => i === index ? { ...r, revisao: value } : r) } : null);
  }
  const rows = data?.resultados.map((r, index) => ({ ...r, index })).filter((r) => filter === "TODOS" || r.classificacao === filter) || [];
  const pending = data?.resultados.filter((r) => r.revisao === "PENDENTE").length ?? 0;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-bold tracking-wider text-blue-600">PRECIFICA QA</p><h1 className="mt-1 text-3xl font-bold text-slate-900">Importar e comparar</h1>
        <p className="mt-2 text-sm text-slate-500">Selecione o tipo de comparação, as bases e as colunas que serão analisadas.</p></div>
      {data && <button disabled={exporting} onClick={exportarExcelCompleto} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Download size={18}/>{exporting ? "Gerando Excel..." : "Exportar planilha completa (.xlsx)"}</button>}
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Segurança:</strong> similaridade não prova identidade do produto. Nada será excluído automaticamente. O limite de importação foi configurado para 500.000 linhas e 200 MB por arquivo, mas volumes grandes ainda exigem processamento em fila e testes de carga. Salve a comparação no Supabase para preservá-la. As decisões de revisão feitas nesta tela ainda não são sincronizadas; exporte o CSV para preservá-las.</div>
    <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm space-y-3">
      <h2 className="text-lg font-bold text-slate-900">Tipo de comparação</h2>
      <p className="text-sm text-slate-500">Escolha como os produtos devem ser associados antes de iniciar a análise.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className={`cursor-pointer rounded-xl border-2 p-4 ${modo === "linha_a_linha" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
          <div className="flex items-center gap-2"><input type="radio" name="qa-modo" checked={modo === "linha_a_linha"} onChange={() => { setModo("linha_a_linha"); setData(null); setSavedId(null); setError(""); }} /><strong>Linha a linha</strong></div>
          <p className="mt-2 text-sm text-slate-600">Descrição da linha 2 com produto monitorado da linha 2; linha 3 com linha 3. Não cruza outras linhas. Ideal para planilhas já relacionadas.</p>
        </label>
        <label className={`cursor-pointer rounded-xl border-2 p-4 ${modo === "cruzamento_1a1" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
          <div className="flex items-center gap-2"><input type="radio" name="qa-modo" checked={modo === "cruzamento_1a1"} onChange={() => { setModo("cruzamento_1a1"); setData(null); setSavedId(null); setError(""); }} /><strong>Cruzamento 1:1</strong></div>
          <p className="mt-2 text-sm text-slate-600">Busca os melhores candidatos em posições diferentes. Uma linha B só pode ser utilizada uma vez. Para bases independentes.</p>
        </label>
      </div>
      {modo === "linha_a_linha" && previewA && previewB && previewA.total !== previewB.total &&
        <p role="alert" className="text-sm font-semibold text-rose-700">Atenção: o modo linha a linha exige o mesmo número de registros ({previewA.total.toLocaleString("pt-BR")} na A e {previewB.total.toLocaleString("pt-BR")} na B).</p>}
    </section>
    <div className="grid gap-5 lg:grid-cols-2">
      {(["a", "b"] as const).map((side) => {
        const preview = side === "a" ? previewA : previewB;
        const column = side === "a" ? columnA : columnB;
        return <section key={side} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3"><FileSpreadsheet className="text-blue-600"/><div><h2 className="font-bold">Base {side.toUpperCase()}</h2><p className="text-xs text-slate-500">{side === "a" ? "Produtos do cliente" : "Produtos de referência"}</p></div></div>
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-7 text-center hover:border-blue-400">
            <UploadCloud size={30} className="text-blue-600"/><span className="text-sm font-semibold">Escolher arquivo</span><span className="break-all text-xs text-slate-500">{side === "a" ? fileA?.name : fileB?.name || "CSV, Excel, TXT, JSON, XML e Parquet"}</span>
            <input type="file" accept={accepted} className="sr-only" disabled={busy} onChange={(e) => selectFile(e.target.files?.[0], side)} />
          </label>
          {preview && <div className="mt-5 space-y-3"><p className="text-sm text-slate-700"><strong>{preview.total.toLocaleString("pt-BR")}</strong> registros detectados</p>
            <label className="block text-xs font-semibold text-slate-600">Coluna com a descrição do produto</label>
            <select value={column} onChange={(e) => side === "a" ? setColumnA(e.target.value) : setColumnB(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm">
              {preview.colunas.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <p className="text-xs text-slate-500">Prévia de até cinco valores:</p>
            <div className="max-h-40 space-y-1 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{preview.amostra.map((v, i) => <p key={i} className="border-b border-slate-200 py-1">{String(v[column] || "(vazio)")}</p>)}</div>
          </div>}
        </section>;
      })}
    </div>
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><AlertTriangle size={20} className="shrink-0"/>{error}<span className="ml-2 text-xs">Confirme que a API Python está ativa em {API}.</span></div>}
    <button disabled={busy || !previewA || !previewB || !columnA || !columnB || (modo === "linha_a_linha" && previewA.total !== previewB.total)} onClick={compare} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw size={19}/>{busy ? "Processando..." : modo === "linha_a_linha" ? "Comparar linha a linha" : "Cruzar bases 1:1"}</button>
    {data && <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-3">
      <div><h2 className="font-bold text-slate-900">Registrar comparação no banco</h2>
      <p className="mt-1 text-sm text-slate-600">Salva todos os resultados, inclusive itens sem candidato e conflitos, com revisão pendente. Não salva aprovações feitas nesta tela.</p></div>
      {savedId ? <p className="font-semibold text-emerald-700">Comparação salva com sucesso! <a className="underline" href={`/comparacoes/${savedId}`}>Abrir resultados no painel →</a></p> :
        <button type="button" onClick={persistirComparacao} disabled={saving || busy} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Salvando em lotes..." : "Salvar comparação no Supabase"}
        </button>}
      {saveError && <p role="alert" className="text-sm font-semibold text-rose-700">Falha no salvamento: {saveError}. O CSV continua disponível.</p>}
    </div>}
    {data && <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Resultados reais</h2><p className="text-sm text-slate-500">{data.total_a.toLocaleString("pt-BR")} produtos na base A · {pending} revisões pendentes</p></div>
        <div className="flex flex-wrap gap-2"><button disabled={exporting} onClick={exportarExcelCompleto} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Download size={16}/>Planilha original + QA (.xlsx)</button><button onClick={() => exportCsv(data.resultados)} className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"><Download size={16}/>Resumo CSV</button></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{["MATCH_SUGERIDO", "REVISAR", "DIFERENTE", "VINCULO_PENDENTE", "SEM_CANDIDATO"].map((k) => <div key={k} className="rounded-xl bg-slate-50 p-4"><p className="break-words text-xs text-slate-500">{k.replaceAll("_", " ")}</p><p className="mt-2 text-2xl font-bold">{data.totais[k] || 0}</p></div>)}</div>
      <div className="space-y-1">{data.avisos.map((s) => <p key={s} className="text-xs text-amber-700">⚠ {s}</p>)}</div>
      <div className="flex flex-wrap gap-2">{["TODOS", "MATCH_SUGERIDO", "REVISAR", "DIFERENTE", "VINCULO_PENDENTE", "SEM_CANDIDATO"].map((k) => <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{k.replaceAll("_", " ")}</button>)}</div>
      <div className="overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-230 text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{["Linha A", "Descrição A", "Descrição B", "Score", "Faixa", "Classificação", "Motivo", "Revisão"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 200).map((r) => <tr key={r.index} className="border-t border-slate-100 align-top"><td className="p-3">{r.linha_a}</td><td className="max-w-55 p-3">{r.descricao_a}</td><td className="max-w-55 p-3">{r.descricao_b || "—"}</td><td className="p-3 font-bold">{r.score == null ? "—" : `${r.score}%`}</td><td className="p-3">{r.faixa || "—"}</td><td className="p-3">{r.classificacao.replaceAll("_", " ")}</td><td className="max-w-65 p-3 text-slate-500">{r.motivo}</td>
          <td className="p-3"><span className="block font-semibold">{r.revisao}</span><div className="mt-2 flex gap-1"><button onClick={() => review(r.index, "APROVADO")} className="rounded bg-emerald-50 px-2 py-1 text-emerald-700" title="Aprovar decisão revisada"><CheckCircle2 size={14}/></button><button onClick={() => review(r.index, "REJEITADO")} className="rounded bg-rose-50 px-2 py-1 text-rose-700">Rejeitar</button></div></td></tr>)}</tbody></table></div>
      <p className="text-xs text-slate-500">A tabela mostra os primeiros 200 registros do filtro para manter a tela rápida. A exportação inclui TODOS os registros e todas as revisões, inclusive os que não aparecem nesta página. Aprovar aqui significa registrar a revisão da sugestão, nunca excluir produtos do cliente.</p>
    </section>}
  </div>;
}
