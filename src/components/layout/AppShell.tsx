"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, RefreshCcw, ShieldAlert } from "lucide-react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { fetchQA, getSupabaseBrowser } from "@/lib/supabase/browser";

interface AppShellProps { children: ReactNode }
type AuthorizationState = "checking" | "authorized" | "error";

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  const [menuAberto, setMenuAberto] = useState(false);
  const [authState, setAuthState] = useState<AuthorizationState>("checking");
  const [authMessage, setAuthMessage] = useState("");
  const [authorizedPath, setAuthorizedPath] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (isLogin) return;
    const controller = new AbortController();
    setAuthState("checking");
    setAuthMessage("");
    setAuthorizedPath(null);

    async function validate() {
      try {
        const response = await fetchQA("/api/qa/me", { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          await getSupabaseBrowser().auth.signOut();
          if (!controller.signal.aborted) router.replace("/login");
          return;
        }
        if (!response.ok) {
          const result: { error?: string } = await response.json().catch(() => ({}));
          throw new Error(result.error || "Não foi possível verificar seu acesso.");
        }
        setAuthorizedPath(pathname);
        setAuthState("authorized");
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Erro ao verificar autorização.";
        if (/Entre na sua conta|Sessão expirada|token|access token/i.test(message)) {
          router.replace("/login");
          return;
        }
        setAuthMessage(message);
        setAuthState("error");
      }
    }
    void validate();
    return () => controller.abort();
  }, [pathname, isLogin, router, retryKey]);

  // Login fora da sidebar e do cabeçalho, sem revelar telas internas.
  if (isLogin) return <>{children}</>;

  if (authState !== "error" && (authState !== "authorized" || authorizedPath !== pathname)) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0c1427] px-6 text-white" role="status" aria-live="polite">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600"><LoaderCircle size={26} className="animate-spin" /></div>
      <p className="text-lg font-bold">Precifica Operações</p>
      <p className="text-sm text-slate-400">Validando seu acesso seguro...</p>
    </main>;
  }

  if (authState === "error") {
    return <main className="flex min-h-screen items-center justify-center bg-[#0c1427] px-5">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white p-7 text-slate-900 shadow-xl">
        <ShieldAlert size={30} className="text-amber-600" />
        <h1 className="mt-4 text-2xl font-bold">Não foi possível validar seu acesso</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-slate-600">{authMessage}</p>
        <button type="button" onClick={() => setRetryKey((n) => n + 1)} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"><RefreshCcw size={17}/> Tentar novamente</button>
        <button type="button" onClick={() => router.replace("/login")} className="mt-3 w-full py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">Voltar ao login</button>
      </section>
    </main>;
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <Sidebar open={menuAberto} onClose={() => setMenuAberto(false)} />
      <div className="min-h-screen lg:pl-67">
        <Header onMenuClick={() => setMenuAberto(true)} />
        <main className="mx-auto w-full max-w-400 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
