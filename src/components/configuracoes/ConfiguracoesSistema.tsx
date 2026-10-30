"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowUpRight, BookOpenText, Boxes, CheckCircle2,
  ClipboardList, Cloud, Code2, Database, FileSpreadsheet, GitBranch,
  Globe2, Info, Layers3, LockKeyhole, ServerCog, ShieldAlert,
  ShieldCheck, Workflow, XCircle,
} from "lucide-react";

type Health = { status?: string; versao_motor?: string; max_linhas?: number; formatos?: string[] };
type HealthStatus = "loading" | "online" | "offline" | "not_configured";
const API = (process.env.NEXT_PUBLIC_QA_API_URL || "").replace(/\/$/, "");
const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const label = "text-[11px] font-bold uppercase tracking-[0.17em] text-slate-500";
const external = "inline-flex items-center gap-1 font-medium text-blue-700 hover:underline";

function SectionTitle({ eyebrow, title, description }: {eyebrow: string; title: string; description?: string}) {
  return <header className="mb-4"><p className={label}>{eyebrow}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}</header>;
}
function Stat({ label: title, value, sub }: { label: string; value: string; sub: string }) {
  return <div className={`${card} p-5`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p><p className="mt-3 text-lg font-semibold text-slate-900">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p></div>;
}
const formats = ["CSV", "TSV", "TXT", "XLSX", "XLS", "XLSM", "XLSB", "ODS", "JSON", "JSONL", "NDJSON", "XML", "Parquet"];
const rules = [
  { title: "Identidade comercial antes da pontuação", detail: "A decisão avalia família do produto, marca, EAN/GTIN, modelo, variação e termos relevantes. Similaridade textual elevada, isoladamente, não comprova equivalência." },
  { title: "Atributos de produto", detail: "Cor, tamanho, tensão, capacidade, medidas, memória RAM/armazenamento, formulação e especificações de famílias específicas podem tornar produtos incompatíveis." },
  { title: "Conflito de evidências", detail: "EAN igual com atributos comerciais conflitantes exige REVISAR. Família, marca ou variante claramente incompatível pode resultar em DIFERENTE mesmo com score alto." },
  { title: "Cruzamento 1:1", detail: "Busca candidatos fora da mesma posição e permite associar uma ocorrência da Base B a no máximo um registro da Base A. A heurística não garante a solução ótima global." },
  { title: "Linha a linha", detail: "Compara exclusivamente a linha A com a linha B correspondente. Exige as duas bases com a mesma quantidade de registros." },
  { title: "Ausência de candidato", detail: "SEM_CANDIDATO indica apenas que a busca não encontrou candidato naquele processamento. Não comprova ausência na Base B e nunca dispara exclusão automática." },
];
const states = [
  { name: "MATCH_SUGERIDO", explanation: "Identidade comercial sugerida; sujeito à conferência humana." },
  { name: "REVISAR", explanation: "Dados parciais, conflito ou evidências insuficientes para validar a associação." },
  { name: "DIFERENTE", explanation: "Incompatibilidade comercial ou falta de prova de identidade." },
  { name: "VINCULO_PENDENTE", explanation: "Possível candidato já ocupado por outro vínculo no cruzamento 1:1." },
  { name: "SEM_CANDIDATO", explanation: "Nenhum candidato localizado no processamento. Requer triagem, não exclusão." },
];
export default function ConfiguracoesSistema() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>(API ? "loading" : "not_configured");
  useEffect(() => {
    if (!API) return;
    let active = true;
    const controller = new AbortController();
    async function verify() {
      try {
        const res = await fetch(`${API}/health`, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as Health;
        if (active) { setHealth(json); setHealthStatus(json.status === "ok" ? "online" : "offline"); }
      } catch { if (active) setHealthStatus("offline"); }
    }
    void verify();
    return () => { active = false; controller.abort(); };
  }, []);

  return <div className="space-y-9 pb-14 text-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className={label}>Precifica Operações / Referência técnica</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Informações do sistema</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Arquitetura, regras de negócio, tecnologias e instruções de operação para manutenção e transferência à equipe da empresa.</p></div>
      <a className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50" href="https://github.com/thacyanalopes1999-source/precifica-qa" target="_blank" rel="noopener noreferrer"><GitBranch size={17}/> Código-fonte <ArrowUpRight size={15}/></a>
    </header>

    <section aria-label="Identificação do sistema" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Stat label="Produto" value="Precifica Operações" sub="Módulo Precifica QA · validação e conciliação"/>
      <Stat label="Frontend" value="Next.js 16.4.2" sub="React 19.3.0 · TypeScript · Tailwind CSS 4"/>
      <Stat label="Motor informado pela API" value={health?.versao_motor || "10.1.0.1"} sub={health ? "Versão lida em /health" : "Versão observada anteriormente em /health; conferir online"}/>
      <Stat label="Banco de dados" value="Supabase" sub="PostgreSQL · Auth · persistência de comparações"/>
    </section>

    <section><SectionTitle eyebrow="Infraestrutura" title="Onde cada parte funciona" description="O repositório é a fonte do código; os serviços de execução e o banco são independentes."/>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={`${card} p-5`}><div className="flex items-center justify-between"><Cloud size={24} className="text-slate-600"/><span className="text-xs text-slate-400">Interface web</span></div><h3 className="mt-4 text-lg font-semibold">Vercel</h3><p className="mt-2 text-sm leading-6 text-slate-500">Hospeda o Next.js, páginas administrativas, login e rotas do servidor <code>/api/qa/*</code>.</p><a className={`${external} mt-4 text-sm`} href="https://precifica-qa.vercel.app" target="_blank" rel="noopener noreferrer">Abrir aplicação <ArrowUpRight size={15}/></a></div>
        <div className={`${card} p-5`}><div className="flex items-center justify-between"><ServerCog size={24} className="text-slate-600"/><span className="text-xs text-slate-400">Processamento</span></div><h3 className="mt-4 text-lg font-semibold">Render · FastAPI</h3><p className="mt-2 text-sm leading-6 text-slate-500">Executa o Python: leitura de arquivos, comparação, exportação e validação de URLs.</p><a className={`${external} mt-4 text-sm`} href="https://precifica-qa-api.onrender.com/health" target="_blank" rel="noopener noreferrer">Verificar /health <ArrowUpRight size={15}/></a></div>
        <div className={`${card} p-5`}><div className="flex items-center justify-between"><Database size={24} className="text-slate-600"/><span className="text-xs text-slate-400">Dados e identidade</span></div><h3 className="mt-4 text-lg font-semibold">Supabase</h3><p className="mt-2 text-sm leading-6 text-slate-500">PostgreSQL para comparações e resultados; Supabase Auth para autenticação administrativa.</p><a className={`${external} mt-4 text-sm`} href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">Painel do banco <ArrowUpRight size={15}/></a></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600"><Activity size={17} className={healthStatus === "online" ? "text-emerald-600" : "text-slate-400"}/><strong>Saúde da API:</strong> {healthStatus === "online" ? "Online · /health respondeu OK" : healthStatus === "loading" ? "Consultando... (Render Free pode despertar com atraso)" : healthStatus === "not_configured" ? "NEXT_PUBLIC_QA_API_URL não configurada" : "Sem resposta neste momento; verificar Logs do Render"}{health?.max_linhas && <span>· Limite configurado: {health.max_linhas.toLocaleString("pt-BR")} linhas por base</span>}</div>
    </section>

    <section><SectionTitle eyebrow="Regras vigentes" title="Como o motor decide" description="A classificação é baseada em evidências comerciais; não existe regra única de match acima de 50%. Percentuais de score são indicadores auxiliares."/>
      <div className="grid gap-3 lg:grid-cols-2">{rules.map(rule => <article key={rule.title} className={`${card} p-5`}><div className="flex gap-3"><CheckCircle2 size={19} className="mt-0.5 shrink-0 text-[#9e8660]"/><div><h3 className="text-sm font-semibold">{rule.title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{rule.detail}</p></div></div></article>)}</div>
    </section>

    <section><SectionTitle eyebrow="Interpretação" title="Classificações exibidas ao usuário"/>
      <div className={`${card} overflow-hidden`}><div className="overflow-x-auto"><table className="w-full min-w-[670px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Classificação do motor</th><th className="px-5 py-3">O que significa</th></tr></thead><tbody>{states.map(item => <tr key={item.name} className="border-t border-slate-100"><td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700">{item.name}</td><td className="px-5 py-3 leading-6 text-slate-600">{item.explanation}</td></tr>)}</tbody></table></div></div>
      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900"><Info size={17} className="mr-2 inline"/>Ao salvar no Supabase, <code>MATCH_SUGERIDO</code> vira <code>match</code>, <code>SEM_CANDIDATO</code> vira <code>exclusao</code>, e os demais casos são agrupados em <code>revisar</code>. Essa conversão é feita em <code>src/app/api/qa/salvar/route.ts</code>.</div>
    </section>

    <section><SectionTitle eyebrow="Operação" title="Fluxo completo de trabalho"/>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        {n:"01",title:"Importação",desc:"Selecionar Base A, Base B, colunas e o modo de comparação.",I:FileSpreadsheet},
        {n:"02",title:"Análise Python",desc:"Normalizar descrições e avaliar score, atributos e vínculos.",I:Workflow},
        {n:"03",title:"Persistência",desc:"Salvar os resultados explicitamente nas tabelas do Supabase.",I:Database},
        {n:"04",title:"Revisão humana",desc:"Conferir resultados, registrar decisões e exportar evidências.",I:ClipboardList},
      ].map(step=><div key={step.n} className={`${card} p-5`}><div className="flex items-center justify-between text-slate-400"><span className="text-xs font-semibold">ETAPA {step.n}</span><step.I size={19}/></div><h3 className="mt-4 font-semibold">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{step.desc}</p></div>)}</div>
    </section>

    <section><SectionTitle eyebrow="Código e tecnologias" title="Referência de manutenção"/>
      <div className={`${card} divide-y divide-slate-100`}>{[
        ["Frontend", "src/app/", "Next.js App Router · páginas, telas e layouts"],
        ["Interfaces e componentes", "src/components/", "Tabelas, painéis, navegação e formulários"],
        ["API administrativa", "src/app/api/qa/", "Consultar, salvar, revisar, autenticar e listar exclusões"],
        ["Controle de acesso", "src/lib/qa/auth.ts", "Validação do JWT e do UID administrador no servidor"],
        ["Supabase", "src/lib/supabase/", "Cliente do navegador e cliente administrativo somente no servidor"],
        ["Motor Python", "backend/app/main.py", "FastAPI · /health · /preview · /compare · /export"],
        ["Serviços do backend", "backend/app/services/", "Normalização e lógica auxiliar de comparação"],
        ["Validação de URLs", "backend/app/url_validator.py", "Prévia, verificação e geração de resultados de URLs"],
        ["Dependências Python", "backend/requirements.txt", "FastAPI, Uvicorn, Pandas, RapidFuzz e leitores de arquivos"],
        ["Dependências web", "package.json", "Next.js, React, TypeScript e bibliotecas de interface"],
      ].map(([name,path,desc])=><div key={path} className="grid gap-1 px-5 py-4 text-sm md:grid-cols-[180px_1fr] md:gap-4"><p className="font-semibold text-slate-800">{name}</p><div><code className="break-all text-xs text-blue-800">{path}</code><p className="mt-1 leading-5 text-slate-500">{desc}</p></div></div>)}</div>
    </section>

    <section><SectionTitle eyebrow="Implantação" title="Ambientes e comandos"/>
      <div className="grid gap-3 lg:grid-cols-2">
        <article className={`${card} p-5`}><div className="flex items-center gap-2"><Code2 size={19}/><h3 className="font-semibold">Frontend Next.js · Vercel</h3></div><p className="mt-2 text-sm text-slate-500">Branch <code>main</code>, diretório <code>./</code>.</p><pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100"><code>npm ci{"\n"}npm run build{"\n"}npm run start</code></pre></article>
        <article className={`${card} p-5`}><div className="flex items-center gap-2"><ServerCog size={19}/><h3 className="font-semibold">Backend Python · Render</h3></div><p className="mt-2 text-sm text-slate-500">Branch <code>main</code>, diretório <code>backend/</code>.</p><pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100"><code>pip install -r requirements.txt{"\n"}uvicorn app.main:app --host 0.0.0.0 --port $PORT</code></pre></article>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-100 p-4 text-xs leading-6 text-slate-700"><Layers3 size={17} className="mt-0.5 shrink-0"/><p>O Python é uma aplicação FastAPI, não uma rota Next.js. Ele executa no serviço <strong>Render</strong>. O código-fonte integral fica no <strong>GitHub</strong>; não depende do Linux pessoal após a implantação, desde que a infraestrutura e os serviços de nuvem continuem ativos. A versão exata do interpretador Python deve ser conferida nas configurações do Render; o número do motor é exposto em <code>/health</code>.</p></div>
    </section>

    <section><SectionTitle eyebrow="Configuração" title="Variáveis de ambiente necessárias" description="Nunca compartilhe valores de chaves administrativas em documentos ou no código versionado."/>
      <div className={`${card} overflow-x-auto`}><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-3">Variável</th><th className="px-5 py-3">Local</th><th className="px-5 py-3">Finalidade</th></tr></thead><tbody>{[
        ["NEXT_PUBLIC_QA_API_URL", "Vercel", "URL pública HTTPS do FastAPI no Render"],
        ["NEXT_PUBLIC_SUPABASE_URL", "Vercel", "Endpoint do projeto Supabase"],
        ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "Vercel", "Chave pública (publishable/anon) para Supabase Auth"],
        ["SUPABASE_SERVICE_ROLE_KEY", "Vercel, servidor", "Chave privilegiada; nunca NEXT_PUBLIC"],
        ["QA_ADMIN_USER_ID", "Vercel, servidor", "UID do administrador com permissão nas rotas /api/qa/*"],
        ["PORT", "Render", "Porta fornecida pelo provedor ao Uvicorn"],
        ["PYTHON_VERSION", "Render, se fixada", "Versão do runtime Python; deve ser revisada no ambiente"],
      ].map(([key,place,purpose])=><tr className="border-t border-slate-100" key={key}><td className="px-5 py-3 font-mono text-xs">{key}</td><td className="px-5 py-3 text-slate-600">{place}</td><td className="px-5 py-3 text-slate-600">{purpose}</td></tr>)}</tbody></table></div>
    </section>

    <section><SectionTitle eyebrow="Limites e governança" title="O que a equipe precisa saber antes de operar"/>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><ShieldAlert className="text-amber-700"/><h3 className="mt-3 font-semibold text-amber-950">Pontos de atenção</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-950"><li>500.000 linhas e 200 MB são limites configurados, não desempenho homologado; Render Free possui recursos reduzidos.</li><li>O backend Python está acessível publicamente e necessita autenticação, limitação de requisições e proteção contra uso abusivo antes da operação empresarial.</li><li>O status de revisão é persistido, mas a versão atual não armazena trilha imutável por usuário/data de cada alteração.</li><li>A classe <code>exclusao</code> não representa remoção real; somente conferência de ausência de candidato.</li></ul></div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><ShieldCheck className="text-blue-700"/><h3 className="mt-3 font-semibold text-blue-950">Controles existentes</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-blue-950"><li>Autenticação Supabase para o painel; rotas administrativas verificam JWT e UID do administrador.</li><li>Chave de serviço do Supabase usada apenas no servidor Next.js.</li><li>Revisão humana obrigatória e ausência de rotas de remoção automática de produtos.</li><li>Exportações preservam resultados da comparação para análise posterior.</li></ul></div>
      </div>
    </section>

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500"><p>Precifica Operações · documentação técnica e funcional · 30/10/2026</p><Link href="/comparacoes" className="inline-flex items-center gap-1 font-semibold text-blue-700">Ver comparações <ArrowUpRight size={14}/></Link></footer>
  </div>;
}
