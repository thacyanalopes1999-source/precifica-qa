"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { fetchQA, getSupabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    document.title = "Acesso | Precifica Operações";
  }, []);

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");

    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });
      if (error || !data.session) {
        throw new Error("Não foi possível entrar. Verifique seu e-mail e sua senha.");
      }

      // Mantem a validacao administrativa no servidor.
      const autorizacao = await fetchQA("/api/qa/me");
      if (!autorizacao.ok) {
        const detalhe: { error?: string } = await autorizacao.json().catch(() => ({}));
        await supabase.auth.signOut();
        throw new Error(detalhe.error || "Sua conta não tem permissão para acessar o sistema.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível autenticar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c121b] px-4 py-8 font-sans text-[#15202d] sm:px-8 lg:py-12">
      <div className="grid w-full max-w-[1080px] overflow-hidden rounded-[18px] border border-white/10 bg-[#f9f8f5] shadow-[0_24px_90px_rgba(0,0,0,0.27)] lg:min-h-[640px] lg:grid-cols-[1fr_0.94fr]">
        <section className="flex min-h-[320px] flex-col justify-between bg-[#182230] p-8 text-[#f6f3ec] sm:p-11 lg:min-h-0 lg:p-[58px]">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="flex size-11 items-center justify-center rounded-[9px] border border-[#b8a47f]/60 text-[25px] font-semibold leading-none text-[#e4cda1]" style={{ fontFamily: "Georgia, serif" }}>
              P
            </div>
            <div className="leading-tight">
              <p className="text-[17px] font-semibold tracking-[-0.025em]">Precifica</p>
              <p className="mt-0.5 text-[11px] font-medium tracking-[0.22em] text-[#bba988] uppercase">Operações</p>
            </div>
          </div>

          <div className="my-12 max-w-[400px] lg:my-8">
            <div className="mb-6 h-[2px] w-10 bg-[#d3ba8f]" aria-hidden="true" />
            <h1 className="text-[39px] leading-[1.13] tracking-[-0.04em] sm:text-[47px] lg:text-[52px]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
              Automação e tecnologia para ir além.
            </h1>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#354252] pt-5 text-[11px] tracking-[0.04em] text-[#b5bec9]">
            <span>PRECIFICA OPERAÇÕES</span>
            <span>© 2026</span>
          </div>
        </section>

        <section className="flex flex-col justify-center bg-[#f9f8f5] px-7 py-12 sm:px-12 lg:px-[66px]">
          <header className="mb-11">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#9b815a]">Acesso administrativo</p>
            <h2 className="text-[35px] font-semibold tracking-[-0.055em] text-[#17212d] sm:text-[39px]">Bem-vindo.</h2>
            <p className="mt-2 text-[14px] leading-6 text-[#737b83]">Entre com suas credenciais.</p>
          </header>

          <form onSubmit={entrar} className="space-y-6">
            <div>
              <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-[#26313c]">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                className="block w-full rounded-[9px] border border-[#dce0e2] bg-white px-4 py-[14px] text-[14px] text-[#17212d] outline-none transition-colors placeholder:text-[#a3a9b0] focus:border-[#9a8160] focus:ring-2 focus:ring-[#9a8160]/10"
              />
            </div>
            <div>
              <label htmlFor="senha" className="mb-2 block text-[13px] font-medium text-[#26313c]">Senha</label>
              <div className="relative">
                <input
                  id="senha"
                  type={mostrarSenha ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
                  placeholder="Digite sua senha"
                  className="block w-full rounded-[9px] border border-[#dce0e2] bg-white py-[14px] pl-4 pr-12 text-[14px] text-[#17212d] outline-none transition-colors placeholder:text-[#a3a9b0] focus:border-[#9a8160] focus:ring-2 focus:ring-[#9a8160]/10"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((visivel) => !visivel)}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#929ba3] transition-colors hover:text-[#27323e]"
                >
                  {mostrarSenha ? <EyeOff size={18} strokeWidth={1.7} /> : <Eye size={18} strokeWidth={1.7} />}
                </button>
              </div>
            </div>

            {erro && (
              <div role="alert" className="rounded-[9px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-800">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="group flex w-full items-center justify-center gap-2 rounded-[9px] bg-[#192330] px-4 py-[15px] text-[14px] font-semibold text-white transition-colors hover:bg-[#2c3a4b] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {enviando ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
              )}
              {enviando ? "Verificando acesso..." : "Entrar"}
            </button>
          </form>

          <div className="mt-11 border-t border-[#e3e3df] pt-5 text-[11px] tracking-[0.025em] text-[#93999e]">
            Ambiente de acesso restrito
          </div>
        </section>
      </div>
    </main>
  );
}
