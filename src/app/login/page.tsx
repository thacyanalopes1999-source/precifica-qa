"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  ChartNoAxesCombined,
  Check,
  Eye,
  EyeOff,
  GitCompareArrows,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getSupabaseBrowser, fetchQA } from "@/lib/supabase/browser";

const funcionalidades = [
  { icon: GitCompareArrows, title: "Comparações inteligentes", subtitle: "Cruzamento 1:1 e análise de similaridade" },
  { icon: ChartNoAxesCombined, title: "Visão operacional", subtitle: "Indicadores e histórico centralizados" },
  { icon: ShieldCheck, title: "Revisão com controle", subtitle: "Decisões humanas com rastreabilidade" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    document.title = "Entrar | Precifica Operações";
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
        throw new Error("Não foi possível entrar. Confira o e-mail e a senha cadastrados no Supabase.");
      }

      // A verificação do UID administrador ocorre na API do servidor, não no navegador.
      const autorizacao = await fetchQA("/api/qa/me");
      if (!autorizacao.ok) {
        const detalhe: { error?: string } = await autorizacao.json().catch(() => ({}));
        await supabase.auth.signOut();
        throw new Error(detalhe.error || "Este usuário não está autorizado a acessar o Precifica Operações.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao autenticar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#080f20] px-4 py-8 text-white sm:px-6 lg:px-10">
      <div aria-hidden="true" className="pointer-events-none absolute -top-56 right-[-14rem] h-[38rem] w-[38rem] rounded-full bg-blue-600/20 blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-64 -left-52 h-[36rem] w-[36rem] rounded-full bg-emerald-500/10 blur-[110px]" />

      <div className="relative z-10 grid w-full max-w-[1100px] overflow-hidden rounded-[28px] border border-white/10 bg-[#111b30] shadow-[0_35px_120px_rgba(0,0,0,.42)] lg:min-h-[690px] lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(145deg,#142c63_0%,#102e4a_53%,#0c3946_100%)] p-11 lg:flex xl:p-14">
          <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-24 h-96 w-96 rounded-full border border-white/10 bg-white/5" />
          <div aria-hidden="true" className="pointer-events-none absolute right-20 bottom-[-160px] h-80 w-80 rounded-full border border-cyan-300/20" />
          <div className="relative z-10">
            <div className="mb-16 inline-flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-lg shadow-black/10">
                <ChartNoAxesCombined size={25} strokeWidth={2.2} />
              </span>
              <div>
                <p className="text-xl font-extrabold tracking-[-.035em]">Precifica <span className="text-cyan-200">Operações</span></p>
                <p className="text-[10px] font-bold uppercase tracking-[.32em] text-cyan-200/80">Plataforma QA</p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-200/10 px-3.5 py-2 text-xs font-semibold text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Gestão de qualidade e resultados
            </div>
            <h1 className="mt-7 max-w-[475px] text-[47px] font-extrabold leading-[1.10] tracking-[-.055em] xl:text-[55px]">
              Inteligência em cada <span className="text-cyan-200">comparação.</span>
            </h1>
            <p className="mt-6 max-w-[410px] text-[15px] leading-7 text-slate-200/90">
              Centralize suas análises, acompanhe os resultados e tome decisões com segurança em uma única plataforma.
            </p>
            <div className="mt-11 space-y-6">
              {funcionalidades.map(({ icon: Icon, title, subtitle }) => (
                <div key={title} className="flex items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10"><Icon size={21} /></div>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-0.5 text-xs text-slate-300">{subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10 mt-14 flex items-center justify-between border-t border-white/10 pt-7 text-xs text-slate-300/90">
            <span>Precifica Operações · 2026</span>
            <span className="inline-flex items-center gap-1.5"><BadgeCheck size={15} /> Acesso controlado</span>
          </div>
        </section>

        <section className="flex flex-col justify-center bg-white px-6 py-9 text-slate-900 sm:px-11 lg:px-12 xl:px-14">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"><ChartNoAxesCombined size={23} /></span>
            <div>
              <p className="text-lg font-extrabold tracking-tight">Precifica Operações</p>
              <p className="text-[10px] font-bold uppercase tracking-[.25em] text-blue-600">Plataforma QA</p>
            </div>
          </div>

          <div className="mb-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700">
            <LockKeyhole size={25} strokeWidth={2.1} />
          </div>
          <div className="mb-8">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"><Check size={13} /> Ambiente administrativo</div>
            <h2 className="text-[33px] font-extrabold leading-tight tracking-[-.045em] text-slate-950">Bem-vindo de volta</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">Entre com o usuário autorizado para acessar o painel operacional.</p>
          </div>
          <form onSubmit={entrar} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">E-mail de acesso</label>
              <input
                id="email" type="email" autoComplete="username" inputMode="email" required
                value={email} onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
                className="block w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><label htmlFor="senha" className="text-sm font-semibold text-slate-700">Senha</label><span className="text-xs text-slate-400">Supabase Auth</span></div>
              <div className="relative">
                <input
                  id="senha" type={mostrarSenha ? "text" : "password"} autoComplete="current-password" required
                  value={senha} onChange={(event) => setSenha(event.target.value)}
                  placeholder="Digite sua senha"
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50/60 py-3.5 pl-4 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                />
                <button type="button" onClick={() => setMostrarSenha((mostrar) => !mostrar)} aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-800">
                  {mostrarSenha ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>
            {erro ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{erro}</div> : null}
            <button
              type="submit" disabled={enviando}
              className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enviando ? <LoaderCircle size={19} className="animate-spin" /> : <ArrowRight size={19} className="transition-transform group-hover:translate-x-0.5" />}
              {enviando ? "Verificando acesso..." : "Entrar na plataforma"}
            </button>
          </form>
          <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 shrink-0 text-blue-600" size={17} />
            <p>Ambiente restrito a usuários autorizados. Não existe cadastro público nesta plataforma.</p>
          </div>
          <div className="mt-9 flex items-center justify-center gap-2 text-[11px] text-slate-400"><Sparkles size={13} /> Precifica Operações · Segurança e rastreabilidade</div>
        </section>
      </div>
    </main>
  );
}
