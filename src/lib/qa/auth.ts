import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Verifica o JWT com o Supabase Auth e autoriza um UID administrador específico.
 *  Nunca confie em um UID/email enviado pelo navegador ou apenas em JWT decodificado.
 */
export async function requireQAAdmin(req: NextRequest): Promise<NextResponse | null> {
  const adminId = process.env.QA_ADMIN_USER_ID?.trim();
  if (!adminId) {
    return NextResponse.json({ error: "QA_ADMIN_USER_ID não configurado no servidor." }, { status: 503 });
  }
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "");
  if (!match) {
    return NextResponse.json({ error: "Faça login no Supabase para acessar esta área." }, { status: 401 });
  }
  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(match[1]);
    if (error || !data.user) {
      return NextResponse.json({ error: "Sessão expirada ou inválida. Entre novamente." }, { status: 401 });
    }
    if (data.user.id !== adminId) {
      return NextResponse.json({ error: "Este usuário não tem acesso administrativo ao Precifica QA." }, { status: 403 });
    }
    return null;
  } catch (error) {
    console.error("[PRECIFICA QA] Falha na autenticação:", error);
    return NextResponse.json({ error: "Falha na verificação de acesso ao Supabase." }, { status: 503 });
  }
}

export function checkMutationOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.json({ error: "Origem obrigatória." }, { status: 403 });
  try {
    if (new URL(origin).origin === req.nextUrl.origin) return null;
  } catch { /* Origem inválida */ }
  return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
}
