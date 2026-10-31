import { NextRequest, NextResponse } from "next/server";
import { requireQAAdmin, checkMutationOrigin } from "@/lib/qa/auth";

const STORES = {
  mercado_livre: { nome: "Mercado Livre", dominio: "mercadolivre.com.br" },
  magalu: { nome: "Magazine Luiza", dominio: "magazineluiza.com.br" },
  casas_bahia: { nome: "Casas Bahia", dominio: "casasbahia.com.br" },
  amazon: { nome: "Amazon", dominio: "amazon.com.br" },
  shopee: { nome: "Shopee", dominio: "shopee.com.br" },
  americanas: { nome: "Americanas", dominio: "americanas.com.br" },
  carrefour: { nome: "Carrefour", dominio: "carrefour.com.br" },
} as const;
type StoreKey = keyof typeof STORES;
const validStore = (value: string): value is StoreKey => Object.prototype.hasOwnProperty.call(STORES, value);
const response = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function barcodeIsExact(value: string): boolean {
  return /^(?:\d{8}|\d{12,14})$/.test(value.replace(/[\s-]/g, ""));
}
function relevance(description: string, title: string): number {
  const ignore = new Set(["para", "com", "sem", "de", "do", "da", "dos", "das", "um", "uma", "em", "e", "o", "a", "dimensoes", "altura", "largura", "profundidade"]);
  const tokens = [...new Set(normalize(description).split(" ").filter((t) => t.length > 2 && !ignore.has(t)))];
  const available = new Set(normalize(title).split(" "));
  if (!tokens.length) return 0;
  const found = tokens.filter((t) => available.has(t)).length;
  return Math.round(100 * found / tokens.length);
}
function safeProductUrl(raw: string, domain: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (host !== domain && !host.endsWith(`.${domain}`)) return null;
    // Excluir páginas de lista/pesquisa: precisamos sugerir links de anúncios ou fichas de produto.
    if (host.startsWith("lista.") || host.startsWith("busca.")) return null;
    if (url.pathname.length < 4) return null;
    // Resultados de busca/categorias não são URLs individuais de produtos.
    if (/^\/(?:busca|search|search-results|departamento|categoria|categories|s)(?:\/|$)/i.test(url.pathname)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gclid|fbclid|ref|tag|tracking_id)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch { return null; }
}

type SearchResult = { loja: string; loja_id: StoreKey; titulo: string; url: string; afinidade: number; descricao_busca: string };
type SerperResponse = { organic?: { title?: string; link?: string; snippet?: string }[] };

export async function GET(req: NextRequest) {
  const denied = await requireQAAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ busca_automatica: Boolean(process.env.SERPER_API_KEY?.trim()), provedor: "Serper", lojas: STORES }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const denied = await requireQAAdmin(req);
  if (denied) return denied;
  const badOrigin = checkMutationOrigin(req);
  if (badOrigin) return badOrigin;

  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return response("Configure SERPER_API_KEY na Vercel para obter URLs automaticamente. A busca manual continua disponível.", 503);
  const raw = await req.text();
  if (raw.length > 8000) return response("Solicitação muito grande.", 413);
  let body: { descricao?: unknown; codigo_barras?: unknown; lojas?: unknown };
  try { body = JSON.parse(raw) as typeof body; } catch { return response("JSON inválido."); }
  const descricao = typeof body.descricao === "string" ? body.descricao.trim() : "";
  const codigo = typeof body.codigo_barras === "string" ? body.codigo_barras.trim() : "";
  const lojas = Array.isArray(body.lojas) ? body.lojas.filter((value): value is StoreKey => typeof value === "string" && validStore(value)) : [];
  if (!descricao || descricao.length < 5 || descricao.length > 500) return response("Descrição deve ter entre 5 e 500 caracteres.");
  if (codigo.length > 32) return response("Código de barras inválido.");
  if (!lojas.length || lojas.length > 3 || new Set(lojas).size !== lojas.length) return response("Escolha de 1 a 3 marketplaces sem repetição.");

  // Remover especificações logísticas evita resultados pouco relacionados.
  const descricaoBusca = descricao.replace(/\s*-\s*Dimens[oõ]es\s*\(.*$/i, "").slice(0, 135).trim();
  const ean = barcodeIsExact(codigo) ? codigo.replace(/[\s-]/g, "") : "";
  const results: SearchResult[] = [];
  const errors: string[] = [];
  await Promise.all(lojas.map(async (storeId) => {
    const store = STORES[storeId];
    const query = `site:${store.dominio} ${ean ? `${ean} ` : ""}${descricaoBusca}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12500);
      let res: Response;
      try {
        res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": key, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num: 10 }),
          signal: controller.signal,
          cache: "no-store",
        });
      } finally { clearTimeout(timer); }
      if (!res.ok) {
        errors.push(`${store.nome}: provedor retornou HTTP ${res.status}.`);
        return;
      }
      const data = await res.json() as SerperResponse;
      for (const item of (data.organic || []).slice(0, 10)) {
        if (!item.title || !item.link) continue;
        const url = safeProductUrl(item.link, store.dominio);
        if (!url) continue;
        results.push({ loja: store.nome, loja_id: storeId, titulo: item.title.slice(0, 260), url, afinidade: relevance(descricaoBusca, item.title), descricao_busca: query });
      }
    } catch (error) {
      errors.push(`${store.nome}: ${error instanceof Error && error.name === "AbortError" ? "tempo limite" : "erro na pesquisa"}.`);
    }
  }));
  const unique = [...new Map(results.map((r) => [r.url, r])).values()]
    .sort((a, b) => b.afinidade - a.afinidade).slice(0, 15);
  return NextResponse.json({ candidatos: unique, avisos: errors, codigo_exato: Boolean(ean),
    nota: "Candidatos localizados por pesquisa; a similaridade do título não garante identidade, disponibilidade ou EAN correspondente." },
  { headers: { "Cache-Control": "no-store" } });
}
